import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { AuthService } from '../src/enterprise/auth.mjs';

// Google / OIDC sign-in through the shared dispatcher. A verification failure
// must be a clean 401 (with the real reason) — not an opaque 500 that the client
// shows as a generic "Google sign-in failed". Distinct Google identities must
// map to distinct accounts (multi-account); the same identity reuses its user.

// Stub verifier: maps known idTokens to identities; throws like the real one.
function fakeVerifier() {
  const identities = {
    tokA: { email: 'a@example.com', sub: 'google-a', displayName: 'Account A', emailVerified: true },
    tokB: { email: 'b@example.com', sub: 'google-b', displayName: 'Account B', emailVerified: true }
  };
  return async ({ idToken }) => {
    if (idToken === 'bad') throw new Error('Invalid OIDC token signature.');
    if (idToken === 'wrongaud') throw new Error('OIDC audience mismatch.');
    const id = identities[idToken];
    if (!id) throw new Error('No matching JWKS key for token.');
    return id;
  };
}

function setup() {
  const authService = new AuthService({ sessionSecret: 'test-secret', oidcVerifier: fakeVerifier() });
  return buildApi({ authService });
}

describe('Google/OIDC sign-in', () => {
  it('a valid Google token issues a working session', async () => {
    const { dispatch } = setup();
    const res = await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'tokA' } });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe('a@example.com');
    const me = await dispatch({ method: 'GET', path: '/api/me', authorization: 'Bearer ' + res.body.token });
    expect(me.body.user.email).toBe('a@example.com');
  });

  it('a verification failure is a 401 with the real reason (not a 500)', async () => {
    const { dispatch } = setup();
    await expect(dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'bad' } }))
      .rejects.toMatchObject({ status: 401, code: 'OIDC_VERIFY_FAILED', message: /signature/ });
    await expect(dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'wrongaud' } }))
      .rejects.toMatchObject({ status: 401, code: 'OIDC_VERIFY_FAILED', message: /audience/ });
  });

  it('two different Google accounts map to two different users (multi-account)', async () => {
    const { dispatch } = setup();
    const a = await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'tokA' } });
    const b = await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'tokB' } });
    expect(a.body.user.email).toBe('a@example.com');
    expect(b.body.user.email).toBe('b@example.com');
    expect(a.body.user.id).not.toBe(b.body.user.id);
  });

  it('signing in with the same Google account reuses the user', async () => {
    const { dispatch } = setup();
    const first = await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'tokA' } });
    const again = await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'tokA' } });
    expect(again.body.user.id).toBe(first.body.user.id);
  });

  it('rejects a missing/blank idToken with 400', async () => {
    const { dispatch } = setup();
    await expect(dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: {} })).rejects.toMatchObject({ status: 400 });
  });
});
