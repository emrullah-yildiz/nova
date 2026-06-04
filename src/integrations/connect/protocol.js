export const NOVA_CONNECT_VERSION = 1;
export const DEFAULT_COORDINATE_SYSTEM = 'nova-y-up';
export const DEFAULT_UNITS = {
  system: 'meters',
  scaleToMeters: 1
};

export const SOURCES = {
  REVIT_LOCAL: 'revit-local',
  APS: 'aps',
  IFC: 'ifc',
  RHINO: 'rhino'
};

export function createIdentity({
  source = SOURCES.REVIT_LOCAL,
  sourceId = '',
  versionId = '',
  units = DEFAULT_UNITS,
  coordinateSystem = DEFAULT_COORDINATE_SYSTEM,
  transform = null
} = {}) {
  return {
    source,
    sourceId: String(sourceId || ''),
    versionId: String(versionId || ''),
    units: normalizeUnits(units),
    coordinateSystem,
    transform
  };
}

export function createEnvelope({
  type,
  source,
  target,
  sessionId,
  projectId,
  payload,
  id,
  timestamp,
  error
} = {}) {
  return {
    version: NOVA_CONNECT_VERSION,
    id: id || createId('msg'),
    type,
    source,
    target,
    sessionId: sessionId || '',
    projectId: projectId || '',
    timestamp: timestamp || Date.now(),
    payload: payload || {},
    error: error || null
  };
}

export function validateEnvelope(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object') errors.push('Envelope must be an object');
  if (!envelope || !envelope.type) errors.push('Envelope type is required');
  if (!envelope || !envelope.source) errors.push('Envelope source is required');
  if (!envelope || !envelope.id) errors.push('Envelope id is required');
  return {
    ok: errors.length === 0,
    errors
  };
}

/**
 * Milestone 4 round-trip message classes.
 *
 * These are the wire `type` values for the Revit read/select → place/parameter
 * round-trip. M4-T2 (C# add-in), M4-T3 (browser bridge), M4-T4 (node defs), and
 * M4-T5 (picker UI) all code to the payload shapes documented below. Keep this
 * list and the validators in `MESSAGE_PAYLOAD_VALIDATORS` in lockstep.
 *
 * Every message still rides the standard envelope from `createEnvelope`
 * (version, id, type, source, target, sessionId, projectId, timestamp, payload,
 * error). These validators check ONLY the `payload` shape per message class;
 * envelope-level fields are validated by `validateEnvelope`.
 */
export const MESSAGE_TYPES = {
  // Browser → host: ask the host to report the user's current Revit selection.
  SELECTION_QUERY: 'selection.query',
  // Host → browser: the selected elements (and optional pickable faces).
  SELECTION_RESULT: 'selection.result',
  // Browser → host (WRITE): place a family instance / adaptive component.
  GEOMETRY_PLACE: 'geometry.place',
  // Browser → host: read parameter values off an element.
  PARAMETER_GET: 'parameter.get',
  // Browser → host (WRITE): set parameter values on an element.
  PARAMETER_SET: 'parameter.set'
};

/** Family placement kinds accepted by `geometry.place`. */
export const PLACEMENT_KINDS = ['FamilyInstance', 'AdaptiveComponent'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A point is a 3-tuple [x, y, z] of finite numbers. */
function isPoint3Tuple(value) {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

/** A parameter value is a scalar (string/number/boolean) or null — never an object/array. */
function isParamValue(value) {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

/** `params` is a flat map of `{ [paramName]: scalar }`. */
function validateParamMap(params, errors, label = 'params') {
  if (!isPlainObject(params)) {
    errors.push(`${label} must be an object map of parameter name to value`);
    return;
  }
  for (const key of Object.keys(params)) {
    if (!isNonEmptyString(key)) {
      errors.push(`${label} keys must be non-empty strings`);
      continue;
    }
    if (!isParamValue(params[key])) {
      errors.push(`${label}["${key}"] must be a string, number, boolean, or null`);
    }
  }
}

/**
 * `selection.query` payload: { categories?: string[], includeFaces?: boolean }
 * Both fields are optional; an empty `{}` payload means "current selection,
 * all categories, no faces".
 */
function validateSelectionQueryPayload(payload, errors) {
  if (!isPlainObject(payload)) {
    errors.push('selection.query payload must be an object');
    return;
  }
  if (payload.categories !== undefined) {
    if (!Array.isArray(payload.categories) || !payload.categories.every(isNonEmptyString)) {
      errors.push('selection.query categories must be an array of non-empty strings');
    }
  }
  if (payload.includeFaces !== undefined && typeof payload.includeFaces !== 'boolean') {
    errors.push('selection.query includeFaces must be a boolean');
  }
}

/**
 * `selection.result` payload:
 *   { elements: [{ id, name, category, typeName, levelName, params,
 *                  faces?: [{ faceId, bbox }] }] }
 * `id` and `category` are required per element; `name`/`typeName`/`levelName`
 * are strings (may be empty); `params` is a flat scalar map. `faces` (present
 * only when the query set includeFaces) is an array of `{ faceId, bbox }` where
 * `bbox` is `{ min: [x,y,z], max: [x,y,z] }`.
 */
function validateSelectionResultPayload(payload, errors) {
  if (!isPlainObject(payload)) {
    errors.push('selection.result payload must be an object');
    return;
  }
  if (!Array.isArray(payload.elements)) {
    errors.push('selection.result payload.elements must be an array');
    return;
  }
  payload.elements.forEach((el, i) => {
    const at = `selection.result elements[${i}]`;
    if (!isPlainObject(el)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (!isNonEmptyString(el.id)) errors.push(`${at}.id is required (non-empty string)`);
    if (!isNonEmptyString(el.category)) errors.push(`${at}.category is required (non-empty string)`);
    for (const field of ['name', 'typeName', 'levelName']) {
      if (el[field] !== undefined && typeof el[field] !== 'string') {
        errors.push(`${at}.${field} must be a string`);
      }
    }
    if (el.params !== undefined) validateParamMap(el.params, errors, `${at}.params`);
    if (el.faces !== undefined) {
      if (!Array.isArray(el.faces)) {
        errors.push(`${at}.faces must be an array`);
      } else {
        el.faces.forEach((face, j) => {
          const fat = `${at}.faces[${j}]`;
          if (!isPlainObject(face)) {
            errors.push(`${fat} must be an object`);
            return;
          }
          if (!isNonEmptyString(face.faceId)) errors.push(`${fat}.faceId is required (non-empty string)`);
          if (!isPlainObject(face.bbox)
            || !isPoint3Tuple(face.bbox.min)
            || !isPoint3Tuple(face.bbox.max)) {
            errors.push(`${fat}.bbox must be { min: [x,y,z], max: [x,y,z] }`);
          }
        });
      }
    }
  });
}

/**
 * `geometry.place` payload (WRITE — requires user approval before routing):
 *   { kind: 'FamilyInstance' | 'AdaptiveComponent', familyType,
 *     points: [[x,y,z], ...], hostFaceId?, params? }
 * `familyType` names the Revit family type to instantiate. `points` are the
 * placement points (1 for a hosted/point family instance, N for an adaptive
 * component's adaptive points). `hostFaceId` (optional) references a faceId
 * returned by `selection.result`. `params` (optional) sets instance params on
 * the new element after placement.
 */
function validateGeometryPlacePayload(payload, errors) {
  if (!isPlainObject(payload)) {
    errors.push('geometry.place payload must be an object');
    return;
  }
  if (!PLACEMENT_KINDS.includes(payload.kind)) {
    errors.push(`geometry.place kind must be one of: ${PLACEMENT_KINDS.join(', ')}`);
  }
  if (!isNonEmptyString(payload.familyType)) {
    errors.push('geometry.place familyType is required (non-empty string)');
  }
  if (!Array.isArray(payload.points) || payload.points.length === 0) {
    errors.push('geometry.place points must be a non-empty array of [x,y,z] tuples');
  } else if (!payload.points.every(isPoint3Tuple)) {
    errors.push('geometry.place points must each be a [x,y,z] tuple of finite numbers');
  }
  if (payload.hostFaceId !== undefined && !isNonEmptyString(payload.hostFaceId)) {
    errors.push('geometry.place hostFaceId must be a non-empty string when present');
  }
  if (payload.params !== undefined) validateParamMap(payload.params, errors, 'geometry.place params');
}

/**
 * `parameter.set` payload (WRITE — requires user approval before routing):
 *   { elementId, params: { [name]: value } }
 * `parameter.get` is the mirror: same shape, but `params` values are ignored on
 * the request (the host fills them in the reply), so only the param NAMES (keys)
 * are required for a get. We validate both with the same checker; for a get the
 * caller may send placeholder/null values.
 */
function validateParameterMessagePayload(payload, errors, label) {
  if (!isPlainObject(payload)) {
    errors.push(`${label} payload must be an object`);
    return;
  }
  if (!isNonEmptyString(payload.elementId)) {
    errors.push(`${label} elementId is required (non-empty string)`);
  }
  validateParamMap(payload.params, errors, `${label} params`);
  if (isPlainObject(payload.params) && Object.keys(payload.params).length === 0) {
    errors.push(`${label} params must name at least one parameter`);
  }
}

/**
 * Registry mapping message `type` → payload validator. Used by
 * `validateMessage`. Adding a new round-trip message class means adding its
 * type to `MESSAGE_TYPES` and a validator here.
 */
export const MESSAGE_PAYLOAD_VALIDATORS = {
  [MESSAGE_TYPES.SELECTION_QUERY]: validateSelectionQueryPayload,
  [MESSAGE_TYPES.SELECTION_RESULT]: validateSelectionResultPayload,
  [MESSAGE_TYPES.GEOMETRY_PLACE]: validateGeometryPlacePayload,
  [MESSAGE_TYPES.PARAMETER_GET]: (payload, errors) =>
    validateParameterMessagePayload(payload, errors, 'parameter.get'),
  [MESSAGE_TYPES.PARAMETER_SET]: (payload, errors) =>
    validateParameterMessagePayload(payload, errors, 'parameter.set')
};

/** Write operations that require explicit user approval before routing. */
export const WRITE_MESSAGE_TYPES = [
  MESSAGE_TYPES.GEOMETRY_PLACE,
  MESSAGE_TYPES.PARAMETER_SET
];

/** True if a message `type` is a write operation requiring approval. */
export function isWriteMessage(type) {
  return WRITE_MESSAGE_TYPES.includes(type);
}

/**
 * Validate a full message: the envelope shape AND, when the message `type` has
 * a registered payload validator, its `payload` shape. Returns the same
 * `{ ok, errors }` contract as `validateEnvelope`. Message types without a
 * registered validator pass payload validation (envelope-only check), matching
 * the hub's existing permissive routing for legacy/control messages.
 */
export function validateMessage(envelope) {
  const { errors } = validateEnvelope(envelope);
  if (envelope && typeof envelope === 'object') {
    const validator = MESSAGE_PAYLOAD_VALIDATORS[envelope.type];
    if (validator) validator(envelope.payload, errors);
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

export function createResult({ ok = true, data = null, message = '', code = '' } = {}) {
  return { ok, data, message, code };
}

export function createErrorEnvelope(envelope, message, code = 'NOVA_CONNECT_ERROR') {
  return createEnvelope({
    id: createId('err'),
    type: 'operation.error',
    source: 'nova-connect-hub',
    target: envelope ? envelope.source : '',
    sessionId: envelope ? envelope.sessionId : '',
    projectId: envelope ? envelope.projectId : '',
    payload: createResult({ ok: false, message, code }),
    error: { message, code }
  });
}

export function normalizeElementRecord(raw = {}, identity = {}) {
  const normalizedIdentity = createIdentity({
    ...identity,
    sourceId: identity.sourceId || raw.sourceId || raw.id || raw.dbId || raw.globalId || raw.guid || ''
  });
  return {
    _type: 'ElementRecord',
    id: raw.id || raw.sourceId || normalizedIdentity.sourceId,
    name: raw.name || raw.displayName || '',
    category: raw.category || raw.type || 'Unknown',
    typeName: raw.typeName || raw.familyType || '',
    levelName: raw.levelName || raw.level || '',
    params: raw.params || raw.properties || {},
    identity: normalizedIdentity
  };
}

export function createGeometryEnvelope(geometry, identity = {}, options = {}) {
  const payload = geometryToPayload(geometry);
  return {
    _type: 'GeometryEnvelope',
    kind: payload.kind,
    units: normalizeUnits(options.units || identity.units || DEFAULT_UNITS),
    coordinateSystem: options.coordinateSystem || identity.coordinateSystem || DEFAULT_COORDINATE_SYSTEM,
    transform: options.transform || identity.transform || null,
    identity: createIdentity(identity),
    data: payload.data,
    materials: options.materials || [],
    metadata: options.metadata || {}
  };
}

export function geometryToPayload(geometry) {
  if (!geometry) return { kind: 'empty', data: null };
  if (geometry._type === 'Point3') {
    return { kind: 'point', data: { x: geometry.x, y: geometry.y, z: geometry.z } };
  }
  if (geometry._type === 'Line3') {
    return {
      kind: 'curve',
      data: {
        curveType: 'line',
        points: [pointToArray(geometry.start), pointToArray(geometry.end)]
      }
    };
  }
  if (geometry._type === 'Polyline3') {
    return {
      kind: 'curve',
      data: {
        curveType: 'polyline',
        closed: !!geometry.closed,
        points: (geometry.points || []).map(pointToArray)
      }
    };
  }
  if (geometry._type === 'Mesh3') {
    return {
      kind: 'mesh',
      data: {
        vertices: (geometry.vertices || []).map(pointToArray),
        faces: (geometry.faces || []).map(face => face.slice())
      }
    };
  }
  if (Array.isArray(geometry)) {
    return {
      kind: 'collection',
      data: geometry.map(item => geometryToPayload(item))
    };
  }
  if (geometry.kind && geometry.data) return { kind: geometry.kind, data: geometry.data };
  return { kind: 'unknown', data: geometry };
}

export function pointToArray(point) {
  if (Array.isArray(point)) return point.map(Number);
  return [Number(point.x || 0), Number(point.y || 0), Number(point.z || 0)];
}

export function normalizeUnits(units) {
  if (!units) return { ...DEFAULT_UNITS };
  return {
    system: units.system || units.name || 'meters',
    scaleToMeters: Number(units.scaleToMeters || units.toMeters || 1)
  };
}

function createId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}
