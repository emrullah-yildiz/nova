import HostAdapter from '../HostAdapter.js';
import { createRevitGeometryRef } from '../../core/values.js';
import { GEOMETRY_LEVELS } from '../../geometry/GeometryRef.js';
import { createPreviewMesh, meshBounds } from '../../geometry/MeshCompression.js';

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export class RevitAdapter extends HostAdapter {
  constructor(options = {}) {
    super('revit');
    this._getBridge = options.getBridge || (() => {
      const runtime = typeof window !== 'undefined' ? window : globalThis;
      return runtime.RevitBridge || (runtime.NodeFlow && runtime.NodeFlow.RevitBridge) || null;
    });
  }

  get bridge() {
    const bridge = this._getBridge();
    if (!bridge) throw new Error('Revit host adapter requires RevitBridge.');
    return bridge;
  }

  getElements(query = {}) {
    const category = typeof query === 'string' ? query : query.category;
    if (category) return this.bridge.getElements(category);
    return this.bridge.getAllElements();
  }

  getGeometry(refs, options = {}) {
    const elements = normalizeList(refs);
    const level = options.level || GEOMETRY_LEVELS.FULL_MESH;
    if (level === GEOMETRY_LEVELS.FULL_MESH) {
      return this.bridge.getGeometries(elements);
    }
    return elements.map(element => this.createGeometryRef(element, options));
  }

  createGeometryRef(element, options = {}) {
    const bridge = this.bridge;
    const elementId = bridge.getElementIdentity ? bridge.getElementIdentity(element) : element && (element.id || element.sourceId);
    let cachedFull = null;
    async function loadFull() {
      if (!cachedFull) cachedFull = Promise.resolve(bridge.getGeometries([element])).then(result => result && result[0]);
      return cachedFull;
    }
    return createRevitGeometryRef(element, null, {
      bounds: element && (element.bounds || element.raw && element.raw.bounds) || null,
      versionId: element && (element.versionId || element.identity && element.identity.versionId) || '',
      nativeRef: element && element.identity || { sourceId: elementId },
      load: loadFull,
      loadLevel: async level => {
        if (level === GEOMETRY_LEVELS.BOUNDS) {
          const existingBounds = element && (element.bounds || element.raw && element.raw.bounds);
          if (existingBounds) return existingBounds;
          const mesh = await loadFull();
          return meshBounds(mesh);
        }
        if (level === GEOMETRY_LEVELS.PREVIEW_MESH) {
          const mesh = await loadFull();
          return createPreviewMesh(mesh, { maxFaces: options.previewMaxFaces || 1000 });
        }
        if (level === GEOMETRY_LEVELS.NATIVE_HOST_GEOMETRY) return element && element.identity || { sourceId: elementId };
        return loadFull();
      }
    });
  }

  sendGeometry(geometry, options = {}) {
    return this.bridge.sendGeometry(geometry, options.identity || {}, options);
  }

  getParameterValues(refs, names) {
    const elements = normalizeList(refs);
    const paramNames = normalizeList(names);
    if (paramNames.length <= 1) {
      return this.bridge.getParameterValues(elements, paramNames[0] || '');
    }
    return paramNames.reduce((acc, name) => {
      acc[name] = this.bridge.getParameterValues(elements, name);
      return acc;
    }, {});
  }

  setParameterValues(refs, names, values) {
    const elements = normalizeList(refs);
    const paramNames = normalizeList(names);
    const firstName = paramNames[0] || '';
    if (typeof this.bridge.setLiveParameterValues === 'function') {
      return this.bridge.setLiveParameterValues(elements, firstName, values);
    }
    return elements.map(element => ({
      elementId: this.bridge.getElementIdentity ? this.bridge.getElementIdentity(element) : element && element.id,
      parameterName: firstName,
      ok: false,
      message: 'Revit parameter writes require a live Revit connection.'
    }));
  }
}

export default RevitAdapter;
