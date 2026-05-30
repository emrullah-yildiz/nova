// WebCrypto auth service for the Cloudflare Worker.
//
// Same interface the domain expects (createSessionTokenAsync /
// verifySessionTokenAsync / verifyOidcLogin) but async + WebCrypto, so it runs
// on workerd where node:crypto isn't available. Tokens are interchangeable with
// the node AuthService (see tests/webcrypto.test.js). The sync methods throw —
// on the Worker the domain only uses the async path.

import { signSessionPayload, verifySessionPayload } from './webcrypto.mjs';
import { createHttpError } from '../../src/enterprise/domain.mjs';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function createWebCryptoAuthService(options = {}) {
  const now = options.now || (() => Date.now());
  const sessionSecret = options.sessionSecret || 'nova-dev-session-secret';
  const sessionTtlMs = options.sessionTtlMs || DEFAULT_SESSION_TTL_MS;
  const oidcVerifier = options.oidcVerifier || null;

  return {
    createSessionToken() { throw createHttpError(500, 'WebCrypto auth is async-only; use createSessionTokenAsync.'); },
    verifySessionToken() { throw createHttpError(500, 'WebCrypto auth is async-only; use verifySessionTokenAsync.'); },

    async createSessionTokenAsync({ userId, organizationId, role }) {
      return signSessionPayload({ sub: userId, org: organizationId, role, iat: now(), exp: now() + sessionTtlMs }, sessionSecret);
    },

    async verifySessionTokenAsync(token) {
      if (!token) throw createHttpError(401, 'Missing bearer token.');
      const payload = await verifySessionPayload(token, sessionSecret);
      if (!payload) throw createHttpError(401, 'Invalid bearer token.');
      if (payload.exp && payload.exp < now()) throw createHttpError(401, 'Session expired.');
      return payload;
    },

    async verifyOidcLogin({ idToken, organizationSlug }) {
      if (!oidcVerifier) throw createHttpError(501, 'OIDC verifier is not configured.');
      const identity = await oidcVerifier({ idToken, organizationSlug });
      if (!identity || !identity.email) throw createHttpError(401, 'OIDC identity is invalid.');
      return {
        email: identity.email,
        displayName: identity.displayName || identity.email,
        externalSubject: identity.externalSubject || identity.sub || '',
        organizationSlug
      };
    }
  };
}
