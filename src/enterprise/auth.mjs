import crypto from 'node:crypto';
import { createHttpError } from './domain.mjs';
import { hashPassword, verifyPassword } from '../../server/auth/webcrypto.mjs';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export class AuthService {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
    this.sessionSecret = options.sessionSecret || 'nova-dev-session-secret';
    this.oidcVerifier = options.oidcVerifier || null;
    this.sessionTtlMs = options.sessionTtlMs || DEFAULT_SESSION_TTL_MS;
  }

  createSessionToken({ userId, organizationId, role }) {
    const payload = {
      sub: userId,
      org: organizationId,
      role,
      iat: this.now(),
      exp: this.now() + this.sessionTtlMs
    };
    return signPayload(payload, this.sessionSecret);
  }

  verifySessionToken(token) {
    if (!token) throw createHttpError(401, 'Missing bearer token.');
    const payload = verifySignedPayload(token, this.sessionSecret);
    if (payload.exp && payload.exp < this.now()) throw createHttpError(401, 'Session expired.');
    return payload;
  }

  // Async crypto surface, so the domain can stay agnostic to whether the auth
  // service uses sync node:crypto (here) or async WebCrypto (the Worker). The
  // node implementation just wraps the sync methods.
  async createSessionTokenAsync(input) { return this.createSessionToken(input); }
  async verifySessionTokenAsync(token) { return this.verifySessionToken(token); }

  // Email+password credentials. Delegates to the shared WebCrypto PBKDF2 impl
  // so the hash format is byte-for-byte identical to the Worker's auth service.
  async hashPasswordAsync(password) { return hashPassword(password); }
  async verifyPasswordAsync(password, stored) { return verifyPassword(password, stored); }

  async verifyOidcLogin({ idToken, organizationSlug }) {
    if (!this.oidcVerifier) throw createHttpError(501, 'OIDC verifier is not configured.');
    let identity;
    try {
      identity = await this.oidcVerifier({ idToken, organizationSlug });
    } catch (error) {
      // Surface the real reason (audience/issuer/signature/JWKS/expiry) as a
      // clean 401 instead of an opaque 500 — so the client shows why sign-in
      // failed rather than a generic message.
      throw createHttpError(401, 'Could not verify your Google sign-in: ' + ((error && error.message) || 'verification failed'), 'OIDC_VERIFY_FAILED');
    }
    if (!identity || !identity.email) throw createHttpError(401, 'OIDC identity is invalid.', 'OIDC_VERIFY_FAILED');
    return {
      email: identity.email,
      displayName: identity.displayName || identity.email,
      externalSubject: identity.externalSubject || identity.sub || '',
      organizationSlug
    };
  }
}

export function signPayload(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return encodedPayload + '.' + signature;
}

export function verifySignedPayload(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw createHttpError(401, 'Invalid bearer token.');
  const [encodedPayload, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (!timingSafeEqual(signature, expected)) throw createHttpError(401, 'Invalid bearer token.');
  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (error) {
    throw createHttpError(401, 'Invalid bearer token.');
  }
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
