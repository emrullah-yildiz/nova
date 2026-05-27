import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEnterpriseApiServer } from '../src/enterprise/api-server.mjs';

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(baseUrl + path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: 'Bearer ' + options.token } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null
  };
}

describe('enterprise API server', () => {
  it('sets baseline security and CORS headers', async () => {
    const { server } = createEnterpriseApiServer({ corsOrigin: 'https://app.nova.example' });
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const health = await request(baseUrl, '/health');

      expect(health.status).toBe(200);
      expect(health.headers.get('access-control-allow-origin')).toBe('https://app.nova.example');
      expect(health.headers.get('x-content-type-options')).toBe('nosniff');
      expect(health.headers.get('x-frame-options')).toBe('DENY');
      expect(health.headers.get('referrer-policy')).toBe('no-referrer');
      expect(health.headers.get('permissions-policy')).toContain('camera=()');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('can disable dev login for production deployments', async () => {
    const { server } = createEnterpriseApiServer({ allowDevLogin: false });
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });

      expect(login.status).toBe(404);
      expect(login.body.error.message).toMatch(/Route not found/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('reloads persisted projects after API restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-enterprise-api-'));
    const persistenceFilePath = path.join(dir, 'store.json');

    try {
      const first = createEnterpriseApiServer({ persistenceFilePath });
      const firstPort = await listen(first.server);
      const firstBaseUrl = 'http://127.0.0.1:' + firstPort;
      const login = await request(firstBaseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      const project = await request(firstBaseUrl, '/api/projects', {
        method: 'POST',
        token: login.body.token,
        body: { name: 'Restart Project', graph: { nodes: [{ id: 'persisted' }], wires: [] } }
      });
      await new Promise(resolve => first.server.close(resolve));

      const second = createEnterpriseApiServer({ persistenceFilePath });
      const secondPort = await listen(second.server);
      const secondBaseUrl = 'http://127.0.0.1:' + secondPort;
      const secondLogin = await request(secondBaseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      const loaded = await request(secondBaseUrl, '/api/projects/' + project.body.id, {
        token: secondLogin.body.token
      });

      expect(loaded.status).toBe(200);
      expect(loaded.body.name).toBe('Restart Project');
      expect(loaded.body.versions[0].graph.nodes[0].id).toBe('persisted');
      await new Promise(resolve => second.server.close(resolve));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts OIDC-ready login callbacks and returns signed sessions', async () => {
    const { server } = createEnterpriseApiServer({
      sessionSecret: 'api-test-session-secret',
      oidcVerifier: async ({ idToken, organizationSlug }) => {
        expect(idToken).toBe('valid-id-token');
        expect(organizationSlug).toBe('demo');
        return {
          email: 'sso.user@example.com',
          displayName: 'SSO User',
          externalSubject: 'oidc|sso-user'
        };
      }
    });
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/oidc/callback', {
        method: 'POST',
        body: { idToken: 'valid-id-token', organizationSlug: 'demo' }
      });
      expect(login.status).toBe(200);
      expect(login.body.token).toContain('.');
      expect(login.body.user.role).toBe('Viewer');

      const me = await request(baseUrl, '/api/me', { token: login.body.token });
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe('sso.user@example.com');

      const blockedWrite = await request(baseUrl, '/api/projects', {
        method: 'POST',
        token: login.body.token,
        body: { name: 'Viewer Write' }
      });
      expect(blockedWrite.status).toBe(403);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('rejects OIDC callbacks when the verifier is not configured', async () => {
    const { server } = createEnterpriseApiServer();
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/oidc/callback', {
        method: 'POST',
        body: { idToken: 'valid-id-token', organizationSlug: 'demo' }
      });
      expect(login.status).toBe(501);
      expect(login.body.error.message).toMatch(/OIDC verifier/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('authenticates, stores projects, versions graphs, and creates connector sessions', async () => {
    const { server } = createEnterpriseApiServer();
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      expect(login.status).toBe(200);

      const token = login.body.token;
      const project = await request(baseUrl, '/api/projects', {
        method: 'POST',
        token,
        body: { name: 'Enterprise Graph', graph: { nodes: [], wires: [] } }
      });
      expect(project.status).toBe(201);

      const saved = await request(baseUrl, '/api/projects/' + project.body.id + '/graph', {
        method: 'PUT',
        token,
        body: { graph: { nodes: [{ id: 'node-1' }], wires: [] }, message: 'Save' }
      });
      expect(saved.body.versions).toHaveLength(2);

      const connector = await request(baseUrl, '/api/connectors/sessions', {
        method: 'POST',
        token,
        body: { host: 'revit', projectId: project.body.id }
      });
      expect(connector.status).toBe(201);
      expect(connector.body.pairingCode).toMatch(/^[A-F0-9]+$/);

      const ai = await request(baseUrl, '/api/ai/chat', {
        method: 'POST',
        token,
        body: {
          projectId: project.body.id,
          provider: 'mock',
          model: 'nova-mock-enterprise',
          messages: [{ role: 'user', content: 'Generate a lobby concept' }]
        }
      });
      expect(ai.status).toBe(200);
      expect(ai.body.status).toBe('completed');
      expect(ai.body.message.content).toContain('Generate a lobby concept');

      const audit = await request(baseUrl, '/api/audit', { token });
      expect(audit.body.events.some(event => event.type === 'ai.request.completed')).toBe(true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('returns policy errors for blocked enterprise AI providers', async () => {
    const { server } = createEnterpriseApiServer();
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      const ai = await request(baseUrl, '/api/ai/chat', {
        method: 'POST',
        token: login.body.token,
        body: {
          provider: 'openai',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Should be blocked by policy' }]
        }
      });
      expect(ai.status).toBe(403);
      expect(ai.body.error.message).toMatch(/provider/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('rejects malformed enterprise API payloads before domain operations run', async () => {
    const { server } = createEnterpriseApiServer();
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      const token = login.body.token;

      const project = await request(baseUrl, '/api/projects', {
        method: 'POST',
        token,
        body: { name: 'Validation Project', graph: { nodes: [], wires: [] } }
      });

      const invalidGraph = await request(baseUrl, '/api/projects/' + project.body.id + '/graph', {
        method: 'PUT',
        token,
        body: { graph: { nodes: [] } }
      });
      expect(invalidGraph.status).toBe(400);
      expect(invalidGraph.body.error.message).toMatch(/wires/);

      const invalidAi = await request(baseUrl, '/api/ai/chat', {
        method: 'POST',
        token,
        body: {
          messages: [{ role: 'tool', content: 'Nope' }]
        }
      });
      expect(invalidAi.status).toBe(400);
      expect(invalidAi.body.error.message).toMatch(/role/);

      const invalidConnectorPair = await request(baseUrl, '/api/connectors/sessions/con_missing/pair', {
        method: 'POST',
        token,
        body: {}
      });
      expect(invalidConnectorPair.status).toBe(400);
      expect(invalidConnectorPair.body.error.message).toMatch(/pairingCode/);

      const invalidHostOperation = await request(baseUrl, '/api/host-operations', {
        method: 'POST',
        token,
        body: { host: 'revit' }
      });
      expect(invalidHostOperation.status).toBe(400);
      expect(invalidHostOperation.body.error.message).toMatch(/operation/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
