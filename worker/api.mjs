// Worker-side assembly of the enterprise API: builds an EnterpriseStore from
// worker-safe deps (Neon serverless DB, KV session state, R2 objects, WebCrypto
// auth) and drives the shared dispatcher. No node:net/tls/fs reaches the bundle.
//
// Note: the EnterpriseStore is an in-memory store with snapshot persistence, so
// this reads the full snapshot per cold isolate and flushes on writes. That's
// correct but not optimal at scale; a per-request query model is a later step.

import { EnterpriseStore } from '../src/enterprise/domain.mjs';
import { createApiDispatcher, createConfiguredAiProvider } from '../src/enterprise/api-dispatch.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';
import { createSecretsService } from '../server/auth/webcrypto.mjs';
import { createGithubIssueService } from '../server/feedback/github-issues.mjs';
import { createGoogleOidcVerifier } from '../server/auth/oidc-verifier.mjs';
import { createEmailService } from '../server/email/resend.mjs';
import { NeonPersistence } from '../server/db/neon-persistence.mjs';
import { createKvStateStore, createR2ObjectStorage } from './adapters.mjs';
import { checkAuthRate, resetAuthRate } from './auth-rate-limit.mjs';
import {
  clearSessionCookie, parseCookie,
  serializeSlotCookie, clearSlotCookie, clearAllSlotCookies, serializeActivePointer, clearActivePointer,
  parseAllSlots, parseActiveSlot, clampSlot, MAX_ACCOUNT_SLOTS
} from './cookies.mjs';
import { hashToken } from '../src/enterprise/state-hash.mjs';
import { createFormaPairingService } from '../src/enterprise/forma-pairing.mjs';

let cachedApi = null;

// Test-only: the module-level cache binds the first env's store for the isolate
// lifetime (correct in the Worker — one env per isolate). Tests that drive
// handleEnterpriseApi with different envs/KVs must reset it between cases.
export function __resetApiCacheForTests() {
  cachedApi = null;
}

// Test-only: boot (or reuse) the cached store for an env so tests can inspect or
// mutate store state (e.g. simulate a cold-isolate empty KV index for SEC-004).
export async function __getStoreForTests(env) {
  return (await getApi(env)).store;
}

async function getApi(env) {
  if (cachedApi) return cachedApi;
  const oidcVerifier = env.GOOGLE_CLIENT_ID ? createGoogleOidcVerifier({ clientId: env.GOOGLE_CLIENT_ID }) : null;
  const authService = createWebCryptoAuthService({ sessionSecret: env.NOVA_SESSION_SECRET, oidcVerifier });
  const persistence = env.NOVA_DATABASE_URL ? new NeonPersistence({ connectionString: env.NOVA_DATABASE_URL }) : null;
  const stateStore = env.SESSION_KV ? createKvStateStore(env.SESSION_KV) : undefined;
  const objectStorage = env.ARTIFACTS_R2 ? createR2ObjectStorage(env.ARTIFACTS_R2) : undefined;

  const store = new EnterpriseStore({ authService, persistence, stateStore });
  if (typeof store.ready === 'function') await store.ready();

  // FM-M1: Forma pairing-code service. Uses the same KV state store as session
  // state (codes are stored hashed under the 'formapair:' prefix, so they don't
  // collide with session:/emailverify:/rate: keys). No KV bound (node/tests) →
  // an in-memory fallback inside the service.
  const formaPairing = createFormaPairingService({ stateStore: stateStore || null });

  const aiProvider = createConfiguredAiProvider({ env });
  // Resend when RESEND_API_KEY is set, else a console fallback (logs the link).
  const emailService = createEmailService(env);
  // Encrypts/decrypts users' synced AI settings. Prefer a dedicated
  // NOVA_SECRETS_KEY; fall back to deriving from NOVA_SESSION_SECRET. Guarded so
  // a missing secret never throws out of getApi (handlers return 503 instead).
  let secretsService = null;
  try {
    if (env.NOVA_SECRETS_KEY || env.NOVA_SESSION_SECRET) {
      secretsService = await createSecretsService({ secretsKey: env.NOVA_SECRETS_KEY, sessionSecret: env.NOVA_SESSION_SECRET });
    }
  } catch (e) {
    console.error('[nova] secrets service init failed:', (e && e.message) || e);
  }
  // Optional in-app support tickets → GitHub issues (FEEDBACK_GITHUB_TOKEN).
  const issueService = createGithubIssueService({ token: env.FEEDBACK_GITHUB_TOKEN, repo: env.FEEDBACK_GITHUB_REPO });
  // SEC-005: KV-backed brute-force throttle for the auth routes. Closes over the
  // deployment env (RATE_KV is stable per deploy); no KV bound → fails open.
  const rateLimiter = {
    check: (args) => checkAuthRate(env, args),
    reset: (args) => resetAuthRate(env, args)
  };
  const dispatch = createApiDispatcher({
    store,
    authService,
    aiProvider,
    objectStorage,
    emailService,
    secretsService,
    issueService,
    appUrl: env.NOVA_PUBLIC_URL || '',
    allowDevLogin: env.NOVA_ALLOW_DEV_LOGIN === 'true',
    rateLimiter
  });
  cachedApi = { store, dispatch, formaPairing };
  return cachedApi;
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.NOVA_CORS_ORIGIN) || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
}

// Routes whose successful response carries a session token we should promote to
// the httpOnly cookie. /api/auth/verify is here because clicking the emailed
// verification link completes sign-in. (signup no longer returns a token.)
const AUTH_ROUTES = new Set(['/api/auth/oidc/callback', '/api/auth/dev-login', '/api/auth/signup', '/api/auth/login', '/api/auth/verify']);

// A Headers instance (CORS + any Set-Cookie). Multiple Set-Cookie need
// Headers.append — a plain object would collapse duplicates to one.
function headersWith(env, cookies = []) {
  const h = new Headers(cors(env));
  for (const c of cookies) { if (c) h.append('Set-Cookie', c); }
  return h;
}

// Verify every `nova_session_<slot>` cookie → { [slot]: { token, userId, user } }.
// Invalid/expired tokens are dropped (their slot is treated as free).
async function resolveSlots(store, cookieHeader) {
  const slots = parseAllSlots(cookieHeader);
  const map = {};
  for (const [slotStr, token] of Object.entries(slots)) {
    try {
      const ctx = await store.authenticateAsync(token);
      map[Number(slotStr)] = { token, userId: ctx.userId, user: ctx.user };
    } catch { /* invalid/expired → slot free */ }
  }
  return map;
}

// The slot whose token is "active": the pointer if it maps to a valid slot,
// else the lowest valid slot, else null.
function resolveActiveSlot(cookieHeader, map) {
  const pointer = parseActiveSlot(cookieHeader);
  if (pointer !== null && map[pointer]) return pointer;
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
  return keys.length ? keys[0] : null;
}

// Authorization for a normal request: explicit header → active slot token →
// lowest slot → legacy single cookie.
function activeAuthorization(request, cookieHeader) {
  const header = request.headers.get('authorization');
  if (header) return header;
  const slots = parseAllSlots(cookieHeader);
  const pointer = parseActiveSlot(cookieHeader);
  let token = (pointer !== null && slots[pointer]) ? slots[pointer] : null;
  if (!token) {
    const keys = Object.keys(slots).map(Number).sort((a, b) => a - b);
    if (keys.length) token = slots[keys[0]];
  }
  if (!token) token = parseCookie(cookieHeader); // legacy nova_session
  return token ? 'Bearer ' + token : null;
}

// Slot for a newly-issued token: reuse the user's existing slot, else the
// lowest free one, else overwrite slot 0 (cap reached — rare; 5 accounts).
function pickSlot(map, userId) {
  for (const s of Object.keys(map).map(Number)) if (map[s].userId === userId) return s;
  for (let i = 0; i < MAX_ACCOUNT_SLOTS; i++) if (!(i in map)) return i;
  return 0;
}

// Resolve the room access for a collaboration WebSocket: authenticate the
// cookie session, confirm the user can at least READ the project, and report
// whether they can WRITE (edit) it. Returns { ok, status, user, canEdit } —
// status is an HTTP code to send back when ok is false (401 unauthenticated,
// 403/404 no access). Reused by the /api/projects/:id/room upgrade handler.
export async function resolveRoomAccess(env, request, projectId) {
  const cookieHeader = request.headers.get('cookie');
  const authorization = activeAuthorization(request, cookieHeader);
  if (!authorization) return { ok: false, status: 401 };
  const token = authorization.replace(/^Bearer\s+/i, '');
  try {
    const { store } = await getApi(env);
    const context = await store.authenticateAsync(token);
    // getProject throws 404 when the user has no read access, hiding existence.
    const project = store.getProject(context, projectId);
    const canEdit = store.canWriteProject(context, project);
    return { ok: true, status: 200, user: context.user, canEdit };
  } catch (error) {
    return { ok: false, status: error && error.status ? error.status : 401 };
  }
}

// ── Forma pairing room (FM-M1) ────────────────────────────────────────────────

// Issue a Forma pairing code bound to the authenticated Nova session/user. The
// caller MUST present a valid session (cookie or Authorization). Returns
// { ok, status, code, expiresAt, user } — `code` is the raw code, returned once.
// Oracle F-001: the code is bound to context.userId; a join as the nova-app peer
// later re-presents the session and the room verifies the binding.
export async function issueFormaPairingCode(env, request) {
  const cookieHeader = request.headers.get('cookie');
  const authorization = activeAuthorization(request, cookieHeader);
  if (!authorization) return { ok: false, status: 401 };
  const token = authorization.replace(/^Bearer\s+/i, '');
  try {
    const { store, formaPairing } = await getApi(env);
    const context = await store.authenticateAsync(token);
    const { code, expiresAt } = await formaPairing.issue({
      userId: context.userId,
      organizationId: context.organizationId
    });
    return { ok: true, status: 201, code, expiresAt, user: context.user };
  } catch (error) {
    return { ok: false, status: error && error.status ? error.status : 401 };
  }
}

// Revoke a Forma pairing code (teardown). Scoped to the code's owner: a user may
// only revoke a code issued to them. Returns { ok, status, revoked }.
export async function revokeFormaPairingCode(env, request, code) {
  const cookieHeader = request.headers.get('cookie');
  const authorization = activeAuthorization(request, cookieHeader);
  if (!authorization) return { ok: false, status: 401 };
  const token = authorization.replace(/^Bearer\s+/i, '');
  try {
    const { store, formaPairing } = await getApi(env);
    const context = await store.authenticateAsync(token);
    const revoked = await formaPairing.revoke(code, { expectUserId: context.userId });
    return { ok: true, status: 200, revoked };
  } catch (error) {
    return { ok: false, status: error && error.status ? error.status : 401 };
  }
}

// Authorize a peer joining the Forma pairing room for `code` as `role`.
//
// nova-app peer: MUST present a valid Nova session (cookie/Authorization) AND
//   the room verifies the code was issued to THAT user (Oracle F-001 — code
//   possession alone is insufficient).
// forma-extension peer: joins by code only (it runs inside the user's Forma
//   iframe, with no Nova session) — but it can only ever reach a room a valid
//   code authorizes, and the audit owner is resolved from the code's record.
//
// Returns { ok, status, identity } where identity carries the resolved
// (server-authoritative) owning Nova userId/org + pairingRoom for the DO.
export async function resolveFormaRoomJoin(env, request, code, role) {
  try {
    const { store, formaPairing } = await getApi(env);
    let sessionUserId = null;
    if (role === 'nova-app') {
      const cookieHeader = request.headers.get('cookie');
      const authorization = activeAuthorization(request, cookieHeader);
      if (!authorization) return { ok: false, status: 401, reason: 'session_required' };
      try {
        const context = await store.authenticateAsync(authorization.replace(/^Bearer\s+/i, ''));
        sessionUserId = context.userId;
      } catch {
        return { ok: false, status: 401, reason: 'session_invalid' };
      }
    }
    const join = await formaPairing.authorizeJoin({ code, role, sessionUserId });
    if (!join.ok) {
      // 401 for a session/binding failure (F-001), 403 otherwise (expired/used/…).
      const status = (join.reason === 'session_required' || join.reason === 'session_mismatch') ? 401 : 403;
      return { ok: false, status, reason: join.reason };
    }
    // Server-authoritative identity: the OWNING Nova user the code was issued to
    // (from the pairing record), so every audit row is keyed to the responsible
    // user regardless of which peer relays the frame.
    return {
      ok: true,
      status: 200,
      identity: {
        role,
        userId: join.record.userId,
        organizationId: join.record.organizationId || '',
        pairingRoom: hashToken(String(code)) // room key is the code hash (never the raw code)
      }
    };
  } catch (error) {
    return { ok: false, status: error && error.status ? error.status : 500, reason: 'internal' };
  }
}

// F-003: persist a server-authoritative audit row for a Forma write frame. Called
// from the FormaPairingRoom DO (which shares this Worker bundle + env). The
// identity is resolved by the Worker from the pairing-code record, NOT a client
// claim, so the row is server-authoritative. Best-effort flush via the store's
// persistence; never throws into the relay loop.
export async function recordFormaWriteAudit(env, { userId = '', organizationId = '', pairingRoom = '', operation = '', ok = true, metadata = {} } = {}) {
  const { store } = await getApi(env);
  store.recordFormaWrite({ userId, organizationId, pairingRoom, operation, ok, metadata });
  if (store.flushPersistence) {
    try { await store.flushPersistence(); }
    catch (e) { if (typeof console !== 'undefined') console.error('[forma-room] audit flush failed:', (e && e.message) || e); }
  }
}

export async function handleEnterpriseApi(request, env, ctx) {
  const url = new URL(request.url);
  const cookieHeader = request.headers.get('cookie');
  // Lets the dispatcher offload the persistence flush to the runtime: the
  // response returns immediately while the isolate is kept alive until the Neon
  // write completes. Null in non-Worker contexts (the dispatcher then awaits).
  const waitUntil = ctx && typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null;
  // Caller IP for the SEC-005 auth throttle — same resolution as the AI-proxy
  // limiter in worker/index.mjs.
  const ip = request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  // Public client config: lets the static SPA discover how to render sign-in
  // (Google client id is public; the secret never leaves the Worker).
  if (url.pathname === '/api/auth/config') {
    return Response.json(
      { googleClientId: env.GOOGLE_CLIENT_ID || '', devLogin: env.NOVA_ALLOW_DEV_LOGIN === 'true' },
      { status: 200, headers: cors(env) }
    );
  }

  let body = {};
  // DELETE carries a body too — `DELETE /api/me` ships { confirmEmail, password }
  // (SEC-004). Without parsing it the delete dispatcher 400s on a missing
  // confirmEmail, so account deletion could never complete on the Worker.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    try { body = await request.json(); } catch { body = {}; }
  }

  try {
    // getApi() boots the store (reads the full Neon snapshot). Keep it INSIDE
    // the try so an init failure returns a structured JSON error, not a bare 500.
    const { store, dispatch } = await getApi(env);

    // ── Multi-account cookie endpoints (handled here — cookie multiplexing) ──
    if (url.pathname === '/api/auth/logout') {
      return await handleLogout(env, store, cookieHeader, body);
    }
    if (url.pathname === '/api/me/accounts' && request.method === 'GET') {
      const map = await resolveSlots(store, cookieHeader);
      const active = resolveActiveSlot(cookieHeader, map);
      const accounts = Object.keys(map).map(Number).sort((a, b) => a - b).map(slot => ({
        slot,
        email: map[slot].user.email,
        displayName: map[slot].user.displayName,
        active: slot === active
      }));
      return Response.json({ accounts }, { status: 200, headers: headersWith(env) });
    }
    if (url.pathname === '/api/auth/switch' && request.method === 'POST') {
      const slot = clampSlot(body && body.slot);
      const map = await resolveSlots(store, cookieHeader);
      if (slot === null || !map[slot]) {
        return Response.json({ ok: false, error: { message: 'That account is no longer signed in.', code: 'SLOT_NOT_FOUND' } }, { status: 401, headers: headersWith(env) });
      }
      return Response.json({ ok: true, user: map[slot].user }, { status: 200, headers: headersWith(env, [serializeActivePointer(slot, null)]) });
    }

    // SEC-004 / F-001: for DELETE /api/me we MUST capture the cookie-derived
    // slot→token map and the active user's id BEFORE dispatch runs, because
    // dispatch deletes the user row. After deletion resolveSlots() can no longer
    // authenticate this browser's cookies (requireUser throws 404), so the
    // active session's `session:<hash>` key would never be purged. Capturing it
    // up front guarantees the deleting browser's live session is always dropped.
    const isDeleteMe = url.pathname === '/api/me' && request.method === 'DELETE';
    let preDeleteMap = null;
    let preDeleteActive = null;
    let capturedSlotTokens = null;
    if (isDeleteMe) {
      preDeleteMap = await resolveSlots(store, cookieHeader);
      preDeleteActive = resolveActiveSlot(cookieHeader, preDeleteMap);
      capturedSlotTokens = parseAllSlots(cookieHeader);
    }

    const { status, body: payload } = await dispatch({
      method: request.method,
      path: url.pathname,
      searchParams: url.searchParams,
      authorization: activeAuthorization(request, cookieHeader),
      body,
      ip,
      appUrl: env.NOVA_PUBLIC_URL || url.origin,
      waitUntil
    });

    const cookies = [];
    // On a successful auth route, store the issued token in this user's slot and
    // make it active (reusing their slot on re-login). Migrate any legacy cookie.
    if (status < 400 && payload && payload.token && AUTH_ROUTES.has(url.pathname)) {
      const map = await resolveSlots(store, cookieHeader);
      let userId = null;
      try { userId = (await store.authenticateAsync(payload.token)).userId; } catch { /* fall back to a free slot */ }
      const slot = pickSlot(map, userId);
      const remember = !!(body && body.remember);
      const cookieMaxAge = remember ? undefined : null;
      cookies.push(serializeSlotCookie(slot, payload.token, cookieMaxAge));
      cookies.push(serializeActivePointer(slot, cookieMaxAge));
      if (parseCookie(cookieHeader)) cookies.push(clearSessionCookie()); // migrate legacy → slotted
    }
    if (status < 400 && isDeleteMe) {
      // SEC-004: a deleted account must leave NO working credential behind.
      // The slot map + active slot were captured from this browser's cookies
      // BEFORE dispatch deleted the user (F-001): re-resolving here would fail
      // auth (the user row is gone), so we rely on the pre-delete snapshot. The
      // active slot's user is the one just deleted. Drop the KV session for
      // EVERY slot owned by that user (not just the active one) plus every
      // session:/emailverify: key the store enumerated for them, and clear all
      // of their slot cookies — other signed-in accounts in this browser survive.
      const map = preDeleteMap || {};
      const active = preDeleteActive;
      const deletedUserId = active !== null && map[active] ? map[active].userId : null;
      const dropKv = async (key) => {
        if (store.stateStore && key) { try { await store.stateStore.delete(key); } catch { /* ignore */ } }
      };
      // KV keys the store enumerated for the deleted user (session + emailverify).
      // After a cold isolate the in-memory index is empty, so this can be sparse;
      // the cookie-derived drop below is the always-on guarantee for the active
      // browser's live session.
      for (const key of (payload && Array.isArray(payload.kvKeys) ? payload.kvKeys : [])) await dropKv(key);
      // Plus session keys derived from THIS request's slot cookies, captured
      // up front. This is the security-critical path: even when the store's
      // userKvKeys index is empty (cold isolate), the deleting browser's active
      // `session:<hash>` key is ALWAYS dropped here.
      const slotTokens = capturedSlotTokens || {};
      const survivingSlots = {};
      for (const [slotStr, entry] of Object.entries(map)) {
        const slot = Number(slotStr);
        if (deletedUserId !== null && entry.userId === deletedUserId) {
          await dropKv('session:' + hashToken(entry.token));
          cookies.push(clearSlotCookie(slot));
        } else {
          survivingSlots[slot] = entry;
        }
      }
      // Also clear any slot cookie whose token failed auth (not in map) — it may
      // be a stale/expired token for the deleted user; safest to wipe it.
      for (const slotStr of Object.keys(slotTokens)) {
        const slot = Number(slotStr);
        if (!(slot in map)) cookies.push(clearSlotCookie(slot));
      }
      // Re-point the active pointer to a surviving account, else clear it.
      const next = Object.keys(survivingSlots).map(Number).sort((a, b) => a - b)[0];
      if (next !== undefined) cookies.push(serializeActivePointer(next));
      else {
        cookies.push(clearActivePointer());
        cookies.push(clearSessionCookie());
      }
    }
    return Response.json(payload, { status, headers: headersWith(env, cookies) });
  } catch (error) {
    const headers = cors(env);
    // SEC-005: surface the backoff as a standard Retry-After (seconds) so the
    // client can wait the right amount before retrying.
    if (error && error.status === 429 && Number(error.retryAfterMs) > 0) {
      headers['Retry-After'] = String(Math.ceil(error.retryAfterMs / 1000));
    }
    return Response.json(
      { ok: false, error: { message: error.message || 'Internal server error', code: error.code || 'NOVA_API_ERROR' } },
      { status: error.status || 500, headers }
    );
  }
}

// scope:'current' (default) clears the active account and re-points to another;
// scope:'all' signs out every account in this browser.
async function handleLogout(env, store, cookieHeader, body) {
  const scope = body && body.scope === 'all' ? 'all' : 'current';
  const map = await resolveSlots(store, cookieHeader);
  const cookies = [];
  const dropKv = async (token) => {
    if (store.stateStore && token) { try { await store.stateStore.delete('session:' + hashToken(token)); } catch { /* ignore */ } }
  };

  if (scope === 'all') {
    // Clear every slot we can see (valid or not) + the pointer + legacy.
    for (const c of clearAllSlotCookies(cookieHeader)) cookies.push(c);
    for (const s of Object.keys(map).map(Number)) await dropKv(map[s].token);
    cookies.push(clearActivePointer());
    cookies.push(clearSessionCookie());
    return Response.json({ ok: true, activeSlot: null }, { status: 200, headers: headersWith(env, cookies) });
  }

  const active = resolveActiveSlot(cookieHeader, map);
  if (active !== null) {
    cookies.push(clearSlotCookie(active));
    await dropKv(map[active] && map[active].token);
    delete map[active];
  }
  const next = Object.keys(map).map(Number).sort((a, b) => a - b)[0];
  if (next !== undefined) {
    cookies.push(serializeActivePointer(next));
  } else {
    cookies.push(clearActivePointer());
    cookies.push(clearSessionCookie()); // also drop legacy when nothing remains
  }
  return Response.json({ ok: true, activeSlot: next === undefined ? null : next }, { status: 200, headers: headersWith(env, cookies) });
}
