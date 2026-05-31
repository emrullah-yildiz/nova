import { getRuntimeConfig, resolveApiUrl } from '../config/runtime-config.js';

export class NovaCloudClient {
  constructor(options = {}) {
    this.config = options.config || getRuntimeConfig();
    this.fetchImpl = options.fetchImpl || getFetchImpl();
    // Cookie mode: the SPA is signed in via the httpOnly session cookie, so the
    // client sends same-origin requests with credentials and no Bearer token
    // (the durable identity, shared with the rest of the app). Bearer/token mode
    // is kept for dev-login and non-browser callers.
    this.useCookie = options.useCookie || false;
    this.token = options.token || (this.useCookie ? '' : readStoredToken());
  }

  isConfigured() {
    return this.useCookie || !!(this.config && this.config.apiBaseUrl);
  }

  isAuthenticated() {
    // In cookie mode the httpOnly cookie isn't readable from JS — the app gates
    // on app.currentUser instead, so treat the client as ready.
    return this.useCookie || !!this.token;
  }

  clearSession() {
    this.token = '';
    storeToken('');
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

  async listProjects(pagination = {}) {
    return this.request(withPagination('/api/projects', pagination));
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

  // Projects shared with the signed-in user (member, different org).
  async listSharedProjects(pagination = {}) {
    return this.request(withPagination('/api/projects/shared', pagination));
  }

  // ── Share links ──
  async createShareLink(projectId, { role, expiresInMs = 0 } = {}) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/share-links', {
      method: 'POST',
      body: { role, expiresInMs }
    });
  }

  async listShareLinks(projectId) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/share-links');
  }

  async revokeShareLink(projectId, linkId) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/share-links/' + encodeURIComponent(linkId) + '/revoke', {
      method: 'POST'
    });
  }

  // Redeem a share token → join the project at the link's role.
  async redeemShareLink(token) {
    return this.request('/api/share/' + encodeURIComponent(token), { method: 'POST' });
  }

  // Invite someone by email → emails them a role-scoped join link.
  async inviteByEmail(projectId, { email, role }) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/invites', {
      method: 'POST',
      body: { email, role }
    });
  }

  // Submit an in-app support ticket → opens a GitHub issue server-side.
  async submitTicket({ title, body, category }) {
    return this.request('/api/feedback/ticket', { method: 'POST', body: { title, body, category } });
  }

  async saveProjectGraph(projectId, { graph, message = 'Graph saved from Nova web' }) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/graph', {
      method: 'PUT',
      body: { graph, message }
    });
  }

  async listProjectVersions(projectId, pagination = {}) {
    return this.request(withPagination('/api/projects/' + encodeURIComponent(projectId) + '/versions', pagination));
  }

  async restoreProjectVersion(projectId, versionId) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/versions/' + encodeURIComponent(versionId) + '/restore', {
      method: 'POST'
    });
  }

  async listGraphRuns(projectId, pagination = {}) {
    return this.request(withPagination('/api/projects/' + encodeURIComponent(projectId) + '/runs', pagination));
  }

  async recordGraphRun(projectId, payload = {}) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/runs', {
      method: 'POST',
      body: payload
    });
  }

  async listArtifacts(projectId, pagination = {}) {
    return this.request(withPagination('/api/projects/' + encodeURIComponent(projectId) + '/artifacts', pagination));
  }

  async createArtifact(projectId, payload = {}) {
    return this.request('/api/projects/' + encodeURIComponent(projectId) + '/artifacts', {
      method: 'POST',
      body: payload
    });
  }

  async getArtifactData(artifactId) {
    return this.request('/api/artifacts/' + encodeURIComponent(artifactId) + '/data');
  }

  async listBackgroundJobs(pagination = {}) {
    return this.request(withPagination('/api/jobs', pagination));
  }

  async enqueueBackgroundJob(payload = {}) {
    return this.request('/api/jobs', {
      method: 'POST',
      body: payload
    });
  }

  async completeBackgroundJob(jobId, result = {}) {
    return this.request('/api/jobs/' + encodeURIComponent(jobId) + '/complete', {
      method: 'POST',
      body: { result }
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
    const init = {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    };
    let target;
    if (this.useCookie) {
      // Same-origin relative path so the session cookie is sent automatically.
      target = path;
      init.credentials = 'include';
    } else {
      target = resolveApiUrl(path, this.config);
      if (options.auth !== false && this.token) headers.Authorization = 'Bearer ' + this.token;
    }
    const response = await this.fetchImpl(target, init);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : 'Nova Cloud request failed.';
      const err = new Error(message);
      // Surface the HTTP status (and server error code) so callers can map
      // specific failures to actionable messages — e.g. 403 unverified / 410
      // expired / 404 invalid for the invite-redeem flow.
      err.status = response.status;
      if (data && data.error && data.error.code) err.code = data.error.code;
      throw err;
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

function withPagination(path, { limit, cursor } = {}) {
  const params = new URLSearchParams();
  if (limit !== undefined && limit !== null) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? path + '?' + query : path;
}

function storeToken(token) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('nova_cloud_token', token || '');
  } catch (error) {
    // Ignore storage failures in locked-down browsers.
  }
}
