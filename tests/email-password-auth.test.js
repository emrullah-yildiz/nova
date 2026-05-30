import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';

// Email+password sign-up/sign-in through the shared dispatcher, driven by the
// async WebCrypto auth service — the exact path the Cloudflare Worker uses.

function setup(options = {}) {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  return buildApi({ authService, ...options });
}

// A fake email sender that captures what would be sent (so we can read the
// verification token out of the link).
function captureEmails() {
  const sent = [];
  return { sent, service: { provider: 'fake', async send(m) { sent.push(m); } } };
}

function tokenFrom(message) {
  const m = (message.text || '') + ' ' + (message.html || '');
  return (m.match(/verify=([0-9a-f]+)/) || [])[1];
}

describe('email+password accounts (signup / login)', () => {
  // Signup runs an MX (DNS-over-HTTPS) check — stub it so tests never hit the
  // network and every non-disposable domain looks deliverable.
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url) => {
      const type = new URL(url).searchParams.get('type');
      return { ok: true, json: async () => ({ Status: 0, Answer: type === 'MX' ? [{ type: 15 }] : [] }) };
    });
  });
  afterEach(() => vi.unstubAllGlobals());

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

  it('rejects signups from disposable email domains with 400', async () => {
    const { dispatch } = setup();
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'temp@mailinator.com', password: 'password123' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('new accounts start unverified, and the emailed link marks them verified', async () => {
    const { sent, service } = captureEmails();
    const { dispatch } = setup({ emailService: service, appUrl: 'https://nova.test' });

    const signup = await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'newbie@example.com', password: 'verifyme123' } });
    expect(signup.status).toBe(201);
    expect(signup.body.user.emailVerified).toBe(false);
    expect(sent.length).toBe(1);

    const token = tokenFrom(sent[0]);
    expect(token).toBeTruthy();

    const verify = await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token } });
    expect(verify.status).toBe(200);
    expect(verify.body.emailVerified).toBe(true);

    const me = await dispatch({ method: 'GET', path: '/api/me', authorization: 'Bearer ' + signup.body.token });
    expect(me.body.user.emailVerified).toBe(true);
  });

  it('rejects an invalid/expired verification token with 400', async () => {
    const { dispatch } = setup({ emailService: captureEmails().service });
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: 'deadbeef-not-a-real-token' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('resend-verification re-sends while unverified, then no-ops once verified', async () => {
    const { sent, service } = captureEmails();
    const { dispatch } = setup({ emailService: service, appUrl: 'https://nova.test' });

    const signup = await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'resend@example.com', password: 'resend12345' } });
    const auth = 'Bearer ' + signup.body.token;
    expect(sent.length).toBe(1);

    const resend = await dispatch({ method: 'POST', path: '/api/auth/resend-verification', authorization: auth });
    expect(resend.status).toBe(200);
    expect(sent.length).toBe(2);

    await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: tokenFrom(sent[1]) } });
    const after = await dispatch({ method: 'POST', path: '/api/auth/resend-verification', authorization: auth });
    expect(after.body.alreadyVerified).toBe(true);
    expect(sent.length).toBe(2); // not re-sent once verified
  });
});
