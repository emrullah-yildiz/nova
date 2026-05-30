import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';

// Email+password sign-up/sign-in through the shared dispatcher, driven by the
// async WebCrypto auth service — the exact path the Cloudflare Worker uses.

function setup() {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  return buildApi({ authService });
}

describe('email+password accounts (signup / login)', () => {
  it('signup creates an account in a personal workspace and issues a working session', async () => {
    const { dispatch } = setup();
    const res = await dispatch({
      method: 'POST', path: '/api/auth/signup',
      body: { email: 'ada@example.com', password: 'lovelace8', displayName: 'Ada' }
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe('ada@example.com');
    expect(res.body.user.role).toBe('Owner'); // owns their personal workspace

    const me = await dispatch({ method: 'GET', path: '/api/me', authorization: 'Bearer ' + res.body.token });
    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBe('Ada');
  });

  it('login succeeds after signup and rejects the wrong password with 401', async () => {
    const { dispatch } = setup();
    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'grace@example.com', password: 'hopper-1906' } });

    const ok = await dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'grace@example.com', password: 'hopper-1906' } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('grace@example.com');

    await expect(
      dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'grace@example.com', password: 'WRONG-password' } })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects duplicate signups with 409', async () => {
    const { dispatch } = setup();
    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'dup@example.com', password: 'password123' } });
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'dup@example.com', password: 'password123' } })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('login for an unknown email is a generic 401 (no user enumeration)', async () => {
    const { dispatch } = setup();
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'nobody@example.com', password: 'whatever1' } })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects invalid email and too-short passwords with 400', async () => {
    const { dispatch } = setup();
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'not-an-email', password: 'longenough' } })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'ok@example.com', password: 'short' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('treats email as case-insensitive between signup and login', async () => {
    const { dispatch } = setup();
    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'Mixed@Example.com', password: 'casetest12' } });
    const res = await dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'mixed@example.com', password: 'casetest12' } });
    expect(res.status).toBe(200);
  });
});
