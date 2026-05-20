import HostAdapter from '../HostAdapter.js';
import { createGeometryRef, GEOMETRY_LEVELS } from '../../geometry/GeometryRef.js';
import { createPreviewMesh, meshBounds } from '../../geometry/MeshCompression.js';

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export class RhinoAdapter extends HostAdapter {
  constructor(options = {}) {
    super('rhino');
    this.client = options.client || null;
  }

  getElements(query = {}) {
    if (!this.client || typeof this.client.getElements !== 'function') return [];
    return this.client.getElements(query);
  }

  getGeometry(refs, options = {}) {
    if (options.level && options.level !== GEOMETRY_LEVELS.FULL_MESH) {
      return normalizeList(refs).map(ref => this.createGeometryRef(ref, options));
    }
    if (!this.client || typeof this.client.getGeometry !== 'function') return [];
    return this.client.getGeometry(normalizeList(refs));
  }

  createGeometryRef(ref, options = {}) {
    const id = ref && (ref.id || ref.sourceId || ref.guid);
    let cachedFull = null;
    const loadFull = async () => {
      if (!this.client || typeof this.client.getGeometry !== 'function') return null;
      if (!cachedFull) cachedFull = Promise.resolve(this.client.getGeometry([ref])).then(result => result && result[0]);
      return cachedFull;
    };
    return createGeometryRef({
      host: 'rhino',
      id,
      versionId: ref && (ref.versionId || ref.serialNumber) || '',
      bounds: ref && ref.bounds || null,
      nativeRef: ref,
      load: loadFull,
      levels: {
        [GEOMETRY_LEVELS.NATIVE_HOST_GEOMETRY]: ref
      },
      loadLevel: async level => {
        if (level === GEOMETRY_LEVELS.BOUNDS) {
          if (ref && ref.bounds) return ref.bounds;
          return meshBounds(await loadFull());
        }
        if (level === GEOMETRY_LEVELS.PREVIEW_MESH) return createPreviewMesh(await loadFull(), { maxFaces: options.previewMaxFaces || 1000 });
        if (level === GEOMETRY_LEVELS.NATIVE_HOST_GEOMETRY) return ref;
        return loadFull();
      }
    });
  }

  sendGeometry(geometry, options = {}) {
    if (!this.client || typeof this.client.sendGeometry !== 'function') {
      return {
        ok: false,
        code: 'RHINO_ADAPTER_OFFLINE',
        message: 'Rhino host adapter is registered, but no Rhino client is connected.'
      };
    }
    return this.client.sendGeometry(geometry, options);
  }

  getParameterValues(refs, names) {
    if (!this.client || typeof this.client.getParameterValues !== 'function') return [];
    return this.client.getParameterValues(normalizeList(refs), normalizeList(names));
  }

  setParameterValues(refs, names, values) {
    if (!this.client || typeof this.client.setParameterValues !== 'function') {
      return normalizeList(refs).map(ref => ({
        id: ref && (ref.id || ref.sourceId),
        ok: false,
        message: 'Rhino host adapter is registered, but no Rhino client is connected.'
      }));
    }
    return this.client.setParameterValues(normalizeList(refs), normalizeList(names), values);
  }

  objectsByLayer(layer) {
    return this.getElements({ layer });
  }
}

export default RhinoAdapter;
