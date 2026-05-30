import http from 'node:http';
import { AuthService } from './auth.mjs';
import { EnterpriseStore, createHttpError } from './domain.mjs';
import { JsonFilePersistence } from './persistence.mjs';
import { createStateStore } from './state-store.mjs';
import { createObjectStorage } from './object-storage.mjs';
import { PostgresPersistence } from '../../server/db/postgres-persistence.mjs';
import { createApiDispatcher, createConfiguredAiProvider } from './api-dispatch.mjs';
import { createSecretsService } from '../../server/auth/webcrypto.mjs';
import { createGithubIssueService } from '../../server/feedback/github-issues.mjs';

// Platform-agnostic API assembly: builds the store + injected deps and returns
// a dispatch(request) -> { status, body }. The Cloudflare Worker calls this too
// (with a Neon-backed store + WebCrypto auth); only the persistence and the HTTP
// adapter differ between runtimes.
export function buildApi(options = {}) {
  const oidcVerifier = options.oidcVerifier || null;
  const authService = options.authService || new AuthService({
    now: options.now,
    sessionSecret: options.sessionSecret,
    oidcVerifier
  });
  const persistence = options.persistence || resolvePersistence(options);
  const stateStore = options.stateStore || createStateStore(options);
  const objectStorage = createObjectStorage(options);
  const store = options.store || new EnterpriseStore({ authService, persistence, stateStore });
  if (!store.authService) store.authService = authService;
  if (options.bootstrapDemo !== false && store.organizations.size === 0 && !options.databaseUrl) store.bootstrapDemoTenant();
  if (options.aiPolicy) applyAiPolicy(store, options.aiPolicy);
  const corsOrigin = options.corsOrigin || '*';
  const aiProvider = options.aiProvider || createConfiguredAiProvider(options.aiProviderConfig || {});
  const allowDevLogin = options.allowDevLogin === true;
  const emailService = options.emailService || null;
  const appUrl = options.appUrl || '';
  // secretsService is built async (key derivation), so it's injected by
  // createEnterpriseApiServerAsync; sync callers without it get 503 on the
  // ai-settings routes only.
  const secretsService = options.secretsService || null;
  const issueService = options.issueService || createGithubIssueService({ token: options.githubToken, repo: options.githubRepo });
  const dispatch = createApiDispatcher({ store, authService, aiProvider, objectStorage, emailService, secretsService, issueService, appUrl, allowDevLogin });
  return { store, dispatch, authService, aiProvider, objectStorage, corsOrigin };
}

export function createEnterpriseApiServer(options = {}) {
  const api = buildApi(options);
  const { store, dispatch, corsOrigin } = api;

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res, corsOrigin);
    setSecurityHeaders(res);
    if (req.method === 'OPTIONS') return sendJson(res, 204, null);

    try {
      const url = new URL(req.url, 'http://localhost');
      const body = await readJsonBody(req);
      const { status, body: payload } = await dispatch({
        method: req.method,
        path: url.pathname,
        searchParams: url.searchParams,
        authorization: req.headers.authorization,
        body
      });
      sendJson(res, status, payload);
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: {
          message: error.message || 'Internal server error',
          code: error.code || 'NOVA_API_ERROR'
        }
      });
    }
  });

  return { server, store, dispatch };
}

export async function createEnterpriseApiServerAsync(options = {}) {
  // Derive the AES key for synced AI settings up front (async) and inject it, so
  // the sync buildApi path stays sync. Guarded: a missing secret leaves the
  // service null (ai-settings routes 503) rather than throwing.
  let withSecrets = options;
  if (!options.secretsService && (options.secretsKey || options.sessionSecret)) {
    try {
      const secretsService = await createSecretsService({ secretsKey: options.secretsKey, sessionSecret: options.sessionSecret });
      withSecrets = { ...options, secretsService };
    } catch (error) {
      console.error('[nova] secrets service init failed:', (error && error.message) || error);
    }
  }
  const api = createEnterpriseApiServer(withSecrets);
  if (api.store && api.store.ready) await api.store.ready();
  if (options.aiPolicy) applyAiPolicy(api.store, options.aiPolicy);
  return api;
}

function applyAiPolicy(store, aiPolicy) {
  for (const organization of store.organizations.values()) {
    organization.settings.ai = {
      ...(organization.settings.ai || {}),
      ...aiPolicy,
      allowedModels: {
        ...((organization.settings.ai && organization.settings.ai.allowedModels) || {}),
        ...(aiPolicy.allowedModels || {})
      }
    };
  }
}

function resolvePersistence(options) {
  if (options.databaseUrl) {
    return new PostgresPersistence({ connectionString: options.databaseUrl });
  }
  if (options.persistenceFilePath) {
    return new JsonFilePersistence(options.persistenceFilePath);
  }
  return null;
}

function setCorsHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  if (payload === null) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString();
      if (raw.length > 2_000_000) {
        reject(createHttpError(413, 'Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(createHttpError(400, 'Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}
