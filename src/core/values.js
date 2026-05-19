export const VALUE_TYPES = Object.freeze({
  SCALAR: 'ScalarValue',
  LIST: 'ListValue',
  TREE: 'TreeValue',
  GEOMETRY: 'GeometryValue',
  GEOMETRY_REF: 'GeometryRef',
  ELEMENT_REF: 'ElementRef',
  HOST_REF: 'HostRef',
  ERROR: 'ErrorValue',
  PENDING: 'PendingValue'
});

const NOVA_VALUE = Symbol.for('nova.value');

function defineValue(type, payload = {}) {
  return Object.freeze({
    [NOVA_VALUE]: true,
    type,
    ...payload
  });
}

export function isNovaValue(value) {
  return !!(value && typeof value === 'object' && value[NOVA_VALUE] === true);
}

export function isReferenceValue(value) {
  return isNovaValue(value) && (
    value.type === VALUE_TYPES.ELEMENT_REF ||
    value.type === VALUE_TYPES.GEOMETRY_REF ||
    value.type === VALUE_TYPES.HOST_REF
  );
}

export function createScalarValue(value, metadata = {}) {
  return defineValue(VALUE_TYPES.SCALAR, {
    value,
    valueType: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    metadata
  });
}

export function createListValue(items = [], metadata = {}) {
  const values = Array.isArray(items) ? items : [items];
  return defineValue(VALUE_TYPES.LIST, {
    items: values,
    length: values.length,
    metadata
  });
}

export function createTreeValue(branches = [], metadata = {}) {
  const normalizedBranches = branches.map(branch => ({
    path: Array.isArray(branch.path) ? branch.path.slice() : [],
    items: Array.isArray(branch.items) ? branch.items.slice() : []
  }));

  return defineValue(VALUE_TYPES.TREE, {
    branches: normalizedBranches,
    metadata
  });
}

export function createGeometryValue(geometry, metadata = {}) {
  return defineValue(VALUE_TYPES.GEOMETRY, {
    geometry,
    bounds: metadata.bounds || null,
    host: metadata.host || 'local',
    metadata
  });
}

export function createHostRef({ host, id, kind = 'host', label = '', metadata = {} }) {
  if (!host) throw new TypeError('HostRef requires a host.');
  if (id === undefined || id === null) throw new TypeError('HostRef requires an id.');

  return defineValue(VALUE_TYPES.HOST_REF, {
    host,
    id: String(id),
    kind,
    label,
    metadata
  });
}

export function createElementRef({ host, id, category = '', name = '', metadata = {} }) {
  if (!host) throw new TypeError('ElementRef requires a host.');
  if (id === undefined || id === null) throw new TypeError('ElementRef requires an id.');

  return defineValue(VALUE_TYPES.ELEMENT_REF, {
    host,
    id: String(id),
    category,
    name,
    metadata
  });
}

export function createGeometryRef({ host, id, bounds = null, load, metadata = {} }) {
  if (!host) throw new TypeError('GeometryRef requires a host.');
  if (id === undefined || id === null) throw new TypeError('GeometryRef requires an id.');
  if (load !== undefined && typeof load !== 'function') {
    throw new TypeError('GeometryRef load must be a function when provided.');
  }

  let cachedLoad;
  return defineValue(VALUE_TYPES.GEOMETRY_REF, {
    host,
    id: String(id),
    bounds,
    metadata,
    async load() {
      if (!load) return undefined;
      if (!cachedLoad) cachedLoad = Promise.resolve(load());
      return cachedLoad;
    }
  });
}

export function createErrorValue(error, metadata = {}) {
  const message = error && error.message ? error.message : String(error || 'Unknown error');
  return defineValue(VALUE_TYPES.ERROR, {
    message,
    code: metadata.code || '',
    recoverable: metadata.recoverable === true,
    error,
    metadata
  });
}

export function createPendingValue(label = 'Pending', metadata = {}) {
  return defineValue(VALUE_TYPES.PENDING, {
    label,
    metadata
  });
}

export function createRevitElementRef(element) {
  return createElementRef({
    host: 'revit',
    id: element && (element.id || element.elementId || element.sourceId),
    category: element && element.category || '',
    name: element && element.name || '',
    metadata: {
      sourceId: element && element.sourceId,
      versionId: element && element.versionId
    }
  });
}

export function createRevitGeometryRef(element, meshId, options = {}) {
  const elementId = element && (element.id || element.elementId || element.sourceId);
  return createGeometryRef({
    host: 'revit',
    id: meshId || `${element && element.category || 'element'}:${elementId}:mesh`,
    bounds: options.bounds || null,
    load: options.load,
    metadata: {
      elementId: elementId !== undefined && elementId !== null ? String(elementId) : '',
      category: element && element.category || '',
      ...options.metadata
    }
  });
}

export function wrapValue(value) {
  if (isNovaValue(value)) return value;
  if (Array.isArray(value)) return createListValue(value.map(wrapValue));
  if (value && value._type === 'RevitElement') return createRevitElementRef(value);
  return createScalarValue(value);
}

export function unwrapValue(value) {
  if (!isNovaValue(value)) return value;
  if (value.type === VALUE_TYPES.SCALAR) return value.value;
  if (value.type === VALUE_TYPES.LIST) return value.items.map(unwrapValue);
  if (value.type === VALUE_TYPES.TREE) {
    return value.branches.map(branch => ({
      path: branch.path.slice(),
      items: branch.items.map(unwrapValue)
    }));
  }
  if (value.type === VALUE_TYPES.GEOMETRY) return value.geometry;
  return value;
}

export function valueTypeOf(value) {
  if (isNovaValue(value)) return value.type;
  if (Array.isArray(value)) return VALUE_TYPES.LIST;
  if (value && value._type === 'RevitElement') return VALUE_TYPES.ELEMENT_REF;
  if (value && value._type === 'GeometryEnvelope') return VALUE_TYPES.GEOMETRY;
  return VALUE_TYPES.SCALAR;
}

export function summarizeValue(value) {
  if (!isNovaValue(value)) return summarizeValue(wrapValue(value));

  switch (value.type) {
    case VALUE_TYPES.SCALAR:
      return {
        type: value.type,
        label: String(value.value),
        valueType: value.valueType
      };
    case VALUE_TYPES.LIST:
      return {
        type: value.type,
        label: `List (${value.length})`,
        count: value.length
      };
    case VALUE_TYPES.TREE:
      return {
        type: value.type,
        label: `Tree (${value.branches.length} branches)`,
        branches: value.branches.length
      };
    case VALUE_TYPES.ELEMENT_REF:
      return {
        type: value.type,
        label: `${value.category || value.host} [${value.id}]`,
        host: value.host,
        id: value.id,
        category: value.category
      };
    case VALUE_TYPES.GEOMETRY_REF:
      return {
        type: value.type,
        label: `GeometryRef ${value.host}:${value.id}`,
        host: value.host,
        id: value.id,
        bounds: value.bounds
      };
    case VALUE_TYPES.GEOMETRY:
      return {
        type: value.type,
        label: 'Geometry',
        host: value.host,
        bounds: value.bounds
      };
    case VALUE_TYPES.HOST_REF:
      return {
        type: value.type,
        label: `${value.host}:${value.id}`,
        host: value.host,
        id: value.id,
        kind: value.kind
      };
    case VALUE_TYPES.ERROR:
      return {
        type: value.type,
        label: value.message,
        code: value.code,
        recoverable: value.recoverable
      };
    case VALUE_TYPES.PENDING:
      return {
        type: value.type,
        label: value.label
      };
    default:
      return {
        type: value.type,
        label: value.type
      };
  }
}
