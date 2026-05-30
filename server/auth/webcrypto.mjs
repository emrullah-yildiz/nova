// Dual-runtime crypto for the Cloudflare Worker API.
//
// `workerd` (Cloudflare Workers) exposes WebCrypto (`crypto.subtle`) but not
// the full `node:crypto` module, so the API that runs on Workers can't reuse
// the node:crypto code in `src/enterprise/auth.mjs` / `server/auth/jwks-verifier.mjs`.
//
// This module reproduces the SAME session-token format byte-for-byte (so a
// token signed here verifies there and vice versa — see webcrypto.test.js) and
// adds RS256 verification for OIDC ID tokens. It uses only WebCrypto + atob/btoa,
// so it runs unchanged in workerd, Node (18+), and the browser.

const SUBTLE = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── base64url <-> bytes (no Buffer, so it works in workerd) ──
function bytesToB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(b64url) {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function utf8ToB64url(str) { return bytesToB64url(enc.encode(str)); }
export function b64urlToUtf8(b64url) { return dec.decode(b64urlToBytes(b64url)); }

// ── HMAC-SHA256 session tokens (mirror src/enterprise/auth.mjs) ──
function hmacKey(secret) {
  return SUBTLE.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

// `payload.signature`, both base64url — identical to signPayload() in auth.mjs.
export async function signSessionPayload(payload, secret) {
  const encodedPayload = utf8ToB64url(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = await SUBTLE.sign('HMAC', key, enc.encode(encodedPayload));
  return encodedPayload + '.' + bytesToB64url(new Uint8Array(sig));
}

// Returns the decoded payload, or null if the token is malformed / tampered.
// (WebCrypto's verify is constant-time, so no separate timingSafeEqual needed.)
export async function verifySessionPayload(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  const key = await hmacKey(secret);
  let ok = false;
  try {
    ok = await SUBTLE.verify('HMAC', key, b64urlToBytes(signature), enc.encode(encodedPayload));
  } catch { return null; }
  if (!ok) return null;
  try { return JSON.parse(b64urlToUtf8(encodedPayload)); } catch { return null; }
}

// ── RS256 verification for OIDC ID tokens ──
// `signingInput` is `${headerB64url}.${payloadB64url}`; `jwk` is the issuer's
// public key from its JWKS. Replaces jwks-verifier's node `createVerify`.
export async function verifyRs256(signingInput, signatureB64url, jwk) {
  const key = await SUBTLE.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return SUBTLE.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(signatureB64url), enc.encode(signingInput));
}
