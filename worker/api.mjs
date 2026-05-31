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
import {
  clearSessionCookie, parseCookie,
  serializeSlotCookie, clearSlotCookie, serializeActivePointer, clearActivePointer,
  parseAllSlots, parseActiveSlot, clampSlot, MAX_ACCOUNT_SLOTS
} from './cookies.mjs';
import { hashToken } from '../src/enterprise/state-hash.mjs';

let cachedApi = null;

async function getApi(env) {
  if (cachedApi) return cachedApi;
  const oidcVerifier = env.GOOGLE_CLIENT_ID ? createGoogleOidcVerifier({ clientId: env.GOOGLE_CLIENT_ID }) : null;
  const authService = createWebCryptoAuthService({ sessionSecret: env.NOVA_SESSION_SECRET, oidcVerifier });
  const persistence = env.NOVA_DATABASE_URL ? new NeonPersistence({ connectionString: env.NOVA_DATABASE_URL }) : null;
  const stateStore = env.SESSION_KV ? createKvStateStore(env.SESSION_KV) : undefined;
  const objectStorage = env.ARTIFACTS_R2 ? createR2ObjectStorage(env.ARTIFACTS_R2) : undefined;

  const store = new EnterpriseStore({ authService, persistence, stateStore });
  if (typeof store.ready === 'function') await store.ready();

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
  const dispatch = createApiDispatcher({
    store,
    authService,
    aiProvider,
    objectStorage,
    emailService,
    secretsService,
    issueService,
    appUrl: env.NOVA_PUBLIC_URL || '',
    allowDevLogin: env.NOVA_ALLOW_DEV_LOGIN === 'true'
  });
  cachedApi = { store, dispatch };
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

export async function handleEnterpriseApi(request, env) {
  const url = new URL(request.url);
  const cookieHeader = request.headers.get('cookie');

  // Public client config: lets the static SPA discover how to render sign-in
  // (Google client id is public; the secret never leaves the Worker).
  if (url.pathname === '/api/auth/config') {
    return Response.json(
      { googleClientId: env.GOOGLE_CLIENT_ID || '', devLogin: env.NOVA_ALLOW_DEV_LOGIN === 'true' },
      { status: 200, headers: cors(env) }
    );
  }

  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
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

    const { status, body: payload } = await dispatch({
      method: request.method,
      path: url.pathname,
      searchParams: url.searchParams,
      authorization: activeAuthorization(request, cookieHeader),
      body,
      appUrl: env.NOVA_PUBLIC_URL || url.origin
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
    return Response.json(payload, { status, headers: headersWith(env, cookies) });
  } catch (error) {
    return Response.json(
      { ok: false, error: { message: error.message || 'Internal server error', code: error.code || 'NOVA_API_ERROR' } },
      { status: error.status || 500, headers: cors(env) }
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
    for (const s of Object.keys(parseAllSlots(cookieHeader)).map(Number)) cookies.push(clearSlotCookie(s));
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
