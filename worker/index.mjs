// Cloudflare Worker entry — Nova API + static SPA (Phase 0).
//
// Currently hosts: a health check and the AI proxy (ported from
// api/proxy/chat.mjs, reusing its tested pure helpers). The full enterprise
// API (auth/projects/versions/members/share-links/sessions) mounts here next,
// reusing src/enterprise domain logic + server/auth/webcrypto.mjs + the Neon
// serverless driver. Static SPA assets are served via the ASSETS binding.
//
// The legacy Vercel deployment remains the source of truth until cutover.

import { Hono } from 'hono';
import { PROVIDERS, resolveProvider, pickModel, shouldFallthrough, summarizeFailure } from '../api/proxy/chat.mjs';
import { handleEnterpriseApi, resolveRoomAccess } from './api.mjs';
import { colorForUser, firstNameOf } from '../src/app/collab-core.js';

export { ProjectRoom } from './room.mjs';

const MAX_TOKENS_CAP = 512;
const RATE_LIMIT = 30;            // requests…
const RATE_WINDOW = 60 * 60;      // …per IP per hour (seconds)

const app = new Hono();

function cors(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.NOVA_CORS_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

app.get('/api/health', (c) => c.json({ ok: true, service: 'nova-api', ts: Date.now() }));

app.options('/api/proxy/chat', (c) => new Response(null, { status: 204, headers: cors(c.env) }));

app.post('/api/proxy/chat', async (c) => {
  const env = c.env;
  const ip = c.req.header('cf-connecting-ip') || (c.req.header('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  const rate = await checkRate(env, ip);
  if (rate.over) {
    return c.json(
      { error: { message: 'Free-tier rate limit reached for this session. Bring your own API key in Settings → Preferences for unlimited use.', code: 'RATE_LIMITED_PER_IP' } },
      429, { ...cors(env), 'Retry-After': String(rate.resetSeconds) }
    );
  }

  // Pass the Worker `env` explicitly so provider keys come from secrets, not process.env.
  const available = PROVIDERS.map((p) => resolveProvider(p, env)).filter(Boolean);
  if (available.length === 0) {
    return c.json(
      { error: { message: 'Free-tier proxy is not configured for this deployment. Set GROQ_API_KEY (and optionally others) as Worker secrets, or bring your own key in Nova Settings.', code: 'PROXY_NOT_CONFIGURED' } },
      503, cors(env)
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const attempts = [];
  let lastError;
  for (const provider of available) {
    let upstream;
    try {
      upstream = await fetch(provider.url, { method: 'POST', headers: provider.headers, body: JSON.stringify(forwardBody(provider, body)) });
    } catch (err) {
      lastError = { provider: provider.name, message: (err && err.message) || 'network error' };
      attempts.push(lastError);
      continue;
    }

    let cachedBody = null;
    if (upstream.status >= 400) {
      try { cachedBody = await upstream.text(); } catch { cachedBody = ''; }
      if (shouldFallthrough(upstream.status, cachedBody)) {
        lastError = { provider: provider.name, status: upstream.status, message: (cachedBody || '').slice(0, 200) };
        attempts.push(lastError);
        continue;
      }
    }

    const headers = { ...cors(env), 'X-Nova-Provider': provider.name, 'X-Nova-Rate-Remaining': String(rate.remaining) };
    const ct = upstream.headers.get('Content-Type');
    if (ct) headers['Content-Type'] = ct;
    // 4xx that didn't fall through: pass the buffered text. Otherwise stream the body.
    if (cachedBody !== null) return new Response(cachedBody, { status: upstream.status, headers });
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const fail = summarizeFailure(attempts, lastError);
  const headers = { ...cors(env) };
  if (fail.retryAfter) headers['Retry-After'] = String(fail.retryAfter);
  return c.json(fail.body, fail.status, headers);
});

// Live-collaboration room: a WebSocket upgrade that authenticates the cookie
// session, checks project access, and hands the socket to the per-project
// ProjectRoom Durable Object. Registered BEFORE the /api/* catch-all so the
// upgrade isn't swallowed by the REST dispatcher.
app.get('/api/projects/:id/room', async (c) => {
  const env = c.env;
  const request = c.req.raw;
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
    return c.json({ error: { message: 'Expected a WebSocket upgrade.', code: 'UPGRADE_REQUIRED' } }, 426, cors(env));
  }
  if (!env.PROJECT_ROOM) {
    return c.json({ error: { message: 'Realtime collaboration is not enabled for this deployment.', code: 'COLLAB_DISABLED' } }, 503, cors(env));
  }
  const projectId = c.req.param('id');
  const access = await resolveRoomAccess(env, request, projectId);
  if (!access.ok) {
    return c.json({ error: { message: 'Not allowed to join this project room.', code: 'ROOM_FORBIDDEN' } }, access.status || 403, cors(env));
  }

  // Resolve presence identity here (trusted) and pass it to the DO via headers.
  const headers = new Headers(request.headers);
  headers.set('X-Nova-User-Id', String(access.user.id));
  headers.set('X-Nova-First-Name', firstNameOf(access.user));
  headers.set('X-Nova-Color', colorForUser(access.user.id));
  headers.set('X-Nova-Role', access.canEdit ? 'Editor' : 'Viewer');

  const stub = env.PROJECT_ROOM.get(env.PROJECT_ROOM.idFromName(projectId));
  return stub.fetch(new Request(request.url, { method: request.method, headers, body: request.body }));
});

// Enterprise API (auth/projects/versions/members/…): the shared dispatcher
// driven by worker-safe deps (Neon serverless DB, KV session state, R2 objects,
// WebCrypto auth) — see worker/api.mjs. Registered last so /api/health and
// /api/proxy/chat above win first.
app.all('/api/*', (c) => handleEnterpriseApi(c.req.raw, c.env));

function forwardBody(provider, body) {
  return {
    model: pickModel(provider, body.model),
    messages: Array.isArray(body.messages) ? body.messages : [],
    max_tokens: Math.min(Number(body.max_tokens) || 512, MAX_TOKENS_CAP),
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
    stream: body.stream === true
  };
}

// Per-IP rate limit backed by Workers KV (replaces the in-memory Map, which a
// multi-instance edge can't share). No KV bound → allow (dev/no-abuse default).
async function checkRate(env, ip) {
  if (!env || !env.RATE_KV) return { over: false, remaining: RATE_LIMIT, resetSeconds: RATE_WINDOW };
  const key = 'rl:' + ip;
  const now = Math.floor(Date.now() / 1000);
  let bucket = await env.RATE_KV.get(key, 'json');
  if (!bucket || bucket.resetAt < now) bucket = { count: 0, resetAt: now + RATE_WINDOW };
  bucket.count += 1;
  await env.RATE_KV.put(key, JSON.stringify(bucket), { expiration: bucket.resetAt });
  return { over: bucket.count > RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - bucket.count), resetSeconds: bucket.resetAt - now };
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    if (env && env.ASSETS) return env.ASSETS.fetch(request); // SPA static assets
    return new Response('Not found', { status: 404 });
  }
};
