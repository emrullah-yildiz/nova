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
import { NeonPersistence } from '../server/db/neon-persistence.mjs';
import { createKvStateStore, createR2ObjectStorage } from './adapters.mjs';

let cachedApi = null;

async function getApi(env) {
  if (cachedApi) return cachedApi;
  const authService = createWebCryptoAuthService({ sessionSecret: env.NOVA_SESSION_SECRET });
  const persistence = env.NOVA_DATABASE_URL ? new NeonPersistence({ connectionString: env.NOVA_DATABASE_URL }) : null;
  const stateStore = env.SESSION_KV ? createKvStateStore(env.SESSION_KV) : undefined;
  const objectStorage = env.ARTIFACTS_R2 ? createR2ObjectStorage(env.ARTIFACTS_R2) : undefined;

  const store = new EnterpriseStore({ authService, persistence, stateStore });
  if (typeof store.ready === 'function') await store.ready();

  const aiProvider = createConfiguredAiProvider({ env });
  const dispatch = createApiDispatcher({
    store,
    authService,
    aiProvider,
    objectStorage,
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

export async function handleEnterpriseApi(request, env) {
  const { dispatch } = await getApi(env);
  const url = new URL(request.url);
  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try { body = await request.json(); } catch { body = {}; }
  }
  try {
    const { status, body: payload } = await dispatch({
      method: request.method,
      path: url.pathname,
      searchParams: url.searchParams,
      authorization: request.headers.get('authorization'),
      body
    });
    return Response.json(payload, { status, headers: cors(env) });
  } catch (error) {
    return Response.json(
      { ok: false, error: { message: error.message || 'Internal server error', code: error.code || 'NOVA_API_ERROR' } },
      { status: error.status || 500, headers: cors(env) }
    );
  }
}
