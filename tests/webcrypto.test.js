import { describe, it, expect } from 'vitest';
import { signSessionPayload, verifySessionPayload, verifyRs256, utf8ToB64url, b64urlToUtf8 } from '../server/auth/webcrypto.mjs';
import { signPayload, verifySignedPayload } from '../src/enterprise/auth.mjs';

// The WebCrypto module must be byte-for-byte interchangeable with the existing
// node:crypto auth, so tokens issued during the migration keep working.

describe('webcrypto session tokens', () => {
  const secret = 'nova-dev-session-secret';
  const payload = { sub: 'user-1', org: 'org-1', role: 'Editor', iat: 1000, exp: 9999999999999 };

  it('produces a token byte-identical to the node:crypto signer', async () => {
    const webToken = await signSessionPayload(payload, secret);
    const nodeToken = signPayload(payload, secret);
    expect(webToken).toBe(nodeToken);
  });

  it('verifies a token signed by the node:crypto signer', async () => {
    const nodeToken = signPayload(payload, secret);
    const decoded = await verifySessionPayload(nodeToken, secret);
    expect(decoded).toEqual(payload);
  });

  it('node verifier accepts a token signed by WebCrypto', async () => {
    const webToken = await signSessionPayload(payload, secret);
    expect(verifySignedPayload(webToken, secret)).toEqual(payload);
  });

  it('rejects a tampered token', async () => {
    const token = await signSessionPayload(payload, secret);
    const [p, s] = token.split('.');
    const tampered = p.slice(0, -1) + (p.endsWith('A') ? 'B' : 'A') + '.' + s;
    expect(await verifySessionPayload(tampered, secret)).toBeNull();
  });

  it('rejects a wrong-secret token and malformed input', async () => {
    const token = await signSessionPayload(payload, secret);
    expect(await verifySessionPayload(token, 'other-secret')).toBeNull();
    expect(await verifySessionPayload('not-a-token', secret)).toBeNull();
    expect(await verifySessionPayload('', secret)).toBeNull();
  });

  it('round-trips base64url helpers (incl. non-ASCII)', () => {
    const s = 'Aäŧ→𝟙 {"x":1}';
    expect(b64urlToUtf8(utf8ToB64url(s))).toBe(s);
  });
});

describe('webcrypto RS256 (OIDC id-token verification)', () => {
  async function makeKeyAndJwk() {
    const pair = await globalThis.crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify']
    );
    const jwk = await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey);
    return { priv: pair.privateKey, jwk };
  }
  const b64url = (buf) => {
    const b = new Uint8Array(buf); let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  it('verifies a valid signature and rejects a tampered one', async () => {
    const { priv, jwk } = await makeKeyAndJwk();
    const signingInput = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhYmMifQ';
    const sig = await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, new TextEncoder().encode(signingInput));
    expect(await verifyRs256(signingInput, b64url(sig), jwk)).toBe(true);
    expect(await verifyRs256(signingInput + 'x', b64url(sig), jwk)).toBe(false);
  });
});
