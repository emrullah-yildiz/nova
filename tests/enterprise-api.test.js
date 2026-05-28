import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEnterpriseApiServer } from '../src/enterprise/api-server.mjs';
import { MemoryStateStore, hashToken } from '../src/enterprise/state-store.mjs';
import { MemoryObjectStorage } from '../src/enterprise/object-storage.mjs';

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
      const first = createEnterpriseApiServer({ persistenceFilePath, allowDevLogin: true });
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

      const second = createEnterpriseApiServer({ persistenceFilePath, allowDevLogin: true });
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
    const { server } = createEnterpriseApiServer({ allowDevLogin: true });
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

      const run = await request(baseUrl, '/api/projects/' + project.body.id + '/runs', {
        method: 'POST',
        token,
        body: { status: 'completed', durationMs: 17 }
      });
      expect(run.status).toBe(201);
      expect(run.body.versionId).toBe(saved.body.currentVersionId);

      const runs = await request(baseUrl, '/api/projects/' + project.body.id + '/runs', { token });
      expect(runs.status).toBe(200);
      expect(runs.body.runs).toHaveLength(1);
      expect(runs.body.runs[0].durationMs).toBe(17);

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

  it('returns cursor pagination metadata for large enterprise lists', async () => {
    const { server } = createEnterpriseApiServer({ allowDevLogin: true });
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      const token = login.body.token;
      for (const name of ['One', 'Two', 'Three']) {
        await request(baseUrl, '/api/projects', {
          method: 'POST',
          token,
          body: { name }
        });
      }

      const firstPage = await request(baseUrl, '/api/projects?limit=2', { token });
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.projects.map(project => project.name)).toEqual(['One', 'Two']);
      expect(firstPage.body.pagination).toMatchObject({ limit: 2, total: 3, hasMore: true });
      expect(firstPage.body.pagination.nextCursor).toBeTruthy();

      const secondPage = await request(baseUrl, '/api/projects?limit=2&cursor=' + encodeURIComponent(firstPage.body.pagination.nextCursor), { token });
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.projects.map(project => project.name)).toEqual(['Three']);
      expect(secondPage.body.pagination.hasMore).toBe(false);
      expect(secondPage.body.pagination.nextCursor).toBe('');

      const invalidLimit = await request(baseUrl, '/api/projects?limit=500', { token });
      expect(invalidLimit.status).toBe(400);
      expect(invalidLimit.body.error.message).toMatch(/limit/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('stores artifact payloads and manages background jobs through the API', async () => {
    const objectStorage = new MemoryObjectStorage();
    const { server } = createEnterpriseApiServer({ allowDevLogin: true, objectStorage });
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
        body: { name: 'Export Project' }
      });

      const artifact = await request(baseUrl, '/api/projects/' + project.body.id + '/artifacts', {
        method: 'POST',
        token,
        body: {
          name: 'graph.json',
          kind: 'graph-export',
          contentType: 'application/json',
          data: '{"ok":true}',
          metadata: { source: 'test' }
        }
      });
      expect(artifact.status).toBe(201);
      expect(artifact.body.byteSize).toBe(Buffer.byteLength('{"ok":true}'));

      const data = await request(baseUrl, '/api/artifacts/' + artifact.body.id + '/data', { token });
      expect(Buffer.from(data.body.data, 'base64').toString('utf8')).toBe('{"ok":true}');

      const job = await request(baseUrl, '/api/jobs', {
        method: 'POST',
        token,
        body: {
          type: 'graph.export',
          projectId: project.body.id,
          artifactId: artifact.body.id,
          payload: { format: 'json' }
        }
      });
      expect(job.status).toBe(201);
      expect(job.body.status).toBe('queued');

      const claimed = await request(baseUrl, '/api/jobs/claim', {
        method: 'POST',
        token,
        body: { type: 'graph.export' }
      });
      expect(claimed.body.job.id).toBe(job.body.id);
      expect(claimed.body.job.status).toBe('running');

      const completed = await request(baseUrl, '/api/jobs/' + job.body.id + '/complete', {
        method: 'POST',
        token,
        body: { result: { artifactId: artifact.body.id } }
      });
      expect(completed.body.status).toBe('completed');

      const jobs = await request(baseUrl, '/api/jobs?limit=1', { token });
      expect(jobs.body.jobs).toHaveLength(1);
      expect(jobs.body.pagination.total).toBe(1);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('uses state-store backed sessions on protected API routes', async () => {
    const stateStore = new MemoryStateStore();
    const { server } = createEnterpriseApiServer({ allowDevLogin: true, stateStore });
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      expect(login.status).toBe(200);
      expect(await stateStore.get('session:' + hashToken(login.body.token))).not.toBe(null);

      await stateStore.delete('session:' + hashToken(login.body.token));
      const me = await request(baseUrl, '/api/me', { token: login.body.token });
      expect(me.status).toBe(401);
      expect(me.body.error.message).toMatch(/Session expired/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('returns policy errors for blocked enterprise AI providers', async () => {
    const { server } = createEnterpriseApiServer({ allowDevLogin: true });
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

  it('can proxy enterprise AI through a server-held provider key', async () => {
    const originalFetch = globalThis.fetch;
    const providerCalls = [];
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options);
      providerCalls.push({ url, options });
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Provider-backed reply' } }],
        usage: { total_tokens: 12 }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const { server } = createEnterpriseApiServer({
      allowDevLogin: true,
      aiProviderConfig: {
        env: {
          NOVA_OPENAI_API_KEY: 'server-secret',
          NOVA_OPENAI_API_URL: 'https://provider.example/chat'
        }
      },
      aiPolicy: {
        allowedProviders: ['mock', 'openai'],
        allowedModels: {
          mock: ['nova-mock-enterprise'],
          openai: ['gpt-4o-mini']
        }
      }
    });
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
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Use server key' }]
        }
      });

      expect(ai.status).toBe(200);
      expect(ai.body.message.content).toBe('Provider-backed reply');
      expect(providerCalls).toHaveLength(1);
      expect(providerCalls[0].options.headers.Authorization).toBe('Bearer server-secret');
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('rejects malformed enterprise API payloads before domain operations run', async () => {
    const { server } = createEnterpriseApiServer({ allowDevLogin: true });
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

      const invalidRun = await request(baseUrl, '/api/projects/' + project.body.id + '/runs', {
        method: 'POST',
        token,
        body: { status: 'completed', durationMs: -1 }
      });
      expect(invalidRun.status).toBe(400);
      expect(invalidRun.body.error.message).toMatch(/durationMs/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('awaits async persistence restores and writes before responding', async () => {
    let persisted = null;
    const persistence = {
      async readSnapshot() {
        return null;
      },
      async writeSnapshot(snapshot) {
        await new Promise(resolve => setTimeout(resolve, 5));
        persisted = snapshot;
      }
    };
    const { createEnterpriseApiServerAsync } = await import('../src/enterprise/api-server.mjs');
    const { server } = await createEnterpriseApiServerAsync({ persistence, allowDevLogin: true });
    const port = await listen(server);
    const baseUrl = 'http://127.0.0.1:' + port;

    try {
      const login = await request(baseUrl, '/api/auth/dev-login', {
        method: 'POST',
        body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
      });
      const project = await request(baseUrl, '/api/projects', {
        method: 'POST',
        token: login.body.token,
        body: { name: 'Async Persist' }
      });

      expect(project.status).toBe(201);
      expect(persisted.projects.some(item => item.id === project.body.id)).toBe(true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
