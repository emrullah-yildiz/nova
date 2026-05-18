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
