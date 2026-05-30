import crypto from 'node:crypto';
import { hashToken } from './state-hash.mjs';

export const ROLES = Object.freeze({
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer'
});

const WRITE_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR]);
const ADMIN_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN]);
// Ordering for "never downgrade" when redeeming a share link.
const ROLE_RANK = { [ROLES.VIEWER]: 1, [ROLES.EDITOR]: 2, [ROLES.ADMIN]: 3, [ROLES.OWNER]: 4 };
// Roles a share link may grant — never Admin/Owner (those are an escalation
// primitive: they can mint more links / add members). Higher roles must be
// granted explicitly via addProjectMember.
const SHARE_LINK_ROLES = new Set([ROLES.EDITOR, ROLES.VIEWER]);

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
    this.backgroundJobs = new Map();
    this.objectArtifacts = new Map();
    this.shareLinks = new Map();
    this.aiUsageBuckets = new Map();
    // In-memory fallback for email-verification tokens when no stateStore (KV)
    // is wired (node/dev). Keyed by 'emailverify:' + hashToken(token).
    this.emailVerifications = new Map();
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

  createUser({ email, displayName, externalSubject = '', passwordHash = '', emailVerified = false }) {
    const user = {
      id: createId('usr'),
      email,
      displayName: displayName || email,
      externalSubject,
      // PBKDF2 hash for email+password accounts; '' for OIDC-only (Google/SSO)
      // accounts. Never exposed via publicUser().
      passwordHash,
      // Email+password accounts start unverified until the emailed link is
      // clicked; OIDC accounts (Google) are created already verified.
      emailVerified,
      // AES-GCM ciphertext of the user's synced AI settings (provider/model +
      // BYOK keys). '' until they save settings while signed in. Like
      // passwordHash, this is NEVER exposed via publicUser().
      aiSettingsEncrypted: '',
      memberships: [],
      createdAt: this.now()
    };
    this.users.set(user.id, user);
    this.persist();
    return clone(user);
  }

  // Lookup by email (case-insensitive). Returns a clone (including passwordHash
  // for server-side credential checks) or null. Server-only — handlers must
  // never return the raw record to clients; use publicUser() for that.
  findUserByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    const user = Array.from(this.users.values()).find(item => String(item.email || '').toLowerCase() === normalized);
    return user ? clone(user) : null;
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
    // Async-crypto variant of createAuthSession: works with both the sync
    // node AuthService and the Worker's async WebCrypto auth service.
    const user = Array.from(this.users.values()).find(item => item.email === email);
    if (!user) throw createHttpError(401, 'Unknown user.');
    const membership = this.requireMembership(user.id, organizationId);
    const token = this.authService
      ? await this.authService.createSessionTokenAsync({ userId: user.id, organizationId, role: membership.role })
      : Buffer.from(JSON.stringify({ sub: user.id, org: organizationId, role: membership.role, iat: this.now() })).toString('base64url');
    this.audit({ organizationId, userId: user.id, type: 'auth.login', targetId: user.id });
    const session = { token, user: publicUser(user, organizationId, membership.role) };
    if (this.stateStore) {
      const payload = this.authService ? await this.authService.verifySessionTokenAsync(token) : { sub: user.id, org: organizationId, role: membership.role };
      const ttlMs = payload.exp ? Math.max(1, payload.exp - this.now()) : 8 * 60 * 60 * 1000;
      await this.stateStore.set('session:' + hashToken(token), {
        userId: user.id,
        organizationId,
        role: membership.role,
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
      // An OIDC login (Google/SSO) proves the email — mark it verified, which
      // also "upgrades" a previously password-only account that now linked SSO.
      existing.emailVerified = true;
      return clone(existing);
    }
    // OIDC identities are already email-verified by the provider.
    return this.createUser({ email, displayName, externalSubject, emailVerified: true });
  }

  markEmailVerified(userId) {
    const user = this.requireUser(userId);
    if (!user.emailVerified) {
      user.emailVerified = true;
      this.persist();
    }
    return clone(user);
  }

  // Email-verification tokens. Stored hashed (never the raw token) in the
  // stateStore (KV) when available — so links work across Worker isolates —
  // else in an in-memory map (node/dev). Mirrors the session-token pattern.
  async createEmailVerificationTokenAsync(userId, ttlMs = 24 * 60 * 60 * 1000) {
    this.requireUser(userId);
    const token = crypto.randomBytes(32).toString('hex');
    const key = 'emailverify:' + hashToken(token);
    const record = { userId, expiresAt: this.now() + ttlMs };
    if (this.stateStore) await this.stateStore.set(key, record, ttlMs);
    else this.emailVerifications.set(key, record);
    return token;
  }

  async consumeEmailVerificationTokenAsync(token) {
    if (!token) throw createHttpError(400, 'Missing verification token.');
    const key = 'emailverify:' + hashToken(String(token));
    const record = this.stateStore ? await this.stateStore.get(key) : this.emailVerifications.get(key);
    if (!record || (record.expiresAt && record.expiresAt < this.now())) {
      throw createHttpError(400, 'This verification link is invalid or has expired.');
    }
    if (this.stateStore) await this.stateStore.delete(key);
    else this.emailVerifications.delete(key);
    return this.markEmailVerified(record.userId);
  }

  // Personal-workspace model: every user gets a private organization (their
  // "workspace") they own, so "log in and save my stuff" works without joining
  // a team. Idempotent — returns the existing personal org if one exists.
  ensurePersonalWorkspace(userId) {
    const user = this.requireUser(userId);
    const existing = user.memberships
      .map(m => this.organizations.get(m.organizationId))
      .find(org => org && org.settings && org.settings.personal);
    if (existing) return clone(existing);
    const org = this.createOrganization({ name: (user.displayName || user.email) + '’s Workspace', slug: 'u-' + user.id });
    const stored = this.organizations.get(org.id);
    stored.settings.personal = true;
    this.addMembership({ organizationId: org.id, userId, role: ROLES.OWNER });
    this.persist();
    return clone(stored);
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
    if (!token) throw createHttpError(401, 'Missing bearer token.');
    let payload;
    try {
      payload = this.authService
        ? await this.authService.verifySessionTokenAsync(token)
        : JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch (error) {
      throw createHttpError(401, 'Invalid bearer token.');
    }
    const user = this.requireUser(payload.sub);
    const membership = this.requireMembership(user.id, payload.org);
    const context = {
      userId: user.id,
      organizationId: payload.org,
      role: membership.role,
      user: publicUser(user, payload.org, membership.role)
    };
    if (this.stateStore) {
      const session = await this.stateStore.get('session:' + hashToken(token));
      if (!session) throw createHttpError(401, 'Session expired.');
      if (session.userId !== context.userId || session.organizationId !== context.organizationId) {
        throw createHttpError(401, 'Invalid session.');
      }
    }
    return context;
  }

  listProjects(context, pagination = null) {
    this.requireContext(context);
    const projects = Array.from(this.projects.values())
      .filter(project => project.organizationId === context.organizationId && this.canReadProject(context, project))
      .map(project => projectSummary(project));
    return pagination ? paginateItems(projects, pagination) : projects;
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
      organizationId: project.organizationId,
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
      organizationId: project.organizationId,
      userId: context.userId,
      type: 'project.version.created',
      targetId: project.id,
      metadata: { versionId: version.id, message }
    });
    return clone(project);
  }

  listProjectVersions(context, projectId, pagination = null) {
    const project = this.requireProjectAccess(context, projectId);
    const versions = project.versions.map(version => ({
      id: version.id,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      message: version.message
    }));
    return pagination ? paginateItems(versions, pagination) : versions;
  }

  listGraphRuns(context, projectId, pagination = null) {
    const project = this.requireProjectAccess(context, projectId);
    // Runs are scoped to the PROJECT's org (not the accessor's), so a cross-org
    // collaborator's runs are visible to everyone on the project.
    const runs = Array.from(this.graphRuns.values())
      .filter(run => run.organizationId === project.organizationId && run.projectId === project.id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(clone);
    return pagination ? paginateItems(runs, pagination) : runs;
  }

  createObjectArtifact(context, projectId, {
    name = 'artifact',
    kind = 'graph-export',
    contentType = 'application/octet-stream',
    byteSize = 0,
    storageKey = '',
    metadata = {}
  } = {}) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectWrite(context, project);
    const artifact = {
      id: createId('art'),
      organizationId: project.organizationId,
      projectId: project.id,
      userId: context.userId,
      name,
      kind,
      contentType,
      byteSize,
      storageKey: storageKey || ['org', project.organizationId, 'projects', project.id, 'artifacts', createId('obj')].join('/'),
      metadata,
      createdAt: this.now()
    };
    this.objectArtifacts.set(artifact.id, artifact);
    this.audit({
      organizationId: project.organizationId,
      userId: context.userId,
      type: 'object.artifact.created',
      targetId: artifact.id,
      metadata: { projectId: project.id, kind, byteSize: artifact.byteSize }
    });
    return clone(artifact);
  }

  listObjectArtifacts(context, projectId, pagination = null) {
    const project = this.requireProjectAccess(context, projectId);
    const artifacts = Array.from(this.objectArtifacts.values())
      .filter(artifact => artifact.organizationId === project.organizationId && artifact.projectId === project.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone);
    return pagination ? paginateItems(artifacts, pagination) : artifacts;
  }

  getObjectArtifact(context, artifactId) {
    this.requireContext(context);
    const artifact = this.objectArtifacts.get(artifactId);
    if (!artifact) throw createHttpError(404, 'Object artifact not found.');
    // Authorize solely via project access — the artifact's org is the project's
    // org, which may differ from a shared collaborator's session org.
    this.requireProjectAccess(context, artifact.projectId);
    return clone(artifact);
  }

  enqueueBackgroundJob(context, {
    type,
    projectId = '',
    payload = {},
    artifactId = '',
    availableAfter = this.now()
  } = {}) {
    this.requireContext(context);
    if (projectId) this.requireProjectWrite(context, this.requireProjectAccess(context, projectId));
    if (artifactId) this.getObjectArtifact(context, artifactId);
    const job = {
      id: createId('job'),
      organizationId: context.organizationId,
      userId: context.userId,
      projectId,
      artifactId,
      type,
      status: 'queued',
      payload,
      result: {},
      errorSummary: '',
      attempts: 0,
      createdAt: this.now(),
      updatedAt: this.now(),
      availableAfter,
      completedAt: null
    };
    this.backgroundJobs.set(job.id, job);
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'background.job.queued',
      targetId: job.id,
      metadata: { jobType: type, projectId, artifactId }
    });
    return clone(job);
  }

  listBackgroundJobs(context, pagination = null) {
    this.requireContext(context);
    const jobs = Array.from(this.backgroundJobs.values())
      .filter(job => job.organizationId === context.organizationId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone);
    return pagination ? paginateItems(jobs, pagination) : jobs;
  }

  getBackgroundJob(context, jobId) {
    this.requireContext(context);
    const job = this.backgroundJobs.get(jobId);
    if (!job) throw createHttpError(404, 'Background job not found.');
    if (job.organizationId !== context.organizationId) throw createHttpError(403, 'Cross-organization access denied.');
    return clone(job);
  }

  claimNextBackgroundJob(context, { type = '' } = {}) {
    this.requireAdmin(context);
    const job = Array.from(this.backgroundJobs.values())
      .filter(item => item.organizationId === context.organizationId)
      .filter(item => item.status === 'queued' && item.availableAfter <= this.now())
      .filter(item => !type || item.type === type)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!job) return null;
    job.status = 'running';
    job.attempts += 1;
    job.updatedAt = this.now();
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'background.job.claimed',
      targetId: job.id,
      metadata: { jobType: job.type, attempts: job.attempts }
    });
    return clone(job);
  }

  completeBackgroundJob(context, jobId, { result = {} } = {}) {
    return this.finishBackgroundJob(context, jobId, 'completed', { result });
  }

  failBackgroundJob(context, jobId, { errorSummary = '' } = {}) {
    return this.finishBackgroundJob(context, jobId, 'failed', { errorSummary });
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
      organizationId: project.organizationId,
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
      organizationId: project.organizationId,
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
      organizationId: project.organizationId,
      userId: context.userId,
      type: 'project.version.restored',
      targetId: project.id,
      metadata: { sourceVersionId: versionId, versionId: restored.id }
    });
    return clone(project);
  }

  // ── Share links ────────────────────────────────────────────────────────
  // A capability URL that grants Editor/Viewer access on redemption. The raw
  // token is returned ONCE at creation and stored only as a hash (like sessions
  // / email-verify tokens), so a snapshot/DB leak can't reuse it.

  createShareLink(context, projectId, { role, expiresInMs = 0, email = '' } = {}) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectAdmin(context, project);
    if (!SHARE_LINK_ROLES.has(role)) throw createHttpError(400, 'Share links can only grant Editor or Viewer access.');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const link = {
      id: createId('shl'),
      projectId: project.id,
      role,
      tokenHash: hashToken(rawToken),
      email: email ? String(email).trim().toLowerCase() : '',
      createdBy: context.userId,
      expiresAt: expiresInMs > 0 ? this.now() + expiresInMs : null,
      revokedAt: null,
      createdAt: this.now()
    };
    this.shareLinks.set(link.id, link);
    this.audit({
      organizationId: project.organizationId,
      userId: context.userId,
      type: link.email ? 'project.invite.created' : 'project.share-link.created',
      targetId: project.id,
      metadata: { linkId: link.id, role, invited: !!link.email }
    });
    this.persist();
    // Only place the raw token is ever exposed.
    return { ...publicShareLink(link), token: rawToken };
  }

  // Invite a specific person by email: a role-scoped share link tagged with the
  // address (so the access panel can show it as a pending invite). The caller
  // (API handler) emails the join URL using the returned token.
  inviteToProject(context, projectId, { email, role, expiresInMs = 0 } = {}) {
    return this.createShareLink(context, projectId, { role, expiresInMs, email });
  }

  listShareLinks(context, projectId) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectAdmin(context, project);
    return Array.from(this.shareLinks.values())
      .filter(link => link.projectId === project.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(publicShareLink);
  }

  revokeShareLink(context, projectId, linkId) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectAdmin(context, project);
    const link = this.shareLinks.get(linkId);
    if (!link || link.projectId !== project.id) throw createHttpError(404, 'Share link not found.');
    if (!link.revokedAt) link.revokedAt = this.now();
    this.audit({
      organizationId: project.organizationId,
      userId: context.userId,
      type: 'project.share-link.revoked',
      targetId: project.id,
      metadata: { linkId: link.id }
    });
    this.persist();
    return publicShareLink(link);
  }

  // Redeem a share link → join the project at the link's role. Requires a
  // signed-in, verified user. Idempotent; never downgrades an existing role.
  redeemShareLink(context, rawToken) {
    this.requireContext(context);
    const user = this.requireUser(context.userId);
    if (!user.emailVerified) throw createHttpError(403, 'Verify your email before joining a shared project.', 'EMAIL_NOT_VERIFIED');
    if (!rawToken || typeof rawToken !== 'string') throw createHttpError(400, 'A share token is required.');
    const link = Array.from(this.shareLinks.values()).find(item => item.tokenHash === hashToken(rawToken));
    if (!link) throw createHttpError(404, 'Share link not found.');
    if (link.revokedAt || (link.expiresAt && link.expiresAt <= this.now())) throw createHttpError(410, 'This share link is no longer valid.');
    if (!SHARE_LINK_ROLES.has(link.role)) throw createHttpError(400, 'Invalid share link.'); // defense in depth
    const project = this.projects.get(link.projectId);
    if (!project) throw createHttpError(404, 'Project not found.');
    // Same-org admins already have full access; redeeming is a no-op for them.
    if (!(this.orgRoleApplies(context, project) && ADMIN_ROLES.has(context.role))) {
      const current = this.getProjectRole(context, project);
      const nextRole = (ROLE_RANK[current] || 0) >= ROLE_RANK[link.role] ? current : link.role;
      const member = (project.members || []).find(m => m.userId === context.userId);
      if (member) member.role = nextRole;
      else project.members.push({ userId: context.userId, role: nextRole });
      this.audit({
        organizationId: project.organizationId,
        userId: context.userId,
        type: 'project.share-link.redeemed',
        targetId: project.id,
        metadata: { linkId: link.id, role: nextRole }
      });
      this.persist();
    }
    return projectSummary(project);
  }

  // Projects shared WITH the user (member, but living in another org — i.e. not
  // their own personal workspace). Complements listProjects (own org only).
  listSharedProjects(context, pagination = null) {
    this.requireContext(context);
    const projects = Array.from(this.projects.values())
      .filter(project => !this.orgRoleApplies(context, project) && !!this.getProjectRole(context, project))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(project => projectSummary(project));
    return pagination ? paginateItems(projects, pagination) : projects;
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

  listAuditEvents(context, pagination = null) {
    this.requireAdmin(context);
    const events = this.auditEvents
      .filter(event => event.organizationId === context.organizationId)
      .map(clone);
    return pagination ? paginateItems(events, pagination) : events;
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
    // 404 (not 403) when the caller has no read access — including cross-org
    // non-members — so a project's existence can't be probed by guessing ids.
    if (!project || !this.canReadProject(context, project)) throw createHttpError(404, 'Project not found.');
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

  // The session's org-level role (context.role) only conveys authority over
  // projects IN that org. Since every user is Owner of their own personal
  // workspace, that short-circuit MUST be gated on the project belonging to the
  // session org — otherwise any signed-in user could admin any project. Cross-
  // org access is granted solely by an explicit project-member role.
  orgRoleApplies(context, project) {
    return !!project && project.organizationId === context.organizationId;
  }

  canReadProject(context, project) {
    if (this.orgRoleApplies(context, project) && ADMIN_ROLES.has(context.role)) return true;
    return !!this.getProjectRole(context, project);
  }

  canWriteProject(context, project) {
    if (this.orgRoleApplies(context, project) && ADMIN_ROLES.has(context.role)) return true;
    return WRITE_ROLES.has(this.getProjectRole(context, project));
  }

  canAdminProject(context, project) {
    if (this.orgRoleApplies(context, project) && ADMIN_ROLES.has(context.role)) return true;
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
      backgroundJobs: Array.from(this.backgroundJobs.values()).map(clone),
      objectArtifacts: Array.from(this.objectArtifacts.values()).map(clone),
      shareLinks: Array.from(this.shareLinks.values()).map(clone),
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
    this.backgroundJobs = mapById(snapshot.backgroundJobs);
    this.objectArtifacts = mapById(snapshot.objectArtifacts);
    this.shareLinks = mapById(snapshot.shareLinks);
    this.auditEvents = safeArray(snapshot.auditEvents).map(clone);
  }

  persist() {
    if (!this.persistence) return;
    const snapshot = this.exportSnapshot();
    const logFail = (error) => {
      if (typeof console !== 'undefined') console.error('[nova] snapshot persist failed: %s', (error && error.message) || error);
    };
    // Synchronous persistence (e.g. JSON file): write immediately so a freshly
    // constructed store can read it back in the same tick.
    if (this._persistIsAsync === false) {
      try { this.persistence.writeSnapshot(snapshot); } catch (error) { logFail(error); }
      return;
    }
    // Asynchronous persistence (e.g. Neon): SERIALIZE writes by chaining onto
    // the previous one, so two rapid mutations never run two concurrent
    // full-snapshot transactions (which deadlock on Postgres — the cause of a
    // write occasionally failing after the in-memory change already
    // succeeded). Errors are logged, not propagated, so a transient persist
    // failure doesn't turn a successful mutation into a 500; the in-memory
    // state is intact and the next persist rewrites it.
    if (this._persistIsAsync === true) {
      this._lastPersistPromise = this._lastPersistPromise
        .catch(() => {})
        .then(() => this.persistence.writeSnapshot(snapshot))
        .catch(logFail);
      return;
    }
    // First write — detect sync vs async from the return value, then route
    // subsequent writes accordingly.
    let result;
    try { result = this.persistence.writeSnapshot(snapshot); }
    catch (error) { this._persistIsAsync = false; logFail(error); return; }
    if (result && typeof result.then === 'function') {
      this._persistIsAsync = true;
      this._lastPersistPromise = Promise.resolve(result).catch(logFail);
    } else {
      this._persistIsAsync = false;
    }
  }

  async ready() {
    await this._persistenceReady;
  }

  async flushPersistence() {
    await this._lastPersistPromise;
  }

  finishBackgroundJob(context, jobId, status, { result = {}, errorSummary = '' } = {}) {
    this.requireAdmin(context);
    const job = this.backgroundJobs.get(jobId);
    if (!job) throw createHttpError(404, 'Background job not found.');
    if (job.organizationId !== context.organizationId) throw createHttpError(403, 'Cross-organization access denied.');
    if (!['completed', 'failed'].includes(status)) throw createHttpError(400, 'Invalid background job status.');
    job.status = status;
    job.result = status === 'completed' ? result : {};
    job.errorSummary = status === 'failed' ? String(errorSummary || '').slice(0, 1000) : '';
    job.updatedAt = this.now();
    job.completedAt = this.now();
    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'background.job.' + status,
      targetId: job.id,
      metadata: { jobType: job.type }
    });
    return clone(job);
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

function publicShareLink(link) {
  // Never expose tokenHash — the raw token is shown once at creation only.
  return {
    id: link.id,
    projectId: link.projectId,
    role: link.role,
    email: link.email || '',
    createdBy: link.createdBy,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    createdAt: link.createdAt
  };
}

function publicUser(user, organizationId, role) {
  // Allow-list only. NEVER add passwordHash or aiSettingsEncrypted here — those
  // are server-only secrets (the latter is returned solely to its owner via
  // GET /api/me/ai-settings).
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: !!user.emailVerified,
    organizationId,
    role
  };
}

function paginateItems(items, { limit, offset }) {
  const start = Math.max(0, offset || 0);
  const pageLimit = Math.max(1, limit || 50);
  const sliced = items.slice(start, start + pageLimit);
  const nextOffset = start + sliced.length;
  const hasMore = nextOffset < items.length;
  return {
    items: sliced,
    pagination: {
      limit: pageLimit,
      total: items.length,
      nextCursor: hasMore ? encodePaginationCursor(nextOffset) : '',
      hasMore
    }
  };
}

export function encodePaginationCursor(offset) {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

export function decodePaginationCursor(cursor) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch (error) {
    throw createHttpError(400, 'Invalid pagination cursor.');
  }
  if (!payload || !Number.isInteger(payload.offset) || payload.offset < 0) {
    throw createHttpError(400, 'Invalid pagination cursor.');
  }
  return payload.offset;
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
