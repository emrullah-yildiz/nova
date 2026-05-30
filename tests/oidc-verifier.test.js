import { describe, it, expect } from 'vitest';
import { createOidcVerifier } from '../server/auth/oidc-verifier.mjs';

const enc = new TextEncoder();
const b64url = (buf) => {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const seg = (obj) => b64url(enc.encode(JSON.stringify(obj)));

async function makeIssuer() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = 'test-kid'; jwk.alg = 'RS256';
  return { priv: pair.privateKey, jwks: { keys: [jwk] } };
}
async function mint(priv, payload, kid = 'test-kid') {
  const head = seg({ alg: 'RS256', typ: 'JWT', kid });
  const body = seg(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64url(sig);
}

const ISS = 'https://accounts.google.com';
const AUD = 'client-123';
const future = Math.floor(Date.now() / 1000) + 3600;

describe('OIDC verifier (WebCrypto)', () => {
  it('verifies a valid id token and returns the identity', async () => {
    const { priv, jwks } = await makeIssuer();
    const verify = createOidcVerifier({ issuer: [ISS], audience: AUD, fetchJwks: async () => jwks });
    const token = await mint(priv, { iss: ISS, aud: AUD, sub: 'g-1', email: 'a@b.com', name: 'A B', exp: future });
    const id = await verify({ idToken: token });
    expect(id.email).toBe('a@b.com');
    expect(id.sub).toBe('g-1');
    expect(id.displayName).toBe('A B');
  });

  it('rejects wrong audience / issuer / expired / tampered signature', async () => {
    const { priv, jwks } = await makeIssuer();
    const verify = createOidcVerifier({ issuer: [ISS], audience: AUD, fetchJwks: async () => jwks });

    await expect(verify({ idToken: await mint(priv, { iss: ISS, aud: 'other', sub: 'x', email: 'a@b.com', exp: future }) })).rejects.toThrow(/audience/i);
    await expect(verify({ idToken: await mint(priv, { iss: 'https://evil', aud: AUD, sub: 'x', email: 'a@b.com', exp: future }) })).rejects.toThrow(/issuer/i);
    await expect(verify({ idToken: await mint(priv, { iss: ISS, aud: AUD, sub: 'x', email: 'a@b.com', exp: Math.floor(Date.now() / 1000) - 10 }) })).rejects.toThrow(/expired/i);

    const good = await mint(priv, { iss: ISS, aud: AUD, sub: 'x', email: 'a@b.com', exp: future });
    const tampered = good.slice(0, -3) + (good.endsWith('AAA') ? 'BBB' : 'AAA');
    await expect(verify({ idToken: tampered })).rejects.toThrow(/signature/i);
  });

  it('rejects a token whose kid is not in the JWKS', async () => {
    const { priv } = await makeIssuer();
    const verify = createOidcVerifier({ issuer: [ISS], audience: AUD, fetchJwks: async () => ({ keys: [] }) });
    await expect(verify({ idToken: await mint(priv, { iss: ISS, aud: AUD, sub: 'x', email: 'a@b.com', exp: future }) })).rejects.toThrow(/JWKS key/i);
  });

  it('rejects malformed tokens', async () => {
    const verify = createOidcVerifier({ issuer: [ISS], audience: AUD, fetchJwks: async () => ({ keys: [] }) });
    await expect(verify({ idToken: 'not-a-jwt' })).rejects.toThrow(/malformed/i);
    await expect(verify({ idToken: '' })).rejects.toThrow(/missing/i);
  });
});
