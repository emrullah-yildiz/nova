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
    body: text ? JSON.parse(text) : null
  };
}

describe('enterprise API server', () => {
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
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
