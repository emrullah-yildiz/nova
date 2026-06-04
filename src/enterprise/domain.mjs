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
    // SEC-013: server-issued, single-use Revit/Connect write-approval tokens.
    // Keyed by hashToken(rawToken). The raw token is returned to the caller
    // once at issuance and never stored. A token is the authoritative proof
    // that a write was approved server-side; the write path consumes (and
    // thereby burns) it. Map<hashedToken, approvalRecord>.
    this.hostWriteApprovals = new Map();
    this.aiRequests = new Map();
    this.backgroundJobs = new Map();
    this.objectArtifacts = new Map();
    this.shareLinks = new Map();
    this.aiUsageBuckets = new Map();
    // In-memory fallback for email-verification tokens when no stateStore (KV)
    // is wired (node/dev). Keyed by 'emailverify:' + hashToken(token).
    this.emailVerifications = new Map();
    // SEC-004: per-user index of the KV keys we minted for them — every
    // 'session:<hash>' and 'emailverify:<hash>' issued while this isolate has
    // been alive. KV has no list/prefix-scan, so account deletion uses this
    // index to enumerate the user's tokens and drop them. Map<userId, Set<key>>.
    // It is best-effort *within an isolate's lifetime*: it is NOT persisted to
    // Neon (the snapshot schema has no place for it), so after a cold restart
    // any not-yet-tracked tokens fall back to natural TTL expiry (sessions ~8h,
    // email-verify 24h). The Worker DELETE branch ALSO derives session keys
    // straight from the request's slot cookies, so the security-critical case —
    // a deleted account's live sessions in the same browser — is always purged.
    this.userKvKeys = new Map();
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
      const key = 'session:' + hashToken(token);
      await this.stateStore.set(key, {
        userId: user.id,
        organizationId,
        role: membership.role,
        createdAt: this.now()
      }, ttlMs);
      this.trackUserKvKey(user.id, key);
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

  updateUserPassword(userId, passwordHash) {
    const user = this.requireUser(userId);
    if (!passwordHash) throw createHttpError(400, 'Password hash is required.');
    user.passwordHash = passwordHash;
    const membership = user.memberships[0] || {};
    this.audit({
      organizationId: membership.organizationId || '',
      userId: user.id,
      type: 'account.password.changed',
      targetId: user.id
    });
    return publicUser(user, membership.organizationId, membership.role);
  }

  deleteUserAccount(userId) {
    const user = this.requireUser(userId);
    const personalOrgIds = new Set(user.memberships
      .map(item => item.organizationId)
      .filter(id => {
        const org = this.organizations.get(id);
        return org && org.settings && org.settings.personal;
      }));
    const deletedProjectIds = new Set();
    for (const [projectId, project] of this.projects.entries()) {
      if (personalOrgIds.has(project.organizationId)) {
        this.projects.delete(projectId);
        deletedProjectIds.add(projectId);
      } else if (Array.isArray(project.members)) {
        project.members = project.members.filter(member => member.userId !== user.id);
      }
    }
    for (const orgId of personalOrgIds) this.organizations.delete(orgId);
    for (const organization of this.organizations.values()) {
      for (const member of Array.from(organization.members || [])) {
        if (member.userId === user.id) organization.members.splice(organization.members.indexOf(member), 1);
      }
    }
    for (const [runId, run] of this.graphRuns.entries()) {
      if (deletedProjectIds.has(run.projectId) || run.userId === user.id) this.graphRuns.delete(runId);
    }
    for (const [artifactId, artifact] of this.objectArtifacts.entries()) {
      if (deletedProjectIds.has(artifact.projectId) || artifact.createdBy === user.id) this.objectArtifacts.delete(artifactId);
    }
    for (const [linkId, link] of this.shareLinks.entries()) {
      if (deletedProjectIds.has(link.projectId) || link.createdBy === user.id) this.shareLinks.delete(linkId);
    }
    for (const [requestId, request] of this.aiRequests.entries()) {
      if (request.userId === user.id || deletedProjectIds.has(request.projectId)) this.aiRequests.delete(requestId);
    }
    for (const [jobId, job] of this.backgroundJobs.entries()) {
      if (job.userId === user.id || deletedProjectIds.has(job.projectId)) this.backgroundJobs.delete(jobId);
    }
    for (const [sessionId, session] of this.connectorSessions.entries()) {
      if (session.userId === user.id || deletedProjectIds.has(session.projectId)) this.connectorSessions.delete(sessionId);
    }
    // SEC-004: enumerate every KV key (session: / emailverify:) we minted for
    // this user so the caller can drop them from KV — a deleted account's other
    // sessions must stop authenticating (access-control + erasure). KV has no
    // prefix scan; this index is the source of truth for keys minted this
    // isolate. Returned to the Worker, which also adds keys derived from the
    // request's cookies (covering the cross-isolate case for live sessions).
    const kvKeys = Array.from(this.userKvKeys.get(user.id) || []);
    this.userKvKeys.delete(user.id);
    // Drop in-memory email-verification records (node/dev path; KV path is
    // covered by the returned kvKeys). Belt-and-suspenders: also sweep by userId
    // in case any key escaped the index.
    for (const [key, record] of this.emailVerifications.entries()) {
      if (record && record.userId === user.id) this.emailVerifications.delete(key);
    }
    // SEC-004 / SEC-006: anonymize PII (userId + any email in metadata) in
    // RETAINED audit rows for this user rather than keeping the link to a person
    // whose account is erased. In-memory rows are anonymized here; note that the
    // Neon audit table is append-only by id (snapshot writes ON CONFLICT DO
    // NOTHING), so durable-store anonymization is a separate retention process
    // tracked in SEC-006.
    const deletedEmail = String(user.email || '').toLowerCase();
    for (const event of this.auditEvents) {
      if (event.userId === user.id) event.userId = '';
      if (event.targetId === user.id) event.targetId = '';
      if (event.metadata && typeof event.metadata === 'object') {
        for (const [k, v] of Object.entries(event.metadata)) {
          if (typeof v === 'string' && v.toLowerCase() === deletedEmail) event.metadata[k] = '';
          if (v === user.id) event.metadata[k] = '';
        }
      }
    }
    // The deletion record itself carries no userId — it must not re-introduce
    // the PII we just stripped (SEC-006). projectCount only.
    this.auditEvents.push({
      id: createId('aud'),
      organizationId: '',
      userId: '',
      type: 'account.deleted',
      targetId: '',
      metadata: { projectCount: deletedProjectIds.size },
      createdAt: this.now()
    });
    this.users.delete(user.id);
    this.persist();
    return { ok: true, deletedProjectCount: deletedProjectIds.size, kvKeys };
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
    this.trackUserKvKey(userId, key);
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
    this.untrackUserKvKey(record.userId, key);
    return this.markEmailVerified(record.userId);
  }

  // SEC-004: KV-key index bookkeeping. trackUserKvKey records a key minted for a
  // user so account deletion can enumerate + drop it; untrackUserKvKey forgets a
  // key once it is consumed/expired so the set doesn't grow unbounded.
  trackUserKvKey(userId, key) {
    if (!userId || !key) return;
    let set = this.userKvKeys.get(userId);
    if (!set) { set = new Set(); this.userKvKeys.set(userId, set); }
    set.add(key);
  }

  untrackUserKvKey(userId, key) {
    const set = this.userKvKeys.get(userId);
    if (!set) return;
    set.delete(key);
    if (set.size === 0) this.userKvKeys.delete(userId);
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

  deleteProject(context, projectId) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectAdmin(context, project);
    this.projects.delete(project.id);
    for (const [runId, run] of this.graphRuns.entries()) {
      if (run.projectId === project.id) this.graphRuns.delete(runId);
    }
    for (const [artifactId, artifact] of this.objectArtifacts.entries()) {
      if (artifact.projectId === project.id) this.objectArtifacts.delete(artifactId);
    }
    for (const [linkId, link] of this.shareLinks.entries()) {
      if (link.projectId === project.id) this.shareLinks.delete(linkId);
    }
    for (const [requestId, request] of this.aiRequests.entries()) {
      if (request.projectId === project.id) this.aiRequests.delete(requestId);
    }
    for (const [jobId, job] of this.backgroundJobs.entries()) {
      if (job.projectId === project.id) this.backgroundJobs.delete(jobId);
    }
    for (const [sessionId, session] of this.connectorSessions.entries()) {
      if (session.projectId === project.id) this.connectorSessions.delete(sessionId);
    }
    this.audit({
      organizationId: project.organizationId,
      userId: context.userId,
      type: 'project.deleted',
      targetId: project.id,
      metadata: { name: project.name }
    });
    return { ok: true, projectId: project.id };
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

  previewShareLink(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') throw createHttpError(400, 'A share token is required.');
    const link = Array.from(this.shareLinks.values()).find(item => item.tokenHash === hashToken(rawToken));
    if (!link) throw createHttpError(404, 'Share link not found.');
    if (link.revokedAt || (link.expiresAt && link.expiresAt <= this.now())) throw createHttpError(410, 'This share link is no longer valid.');
    const project = this.projects.get(link.projectId);
    if (!project) throw createHttpError(404, 'Project not found.');
    return {
      id: link.id,
      projectId: link.projectId,
      projectName: project.name,
      role: link.role,
      email: link.email || '',
      expiresAt: link.expiresAt
    };
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

  updateShareLinkRole(context, projectId, linkId, role) {
    const project = this.requireProjectAccess(context, projectId);
    this.requireProjectAdmin(context, project);
    if (!SHARE_LINK_ROLES.has(role)) throw createHttpError(400, 'Share links can only grant Editor or Viewer access.');
    const link = this.shareLinks.get(linkId);
    if (!link || link.projectId !== project.id) throw createHttpError(404, 'Share link not found.');
    if (link.revokedAt) throw createHttpError(410, 'This share link is no longer valid.');
    link.role = role;
    if (link.email) {
      const user = this.findUserByEmail(link.email);
      const member = user && (project.members || []).find(m => m.userId === user.id);
      if (member && SHARE_LINK_ROLES.has(member.role)) member.role = role;
    }
    this.audit({
      organizationId: project.organizationId,
      userId: context.userId,
      type: 'project.share-link.role-updated',
      targetId: project.id,
      metadata: { linkId: link.id, role }
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
    if (link.email && String(user.email || '').trim().toLowerCase() !== link.email) {
      throw createHttpError(403, 'This invite is for ' + link.email + '. Sign in with that account to open the shared project.', 'INVITE_EMAIL_MISMATCH');
    }
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
    return clone(project);
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

  // ──────────────────────────────────────────────────────────────────────
  // SEC-013: authoritative Revit/Connect write-approval gate.
  //
  // The browser may *request* a write, but it cannot mint its own approval.
  // The server (this method) is the single place that, after verifying the
  // caller has project-write access, issues a single-use approval token bound
  // to {operation, projectId, graphVersion}. The actual write path must then
  // consume that token (consumeHostWriteApproval), which is where the write is
  // audited as a precondition. A write attempted with no/forged/expired/reused
  // token is rejected at this boundary and audited as a denial.
  // ──────────────────────────────────────────────────────────────────────

  // Default token lifetime: short — a single user-initiated write should be
  // executed within seconds of approval, not minutes.
  static get HOST_WRITE_APPROVAL_TTL_MS() { return 2 * 60 * 1000; }

  /**
   * Issue a single-use server-side write-approval token. Requires project
   * write access (when a projectId is supplied). Records a
   * `host.write.approved` audit event so the approval itself is accountable.
   * Returns { token, approvalId, operation, projectId, graphVersion, expiresAt }.
   * The raw token is returned ONCE and is never persisted in cleartext.
   */
  issueHostWriteApproval(context, { projectId = '', host = 'revit', operation = '', graphVersion = '', ttlMs = null, metadata = {} } = {}) {
    this.requireContext(context);
    if (!operation || typeof operation !== 'string') {
      throw createHttpError(400, 'A write operation type is required to issue an approval.');
    }
    // Project-write authorization is the real gate. When a projectId is
    // supplied the caller must hold write access; without one the operation is
    // a project-less local write (still bound to the authenticated user).
    if (projectId) this.requireProjectWrite(context, this.requireProjectAccess(context, projectId));

    const rawToken = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
    const approvalId = createId('hwa');
    const expiresAt = this.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : EnterpriseStore.HOST_WRITE_APPROVAL_TTL_MS);
    const record = {
      approvalId,
      organizationId: context.organizationId,
      userId: context.userId,
      projectId,
      host,
      operation,
      graphVersion: String(graphVersion || ''),
      issuedAt: this.now(),
      expiresAt,
      consumed: false
    };
    this.hostWriteApprovals.set(hashToken(rawToken), record);

    this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'host.write.approved',
      targetId: projectId,
      metadata: { host, operation, approvalId, graphVersion: record.graphVersion, ...metadata }
    });

    return { token: rawToken, approvalId, operation, projectId, host, graphVersion: record.graphVersion, expiresAt };
  }

  /**
   * Consume a server-issued write-approval token at the moment of the write.
   * This is the authoritative boundary: the write is only "accepted" if a
   * valid, unexpired, single-use, scope-matching token is presented. Every
   * call audits — an accepted write as `host.operation` (ok), a rejected one
   * as `host.write.denied`. Returns the recorded audit event on success;
   * throws an HTTP 403 (with a denial audit already written) on failure.
   */
  consumeHostWriteApproval(context, rawToken, { projectId = '', host = 'revit', operation = '', graphVersion = '', ok = true, metadata = {} } = {}) {
    this.requireContext(context);

    const recordDenial = (reason) => {
      this.audit({
        organizationId: context.organizationId,
        userId: context.userId,
        type: 'host.write.denied',
        targetId: projectId,
        metadata: { host, operation, reason, graphVersion: String(graphVersion || ''), ...metadata }
      });
    };

    if (!rawToken || typeof rawToken !== 'string') {
      recordDenial('missing_token');
      throw createHttpError(403, 'A server-issued write-approval token is required.', 'WRITE_APPROVAL_REQUIRED');
    }

    const key = hashToken(rawToken);
    const record = this.hostWriteApprovals.get(key);

    if (!record) {
      // Unknown / forged / already-burned token.
      recordDenial('invalid_token');
      throw createHttpError(403, 'Write-approval token is invalid.', 'WRITE_APPROVAL_INVALID');
    }
    if (record.organizationId !== context.organizationId || record.userId !== context.userId) {
      recordDenial('token_owner_mismatch');
      throw createHttpError(403, 'Write-approval token does not belong to this caller.', 'WRITE_APPROVAL_INVALID');
    }
    if (record.consumed) {
      // Single-use enforcement (defends against replay).
      this.hostWriteApprovals.delete(key);
      recordDenial('token_replayed');
      throw createHttpError(403, 'Write-approval token has already been used.', 'WRITE_APPROVAL_INVALID');
    }
    if (record.expiresAt < this.now()) {
      this.hostWriteApprovals.delete(key);
      recordDenial('token_expired');
      throw createHttpError(403, 'Write-approval token has expired.', 'WRITE_APPROVAL_EXPIRED');
    }
    if (record.operation !== operation || record.projectId !== projectId || record.graphVersion !== String(graphVersion || '')) {
      // Scope mismatch: the token was minted for a different op/project/version.
      recordDenial('token_scope_mismatch');
      throw createHttpError(403, 'Write-approval token does not match this operation.', 'WRITE_APPROVAL_INVALID');
    }

    // Burn the token (single-use) BEFORE recording the accepted write so a
    // concurrent replay can never slip through.
    this.hostWriteApprovals.delete(key);

    // Re-verify project write access at consume time (authorization may have
    // been revoked between issuance and the write).
    if (projectId) this.requireProjectWrite(context, this.requireProjectAccess(context, projectId));

    return this.audit({
      organizationId: context.organizationId,
      userId: context.userId,
      type: 'host.operation',
      targetId: projectId,
      metadata: { host, operation, ok, approvalId: record.approvalId, graphVersion: record.graphVersion, ...metadata }
    });
  }

  /**
   * Drop expired, unconsumed approval tokens. Best-effort hygiene; consume
   * already rejects expired tokens, so this only bounds memory growth.
   */
  pruneExpiredHostWriteApprovals() {
    const now = this.now();
    for (const [key, record] of this.hostWriteApprovals) {
      if (record.expiresAt < now) this.hostWriteApprovals.delete(key);
    }
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
    // full-snapshot transactions (which deadlock on Postgres and made a write
    // fail after the in-memory change had already succeeded). Errors are logged,
    // not propagated — the in-memory state is intact and the next write rewrites
    // it. flushPersistence() therefore never rejects.
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
    hasPassword: !!user.passwordHash,
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
