import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createApiDispatcher } from '../src/enterprise/api-dispatch.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';
import { checkAuthRate, resetAuthRate, AUTH_RATE_LIMITS } from '../worker/auth-rate-limit.mjs';

// SEC-005: brute-force / rate-limiting on the auth endpoints.
//
// Two layers under test:
//  1. the pure KV-backed helper (worker/auth-rate-limit.mjs) — limits, lockout,
//     exponential backoff, and reset.
//  2. the dispatcher wiring (src/enterprise/api-dispatch.mjs) — that a throttled
//     login is rejected with 429 BEFORE the PBKDF2 verify ever runs.

// A minimal in-memory stand-in for a Workers-KV namespace (get/put/delete + TTL
// expiration we ignore for the synchronous test clock).
function fakeKv() {
  const map = new Map();
  return {
    map,
    async get(key, type) {
      const raw = map.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); }
  };
}

describe('checkAuthRate helper (SEC-005)', () => {
  it('fails open when no RATE_KV is bound (dev / Node)', async () => {
    const r = await checkAuthRate({}, { ip: '1.2.3.4', action: 'login' });
    expect(r.ok).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });

  it('allows up to the per-account limit, then locks out with a backoff', async () => {
    const env = { RATE_KV: fakeKv() };
    const max = AUTH_RATE_LIMITS.login.perAccount.max;
    const args = { ip: '9.9.9.9', accountKey: 'victim@example.com', action: 'login' };

    for (let i = 0; i < max; i++) {
      const r = await checkAuthRate(env, args);
      expect(r.ok).toBe(true);
    }
    // The (max+1)-th attempt trips the lockout.
    const blocked = await checkAuthRate(env, args);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('escalates the lockout exponentially across repeated over-limit attempts', async () => {
    const env = { RATE_KV: fakeKv() };
    const max = AUTH_RATE_LIMITS.login.perAccount.max;
    const args = { ip: '', accountKey: 'grind@example.com', action: 'login' };
    for (let i = 0; i < max; i++) await checkAuthRate(env, args);

    const first = await checkAuthRate(env, args);
    // While locked, the next attempt reports a remaining wait (does not grow the
    // window). Advance past the lockout and trip it again → longer backoff.
    expect(first.ok).toBe(false);
    const firstBackoff = first.retryAfterMs;

    // Simulate a PERSISTENT attacker: their lockout just elapsed and the window
    // expired, but the strike count is carried (lockedUntil left non-zero-in-
    // past so the decay branch preserves strikes — that's how backoff escalates
    // across windows for someone who keeps hammering).
    const key = 'arl:login:acct:grind@example.com';
    const bucket = JSON.parse(env.RATE_KV.map.get(key));
    bucket.windowResetAt = 1;       // expired window
    bucket.lockedUntil = 1;         // elapsed lockout, but truthy → strikes kept
    env.RATE_KV.map.set(key, JSON.stringify(bucket));

    for (let i = 0; i < max; i++) await checkAuthRate(env, args);
    const second = await checkAuthRate(env, args);
    expect(second.ok).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(firstBackoff);
  });

  it('reset clears the bucket so a recovered user is allowed again', async () => {
    const env = { RATE_KV: fakeKv() };
    const max = AUTH_RATE_LIMITS.login.perAccount.max;
    const args = { ip: '5.5.5.5', accountKey: 'recover@example.com', action: 'login' };
    for (let i = 0; i < max; i++) await checkAuthRate(env, args);
    expect((await checkAuthRate(env, args)).ok).toBe(false);

    await resetAuthRate(env, args);
    expect((await checkAuthRate(env, args)).ok).toBe(true);
  });

  it('throttles verification-token guessing per IP (no account key)', async () => {
    const env = { RATE_KV: fakeKv() };
    const max = AUTH_RATE_LIMITS.verify.perIp.max;
    const args = { ip: '7.7.7.7', accountKey: '', action: 'verify' };
    for (let i = 0; i < max; i++) expect((await checkAuthRate(env, args)).ok).toBe(true);
    expect((await checkAuthRate(env, args)).ok).toBe(false);
  });
});

describe('auth dispatch rate-limit wiring (SEC-005)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url) => {
      const type = new URL(url).searchParams.get('type');
      return { ok: true, json: async () => ({ Status: 0, Answer: type === 'MX' ? [{ type: 15 }] : [] }) };
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  // Build a dispatcher that shares the buildApi store/authService but injects the
  // KV-backed limiter — mirroring how worker/api.mjs wires it. Also count PBKDF2
  // verifies so we can prove the throttle short-circuits BEFORE the hash.
  function setup() {
    const env = { RATE_KV: fakeKv() };
    const authService = createWebCryptoAuthService({ sessionSecret: 'sec-005-secret' });
    let verifyCalls = 0;
    const realVerify = authService.verifyPasswordAsync.bind(authService);
    authService.verifyPasswordAsync = async (...a) => { verifyCalls++; return realVerify(...a); };

    const sent = [];
    const emailService = { provider: 'fake', async send(m) { sent.push(m); } };
    const api = buildApi({ authService, emailService, appUrl: 'https://nova.test' });
    const rateLimiter = {
      check: (args) => checkAuthRate(env, args),
      reset: (args) => resetAuthRate(env, args)
    };
    const dispatch = createApiDispatcher({
      store: api.store,
      authService,
      aiProvider: api.aiProvider,
      objectStorage: api.objectStorage,
      emailService,
      appUrl: 'https://nova.test',
      rateLimiter
    });
    return { dispatch, env, sent, verifyCalls: () => verifyCalls };
  }

  function tokenFrom(message) {
    const m = (message.text || '') + ' ' + (message.html || '');
    return (m.match(/verify=([0-9a-f]+)/) || [])[1];
  }

  it('rejects repeated failed logins with 429 BEFORE PBKDF2 verify', async () => {
    const { dispatch, env, sent, verifyCalls } = setup();
    // A real, verified account so a *correct* password could succeed.
    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'target@example.com', password: 'correct-horse-1' }, ip: '1.1.1.1' });
    await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: tokenFrom(sent[0]) }, ip: '1.1.1.1' });

    const max = AUTH_RATE_LIMITS.login.perAccount.max;
    // Burn the per-account allowance with wrong passwords (each a 401).
    for (let i = 0; i < max; i++) {
      await expect(
        dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'target@example.com', password: 'wrong' + i }, ip: '1.1.1.1' })
      ).rejects.toMatchObject({ status: 401 });
    }
    const verifiesBefore = verifyCalls();
    expect(verifiesBefore).toBe(max); // one PBKDF2 per allowed attempt

    // Now over the limit → 429, and crucially NO further PBKDF2 verify happened.
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'target@example.com', password: 'wrong-again' }, ip: '1.1.1.1' })
    ).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    expect(verifyCalls()).toBe(verifiesBefore); // throttle short-circuited the hash

    // The throttle is real: even the CORRECT password is now blocked.
    await expect(
      dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'target@example.com', password: 'correct-horse-1' }, ip: '1.1.1.1' })
    ).rejects.toMatchObject({ status: 429 });

    // Reset the buckets (simulating the lockout window elapsing) → the correct
    // password is accepted again.
    await resetAuthRate(env, { ip: '1.1.1.1', accountKey: 'target@example.com', action: 'login' });
    const recovered = await dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'target@example.com', password: 'correct-horse-1' }, ip: '1.1.1.1' });
    expect(recovered.status).toBe(200);
  });

  it('resets the failure counter after a successful login (no typo penalty)', async () => {
    const { dispatch, env, sent } = setup();
    await dispatch({ method: 'POST', path: '/api/auth/signup', body: { email: 'typist@example.com', password: 'right-pass-9' }, ip: '2.2.2.2' });
    await dispatch({ method: 'POST', path: '/api/auth/verify', body: { token: tokenFrom(sent[0]) }, ip: '2.2.2.2' });

    const max = AUTH_RATE_LIMITS.login.perAccount.max;
    // A few typos, but stay under the cap.
    for (let i = 0; i < max - 1; i++) {
      await expect(
        dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'typist@example.com', password: 'oops' + i }, ip: '2.2.2.2' })
      ).rejects.toMatchObject({ status: 401 });
    }
    // Correct password succeeds AND clears the account bucket.
    const ok = await dispatch({ method: 'POST', path: '/api/auth/login', body: { email: 'typist@example.com', password: 'right-pass-9' }, ip: '2.2.2.2' });
    expect(ok.status).toBe(200);

    // Bucket cleared → the user can again make a full fresh round of attempts
    // without an immediate lockout.
    expect((await checkAuthRate(env, { ip: '2.2.2.2', accountKey: 'typist@example.com', action: 'login' })).ok).toBe(true);
  });
});
