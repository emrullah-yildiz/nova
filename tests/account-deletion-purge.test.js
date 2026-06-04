import { describe, it, expect, vi, afterEach } from 'vitest';
import { EnterpriseStore, ROLES } from '../src/enterprise/domain.mjs';
import { AuthService } from '../src/enterprise/auth.mjs';
import { MemoryStateStore, hashToken } from '../src/enterprise/state-store.mjs';
import { handleEnterpriseApi, __resetApiCacheForTests, __getStoreForTests } from '../worker/api.mjs';
import { serializeSlotCookie, serializeActivePointer } from '../worker/cookies.mjs';

// SEC-004: deleting an account must purge ALL of the user's credentials —
// every session: and emailverify: KV key — not just the active slot, so a
// token captured before deletion can never authenticate afterwards.

describe('SEC-004 — account deletion purges all sessions / verification tokens', () => {
  it('deleteUserAccount returns every session+verify KV key; dropping them rejects pre-deletion tokens from ALL slots', async () => {
    let now = 1000;
    const authService = new AuthService({ now: () => now, sessionSecret: 'sec004-secret', sessionTtlMs: 10 * 60 * 1000 });
    const stateStore = new MemoryStateStore({ now: () => now });
    const store = new EnterpriseStore({ now: () => now, authService, stateStore });
    const org = store.createOrganization({ name: 'A' });
    const user = store.createUser({ email: 'erasure@example.com', displayName: 'Erasure' });
    store.addMembership({ organizationId: org.id, userId: user.id, role: ROLES.OWNER });

    // Two devices/slots → two distinct, simultaneously-valid sessions.
    const deviceA = await store.createAuthSessionAsync({ email: user.email, organizationId: org.id });
    now += 1; // distinct iat → distinct token/hash
    const deviceB = await store.createAuthSessionAsync({ email: user.email, organizationId: org.id });
    // An outstanding email-verification token for the same user.
    const verifyToken = await store.createEmailVerificationTokenAsync(user.id);

    // Sanity: both sessions authenticate and the verify token resolves pre-delete.
    expect((await store.authenticateAsync(deviceA.token)).user.email).toBe(user.email);
    expect((await store.authenticateAsync(deviceB.token)).user.email).toBe(user.email);
    expect(await stateStore.get('emailverify:' + hashToken(verifyToken))).toBeTruthy();

    const result = store.deleteUserAccount(user.id);
    expect(result.ok).toBe(true);
    // The store hands back the exact KV keys the caller must drop.
    expect(result.kvKeys).toEqual(expect.arrayContaining([
      'session:' + hashToken(deviceA.token),
      'session:' + hashToken(deviceB.token),
      'emailverify:' + hashToken(verifyToken)
    ]));

    // The Worker DELETE branch drops them from KV.
    for (const key of result.kvKeys) await stateStore.delete(key);

    // ACCEPTANCE: neither pre-deletion session token authenticates anymore — the
    // KV session is gone AND the user row is gone, so authenticateAsync rejects
    // (401 Session expired / 404 User not found — either way, no access).
    await expect(store.authenticateAsync(deviceA.token)).rejects.toThrow();
    await expect(store.authenticateAsync(deviceB.token)).rejects.toThrow();
    expect(await stateStore.get('session:' + hashToken(deviceA.token))).toBeNull();
    expect(await stateStore.get('session:' + hashToken(deviceB.token))).toBeNull();
    // And the verification token no longer resolves.
    expect(await stateStore.get('emailverify:' + hashToken(verifyToken))).toBeNull();
    await expect(store.consumeEmailVerificationTokenAsync(verifyToken)).rejects.toMatchObject({ status: 400 });
  });

  it('anonymizes userId/email in retained audit rows on deletion (no leftover PII link)', () => {
    let now = 1000;
    const store = new EnterpriseStore({ now: () => { now += 1; return now; } });
    const org = store.createOrganization({ name: 'A' });
    const user = store.createUser({ email: 'pii@example.com', displayName: 'Pii' });
    store.addMembership({ organizationId: org.id, userId: user.id, role: ROLES.OWNER });
    // An audit event that records both the userId and the email in metadata.
    store.audit({ organizationId: org.id, userId: user.id, type: 'auth.login', targetId: user.id, metadata: { email: 'pii@example.com' } });

    store.deleteUserAccount(user.id);

    for (const event of store.auditEvents) {
      expect(event.userId).not.toBe(user.id);
      expect(event.targetId).not.toBe(user.id);
      expect(JSON.stringify(event.metadata).toLowerCase()).not.toContain('pii@example.com');
    }
    // The deletion record itself carries no userId/email.
    const deleted = store.auditEvents.find(e => e.type === 'account.deleted');
    expect(deleted).toBeTruthy();
    expect(deleted.userId).toBe('');
  });

  it('clears the in-memory email-verification fallback (node/dev, no KV) on deletion', async () => {
    const store = new EnterpriseStore(); // no stateStore → in-memory emailVerifications
    const org = store.createOrganization({ name: 'A' });
    const user = store.createUser({ email: 'dev@example.com' });
    store.addMembership({ organizationId: org.id, userId: user.id, role: ROLES.OWNER });
    const token = await store.createEmailVerificationTokenAsync(user.id);
    expect(store.emailVerifications.size).toBe(1);

    store.deleteUserAccount(user.id);
    expect(store.emailVerifications.size).toBe(0);
    await expect(store.consumeEmailVerificationTokenAsync(token)).rejects.toMatchObject({ status: 400 });
  });
});

// End-to-end through the Worker entrypoint: a fake KV behind createKvStateStore,
// the exact signup → verify → login → DELETE /api/me path a browser drives. A
// token captured before deletion must be rejected after, and the slot cookie
// must be cleared.
describe('SEC-004 — Worker DELETE /api/me end-to-end', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetApiCacheForTests(); });

  function fakeKv() {
    const map = new Map();
    return {
      store: map,
      async get(key, type) {
        const raw = map.get(key);
        if (raw === undefined) return null;
        return type === 'json' ? JSON.parse(raw) : raw;
      },
      async put(key, value) { map.set(key, value); },
      async delete(key) { map.delete(key); }
    };
  }

  // Stub the signup MX/DNS check + console email logger so signup never hits the
  // network and we can read the verification link. Returns { logged, restore }.
  function stubNetworkAndEmail() {
    const logged = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => { logged.push(args.join(' ')); });
    vi.stubGlobal('fetch', async (url) => {
      const u = new URL(url);
      if (u.hostname === 'dns.google') {
        const type = u.searchParams.get('type');
        return { ok: true, json: async () => ({ Status: 0, Answer: type === 'MX' ? [{ type: 15 }] : [] }) };
      }
      return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
    });
    return logged;
  }

  // Build a `call(method, path, {body, cookie})` bound to one env. Parses the
  // Response into { status, body, res } so tests can read payload + Set-Cookie.
  function makeCall(env) {
    return async (method, path, { body, cookie } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (cookie) headers.cookie = cookie;
      const init = { method, headers };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await handleEnterpriseApi(new Request('https://nova.test' + path, init), env, null);
      const parsed = await res.clone().json().catch(() => ({}));
      return { status: res.status, body: parsed, res };
    };
  }

  // Run signup → verify → login for one account; returns the session token.
  async function provisionAccount(call, logged, email, password) {
    const signup = await call('POST', '/api/auth/signup', { body: { email, password } });
    expect(signup.status).toBe(201);
    const link = logged.join('\n').match(/verify=([0-9a-f]+)/g);
    // Use the LAST verify link logged (so multiple accounts don't collide).
    const token = link[link.length - 1].replace('verify=', '');
    const verify = await call('POST', '/api/auth/verify', { body: { token } });
    expect(verify.status).toBe(200);
    const login = await call('POST', '/api/auth/login', { body: { email, password } });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    return login.body.token;
  }

  it('clears the deleted account slot cookie and leaves NO session: key that authenticates', async () => {
    // Capture the verification link the console email service logs.
    const logged = stubNetworkAndEmail();

    const kv = fakeKv();
    const env = {
      NOVA_SESSION_SECRET: 'worker-sec004-secret',
      SESSION_KV: kv,
      NOVA_PUBLIC_URL: 'https://nova.test'
    };
    // handleEnterpriseApi returns a Response; parse it into { status, body, res }
    // so we can read both the JSON payload and the Set-Cookie headers.
    const call = makeCall(env);

    // 1. Sign up (no session yet — verification required).
    const signup = await call('POST', '/api/auth/signup', { body: { email: 'gone@example.com', password: 'delete-me-9' } });
    expect(signup.status).toBe(201);

    // 2. Pull the verification token out of the logged email link, then verify.
    const link = logged.join('\n').match(/verify=([0-9a-f]+)/);
    expect(link).toBeTruthy();
    const verify = await call('POST', '/api/auth/verify', { body: { token: link[1] } });
    expect(verify.status).toBe(200);

    // 3. Log in → capture the issued session token + slot cookie.
    const login = await call('POST', '/api/auth/login', { body: { email: 'gone@example.com', password: 'delete-me-9' } });
    expect(login.status).toBe(200);
    const sessionToken = login.body.token;
    expect(sessionToken).toBeTruthy();
    // A live session: key exists in KV.
    expect(await kv.get('session:' + hashToken(sessionToken), 'json')).toBeTruthy();

    // Build the browser's cookie header for this account (slot 0).
    const cookie = [
      serializeSlotCookie(0, sessionToken, null).split(';')[0],
      serializeActivePointer(0, null).split(';')[0]
    ].join('; ');

    // 4. DELETE /api/me with the captured cookie.
    const del = await call('DELETE', '/api/me', { body: { confirmEmail: 'gone@example.com', password: 'delete-me-9' }, cookie });
    expect(del.status).toBe(200);

    // The slot cookie is cleared (Max-Age=0).
    const setCookies = del.res.headers.getSetCookie ? del.res.headers.getSetCookie() : [del.res.headers.get('set-cookie')];
    expect(setCookies.some(c => /nova_session_0=;.*Max-Age=0/.test(c))).toBe(true);

    // ACCEPTANCE: the pre-deletion session: key is gone from KV → the captured
    // token authenticates nothing anymore. (The other-device case — a second
    // session: key not carried by this browser's cookies — is purged via the
    // kvKeys the store returns; proven at store level above.)
    expect(await kv.get('session:' + hashToken(sessionToken), 'json')).toBeNull();
  });

  // F-002 #1 — no over-deletion: with TWO distinct users in two slots, deleting
  // one must NOT touch the other user's slot cookie or its KV session.
  it('deleting one of two signed-in accounts leaves the OTHER account fully intact', async () => {
    const logged = stubNetworkAndEmail();
    const kv = fakeKv();
    const env = {
      NOVA_SESSION_SECRET: 'worker-sec004-multi',
      SESSION_KV: kv,
      NOVA_PUBLIC_URL: 'https://nova.test'
    };
    const call = makeCall(env);

    // Two distinct users → two distinct, simultaneously-valid sessions.
    const tokenA = await provisionAccount(call, logged, 'keep@example.com', 'keep-me-12');
    const tokenB = await provisionAccount(call, logged, 'gone@example.com', 'delete-me-9');
    expect(tokenA).not.toBe(tokenB);
    expect(await kv.get('session:' + hashToken(tokenA), 'json')).toBeTruthy();
    expect(await kv.get('session:' + hashToken(tokenB), 'json')).toBeTruthy();

    // Browser cookie: slot 0 = keep (A), slot 1 = gone (B), active = slot 1.
    const cookie = [
      serializeSlotCookie(0, tokenA, null).split(';')[0],
      serializeSlotCookie(1, tokenB, null).split(';')[0],
      serializeActivePointer(1, null).split(';')[0]
    ].join('; ');

    // DELETE the active account (B / gone).
    const del = await call('DELETE', '/api/me', { body: { confirmEmail: 'gone@example.com', password: 'delete-me-9' }, cookie });
    expect(del.status).toBe(200);

    const setCookies = del.res.headers.getSetCookie ? del.res.headers.getSetCookie() : [del.res.headers.get('set-cookie')];
    // The deleted account's slot 1 cookie is cleared…
    expect(setCookies.some(c => /nova_session_1=;.*Max-Age=0/.test(c))).toBe(true);
    // …but the surviving account's slot 0 cookie is NEVER cleared.
    expect(setCookies.some(c => /nova_session_0=;.*Max-Age=0/.test(c))).toBe(false);
    // The active pointer is re-pointed to the surviving slot 0.
    expect(setCookies.some(c => /nova_active=0(;|$)/.test(c))).toBe(true);

    // The deleted account's KV session is gone…
    expect(await kv.get('session:' + hashToken(tokenB), 'json')).toBeNull();
    // …while the surviving account's KV session still resolves AND authenticates.
    expect(await kv.get('session:' + hashToken(tokenA), 'json')).toBeTruthy();
    const me = await call('GET', '/api/me', { cookie: serializeSlotCookie(0, tokenA, null).split(';')[0] });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('keep@example.com');
  });

  // F-002 #2 — cold-isolate residual / captured-token purge (the F-001 fix):
  // the deleted user's live session is present via cookie but the store's
  // userKvKeys index is empty (as after a cold isolate restart). The active
  // session: key must STILL be dropped — proving it comes from the captured
  // cookie token, not the index. An other-device key the index never saw would
  // fall back to TTL; we assert that residual explicitly.
  it('drops the active session via the captured cookie token even when the store index is empty (cold isolate)', async () => {
    const logged = stubNetworkAndEmail();
    const kv = fakeKv();
    const env = {
      NOVA_SESSION_SECRET: 'worker-sec004-cold',
      SESSION_KV: kv,
      NOVA_PUBLIC_URL: 'https://nova.test'
    };
    const call = makeCall(env);

    const sessionToken = await provisionAccount(call, logged, 'gone@example.com', 'delete-me-9');
    expect(await kv.get('session:' + hashToken(sessionToken), 'json')).toBeTruthy();

    // Simulate an other-device session for the same user that this browser does
    // NOT carry as a cookie. Put a plausible session: key in KV directly; with an
    // empty index it is unknown to deleteUserAccount and must survive to TTL.
    const otherDeviceKey = 'session:' + hashToken('other-device-token-not-in-cookies');
    await kv.put(otherDeviceKey, JSON.stringify({ stub: true }));

    // Cold isolate: wipe the in-memory userKvKeys index so kvKeys comes back
    // empty for this user. The captured-token path is now the ONLY thing that
    // can drop the active session: key.
    const store = await __getStoreForTests(env);
    store.userKvKeys.clear();

    const cookie = [
      serializeSlotCookie(0, sessionToken, null).split(';')[0],
      serializeActivePointer(0, null).split(';')[0]
    ].join('; ');

    const del = await call('DELETE', '/api/me', { body: { confirmEmail: 'gone@example.com', password: 'delete-me-9' }, cookie });
    expect(del.status).toBe(200);
    // F-001 FIX: the active browser's session: key is dropped via the captured
    // cookie token, despite the empty index.
    expect(await kv.get('session:' + hashToken(sessionToken), 'json')).toBeNull();
    // Documented residual: the other-device key the index never knew about is
    // NOT purged here — it falls back to natural TTL expiry (SEC-006/SEC-009).
    expect(await kv.get(otherDeviceKey, 'json')).toBeTruthy();
  });
});
