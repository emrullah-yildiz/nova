import { createGeometryRef as createCoreGeometryRef, VALUE_TYPES } from '../core/values.js';

export const GEOMETRY_LEVELS = Object.freeze({
  BOUNDS: 'Bounds',
  PREVIEW_MESH: 'PreviewMesh',
  FULL_MESH: 'FullMesh',
  NATIVE_HOST_GEOMETRY: 'NativeHostGeometry'
});

export function geometryCacheKey({ host, id, versionId = '', level = GEOMETRY_LEVELS.FULL_MESH }) {
  if (!host) throw new TypeError('Geometry cache key requires a host.');
  if (id === undefined || id === null) throw new TypeError('Geometry cache key requires an id.');
  return [host, String(id), String(versionId || ''), level].join(':');
}

export function createGeometryRef(options = {}) {
  const {
    host,
    id,
    versionId = '',
    bounds = null,
    levels = {},
    nativeRef = null,
    metadata = {}
  } = options;

  const levelLoaders = {
    ...levels
  };

  if (bounds !== null && levelLoaders[GEOMETRY_LEVELS.BOUNDS] === undefined) {
    levelLoaders[GEOMETRY_LEVELS.BOUNDS] = bounds;
  }
  if (nativeRef !== null && levelLoaders[GEOMETRY_LEVELS.NATIVE_HOST_GEOMETRY] === undefined) {
    levelLoaders[GEOMETRY_LEVELS.NATIVE_HOST_GEOMETRY] = nativeRef;
  }

  const levelCache = new Map();
  const ref = createCoreGeometryRef({
    host,
    id,
    bounds,
    metadata: {
      versionId,
      nativeRef,
      availableLevels: Object.keys(levelLoaders),
      ...metadata
    },
    load: () => loadLevel(GEOMETRY_LEVELS.FULL_MESH)
  });

  async function loadLevel(level = GEOMETRY_LEVELS.FULL_MESH) {
    if (levelCache.has(level)) return levelCache.get(level);
    const loader = levelLoaders[level] !== undefined ? levelLoaders[level] : levelLoaders[GEOMETRY_LEVELS.FULL_MESH];
    const value = typeof loader === 'function' ? await loader(ref) : loader;
    levelCache.set(level, value);
    return value;
  }

  return Object.freeze({
    ...ref,
    type: VALUE_TYPES.GEOMETRY_REF,
    versionId,
    cacheKey(level = GEOMETRY_LEVELS.FULL_MESH) {
      return geometryCacheKey({ host, id, versionId, level });
    },
    loadLevel
  });
}

export default createGeometryRef;
