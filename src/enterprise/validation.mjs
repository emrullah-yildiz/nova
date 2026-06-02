import { createHttpError } from './domain.mjs';

export function validateDevLoginBody(body = {}) {
  optionalString(body.email, 'email', 320);
  optionalString(body.organizationSlug, 'organizationSlug', 120);
  return body;
}

// Minimal, permissive email shape check — real deliverability is verified by
// sending mail (out of scope here); this just rejects obvious garbage.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

export function validateSignupBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.email, 'email', 320);
  if (!EMAIL_RE.test(body.email.trim())) throw createHttpError(400, 'Enter a valid email address.');
  requireString(body.password, 'password', PASSWORD_MAX);
  if (body.password.length < PASSWORD_MIN) throw createHttpError(400, 'Password must be at least ' + PASSWORD_MIN + ' characters.');
  optionalString(body.displayName, 'displayName', 160);
  return body;
}

export function validateLoginBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.email, 'email', 320);
  requireString(body.password, 'password', PASSWORD_MAX);
  return body;
}

export function validateChangePasswordBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.currentPassword, 'currentPassword', PASSWORD_MAX);
  requireString(body.newPassword, 'newPassword', PASSWORD_MAX);
  if (body.newPassword.length < PASSWORD_MIN) throw createHttpError(400, 'Password must be at least ' + PASSWORD_MIN + ' characters.');
  return body;
}

export function validateDeleteAccountBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.confirmEmail, 'confirmEmail', 320);
  optionalString(body.password, 'password', PASSWORD_MAX);
  return body;
}

export function validateOidcCallbackBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.idToken, 'idToken', 20000);
  optionalString(body.organizationSlug, 'organizationSlug', 120);
  return body;
}

export function validateCreateProjectBody(body = {}) {
  optionalString(body.name, 'name', 160);
  optionalGraph(body.graph, 'graph');
  return body;
}

export function validateSaveGraphBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalString(body.message, 'message', 240);
  requireGraph(body.graph, 'graph');
  return body;
}

export function validateConnectorSessionBody(body = {}) {
  optionalString(body.host, 'host', 40);
  optionalString(body.projectId, 'projectId', 80);
  optionalString(body.connectorVersion, 'connectorVersion', 40);
  return body;
}

export function validateConnectorPairBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.pairingCode, 'pairingCode', 64);
  return body;
}

export function validateProjectMemberBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.userId, 'userId', 80);
  requireString(body.role, 'role', 40);
  return body;
}

export function validateAiChatBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalString(body.projectId, 'projectId', 80);
  optionalString(body.provider, 'provider', 80);
  optionalString(body.model, 'model', 160);
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw createHttpError(400, 'messages must be a non-empty array.');
  }
  if (body.messages.length > 32) throw createHttpError(400, 'messages cannot contain more than 32 entries.');
  body.messages.forEach((message, index) => validateAiMessage(message, 'messages[' + index + ']'));
  optionalPlainObject(body.metadata, 'metadata');
  return body;
}

// The signed-in user's synced AI settings: provider + model + a map of
// per-provider BYOK keys. Returns a normalized { provider, model, keys } so the
// stored (encrypted) blob is well-shaped. Caps sizes so a client can't stuff
// the user record with megabytes.
const AI_SETTINGS_PROVIDERS = ['openai', 'groq', 'gemini', 'anthropic', 'openrouter'];
export function validateAiSettingsBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalString(body.provider, 'provider', 80);
  optionalString(body.model, 'model', 200);
  const keys = {};
  if (body.keys !== undefined && body.keys !== null) {
    requirePlainObject(body.keys, 'keys');
    for (const [provider, value] of Object.entries(body.keys)) {
      if (!AI_SETTINGS_PROVIDERS.includes(provider)) continue; // ignore unknown providers
      if (typeof value !== 'string') throw createHttpError(400, 'keys.' + provider + ' must be a string.');
      if (value.length > 600) throw createHttpError(400, 'keys.' + provider + ' is too long.');
      if (value) keys[provider] = value;
    }
  }
  return { provider: body.provider || '', model: body.model || '', keys };
}

// Share-link creation: role is capped at Editor/Viewer (never Admin/Owner via a
// link — those must be granted explicitly). Optional positive expiry.
export function validateShareLinkBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.role, 'role', 40);
  if (!['Editor', 'Viewer'].includes(body.role)) throw createHttpError(400, 'Share links can only grant Editor or Viewer access.');
  if (body.expiresInMs !== undefined && body.expiresInMs !== null && (!Number.isFinite(body.expiresInMs) || body.expiresInMs < 0)) {
    throw createHttpError(400, 'expiresInMs must be a non-negative number.');
  }
  return { role: body.role, expiresInMs: body.expiresInMs || 0 };
}

// Invite-by-email: a valid email + an Editor/Viewer role.
export function validateInviteBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.email, 'email', 320);
  if (!EMAIL_RE.test(body.email.trim())) throw createHttpError(400, 'Enter a valid email address.');
  requireString(body.role, 'role', 40);
  if (!['Editor', 'Viewer'].includes(body.role)) throw createHttpError(400, 'Invites can only grant Editor or Viewer access.');
  return { email: body.email.trim().toLowerCase(), role: body.role };
}

// In-app support ticket → GitHub issue.
export function validateTicketBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.title, 'title', 160);
  requireString(body.body, 'body', 8000);
  optionalString(body.category, 'category', 40);
  const category = ['bug', 'feature', 'question'].includes(body.category) ? body.category : 'bug';
  return { title: body.title.trim(), body: body.body, category };
}

export function validateGraphRunBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalString(body.versionId, 'versionId', 80);
  optionalString(body.status, 'status', 40);
  if (body.durationMs !== undefined && body.durationMs !== null && (!Number.isFinite(body.durationMs) || body.durationMs < 0)) {
    throw createHttpError(400, 'durationMs must be a non-negative number.');
  }
  optionalString(body.errorSummary, 'errorSummary', 1000);
  if (body.startedAt !== undefined && (!Number.isFinite(body.startedAt) || body.startedAt < 0)) {
    throw createHttpError(400, 'startedAt must be a non-negative number.');
  }
  if (body.completedAt !== undefined && body.completedAt !== null && (!Number.isFinite(body.completedAt) || body.completedAt < 0)) {
    throw createHttpError(400, 'completedAt must be a non-negative number.');
  }
  return body;
}

export function validateHostOperationBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalString(body.projectId, 'projectId', 80);
  optionalString(body.host, 'host', 40);
  requireString(body.operation, 'operation', 120);
  if (body.ok !== undefined && typeof body.ok !== 'boolean') throw createHttpError(400, 'ok must be a boolean.');
  optionalPlainObject(body.metadata, 'metadata');
  return body;
}

export function validateObjectArtifactBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalString(body.name, 'name', 240);
  optionalString(body.kind, 'kind', 80);
  optionalString(body.contentType, 'contentType', 160);
  optionalString(body.data, 'data', 2_000_000);
  optionalPlainObject(body.metadata, 'metadata');
  return body;
}

export function validateBackgroundJobBody(body = {}) {
  requirePlainObject(body, 'request body');
  requireString(body.type, 'type', 120);
  optionalString(body.projectId, 'projectId', 80);
  optionalString(body.artifactId, 'artifactId', 80);
  optionalPlainObject(body.payload, 'payload');
  if (body.availableAfter !== undefined && (!Number.isFinite(body.availableAfter) || body.availableAfter < 0)) {
    throw createHttpError(400, 'availableAfter must be a non-negative number.');
  }
  return body;
}

export function validateCompleteBackgroundJobBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalPlainObject(body.result, 'result');
  optionalString(body.errorSummary, 'errorSummary', 1000);
  return body;
}

function validateAiMessage(message, label) {
  requirePlainObject(message, label);
  if (!['system', 'user', 'assistant'].includes(message.role)) {
    throw createHttpError(400, label + '.role must be system, user, or assistant.');
  }
  requireString(message.content, label + '.content', 16000);
}

function requireGraph(value, label) {
  requirePlainObject(value, label);
  if (!Array.isArray(value.nodes)) throw createHttpError(400, label + '.nodes must be an array.');
  if (!Array.isArray(value.wires)) throw createHttpError(400, label + '.wires must be an array.');
}

function optionalGraph(value, label) {
  if (value === undefined || value === null) return;
  requireGraph(value, label);
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createHttpError(400, label + ' must be an object.');
  }
}

function optionalPlainObject(value, label) {
  if (value === undefined || value === null) return;
  requirePlainObject(value, label);
}

function requireString(value, label, maxLength) {
  if (typeof value !== 'string' || value.trim() === '') throw createHttpError(400, label + ' must be a non-empty string.');
  if (value.length > maxLength) throw createHttpError(400, label + ' is too long.');
}

function optionalString(value, label, maxLength) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') throw createHttpError(400, label + ' must be a string.');
  if (value.length > maxLength) throw createHttpError(400, label + ' is too long.');
}
