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

// ── PBKDF2 password hashing (WebCrypto, cross-runtime) ──
// For email+password accounts. PBKDF2-HMAC-SHA256 is the only password KDF in
// WebCrypto, so it's the portable choice for workerd (no node:crypto.scrypt /
// argon2). Output is a self-describing PHC-style string —
// `pbkdf2$sha256$<iterations>$<saltB64url>$<hashB64url>` — so the iteration
// count and salt travel with the hash and can be bumped later without a
// migration.
//
// Cloudflare Workers HARD-CAPS PBKDF2 at 100,000 iterations (deriveBits throws
// "iteration counts above 100000 are not supported" above that), so 100k is the
// ceiling here even though OWASP now suggests more. It's still a sound floor;
// if we want stronger hashing later, the move is a WASM scrypt/argon2 (PBKDF2
// can't go higher on workerd).
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;

async function pbkdf2Bits(password, salt, iterations) {
  const baseKey = await SUBTLE.importKey('raw', enc.encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await SUBTLE.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, baseKey, PBKDF2_HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password, options = {}) {
  if (typeof password !== 'string' || password.length === 0) throw new Error('Password is required.');
  const iterations = options.iterations || PBKDF2_ITERATIONS;
  const salt = options.salt || globalThis.crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2Bits(password, salt, iterations);
  return ['pbkdf2', 'sha256', iterations, bytesToB64url(salt), bytesToB64url(hash)].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = parseInt(parts[2], 10);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  let salt, expected;
  try { salt = b64urlToBytes(parts[3]); expected = b64urlToBytes(parts[4]); } catch { return false; }
  const actual = await pbkdf2Bits(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

// Length-independent equality to avoid leaking the hash via timing.
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
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
