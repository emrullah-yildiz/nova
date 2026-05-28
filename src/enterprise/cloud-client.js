import { getRuntimeConfig, resolveApiUrl } from '../config/runtime-config.js';

export class NovaCloudClient {
  constructor(options = {}) {
    this.config = options.config || getRuntimeConfig();
    this.fetchImpl = options.fetchImpl || getFetchImpl();
    this.token = options.token || readStoredToken();
  }

  isConfigured() {
    return !!(this.config && this.config.apiBaseUrl);
  }

  isAuthenticated() {
    return !!this.token;
  }

  async devLogin({ email = 'owner@demo.nova', organizationSlug = 'demo' } = {}) {
    const response = await this.request('/api/auth/dev-login', {
      method: 'POST',
      auth: false,
      body: { email, organizationSlug }
    });
    this.token = response.token;
    storeToken(this.token);
    return response;
  }

  async me() {
    return this.request('/api/me');
  }

  async listProjects() {
    return this.request('/api/projects');
  }

  async createProject({ name, graph }) {
    return this.request('/api/projects', {
      method: 'POST',
      body: { name, graph }
    });
  }

  async getProject(projectId) {
    return this.request('/api/projects/' + encodeURIComponent(projectId));
  }

  async saveProjectGraph(projectId, { graph, message = 'Graph saved from Nova web' }) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/graph', {
      method: 'PUT',
      body: { graph, message }
    });
  }

  async listProjectVersions(projectId) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/versions');
  }

  async restoreProjectVersion(projectId, versionId) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/versions/' + encodeURIComponent(versionId) + '/restore', {
      method: 'POST'
    });
  }

  async listGraphRuns(projectId) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/runs');
  }

  async recordGraphRun(projectId, payload = {}) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/runs', {
      method: 'POST',
      body: payload
    });
  }

  async createConnectorSession({ host = 'revit', projectId = '', connectorVersion = '0.1.0' } = {}) {
    return this.request('/api/connectors/sessions', {
      method: 'POST',
      body: { host, projectId, connectorVersion }
    });
  }

  async chatWithAi({ projectId = '', provider = 'mock', model = 'nova-mock-enterprise', messages, metadata = {} }) {
    return this.request('/api/ai/chat', {
      method: 'POST',
      body: { projectId, provider, model, messages, metadata }
    });
  }

  async recordHostOperation(payload) {
    return this.request('/api/host-operations', {
      method: 'POST',
      body: payload
    });
  }

  async request(path, options = {}) {
    if (!this.fetchImpl) throw new Error('Fetch API is unavailable.');
    const headers = { 'Content-Type': 'application/json' };
    if (options.auth !== false && this.token) headers.Authorization = 'Bearer ' + this.token;
    const response = await this.fetchImpl(resolveApiUrl(path, this.config), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : 'Nova Cloud request failed.';
      throw new Error(message);
    }
    return data;
  }
}

export function createNovaCloudClient(options = {}) {
  return new NovaCloudClient(options);
}

function readStoredToken() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('nova_cloud_token') || '' : '';
  } catch (error) {
    return '';
  }
}

function getFetchImpl() {
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') return window.fetch.bind(window);
  if (typeof fetch === 'function') return fetch;
  return null;
}

function storeToken(token) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('nova_cloud_token', token || '');
  } catch (error) {
    // Ignore storage failures in locked-down browsers.
  }
}
