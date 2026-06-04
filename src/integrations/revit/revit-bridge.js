// ============================================================================
// Nova Connect — browser-side Revit bridge (Milestone 4, M4-T3)
// ----------------------------------------------------------------------------
// Thin, transport-agnostic helpers that build M4-T1-contract envelopes
// (src/integrations/connect/protocol.js) and push them over a NovaConnectClient.
// Every request envelope is validated with `validateMessage` BEFORE it leaves
// the browser, so a malformed request (bad point tuple, object-valued param,
// missing elementId, …) is rejected client-side with a structured error instead
// of hitting the hub.
//
// M4-T4 (node defs) and M4-T5 (picker UI) pin to the exported API below:
//   requestSelection(opts, deps?)            -> { elements: ContractElement[] }
//   placeInstance(spec, deps?)               -> raw place result payload
//   getParameters(elementId, names, deps?)   -> { elementId, params: {name:value} }
//   setParameters(elementId, params, deps?)  -> raw set result payload
//
// IMPORTANT — legacy coexistence: the M4 parameter contract is
// { elementId, params: { name: value } }. This DIVERGES from the legacy client
// methods (getParameterValues/setParameterValues with
// { elementIds, parameterName, values }) that src/integrations/revit/revit-nodes.js
// still uses. This bridge adds NEW behavior on NEW client methods
// (sendSelectionQuery/sendGeometryPlace/sendParameterGet/sendParameterSet) and
// never touches the legacy methods. See the M4-T3 handoff note for the planned
// migration (owned by M4-T4).
// ============================================================================

import {
  MESSAGE_TYPES,
  createEnvelope,
  validateMessage
} from '../connect/protocol.js';

/**
 * Error thrown when a request envelope fails client-side contract validation.
 * Carries the structured validator errors so callers (and tests) can assert on
 * them without string-matching a single concatenated message.
 */
export class BridgeValidationError extends Error {
  constructor(type, errors) {
    super(`Invalid ${type} request: ${errors.join('; ')}`);
    this.name = 'BridgeValidationError';
    this.type = type;
    this.errors = errors;
  }
}

function getDefaultClient() {
  if (typeof window !== 'undefined' && window.NovaConnect) return window.NovaConnect;
  if (typeof globalThis !== 'undefined' && globalThis.NovaConnect) return globalThis.NovaConnect;
  return null;
}

function resolveClient(deps) {
  const client = (deps && deps.client) || getDefaultClient();
  if (!client) {
    throw new Error('Nova Connect client is not available. Pair with the local hub first.');
  }
  return client;
}

/**
 * Build a contract envelope for `type` carrying `payload`, validate the whole
 * message against the M4-T1 contract, and return the envelope. Throws a
 * `BridgeValidationError` (with structured `.errors`) when validation fails so
 * malformed requests never reach the transport.
 */
function buildValidatedEnvelope(client, type, payload) {
  const envelope = createEnvelope({
    type,
    source: client.source || 'nova-browser',
    target: 'host',
    sessionId: client.sessionId || '',
    projectId: client.projectId || '',
    payload
  });
  const result = validateMessage(envelope);
  if (!result.ok) throw new BridgeValidationError(type, result.errors);
  return envelope;
}

/** Coerce one point into a finite [x, y, z] tuple (accepts {x,y,z} or array). */
function toPointTuple(point) {
  if (Array.isArray(point)) {
    return [Number(point[0]), Number(point[1]), Number(point[2])];
  }
  if (point && typeof point === 'object') {
    return [Number(point.x), Number(point.y), Number(point.z)];
  }
  // Leave non-coercible input as-is so the validator reports the real shape.
  return point;
}

/** Normalize a list (or single) of points to contract [x,y,z] tuples. */
function toPointTuples(points) {
  const list = Array.isArray(points) && !isPointLike(points) ? points : [points];
  return list.map(toPointTuple);
}

/** True when `value` looks like a single point ([x,y,z] or {x,y,z}). */
function isPointLike(value) {
  if (Array.isArray(value)) {
    return value.length === 3 && value.every(n => typeof n === 'number');
  }
  return !!value && typeof value === 'object'
    && typeof value.x === 'number'
    && typeof value.y === 'number'
    && typeof value.z === 'number';
}

/**
 * Normalize one raw element from a `selection.result` payload into the contract
 * element shape. Defensive about field aliases the host might send, but emits
 * exactly the contract fields the rest of Nova consumes.
 */
function normalizeSelectionElement(raw = {}) {
  const element = {
    id: String(raw.id != null ? raw.id : (raw.elementId != null ? raw.elementId : '')),
    name: typeof raw.name === 'string' ? raw.name : '',
    category: raw.category || raw.categoryName || 'Unknown',
    typeName: typeof raw.typeName === 'string' ? raw.typeName : (raw.familyType || ''),
    levelName: typeof raw.levelName === 'string' ? raw.levelName : (raw.level || ''),
    params: raw.params && typeof raw.params === 'object' ? raw.params : {}
  };
  if (Array.isArray(raw.faces)) {
    element.faces = raw.faces.map(face => ({
      faceId: String(face.faceId != null ? face.faceId : ''),
      bbox: face.bbox || null
    }));
  }
  return element;
}

/**
 * Ask the host for the user's current Revit selection.
 *
 * @param {{ categories?: string[], includeFaces?: boolean, timeoutMs?: number }} [opts]
 * @param {{ client?: object }} [deps] - inject a NovaConnectClient (tests); defaults to window.NovaConnect.
 * @returns {Promise<{ elements: object[] }>} contract-shaped selection.
 */
export async function requestSelection(opts = {}, deps = {}) {
  const client = resolveClient(deps);
  const payload = {};
  if (opts.categories !== undefined) payload.categories = opts.categories;
  if (opts.includeFaces !== undefined) payload.includeFaces = opts.includeFaces;

  buildValidatedEnvelope(client, MESSAGE_TYPES.SELECTION_QUERY, payload);

  const response = await client.sendSelectionQuery(payload, { timeoutMs: opts.timeoutMs });
  const elements = Array.isArray(response && response.elements) ? response.elements : [];
  return { elements: elements.map(normalizeSelectionElement) };
}

/**
 * Place a family instance / adaptive component (WRITE — the hub gates this
 * behind interactive user approval before it touches Revit).
 *
 * @param {{ kind: string, familyType: string, points: Array, hostFaceId?: string,
 *           params?: object, approval?: object, timeoutMs?: number }} spec
 * @param {{ client?: object }} [deps]
 * @returns {Promise<object>} the host's place-result payload.
 */
export async function placeInstance(spec = {}, deps = {}) {
  const client = resolveClient(deps);
  const payload = {
    kind: spec.kind,
    familyType: spec.familyType,
    points: toPointTuples(spec.points)
  };
  if (spec.hostFaceId !== undefined) payload.hostFaceId = spec.hostFaceId;
  if (spec.params !== undefined) payload.params = spec.params;

  buildValidatedEnvelope(client, MESSAGE_TYPES.GEOMETRY_PLACE, payload);

  // Carry approval metadata for the WRITE; the hub performs the interactive
  // approval and records the approval_id (server is the authority).
  const requestPayload = spec.approval !== undefined
    ? { ...payload, approval: spec.approval }
    : payload;
  return client.sendGeometryPlace(requestPayload, { timeoutMs: spec.timeoutMs });
}

/**
 * Read parameter values off one element using the M4 contract.
 *
 * @param {string} elementId
 * @param {string[]} names - parameter names to read.
 * @param {{ client?: object, timeoutMs?: number }} [deps]
 * @returns {Promise<{ elementId: string, params: object }>} name→value map.
 */
export async function getParameters(elementId, names = [], deps = {}) {
  const client = resolveClient(deps);
  // The get mirror sends the param NAMES as keys with null placeholder values.
  const params = {};
  (Array.isArray(names) ? names : [names]).forEach(name => {
    params[name] = null;
  });
  const payload = { elementId: String(elementId == null ? '' : elementId), params };

  buildValidatedEnvelope(client, MESSAGE_TYPES.PARAMETER_GET, payload);

  const response = await client.sendParameterGet(payload, { timeoutMs: deps.timeoutMs });
  return {
    elementId: payload.elementId,
    params: response && response.params && typeof response.params === 'object' ? response.params : {}
  };
}

/**
 * Set parameter values on one element using the M4 contract (WRITE — gated by
 * the hub's interactive approval before it touches Revit).
 *
 * @param {string} elementId
 * @param {object} params - flat { name: scalar } map.
 * @param {{ client?: object, approval?: object, timeoutMs?: number }} [deps]
 * @returns {Promise<object>} the host's set-result payload.
 */
export async function setParameters(elementId, params = {}, deps = {}) {
  const client = resolveClient(deps);
  const payload = { elementId: String(elementId == null ? '' : elementId), params };

  buildValidatedEnvelope(client, MESSAGE_TYPES.PARAMETER_SET, payload);

  const requestPayload = deps.approval !== undefined
    ? { ...payload, approval: deps.approval }
    : payload;
  return client.sendParameterSet(requestPayload, { timeoutMs: deps.timeoutMs });
}

export const RevitBridgeM4 = {
  requestSelection,
  placeInstance,
  getParameters,
  setParameters,
  BridgeValidationError
};

export default RevitBridgeM4;
