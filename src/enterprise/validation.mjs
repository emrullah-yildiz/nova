import { createHttpError } from './domain.mjs';

export function validateDevLoginBody(body = {}) {
  optionalString(body.email, 'email', 320);
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

export function validateHostOperationBody(body = {}) {
  requirePlainObject(body, 'request body');
  optionalString(body.projectId, 'projectId', 80);
  optionalString(body.host, 'host', 40);
  requireString(body.operation, 'operation', 120);
  if (body.ok !== undefined && typeof body.ok !== 'boolean') throw createHttpError(400, 'ok must be a boolean.');
  optionalPlainObject(body.metadata, 'metadata');
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
