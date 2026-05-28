import http from 'node:http';
import { AuthService } from './auth.mjs';
import { EnterpriseStore, ROLES, createHttpError } from './domain.mjs';
import { JsonFilePersistence } from './persistence.mjs';
import { PostgresPersistence } from '../../server/db/postgres-persistence.mjs';
import { runMigrations } from '../../server/db/run-migrations.mjs';
import {
  validateAiChatBody,
  validateConnectorPairBody,
  validateConnectorSessionBody,
  validateCreateProjectBody,
  validateDevLoginBody,
  validateGraphRunBody,
  validateHostOperationBody,
  validateOidcCallbackBody,
  validateProjectMemberBody,
  validateSaveGraphBody
} from './validation.mjs';

export function createEnterpriseApiServer(options = {}) {
  const oidcVerifier = options.oidcVerifier || null;
  const authService = options.authService || new AuthService({
    now: options.now,
    sessionSecret: options.sessionSecret,
    oidcVerifier
  });
  const persistence = options.persistence || resolvePersistence(options);
  const store = options.store || new EnterpriseStore({ authService, persistence });
  if (!store.authService) store.authService = authService;
  if (options.bootstrapDemo !== false && store.organizations.size === 0 && !options.databaseUrl) store.bootstrapDemoTenant();
  if (options.aiPolicy) applyAiPolicy(store, options.aiPolicy);
  const corsOrigin = options.corsOrigin || '*';
  const aiProvider = options.aiProvider || createConfiguredAiProvider(options.aiProviderConfig || {});
  const allowDevLogin = options.allowDevLogin === true;

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res, corsOrigin);
    setSecurityHeaders(res);
    if (req.method === 'OPTIONS') return sendJson(res, 204, null);

    try {
      const url = new URL(req.url, 'http://localhost');
      const route = matchRoute(req.method, url.pathname, { allowDevLogin });
      if (!route) throw createHttpError(404, 'Route not found.');
      const body = await readJsonBody(req);
      const context = route.public ? null : authenticateRequest(store, req);
      const result = await route.handler({ store, context, params: route.params, body, url, aiProvider, authService });
      if (store.flushPersistence) await store.flushPersistence();
      sendJson(res, route.status || 200, result);
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

  return { server, store };
}

export async function createEnterpriseApiServerAsync(options = {}) {
  const api = createEnterpriseApiServer(options);
  if (api.store && api.store.ready) await api.store.ready();
  if (options.aiPolicy) applyAiPolicy(api.store, options.aiPolicy);
  return api;
}

function matchRoute(method, path, options = {}) {
  const routes = [
    ['GET', /^\/health$/, true, 200, ({ store }) => ({
      ok: true,
      service: 'nova-enterprise-api',
      organizations: store.organizations.size
    })],
    ['POST', /^\/api\/auth\/dev-login$/, true, 200, ({ store, body }) => {
      if (options.allowDevLogin === false) throw createHttpError(404, 'Route not found.');
      validateDevLoginBody(body);
      const organization = Array.from(store.organizations.values()).find(item => item.slug === (body.organizationSlug || 'demo')) ||
        Array.from(store.organizations.values())[0];
      return store.createAuthSession({
        email: body.email || 'owner@demo.nova',
        organizationId: organization.id
      });
    }],
    ['POST', /^\/api\/auth\/oidc\/callback$/, true, 200, handleOidcCallback],
    ['GET', /^\/api\/me$/, false, 200, ({ context }) => ({ user: context.user })],
    ['GET', /^\/api\/projects$/, false, 200, ({ store, context }) => ({ projects: store.listProjects(context) })],
    ['POST', /^\/api\/projects$/, false, 201, ({ store, context, body }) => store.createProject(context, validateCreateProjectBody(body || {}))],
    ['GET', /^\/api\/projects\/([^/]+)$/, false, 200, ({ store, context, params }) => store.getProject(context, params[0])],
    ['POST', /^\/api\/projects\/([^/]+)\/members$/, false, 200, ({ store, context, params, body }) => store.addProjectMember(context, params[0], validateProjectMemberBody(body || {}))],
    ['PUT', /^\/api\/projects\/([^/]+)\/graph$/, false, 200, ({ store, context, params, body }) => store.updateProjectGraph(context, params[0], validateSaveGraphBody(body || {}))],
    ['GET', /^\/api\/projects\/([^/]+)\/versions$/, false, 200, ({ store, context, params }) => ({ versions: store.listProjectVersions(context, params[0]) })],
    ['POST', /^\/api\/projects\/([^/]+)\/versions\/([^/]+)\/restore$/, false, 200, ({ store, context, params }) => store.restoreProjectVersion(context, params[0], params[1])],
    ['GET', /^\/api\/projects\/([^/]+)\/runs$/, false, 200, ({ store, context, params }) => ({ runs: store.listGraphRuns(context, params[0]) })],
    ['POST', /^\/api\/projects\/([^/]+)\/runs$/, false, 201, ({ store, context, params, body }) => store.recordGraphRun(context, params[0], validateGraphRunBody(body || {}))],
    ['POST', /^\/api\/connectors\/sessions$/, false, 201, ({ store, context, body }) => store.createConnectorSession(context, validateConnectorSessionBody(body || {}))],
    ['POST', /^\/api\/connectors\/sessions\/([^/]+)\/pair$/, false, 200, ({ store, context, params, body }) => {
      const payload = validateConnectorPairBody(body || {});
      return store.pairConnector(context, params[0], payload.pairingCode);
    }],
    ['POST', /^\/api\/ai\/chat$/, false, 200, handleAiChat],
    ['GET', /^\/api\/audit$/, false, 200, ({ store, context }) => ({ events: store.listAuditEvents(context) })],
    ['POST', /^\/api\/host-operations$/, false, 201, ({ store, context, body }) => store.recordHostOperation(context, validateHostOperationBody(body || {}))]
  ];

  for (const [routeMethod, pattern, isPublic, status, handler] of routes) {
    if (routeMethod !== method) continue;
    const match = path.match(pattern);
    if (!match) continue;
    return { public: isPublic, status, handler, params: match.slice(1) };
  }
  return null;
}

async function handleOidcCallback({ store, authService, body }) {
  const payload = validateOidcCallbackBody(body || {});
  const identity = await authService.verifyOidcLogin({
    idToken: payload.idToken,
    organizationSlug: payload.organizationSlug
  });
  const organization = Array.from(store.organizations.values()).find(item => item.slug === identity.organizationSlug) ||
    Array.from(store.organizations.values())[0];
  const user = store.createOrUpdateExternalUser(identity);
  try {
    store.requireMembership(user.id, organization.id);
  } catch (error) {
    if (organization.settings.ssoRequired) throw error;
    store.addMembership({ organizationId: organization.id, userId: user.id, role: ROLES.VIEWER });
  }
  return store.createAuthSession({ email: user.email, organizationId: organization.id });
}

async function handleAiChat({ store, context, body, aiProvider }) {
  const payload = validateAiChatBody(body || {});
  const request = store.createAiRequest(context, payload);
  try {
    const completion = await aiProvider.complete({
      provider: request.provider,
      model: request.model,
      messages: payload.messages,
      projectId: request.projectId,
      context
    });
    const content = completion && completion.content ? completion.content : '';
    const completed = store.completeAiRequest(context, request.id, {
      content,
      usage: completion && completion.usage
    });
    return {
      id: completed.id,
      provider: completed.provider,
      model: completed.model,
      status: completed.status,
      message: {
        role: 'assistant',
        content
      },
      usage: completed.usage
    };
  } catch (error) {
    store.failAiRequest(context, request.id, error.message || 'AI provider failed.');
    throw error;
  }
}

function authenticateRequest(store, req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return store.authenticate(token);
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

function createConfiguredAiProvider(config = {}) {
  const providers = {
    mock: createMockAiProvider(),
    ...createOpenAiCompatibleProviders(config)
  };
  return {
    async complete(request) {
      const provider = providers[request.provider] || providers.mock;
      return provider.complete(request);
    }
  };
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

function createMockAiProvider() {
  return {
    async complete({ messages = [], model }) {
      const lastUserMessage = [...messages].reverse().find(message => message && message.role === 'user');
      const text = lastUserMessage ? String(lastUserMessage.content || '') : '';
      return {
        content: 'Mock enterprise AI response for ' + (text || 'empty request') + '.',
        usage: {
          model,
          inputMessages: messages.length,
          outputCharacters: text.length
        }
      };
    }
  };
}

function createOpenAiCompatibleProviders(config = {}) {
  const env = config.env || (typeof process !== 'undefined' ? process.env : {});
  const definitions = [
    {
      id: 'openai',
      apiKey: env.NOVA_OPENAI_API_KEY,
      apiUrl: env.NOVA_OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
      extraHeaders: {}
    },
    {
      id: 'groq',
      apiKey: env.NOVA_GROQ_API_KEY,
      apiUrl: env.NOVA_GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
      extraHeaders: {}
    },
    {
      id: 'openrouter',
      apiKey: env.NOVA_OPENROUTER_API_KEY,
      apiUrl: env.NOVA_OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
      extraHeaders: {
        'HTTP-Referer': env.NOVA_PUBLIC_APP_URL || 'https://nova.local',
        'X-Title': 'Nova'
      }
    }
  ];
  return Object.fromEntries(
    definitions
      .filter(definition => definition.apiKey)
      .map(definition => [definition.id, createOpenAiCompatibleProvider(definition)])
  );
}

function createOpenAiCompatibleProvider({ apiKey, apiUrl, extraHeaders = {} }) {
  return {
    async complete({ model, messages = [] }) {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
          ...extraHeaders
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 2048
        })
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (error) {
        data = {};
      }
      if (!response.ok) {
        const message = data && data.error && data.error.message ? data.error.message : 'AI provider request failed.';
        throw createHttpError(response.status, message, 'AI_PROVIDER_ERROR');
      }
      const choice = data.choices && data.choices[0] && data.choices[0].message;
      return {
        content: choice && choice.content ? choice.content : '',
        usage: data.usage || null
      };
    }
  };
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

function resolveOidcVerifier(options) {
  if (options.oidcVerifier) return options.oidcVerifier;
  return null;
}
