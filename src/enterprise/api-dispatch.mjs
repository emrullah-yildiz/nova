// Platform-agnostic API dispatcher: route table + handlers + a dispatch()
// that turns a generic request into a JSON result. Imports ONLY domain +
// validation (no node:http / pg / fs), so it runs on both the legacy node
// server (src/enterprise/api-server.mjs) and the Cloudflare Worker
// (worker/index.mjs). The store, auth service, AI provider and object storage
// are injected, so persistence/runtime differences live in the adapters.

import { ROLES, createHttpError, decodePaginationCursor } from './domain.mjs';
import { assertDeliverableEmail } from './email-verification.mjs';
import { buildVerificationEmail, buildInviteEmail } from '../../server/email/resend.mjs';
import {
  validateAiChatBody,
  validateAiSettingsBody,
  validateBackgroundJobBody,
  validateChangePasswordBody,
  validateCompleteBackgroundJobBody,
  validateConnectorPairBody,
  validateConnectorSessionBody,
  validateCreateProjectBody,
  validateDeleteAccountBody,
  validateDevLoginBody,
  validateGraphRunBody,
  validateHostOperationBody,
  validateLoginBody,
  validateObjectArtifactBody,
  validateOidcCallbackBody,
  validateProjectMemberBody,
  validateInviteBody,
  validateSaveGraphBody,
  validateShareLinkBody,
  validateSignupBody,
  validateTicketBody
} from './validation.mjs';

export function matchRoute(method, path, options = {}) {
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
      return store.createAuthSessionAsync({
        email: body.email || 'owner@demo.nova',
        organizationId: organization.id
      });
    }],
    ['POST', /^\/api\/auth\/oidc\/callback$/, true, 200, handleOidcCallback],
    ['POST', /^\/api\/auth\/signup$/, true, 201, handleSignup],
    ['POST', /^\/api\/auth\/login$/, true, 200, handleLogin],
    ['POST', /^\/api\/auth\/verify$/, true, 200, handleVerifyEmail],
    ['POST', /^\/api\/auth\/resend-verification$/, true, 200, handleResendVerification],
    ['GET', /^\/api\/me$/, false, 200, ({ context }) => ({ user: context.user })],
    ['DELETE', /^\/api\/me$/, false, 200, handleDeleteAccount],
    ['PUT', /^\/api\/me\/password$/, false, 200, handleChangePassword],
    ['GET', /^\/api\/me\/ai-settings$/, false, 200, handleGetAiSettings],
    ['PUT', /^\/api\/me\/ai-settings$/, false, 200, handlePutAiSettings],
    ['GET', /^\/api\/projects$/, false, 200, ({ store, context, url }) => {
      const page = store.listProjects(context, parsePaginationParams(url));
      return { projects: page.items, pagination: page.pagination };
    }],
    // Must precede /api/projects/:id so "shared" isn't captured as an id.
    ['GET', /^\/api\/projects\/shared$/, false, 200, ({ store, context, url }) => {
      const page = store.listSharedProjects(context, parsePaginationParams(url));
      return { projects: page.items, pagination: page.pagination };
    }],
    ['POST', /^\/api\/projects$/, false, 201, ({ store, context, body }) => store.createProject(context, validateCreateProjectBody(body || {}))],
    ['GET', /^\/api\/share\/([^/]+)$/, true, 200, ({ store, params }) => ({ invite: store.previewShareLink(params[0]) })],
    ['POST', /^\/api\/share\/([^/]+)$/, false, 200, ({ store, context, params }) => ({ project: store.redeemShareLink(context, params[0]) })],
    ['POST', /^\/api\/projects\/([^/]+)\/share-links$/, false, 201, ({ store, context, params, body }) => store.createShareLink(context, params[0], validateShareLinkBody(body || {}))],
    ['POST', /^\/api\/projects\/([^/]+)\/invites$/, false, 200, handleInviteToProject],
    ['POST', /^\/api\/feedback\/ticket$/, false, 201, handleSubmitTicket],
    ['GET', /^\/api\/projects\/([^/]+)\/share-links$/, false, 200, ({ store, context, params }) => ({ shareLinks: store.listShareLinks(context, params[0]) })],
    ['PATCH', /^\/api\/projects\/([^/]+)\/share-links\/([^/]+)$/, false, 200, ({ store, context, params, body }) => store.updateShareLinkRole(context, params[0], params[1], validateShareLinkBody(body || {}).role)],
    ['POST', /^\/api\/projects\/([^/]+)\/share-links\/([^/]+)\/revoke$/, false, 200, ({ store, context, params }) => store.revokeShareLink(context, params[0], params[1])],
    ['GET', /^\/api\/projects\/([^/]+)$/, false, 200, ({ store, context, params }) => store.getProject(context, params[0])],
    ['DELETE', /^\/api\/projects\/([^/]+)$/, false, 200, ({ store, context, params }) => store.deleteProject(context, params[0])],
    ['POST', /^\/api\/projects\/([^/]+)\/members$/, false, 200, ({ store, context, params, body }) => store.addProjectMember(context, params[0], validateProjectMemberBody(body || {}))],
    ['PUT', /^\/api\/projects\/([^/]+)\/graph$/, false, 200, ({ store, context, params, body }) => store.updateProjectGraph(context, params[0], validateSaveGraphBody(body || {}))],
    ['GET', /^\/api\/projects\/([^/]+)\/versions$/, false, 200, ({ store, context, params, url }) => {
      const page = store.listProjectVersions(context, params[0], parsePaginationParams(url));
      return { versions: page.items, pagination: page.pagination };
    }],
    ['POST', /^\/api\/projects\/([^/]+)\/versions\/([^/]+)\/restore$/, false, 200, ({ store, context, params }) => store.restoreProjectVersion(context, params[0], params[1])],
    ['GET', /^\/api\/projects\/([^/]+)\/runs$/, false, 200, ({ store, context, params, url }) => {
      const page = store.listGraphRuns(context, params[0], parsePaginationParams(url));
      return { runs: page.items, pagination: page.pagination };
    }],
    ['POST', /^\/api\/projects\/([^/]+)\/runs$/, false, 201, ({ store, context, params, body }) => store.recordGraphRun(context, params[0], validateGraphRunBody(body || {}))],
    ['GET', /^\/api\/projects\/([^/]+)\/artifacts$/, false, 200, ({ store, context, params, url }) => {
      const page = store.listObjectArtifacts(context, params[0], parsePaginationParams(url));
      return { artifacts: page.items, pagination: page.pagination };
    }],
    ['POST', /^\/api\/projects\/([^/]+)\/artifacts$/, false, 201, handleCreateObjectArtifact],
    ['GET', /^\/api\/artifacts\/([^/]+)$/, false, 200, ({ store, context, params }) => store.getObjectArtifact(context, params[0])],
    ['GET', /^\/api\/artifacts\/([^/]+)\/data$/, false, 200, handleGetObjectArtifactData],
    ['GET', /^\/api\/jobs$/, false, 200, ({ store, context, url }) => {
      const page = store.listBackgroundJobs(context, parsePaginationParams(url));
      return { jobs: page.items, pagination: page.pagination };
    }],
    ['POST', /^\/api\/jobs$/, false, 201, ({ store, context, body }) => store.enqueueBackgroundJob(context, validateBackgroundJobBody(body || {}))],
    ['GET', /^\/api\/jobs\/([^/]+)$/, false, 200, ({ store, context, params }) => store.getBackgroundJob(context, params[0])],
    ['POST', /^\/api\/jobs\/claim$/, false, 200, ({ store, context, body }) => ({ job: store.claimNextBackgroundJob(context, { type: body && body.type ? String(body.type) : '' }) })],
    ['POST', /^\/api\/jobs\/([^/]+)\/complete$/, false, 200, ({ store, context, params, body }) => store.completeBackgroundJob(context, params[0], validateCompleteBackgroundJobBody(body || {}))],
    ['POST', /^\/api\/jobs\/([^/]+)\/fail$/, false, 200, ({ store, context, params, body }) => store.failBackgroundJob(context, params[0], validateCompleteBackgroundJobBody(body || {}))],
    ['POST', /^\/api\/connectors\/sessions$/, false, 201, ({ store, context, body }) => store.createConnectorSessionAsync(context, validateConnectorSessionBody(body || {}))],
    ['POST', /^\/api\/connectors\/sessions\/([^/]+)\/pair$/, false, 200, ({ store, context, params, body }) => {
      const payload = validateConnectorPairBody(body || {});
      return store.pairConnectorAsync(context, params[0], payload.pairingCode);
    }],
    ['POST', /^\/api\/ai\/chat$/, false, 200, handleAiChat],
    ['GET', /^\/api\/audit$/, false, 200, ({ store, context, url }) => {
      const page = store.listAuditEvents(context, parsePaginationParams(url));
      return { events: page.items, pagination: page.pagination };
    }],
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

function bearerToken(authorization) {
  const header = authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

// Builds the platform-agnostic request handler. `request` is a plain object:
// { method, path, searchParams, authorization, body }. Returns { status, body }.
export function createApiDispatcher({ store, authService, aiProvider, objectStorage, emailService = null, secretsService = null, issueService = null, appUrl = '', allowDevLogin = false }) {
  return async function dispatch(request) {
    const { method, path, searchParams, authorization, body, waitUntil } = request;
    const route = matchRoute(method, path, { allowDevLogin });
    if (!route) throw createHttpError(404, 'Route not found.');
    const context = route.public ? null : await store.authenticateAsync(bearerToken(authorization));
    const url = { searchParams: searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || '') };
    const result = await route.handler({ store, context, params: route.params, body: body || {}, url, aiProvider, authService, objectStorage, emailService, secretsService, issueService, appUrl: request.appUrl || appUrl });
    // Persistence flush. The write MUST complete, but the client shouldn't wait
    // for it. On Cloudflare we hand the promise to ctx.waitUntil (passed in as
    // `waitUntil`): the response returns immediately while the runtime keeps the
    // isolate alive until the Neon write finishes — fast AND no data loss. When
    // there's no waitUntil (Node http server, tests) we await it so the write
    // still completes before responding. A flush FAILURE is always swallowed
    // (logged, not surfaced): the in-memory state is intact and a later write
    // rewrites it, so a transient DB hiccup never fails a successful mutation.
    if (store.flushPersistence) {
      const flush = Promise.resolve()
        .then(() => store.flushPersistence())
        .catch(error => {
          if (typeof console !== 'undefined') console.error('[nova] persist flush failed (mutation still succeeded): %s', (error && error.message) || error);
        });
      if (typeof waitUntil === 'function') waitUntil(flush);
      else await flush;
    }
    return { status: route.status || 200, body: result };
  };
}

async function handleCreateObjectArtifact({ store, context, params, body, objectStorage }) {
  const payload = validateObjectArtifactBody(body || {});
  const bytes = decodeArtifactData(payload.data || '');
  const artifact = store.createObjectArtifact(context, params[0], {
    name: payload.name || 'artifact',
    kind: payload.kind || 'graph-export',
    contentType: payload.contentType || 'application/octet-stream',
    byteSize: bytes.length,
    metadata: payload.metadata || {}
  });
  await objectStorage.putObject(artifact.storageKey, bytes);
  return artifact;
}

async function handleGetObjectArtifactData({ store, context, params, objectStorage }) {
  const artifact = store.getObjectArtifact(context, params[0]);
  const data = await objectStorage.getObject(artifact.storageKey);
  if (!data) throw createHttpError(404, 'Object artifact payload not found.');
  return {
    artifact,
    data: Buffer.from(data).toString('base64')
  };
}

function decodeArtifactData(value) {
  if (!value) return Buffer.alloc(0);
  if (String(value).startsWith('base64:')) return Buffer.from(String(value).slice(7), 'base64');
  return Buffer.from(String(value), 'utf8');
}

function parsePaginationParams(url) {
  const limit = parseLimitParam(url.searchParams.get('limit'));
  const cursor = url.searchParams.get('cursor') || '';
  return {
    limit,
    offset: cursor ? decodePaginationCursor(cursor) : 0
  };
}

function parseLimitParam(value) {
  if (value === null || value === '') return 50;
  if (!/^\d+$/.test(value)) throw createHttpError(400, 'limit must be a positive integer.');
  const limit = Number(value);
  if (limit < 1 || limit > 200) throw createHttpError(400, 'limit must be between 1 and 200.');
  return limit;
}

// Email+password sign-up. Creates the account + personal workspace and emails a
// verification link, but does NOT issue a session — sign-in only completes once
// the user clicks that link (see handleVerifyEmail). The response carries no
// token; the client tells the user to check their inbox.
async function handleSignup({ store, authService, body, emailService, appUrl }) {
  const payload = validateSignupBody(body || {});
  const email = payload.email.trim();
  // Reject disposable domains and domains with no mail servers up front (the
  // MX check fails open on lookup errors). Ownership is then proven by the
  // emailed verification link.
  await assertDeliverableEmail(email);
  // Refuse if the email is already taken — including by a Google-only account.
  // Silently "linking" a password to an existing OIDC email would let anyone
  // who guesses an email set a password on it, so we make the user sign in
  // with the method that already owns the address.
  if (store.findUserByEmail(email)) throw createHttpError(409, 'An account with this email already exists. Try signing in instead.');
  const passwordHash = await authService.hashPasswordAsync(payload.password);
  const user = store.createUser({ email, displayName: payload.displayName || email, passwordHash });
  store.ensurePersonalWorkspace(user.id);
  await sendVerificationEmail({ store, emailService, appUrl, user });
  return { ok: true, verificationRequired: true, email: user.email };
}

// Best-effort: generate a token and email the verification link. Never fails
// signup — if sending breaks, the account still exists and the user can
// re-request a link from the in-app "verify your email" banner.
async function sendVerificationEmail({ store, emailService, appUrl, user }) {
  if (!emailService) return;
  try {
    const token = await store.createEmailVerificationTokenAsync(user.id);
    const msg = buildVerificationEmail({ appUrl, token, displayName: user.displayName, email: user.email });
    await emailService.send({ to: user.email, subject: msg.subject, html: msg.html, text: msg.text });
  } catch (error) {
    console.error('[nova-auth] verification email failed for %s: %s', user.email, (error && error.message) || error);
  }
}

// Public: the link in the verification email points at the SPA (?verify=token),
// which posts the token here. Marks the account verified AND completes sign-in
// by issuing a session — so clicking the link logs the user straight in (the
// Worker turns the returned token into the httpOnly session cookie).
async function handleVerifyEmail({ store, body }) {
  const token = body && typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) throw createHttpError(400, 'A verification token is required.');
  const user = await store.consumeEmailVerificationTokenAsync(token);
  const organization = store.ensurePersonalWorkspace(user.id);
  const session = await store.createAuthSessionAsync({ email: user.email, organizationId: organization.id });
  return { ok: true, emailVerified: true, token: session.token, user: session.user };
}

// Public + email-based: re-send the verification link. Since an unverified user
// has no session yet, this works from the email in the body (also honors a
// signed-in context if present). Always returns a generic { ok: true } and only
// sends when the address maps to a real, still-unverified account — so it never
// reveals whether an email is registered or already verified.
async function handleResendVerification({ store, context, body, emailService, appUrl }) {
  let user = null;
  if (context && context.userId) user = store.requireUser(context.userId);
  else if (body && typeof body.email === 'string' && body.email.trim()) user = store.findUserByEmail(body.email.trim());
  if (user && !user.emailVerified && emailService) {
    try {
      const token = await store.createEmailVerificationTokenAsync(user.id);
      const msg = buildVerificationEmail({ appUrl, token, displayName: user.displayName, email: user.email });
      await emailService.send({ to: user.email, subject: msg.subject, html: msg.html, text: msg.text });
    } catch (error) {
      console.error('[nova-auth] resend verification failed for %s: %s', user.email, (error && error.message) || error);
    }
  }
  return { ok: true };
}

// Authenticated: the signed-in user's synced AI settings (their BYOK keys +
// provider/model). Decrypts and returns plaintext to the owner ONLY — auth is
// enforced by the dispatcher, and the encrypted blob is never exposed via
// publicUser()/`/api/me`. Returns { settings: null } when nothing is stored.
async function handleGetAiSettings({ store, context, secretsService }) {
  const user = store.requireUser(context.userId);
  if (!user.aiSettingsEncrypted) return { settings: null };
  if (!secretsService) throw createHttpError(503, 'Secret storage is not configured for this deployment.', 'SECRETS_NOT_CONFIGURED');
  const plain = await secretsService.decrypt(user.aiSettingsEncrypted);
  if (plain === null) return { settings: null }; // stale/rotated key — treat as empty
  let settings;
  try { settings = JSON.parse(plain); } catch { return { settings: null }; }
  return { settings };
}

// Authenticated: store (encrypted) the user's AI settings. Mutates the live
// user record in place + persists, mirroring markEmailVerified().
async function handlePutAiSettings({ store, context, body, secretsService }) {
  if (!secretsService) throw createHttpError(503, 'Secret storage is not configured for this deployment.', 'SECRETS_NOT_CONFIGURED');
  const settings = validateAiSettingsBody(body || {});
  const user = store.requireUser(context.userId);
  user.aiSettingsEncrypted = await secretsService.encrypt(JSON.stringify(settings));
  if (store.persist) store.persist();
  return { ok: true };
}

async function handleChangePassword({ store, context, body, authService }) {
  const payload = validateChangePasswordBody(body || {});
  const user = store.requireUser(context.userId);
  if (!user.passwordHash) throw createHttpError(400, 'This account does not have a Nova password. Use your identity provider to manage its password.', 'PASSWORD_NOT_AVAILABLE');
  const ok = await authService.verifyPasswordAsync(payload.currentPassword, user.passwordHash);
  if (!ok) throw createHttpError(401, 'Current password is incorrect.');
  const passwordHash = await authService.hashPasswordAsync(payload.newPassword);
  return { ok: true, user: store.updateUserPassword(user.id, passwordHash) };
}

async function handleDeleteAccount({ store, context, body, authService }) {
  const payload = validateDeleteAccountBody(body || {});
  const user = store.requireUser(context.userId);
  if (String(payload.confirmEmail || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
    throw createHttpError(400, 'Type your account email to confirm deletion.');
  }
  if (user.passwordHash) {
    const ok = payload.password && await authService.verifyPasswordAsync(payload.password, user.passwordHash);
    if (!ok) throw createHttpError(401, 'Current password is incorrect.');
  }
  return store.deleteUserAccount(user.id);
}

// Invite someone to a project by email: creates a role-scoped, email-tagged
// share link (admin-only, enforced in the store) and tries to email the join
// URL. The response is HONEST about delivery — `ok:true` only means the
// link/invite was created+persisted (which genuinely happened); whether an
// email actually went out is reported separately in `delivery.delivered`, and
// is only ever true when a real provider confirmed it. The join URL is always
// returned so the UI can offer a copyable link as a fallback. The raw token
// still goes to the invitee's inbox; we expose the join URL (token-bearing) to
// the inviter only as that manual-share fallback.
async function handleInviteToProject({ store, context, params, body, emailService, appUrl }) {
  const payload = validateInviteBody(body || {});
  const project = store.getProject(context, params[0]); // read-access check + name/org
  const link = store.inviteToProject(context, params[0], { email: payload.email, role: payload.role });
  // Build the join URL the same way buildInviteEmail does, so the copyable
  // fallback link matches exactly what the email contains.
  const base = (appUrl || '').replace(/\/+$/, '');
  const joinUrl = base + '/?join=' + encodeURIComponent(link.token);
  let delivery = { delivered: false, provider: 'none' };
  if (emailService) {
    try {
      const inviter = (context.user && (context.user.displayName || context.user.email)) || 'A Nova user';
      const msg = buildInviteEmail({ appUrl, token: link.token, projectName: project.name, inviterName: inviter, role: payload.role });
      const result = await emailService.send({ to: payload.email, subject: msg.subject, html: msg.html, text: msg.text });
      delivery = {
        delivered: !!(result && result.delivered),
        provider: (result && result.provider) || 'unknown'
      };
      if (result && result.error) delivery.error = result.error;
      if (!delivery.delivered) console.error('[nova-invite] email to %s not delivered (%s): %s', payload.email, delivery.provider, delivery.error || 'no error reported');
    } catch (error) {
      delivery = { delivered: false, provider: (emailService && emailService.provider) || 'unknown', error: (error && error.message) || String(error) };
      console.error('[nova-invite] email to %s threw: %s', payload.email, delivery.error);
    }
  }
  return {
    ok: true,
    invite: { id: link.id, email: payload.email, role: payload.role },
    joinUrl,
    delivery
  };
}

// In-app support ticket → a GitHub issue. Authenticated (reduces spam); the
// GitHub token lives only in the injected issueService.
async function handleSubmitTicket({ context, body, issueService, appUrl }) {
  if (!issueService) throw createHttpError(503, 'Ticket submission is not configured for this deployment.', 'FEEDBACK_NOT_CONFIGURED');
  const payload = validateTicketBody(body || {});
  const labelByCategory = { bug: 'bug', feature: 'enhancement', question: 'question' };
  const title = '[' + payload.category + '] ' + payload.title;
  // Attach the VERIFIED reporter identity (from the authenticated session, not a
  // typed field) so the maintainer can follow up. The route is authenticated, so
  // context.user is always present. This is meant for a PRIVATE tickets repo —
  // it intentionally includes the reporter's email.
  const user = (context && context.user) || {};
  const reporterName = user.displayName || user.email || 'Unknown';
  const reporterEmail = user.email || 'unknown';
  const verified = user.emailVerified ? 'verified' : 'unverified';
  const base = (appUrl || '').replace(/\/+$/, '');
  const reporter =
    '\n\n---\n' +
    '**Reporter** (' + verified + ' via account sign-in)\n' +
    '- Name: ' + reporterName + '\n' +
    '- Email: `' + reporterEmail + '`\n' +
    '- Nova user: `' + (user.id || 'unknown') + '`\n' +
    (base ? '- App: ' + base + '\n' : '') +
    '\n_Submitted via the Nova in-app ticket form._';
  const fullBody = payload.body + reporter;
  const issue = await issueService.create({ title, body: fullBody, labels: [labelByCategory[payload.category] || 'bug', 'from-app'] });
  return { ok: true, url: issue.url, number: issue.number };
}

// Email+password sign-in. Uses a single generic error for "no such user" and
// "wrong password" so the endpoint can't be used to enumerate which emails
// have accounts.
async function handleLogin({ store, authService, body }) {
  const payload = validateLoginBody(body || {});
  const email = payload.email.trim();
  const user = store.findUserByEmail(email);
  const ok = user && user.passwordHash && await authService.verifyPasswordAsync(payload.password, user.passwordHash);
  if (!ok) throw createHttpError(401, 'Invalid email or password.');
  // Sign-in is gated on a verified email: until the emailed link is clicked,
  // no session is issued. (OIDC/Google accounts are created already verified.)
  if (!user.emailVerified) {
    throw createHttpError(403, 'Please verify your email before signing in — check your inbox for the verification link.', 'EMAIL_NOT_VERIFIED');
  }
  const organization = store.ensurePersonalWorkspace(user.id);
  return store.createAuthSessionAsync({ email: user.email, organizationId: organization.id });
}

async function handleOidcCallback({ store, authService, body }) {
  const payload = validateOidcCallbackBody(body || {});
  const identity = await authService.verifyOidcLogin({
    idToken: payload.idToken,
    organizationSlug: payload.organizationSlug
  });
  const user = store.createOrUpdateExternalUser(identity);
  // Org/SSO login: a known org slug maps the user into that organization.
  // Personal login (Google with no org, or unknown slug): drop them into their
  // own personal workspace so accounts work without a team.
  let organization = identity.organizationSlug
    ? Array.from(store.organizations.values()).find(item => item.slug === identity.organizationSlug)
    : null;
  if (organization) {
    try {
      store.requireMembership(user.id, organization.id);
    } catch (error) {
      if (organization.settings.ssoRequired) throw error;
      store.addMembership({ organizationId: organization.id, userId: user.id, role: ROLES.VIEWER });
    }
  } else {
    organization = store.ensurePersonalWorkspace(user.id);
  }
  return store.createAuthSessionAsync({ email: user.email, organizationId: organization.id });
}

async function handleAiChat({ store, context, body, aiProvider }) {
  const payload = validateAiChatBody(body || {});
  const request = await store.createAiRequestAsync(context, payload);
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
      message: { role: 'assistant', content },
      usage: completed.usage
    };
  } catch (error) {
    store.failAiRequest(context, request.id, error.message || 'AI provider failed.');
    throw error;
  }
}

// ── AI provider factories (fetch-based, runtime-agnostic) ──

export function createConfiguredAiProvider(config = {}) {
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

function createMockAiProvider() {
  return {
    async complete({ messages = [], model }) {
      const lastUserMessage = [...messages].reverse().find(message => message && message.role === 'user');
      const text = lastUserMessage ? String(lastUserMessage.content || '') : '';
      return {
        content: 'Mock enterprise AI response for ' + (text || 'empty request') + '.',
        usage: { model, inputMessages: messages.length, outputCharacters: text.length }
      };
    }
  };
}

function createOpenAiCompatibleProviders(config = {}) {
  const env = config.env || (typeof process !== 'undefined' ? process.env : {});
  const definitions = [
    { id: 'openai', apiKey: env.NOVA_OPENAI_API_KEY, apiUrl: env.NOVA_OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions', extraHeaders: {} },
    { id: 'groq', apiKey: env.NOVA_GROQ_API_KEY, apiUrl: env.NOVA_GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions', extraHeaders: {} },
    {
      id: 'openrouter',
      apiKey: env.NOVA_OPENROUTER_API_KEY,
      apiUrl: env.NOVA_OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
      extraHeaders: { 'HTTP-Referer': env.NOVA_PUBLIC_APP_URL || 'https://nova.local', 'X-Title': 'Nova' }
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey, ...extraHeaders },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 })
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!response.ok) {
        const message = data && data.error && data.error.message ? data.error.message : 'AI provider request failed.';
        throw createHttpError(response.status, message, 'AI_PROVIDER_ERROR');
      }
      const choice = data.choices && data.choices[0] && data.choices[0].message;
      return { content: choice && choice.content ? choice.content : '', usage: data.usage || null };
    }
  };
}
