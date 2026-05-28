import crypto from 'node:crypto';
import { hashToken } from './state-store.mjs';

export const ROLES = Object.freeze({
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer'
});

const WRITE_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR]);
const ADMIN_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN]);

export class EnterpriseStore {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
    this.authService = options.authService || null;
    this.persistence = options.persistence || null;
    this.stateStore = options.stateStore || null;
    this.organizations = new Map();
    this.users = new Map();
    this.projects = new Map();
    this.graphRuns = new Map();
    this.connectorSessions = new Map();
    this.aiRequests = new Map();
    this.aiUsageBuckets = new Map();
    this.auditEvents = [];
    this._persistenceReady = Promise.resolve();
    this._lastPersistPromise = Promise.resolve();
    if (this.persistence) {
      const snapshot = this.persistence.readSnapshot();
      if (snapshot && typeof snapshot.then === 'function') {
        this._persistenceReady = snapshot.then(value => this.restoreSnapshot(value));
      } else {
        this.restoreSnapshot(snapshot);
      }
    }
  }

  bootstrapDemoTenant() {
    const org = this.createOrganization({ name: 'Demo Organization', slug: 'demo' });
    const owner = this.createUser({ email: 'owner@demo.nova', displayName: 'Demo Owner' });
    this.addMembership({ organizationId: org.id, userId: owner.id, role: ROLES.OWNER });
    return { organization: org, user: owner };
  }

  createOrganization({ name, slug }) {
    const organization = {
      id: createId('org'),
      name,
      slug: slug || slugify(name),
      createdAt: this.now(),
      settings: {
        ssoRequired: false,
        connectorMinimumVersion: '0.1.0',
        dataRetentionDays: 365,
        ai: {
          allowedProviders: ['mock'],
          allowedModels: {
            mock: ['nova-mock-enterprise']
          },
          promptLogging: false,
          maxRequestsPerMinute: 20
        }
      }
    };
    this.organizations.set(organization.id, organization);
    this.persist();
    return clone(organization);
  }

  createUser({ email, displayName, externalSubject = '' }) {
    const user = {
      id: createId('usr'),
      email,
      displayName: displayName || email,
      externalSubject,
      memberships: [],
      createdAt: this.now()
    };
    this.users.set(user.id, user);
    this.persist();
    return clone(user);
  }

  addMembership({ organizationId, userId, role }) {
    const organization = this.requireOrganization(organizationId);
    const user = this.requireUser(userId);
    if (!Object.values(ROLES).includes(role)) throw createHttpError(400, 'Invalid role.');
    const existing = user.memberships.find(item => item.organizationId === organization.id);
    if (existing) existing.role = role;
    else user.memberships.push({ organizationId: organization.id, role });
    this.audit({
      organizationId,
      userId,
      type: 'organization.membership.upserted',
      targetId: userId,
      metadata: { role }
    });
    return clone(user);
  }

  createAuthSession({ email, organizationId }) {
    const user = Array.from(this.users.values()).find(item => item.email === email);
    if (!user) throw createHttpError(401, 'Unknown user.');
    const membership = this.requireMembership(user.id, organizationId);
    const token = this.authService
      ? this.authService.createSessionToken({ userId: user.id, organizationId, role: membership.role })
      : Buffer.from(JSON.stringify({ sub: user.id, org: organizationId, role: membership.role, iat: this.now() })).toString('base64url');
    this.audit({ organizationId, userId: user.id, type: 'auth.login', targetId: user.id });
    return {
      token,
      user: publicUser(user, organizationId, membership.role)
    };
  }

  async createAuthSessionAsync({ email, organizationId }) {
    const session = this.createAuthSession({ email, organizationId });
    if (this.stateStore) {
      const payload = this.authService ? this.authService.verifySessionToken(session.token) : { sub: session.user.id, org: organizationId, role: session.user.role };
      const ttlMs = payload.exp ? Math.max(1, payload.exp - this.now()) : 8 * 60 * 60 * 1000;
      await this.stateStore.set('session:' + hashToken(session.token), {
        userId: session.user.id,
        organizationId,
        role: session.user.role,
        createdAt: this.now()
      }, ttlMs);
    }
    return session;
  }

  createOrUpdateExternalUser({ email, displayName, externalSubject = '' }) {
    const existing = Array.from(this.users.values()).find(user => user.email === email || (externalSubject && user.externalSubject === externalSubject));
    if (existing) {
      existing.displayName = displayName || existing.displayName;
      existing.externalSubject = externalSubject || existing.externalSubject;
      return clone(existing);
    }
    return this.createUser({ email, displayName, externalSubject });
  }

  authenticate(token) {
    if (!token) throw createHttpError(401, 'Missing bearer token.');
    let payload;
    try {
      payload = this.authService
        ? this.authService.verifySessionToken(token)
        : JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch (error) {
      throw createHttpError(401, 'Invalid bearer token.');
    }
    const user = this.requireUser(payload.sub);
    const membership = this.requireMembership(user.id, payload.org);
    return {
      userId: user.id,
      organizationId: payload.org,
      role: membership.role,
      user: publicUser(user, payload.org, membership.role)
    };
  }

  async authenticateAsync(token) {
    const context = this.authenticate(token);
    if (this.stateStore) {
      const session = await this.stateStore.get('session:' + hashToken(token));
      if (!session) throw createHttpError(401, 'Session expired.');
      if (session.userId !== context.userId || session.organizationId !== context.organizationId) {
        throw createHttpError(401, 'Invalid session.');
      }
    }
    return context;
  }

  listProjects(context) {
    this.requireContext(context);
    return Array.from(this.projects.values())
      .filter(project => project.organizationId === context.organizationId && this.canReadProject(context, project))
      .map(project => projectSummary(project));
  }

  createProject(context, { name, graph = null }) {
    this.requireWrite(context);
    const project = {
      id: createId('prj'),
      organizationId: context.organizationId,
      name: name || 'Untitled Project',
      createdBy: context.userId,
      createdAt: this.now(),
      updatedAt: this.now(),
      members: [{ userId: context.userId, role: ROLES.OWNER }],
      currentVersionId: '',
      versions: []
    };
    const version = this.createProjectVersion(project, context, graph || emptyGraph(), 'Initial version');
    project.currentVersionId = version.id;
    this.projects.set(project.id, project);
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'project.created',
      targetId: project.id,
      metadata: { name: project.name }
    });
    return clone(project);
  }

  getProject(context, projectId) {
    const project = this.requireProjectAccess(context, projectId);
    return clone(project);
  }

  addProjectMember(context, projectId, { userId, role }) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectAdmin(context, project);
    this.requireUser(userId);
    if (!Object.values(ROLES).includes(role)) throw createHttpError(400, 'Invalid role.');
    const existing = (project.members || []).find(member => member.userId === userId);
    if (existing) existing.role = role;
    else project.members.push({ userId, role });
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'project.membership.upserted',
      targetId: project.id,
      metadata: { memberUserId: userId, role }
    });
    return clone(project);
  }

  updateProjectGraph(context, projectId, { graph, message = 'Graph saved' }) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectWrite(context, project);
    const version = this.createProjectVersion(project, context, graph || emptyGraph(), message);
    project.currentVersionId = version.id;
    project.updatedAt = this.now();
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'project.version.created',
      targetId: project.id,
      metadata: { versionId: version.id, message }
    });
    return clone(project);
  }

  listProjectVersions(context, projectId) {
    const project = this.requireProjectAccess(context, projectId);
    return project.versions.map(version => ({
      id: version.id,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      message: version.message
    }));
  }

  listGraphRuns(context, projectId) {
    const project = this.requireProjectAccess(context, projectId);
    return Array.from(this.graphRuns.values())
      .filter(run => run.organizationId === context.organizationId && run.projectId === project.id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(clone);
  }

  recordGraphRun(context, projectId, {
    versionId = '',
    status = 'completed',
    durationMs = null,
    errorSummary = '',
    startedAt = this.now(),
    completedAt = this.now()
  } = {}) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectWrite(context, project);
    const resolvedVersionId = versionId || project.currentVersionId;
    if (resolvedVersionId && !project.versions.some(version => version.id === resolvedVersionId)) {
      throw createHttpError(404, 'Project version not found.');
    }
    if (!['pending', 'running', 'completed', 'failed'].includes(status)) {
      throw createHttpError(400, 'Invalid graph run status.');
    }
    const run = {
      id: createId('run'),
      projectId: project.id,
      organizationId: context.organizationId,
      userId: context.userId,
      versionId: resolvedVersionId,
      status,
      durationMs,
      errorSummary: String(errorSummary || '').slice(0, 1000),
      startedAt,
      completedAt: completedAt || null
    };
    this.graphRuns.set(run.id, run);
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'graph.run.recorded',
      targetId: project.id,
      metadata: {
        runId: run.id,
        versionId: run.versionId,
        status: run.status,
        durationMs: run.durationMs,
        failed: run.status === 'failed'
      }
    });
    this.persist();
    return clone(run);
  }

  restoreProjectVersion(context, projectId, versionId) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectWrite(context, project);
    const version = project.versions.find(item => item.id === versionId);
    if (!version) throw createHttpError(404, 'Project version not found.');
    const restored = this.createProjectVersion(project, context, version.graph, 'Restored ' + versionId);
    project.currentVersionId = restored.id;
    project.updatedAt = this.now();
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'project.version.restored',
      targetId: project.id,
      metadata: { sourceVersionId: versionId, versionId: restored.id }
    });
    return clone(project);
  }

  createConnectorSession(context, { host = 'revit', projectId = '', connectorVersion = '0.1.0' } = {}) {
    this.requireWrite(context);
    if (projectId) this.requireProjectWrite(context, this.requireProjectAccess(context, projectId));
    const session = {
      id: createId('con'),
      organizationId: context.organizationId,
      userId: context.userId,
      projectId,
      host,
      status: 'pairing',
      pairingCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
      connectorVersion,
      createdAt: this.now(),
      expiresAt: this.now() + 10 * 60 * 1000,
      pairedAt: null,
      lastSeenAt: null
    };
    this.connectorSessions.set(session.id, session);
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'connector.session.created',
      targetId: session.id,
      metadata: { host, projectId }
    });
    return clone(session);
  }

  async createConnectorSessionAsync(context, payload = {}) {
    const session = this.createConnectorSession(context, payload);
    if (this.stateStore) {
      await this.stateStore.set('connector:' + session.id, session, Math.max(1, session.expiresAt - this.now()));
    }
    return session;
  }

  pairConnector(context, sessionId, pairingCode) {
    this.requireWrite(context);
    const session = this.requireConnectorAccess(context, sessionId);
    if (session.expiresAt < this.now()) throw createHttpError(410, 'Connector pairing session expired.');
    if (session.pairingCode !== pairingCode) throw createHttpError(403, 'Invalid connector pairing code.');
    session.status = 'online';
    session.pairedAt = this.now();
    session.lastSeenAt = this.now();
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'connector.session.paired',
      targetId: session.id,
      metadata: { host: session.host }
    });
    return clone(session);
  }

  async pairConnectorAsync(context, sessionId, pairingCode) {
    if (!this.stateStore) return this.pairConnector(context, sessionId, pairingCode);
    this.requireWrite(context);
    const stored = await this.stateStore.get('connector:' + sessionId);
    if (!stored) throw createHttpError(410, 'Connector pairing session expired.');
    if (stored.organizationId !== context.organizationId) throw createHttpError(403, 'Cross-organization access denied.');
    if (stored.expiresAt < this.now()) {
      await this.stateStore.delete('connector:' + sessionId);
      throw createHttpError(410, 'Connector pairing session expired.');
    }
    if (stored.pairingCode !== pairingCode) throw createHttpError(403, 'Invalid connector pairing code.');
    stored.status = 'online';
    stored.pairedAt = this.now();
    stored.lastSeenAt = this.now();
    this.connectorSessions.set(sessionId, stored);
    await this.stateStore.set('connector:' + sessionId, stored, Math.max(1, stored.expiresAt - this.now()));
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'connector.session.paired',
      targetId: stored.id,
      metadata: { host: stored.host }
    });
    return clone(stored);
  }

  listAuditEvents(context) {
    this.requireAdmin(context);
    return this.auditEvents
      .filter(event => event.organizationId === context.organizationId)
      .map(clone);
  }

  recordHostOperation(context, { projectId = '', host = 'revit', operation, ok = true, metadata = {} }) {
    this.requireContext(context);
    if (projectId) this.requireProjectWrite(context, this.requireProjectAccess(context, projectId));
    return this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'host.operation',
      targetId: projectId,
      metadata: { host, operation, ok, ...metadata }
    });
  }

  createAiRequest(context, {
    projectId = '',
    provider = 'mock',
    model = 'nova-mock-enterprise',
    messages = [],
    metadata = {},
    skipRateLimit = false
  } = {}) {
    this.requireContext(context);
    if (projectId) this.requireProjectAccess(context, projectId);
    const organization = this.requireOrganization(context.organizationId);
    const aiSettings = organization.settings.ai || {};
    const allowedProviders = aiSettings.allowedProviders || [];
    const allowedModels = aiSettings.allowedModels || {};
    if (!allowedProviders.includes(provider)) throw createHttpError(403, 'AI provider is not allowed for this organization.');
    if (allowedModels[provider] && !allowedModels[provider].includes(model)) throw createHttpError(403, 'AI model is not allowed for this organization.');
    if (!Array.isArray(messages) || messages.length === 0) throw createHttpError(400, 'AI request messages are required.');
    if (!skipRateLimit) this.requireAiRateLimit(context, aiSettings.maxRequestsPerMinute || 20);

    const request = {
      id: createId('air'),
      organizationId: context.organizationId,
      userId: context.userId,
      projectId,
      provider,
      model,
      status: 'pending',
      messageCount: messages.length,
      messages: aiSettings.promptLogging ? clone(messages) : [],
      metadata,
      createdAt: this.now(),
      completedAt: null,
      responsePreview: '',
      usage: null
    };
    this.aiRequests.set(request.id, request);
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'ai.request.created',
      targetId: request.id,
      metadata: { projectId, provider, model, messageCount: messages.length, promptLogged: !!aiSettings.promptLogging }
    });
    return clone(request);
  }

  async createAiRequestAsync(context, payload = {}) {
    if (!this.stateStore) return this.createAiRequest(context, payload);
    this.requireContext(context);
    const organization = this.requireOrganization(context.organizationId);
    const aiSettings = organization.settings.ai || {};
    await this.requireAiRateLimitAsync(context, {
      maxUserRequestsPerMinute: aiSettings.maxRequestsPerMinute || 20,
      maxOrganizationRequestsPerMinute: aiSettings.maxOrganizationRequestsPerMinute || Math.max(20, (aiSettings.maxRequestsPerMinute || 20) * 10)
    });
    return this.createAiRequest(context, { ...payload, skipRateLimit: true });
  }

  completeAiRequest(context, requestId, { content = '', usage = null } = {}) {
    this.requireContext(context);
    const request = this.requireAiRequestAccess(context, requestId);
    request.status = 'completed';
    request.completedAt = this.now();
    request.responsePreview = String(content || '').slice(0, 280);
    request.usage = usage;
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'ai.request.completed',
      targetId: request.id,
      metadata: { projectId: request.projectId, provider: request.provider, model: request.model }
    });
    return clone(request);
  }

  failAiRequest(context, requestId, message) {
    this.requireContext(context);
    const request = this.requireAiRequestAccess(context, requestId);
    request.status = 'failed';
    request.completedAt = this.now();
    request.responsePreview = String(message || '').slice(0, 280);
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'ai.request.failed',
      targetId: request.id,
      metadata: { projectId: request.projectId, provider: request.provider, model: request.model }
    });
    return clone(request);
  }

  createProjectVersion(project, context, graph, message) {
    const version = {
      id: createId('ver'),
      projectId: project.id,
      createdAt: this.now(),
      createdBy: context.userId,
      message,
      graph: clone(graph)
    };
    project.versions.push(version);
    return version;
  }

  requireContext(context) {
    if (!context || !context.organizationId || !context.userId) throw createHttpError(401, 'Authentication required.');
    this.requireMembership(context.userId, context.organizationId);
  }

  requireWrite(context) {
    this.requireContext(context);
    if (!WRITE_ROLES.has(context.role)) throw createHttpError(403, 'Write access required.');
  }

  requireAdmin(context) {
    this.requireContext(context);
    if (!ADMIN_ROLES.has(context.role)) throw createHttpError(403, 'Admin access required.');
  }

  requireProjectAccess(context, projectId) {
    this.requireContext(context);
    const project = this.projects.get(projectId);
    if (!project) throw createHttpError(404, 'Project not found.');
    if (project.organizationId !== context.organizationId) throw createHttpError(403, 'Cross-organization access denied.');
    if (!this.canReadProject(context, project)) throw createHttpError(403, 'Project access denied.');
    return project;
  }

  requireProjectWrite(context, project) {
    this.requireContext(context);
    if (!this.canWriteProject(context, project)) throw createHttpError(403, 'Project write access required.');
  }

  requireProjectAdmin(context, project) {
    this.requireContext(context);
    if (!this.canAdminProject(context, project)) throw createHttpError(403, 'Project admin access required.');
  }

  canReadProject(context, project) {
    if (ADMIN_ROLES.has(context.role)) return true;
    return !!this.getProjectRole(context, project);
  }

  canWriteProject(context, project) {
    if (ADMIN_ROLES.has(context.role)) return true;
    return WRITE_ROLES.has(this.getProjectRole(context, project));
  }

  canAdminProject(context, project) {
    if (ADMIN_ROLES.has(context.role)) return true;
    return ADMIN_ROLES.has(this.getProjectRole(context, project));
  }

  getProjectRole(context, project) {
    const member = (project.members || []).find(item => item.userId === context.userId);
    return member ? member.role : '';
  }

  requireConnectorAccess(context, sessionId) {
    this.requireContext(context);
    const session = this.connectorSessions.get(sessionId);
    if (!session) throw createHttpError(404, 'Connector session not found.');
    if (session.organizationId !== context.organizationId) throw createHttpError(403, 'Cross-organization access denied.');
    return session;
  }

  requireAiRequestAccess(context, requestId) {
    this.requireContext(context);
    const request = this.aiRequests.get(requestId);
    if (!request) throw createHttpError(404, 'AI request not found.');
    if (request.organizationId !== context.organizationId) throw createHttpError(403, 'Cross-organization access denied.');
    return request;
  }

  requireAiRateLimit(context, maxRequestsPerMinute) {
    const minute = Math.floor(this.now() / 60000);
    const key = [context.organizationId, context.userId, minute].join(':');
    const count = this.aiUsageBuckets.get(key) || 0;
    if (count >= maxRequestsPerMinute) throw createHttpError(429, 'AI rate limit exceeded.');
    this.aiUsageBuckets.set(key, count + 1);
  }

  async requireAiRateLimitAsync(context, { maxUserRequestsPerMinute, maxOrganizationRequestsPerMinute }) {
    if (!this.stateStore) return this.requireAiRateLimit(context, maxUserRequestsPerMinute);
    const minute = Math.floor(this.now() / 60000);
    const ttlMs = 70000;
    const userKey = ['rate', 'ai', context.organizationId, context.userId, minute].join(':');
    const orgKey = ['rate', 'ai', context.organizationId, 'org', minute].join(':');
    const userCount = await this.stateStore.increment(userKey, ttlMs);
    const orgCount = await this.stateStore.increment(orgKey, ttlMs);
    if (userCount > maxUserRequestsPerMinute) throw createHttpError(429, 'AI rate limit exceeded.');
    if (orgCount > maxOrganizationRequestsPerMinute) throw createHttpError(429, 'Organization AI rate limit exceeded.');
  }

  requireOrganization(id) {
    const organization = this.organizations.get(id);
    if (!organization) throw createHttpError(404, 'Organization not found.');
    return organization;
  }

  requireUser(id) {
    const user = this.users.get(id);
    if (!user) throw createHttpError(404, 'User not found.');
    return user;
  }

  requireMembership(userId, organizationId) {
    const user = this.requireUser(userId);
    const membership = user.memberships.find(item => item.organizationId === organizationId);
    if (!membership) throw createHttpError(403, 'Organization membership required.');
    return membership;
  }

  audit({ organizationId, userId, type, targetId = '', metadata = {} }) {
    const event = {
      id: createId('aud'),
      organizationId,
      userId,
      type,
      targetId,
      metadata,
      createdAt: this.now()
    };
    this.auditEvents.push(event);
    this.persist();
    return clone(event);
  }

  exportSnapshot() {
    return {
      schemaVersion: 1,
      organizations: Array.from(this.organizations.values()).map(clone),
      users: Array.from(this.users.values()).map(clone),
      projects: Array.from(this.projects.values()).map(clone),
      graphRuns: Array.from(this.graphRuns.values()).map(clone),
      connectorSessions: Array.from(this.connectorSessions.values()).map(clone),
      aiRequests: Array.from(this.aiRequests.values()).map(clone),
      auditEvents: this.auditEvents.map(clone)
    };
  }

  restoreSnapshot(snapshot = null) {
    if (!snapshot) return;
    this.organizations = mapById(snapshot.organizations);
    this.users = mapById(snapshot.users);
    this.projects = mapById(snapshot.projects);
    this.graphRuns = mapById(snapshot.graphRuns);
    this.connectorSessions = mapById(snapshot.connectorSessions);
    this.aiRequests = mapById(snapshot.aiRequests);
    this.auditEvents = safeArray(snapshot.auditEvents).map(clone);
  }

  persist() {
    if (!this.persistence) return;
    const result = this.persistence.writeSnapshot(this.exportSnapshot());
    if (result && typeof result.then === 'function') {
      this._lastPersistPromise = result;
    }
  }

  async ready() {
    await this._persistenceReady;
  }

  async flushPersistence() {
    await this._lastPersistPromise;
  }
}

export function createHttpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code || String(status);
  return error;
}

export function emptyGraph() {
  return {
    version: 2,
    nodes: [],
    wires: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    nextNodeId: 1
  };
}

function projectSummary(project) {
  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    currentVersionId: project.currentVersionId,
    versionCount: project.versions.length
  };
}

function publicUser(user, organizationId, role) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    organizationId,
    role
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapById(items) {
  return new Map(safeArray(items).filter(item => item && item.id).map(item => [item.id, clone(item)]));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createId(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

function slugify(value) {
  return String(value || 'organization').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
