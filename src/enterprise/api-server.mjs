import http from 'node:http';
import { EnterpriseStore, createHttpError } from './domain.mjs';
import {
  validateAiChatBody,
  validateConnectorPairBody,
  validateConnectorSessionBody,
  validateCreateProjectBody,
  validateDevLoginBody,
  validateHostOperationBody,
  validateSaveGraphBody
} from './validation.mjs';

export function createEnterpriseApiServer(options = {}) {
  const store = options.store || new EnterpriseStore();
  if (options.bootstrapDemo !== false && store.organizations.size === 0) store.bootstrapDemoTenant();
  const corsOrigin = options.corsOrigin || '*';
  const aiProvider = options.aiProvider || createMockAiProvider();

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res, corsOrigin);
    if (req.method === 'OPTIONS') return sendJson(res, 204, null);

    try {
      const url = new URL(req.url, 'http://localhost');
      const route = matchRoute(req.method, url.pathname);
      if (!route) throw createHttpError(404, 'Route not found.');
      const body = await readJsonBody(req);
      const context = route.public ? null : authenticateRequest(store, req);
      const result = await route.handler({ store, context, params: route.params, body, url, aiProvider });
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

function matchRoute(method, path) {
  const routes = [
    ['GET', /^\/health$/, true, 200, ({ store }) => ({
      ok: true,
      service: 'nova-enterprise-api',
      organizations: store.organizations.size
    })],
    ['POST', /^\/api\/auth\/dev-login$/, true, 200, ({ store, body }) => {
      validateDevLoginBody(body);
      const organization = Array.from(store.organizations.values()).find(item => item.slug === (body.organizationSlug || 'demo')) ||
        Array.from(store.organizations.values())[0];
      return store.createAuthSession({
        email: body.email || 'owner@demo.nova',
        organizationId: organization.id
      });
    }],
    ['GET', /^\/api\/me$/, false, 200, ({ context }) => ({ user: context.user })],
    ['GET', /^\/api\/projects$/, false, 200, ({ store, context }) => ({ projects: store.listProjects(context) })],
    ['POST', /^\/api\/projects$/, false, 201, ({ store, context, body }) => store.createProject(context, validateCreateProjectBody(body || {}))],
    ['GET', /^\/api\/projects\/([^/]+)$/, false, 200, ({ store, context, params }) => store.getProject(context, params[0])],
    ['PUT', /^\/api\/projects\/([^/]+)\/graph$/, false, 200, ({ store, context, params, body }) => store.updateProjectGraph(context, params[0], validateSaveGraphBody(body || {}))],
    ['GET', /^\/api\/projects\/([^/]+)\/versions$/, false, 200, ({ store, context, params }) => ({ versions: store.listProjectVersions(context, params[0]) })],
    ['POST', /^\/api\/projects\/([^/]+)\/versions\/([^/]+)\/restore$/, false, 200, ({ store, context, params }) => store.restoreProjectVersion(context, params[0], params[1])],
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
