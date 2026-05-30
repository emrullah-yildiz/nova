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

  it('signup creates the account but issues NO session (verification required)', async () => {
    const { dispatch } = setup();
    const res = await dispatch({
      method: 'POST', path: '/api/auth/signup',
      body: { email: 'ada@example.com', password: 'lovelace8', displayName: 'Ada' }
    });
    expect(res.status).toBe(201);
    expect(res.body.verificationRequired).toBe(true);
    expect(res.body.email).toBe('ada@example.com');
    expect(res.body.token).toBeUndefined(); // not signed in yet
  });

  it('login is blocked with 403 EMAIL_NOT_VERIFIED until verified, then succeeds', async () => {
    const { sent, service } = captureEmails();
    const { dispatch } = setup({ emailService: service, appUrl: 'https://nova.test' });
    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'grace@example.com', password: 'hopper-1906' } });

    // Unverified → blocked.
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'grace@example.com', password: 'hopper-1906' } })
    ).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });

    // Verify via the emailed link, then login works.
    await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: tokenFrom(sent[0]) } });
    const ok = await dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'grace@example.com', password: 'hopper-1906' } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('grace@example.com');

    // Wrong password is still a generic 401 (checked before the verified gate).
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
    const { sent, service } = captureEmails();
    const { dispatch } = setup({ emailService: service, appUrl: 'https://nova.test' });
    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'Mixed@Example.com', password: 'casetest12' } });
    await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: tokenFrom(sent[0]) } });
    const res = await dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'mixed@example.com', password: 'casetest12' } });
    expect(res.status).toBe(200);
  });

  it('rejects signups from disposable email domains with 400', async () => {
    const { dispatch } = setup();
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'temp@mailinator.com', password: 'password123' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('the emailed link verifies AND signs the user in (returns a working session)', async () => {
    const { sent, service } = captureEmails();
    const { dispatch } = setup({ emailService: service, appUrl: 'https://nova.test' });

    const signup = await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'newbie@example.com', password: 'verifyme123' } });
    expect(signup.status).toBe(201);
    expect(signup.body.verificationRequired).toBe(true);
    expect(sent.length).toBe(1);

    const token = tokenFrom(sent[0]);
    expect(token).toBeTruthy();

    const verify = await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token } });
    expect(verify.status).toBe(200);
    expect(verify.body.emailVerified).toBe(true);
    expect(typeof verify.body.token).toBe('string'); // sign-in completed by the link

    const me = await dispatch({ method: 'GET', path: '/api/me', authorization: 'Bearer ' + verify.body.token });
    expect(me.body.user.email).toBe('newbie@example.com');
    expect(me.body.user.emailVerified).toBe(true);
  });

  it('rejects an invalid/expired verification token with 400', async () => {
    const { dispatch } = setup({ emailService: captureEmails().service });
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: 'deadbeef-not-a-real-token' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('resend-verification (public, by email) re-sends while unverified, then no-ops once verified', async () => {
    const { sent, service } = captureEmails();
    const { dispatch } = setup({ emailService: service, appUrl: 'https://nova.test' });

    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'resend@example.com', password: 'resend12345' } });
    expect(sent.length).toBe(1);

    // No session needed — resend by email (the pre-verify path).
    const resend = await dispatch({ method: 'POST', path: '/api/auth/resend-verification', body: { email: 'resend@example.com' } });
    expect(resend.status).toBe(200);
    expect(resend.body.ok).toBe(true);
    expect(sent.length).toBe(2);

    await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: tokenFrom(sent[1]) } });
    const after = await dispatch({ method: 'POST', path: '/api/auth/resend-verification', body: { email: 'resend@example.com' } });
    expect(after.body.ok).toBe(true);       // generic response (no enumeration)
    expect(sent.length).toBe(2);            // not re-sent once verified

    // Unknown email is also a generic ok with no send.
    const unknown = await dispatch({ method: 'POST', path: '/api/auth/resend-verification', body: { email: 'nobody@example.com' } });
    expect(unknown.body.ok).toBe(true);
    expect(sent.length).toBe(2);
  });
});
