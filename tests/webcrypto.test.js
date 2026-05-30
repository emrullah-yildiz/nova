import { describe, it, expect } from 'vitest';
import { signSessionPayload, verifySessionPayload, verifyRs256, utf8ToB64url, b64urlToUtf8, deriveSecretsKey, encryptSecret, decryptSecret, createSecretsService } from '../server/auth/webcrypto.mjs';
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

describe('webcrypto AES-GCM secret encryption', () => {
  const plaintext = JSON.stringify({ provider: 'groq', model: 'llama-3.1-8b-instant', keys: { groq: 'gsk_secret_1234567890' } });

  it('round-trips with a key derived from the session secret', async () => {
    const key = await deriveSecretsKey({ sessionSecret: 'nova-dev-session-secret' });
    const blob = await encryptSecret(plaintext, key);
    expect(blob.startsWith('aesgcm$v1$')).toBe(true);
    expect(blob).not.toContain('gsk_secret'); // ciphertext must not leak the key
    expect(await decryptSecret(blob, key)).toBe(plaintext);
  });

  it('uses a fresh IV each call (different ciphertext for the same input)', async () => {
    const key = await deriveSecretsKey({ sessionSecret: 'nova-dev-session-secret' });
    const a = await encryptSecret(plaintext, key);
    const b = await encryptSecret(plaintext, key);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, key)).toBe(plaintext);
    expect(await decryptSecret(b, key)).toBe(plaintext);
  });

  it('returns null for tampered blobs or a wrong key', async () => {
    const key = await deriveSecretsKey({ sessionSecret: 'nova-dev-session-secret' });
    const other = await deriveSecretsKey({ sessionSecret: 'a-different-secret' });
    const blob = await encryptSecret(plaintext, key);
    expect(await decryptSecret(blob, other)).toBeNull();
    expect(await decryptSecret(blob.slice(0, -2) + 'xy', key)).toBeNull();
    expect(await decryptSecret('garbage', key)).toBeNull();
    expect(await decryptSecret('aesgcm$v2$aa$bb', key)).toBeNull(); // unknown version
  });

  it('accepts an explicit base64url 32-byte NOVA_SECRETS_KEY and rejects bad lengths', async () => {
    const raw = new Uint8Array(32).fill(7);
    let s = ''; for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    const secretsKey = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const key = await deriveSecretsKey({ secretsKey });
    expect(await decryptSecret(await encryptSecret(plaintext, key), key)).toBe(plaintext);
    await expect(deriveSecretsKey({ secretsKey: 'dG9vLXNob3J0' })).rejects.toThrow();
  });

  it('createSecretsService binds encrypt/decrypt to one key', async () => {
    const svc = await createSecretsService({ sessionSecret: 'nova-dev-session-secret' });
    const blob = await svc.encrypt(plaintext);
    expect(await svc.decrypt(blob)).toBe(plaintext);
  });
});
