// Worker-safe OIDC ID-token verifier (Google / generic SSO).
//
// Mirrors server/auth/jwks-verifier.mjs but uses WebCrypto (verifyRs256), so it
// runs on Cloudflare Workers where node:crypto's createVerify isn't available.
// Returns the identity shape the AuthService.verifyOidcLogin expects.
//
// JWKS fetching is injectable (options.fetchJwks) so it can be unit-tested
// without network access.

import { verifyRs256, b64urlToUtf8 } from './webcrypto.mjs';

function decodeSegment(segment) {
  return JSON.parse(b64urlToUtf8(segment));
}

export function createOidcVerifier(options = {}) {
  const issuers = [].concat(options.issuer || []);
  const audience = options.audience;
  const jwksUri = options.jwksUri;
  const now = options.now || (() => Date.now());
  const cacheTtlMs = options.cacheTtlMs || 5 * 60 * 1000;
  const fetchJwks = options.fetchJwks || (async () => {
    const res = await fetch(jwksUri);
    if (!res.ok) throw new Error('Failed to fetch JWKS (' + res.status + ').');
    return res.json();
  });

  let cache = null; // { keys, fetchedAt }
  async function refresh() {
    const jwks = await fetchJwks();
    cache = { keys: (jwks && jwks.keys) || [], fetchedAt: now() };
    return cache.keys;
  }
  async function getKey(kid) {
    if (!cache || (now() - cache.fetchedAt) > cacheTtlMs) await refresh();
    let key = cache.keys.find(k => k.kid === kid);
    if (!key) key = (await refresh()).find(k => k.kid === kid); // re-fetch once on miss (rotation)
    return key || null;
  }

  return async function verify({ idToken }) {
    if (!idToken || typeof idToken !== 'string') throw new Error('Missing OIDC id token.');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed OIDC id token.');
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = decodeSegment(headerB64);
    if (header.alg !== 'RS256') throw new Error('Unsupported token algorithm: ' + header.alg);

    const jwk = await getKey(header.kid);
    if (!jwk) throw new Error('No matching JWKS key for token.');

    const signatureValid = await verifyRs256(headerB64 + '.' + payloadB64, signatureB64, jwk);
    if (!signatureValid) throw new Error('Invalid OIDC token signature.');

    const payload = decodeSegment(payloadB64);
    if (issuers.length && !issuers.includes(payload.iss)) throw new Error('OIDC issuer mismatch.');
    if (audience) {
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(audience)) throw new Error('OIDC audience mismatch.');
    }
    if (payload.exp && payload.exp * 1000 < now()) throw new Error('OIDC token expired.');

    return {
      email: payload.email,
      displayName: payload.name || payload.email,
      sub: payload.sub,
      externalSubject: payload.sub,
      emailVerified: payload.email_verified === true,
      picture: payload.picture || ''
    };
  };
}

// Google convenience: correct issuer + JWKS URI; audience is your OAuth client id.
export function createGoogleOidcVerifier(options = {}) {
  return createOidcVerifier({
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: options.clientId,
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    ...options
  });
}
