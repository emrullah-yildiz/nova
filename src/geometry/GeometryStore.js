import { createGeometryRef, GEOMETRY_LEVELS } from './GeometryRef.js';
import { GeometryCache } from './GeometryCache.js';

export class GeometryStore {
  constructor(options = {}) {
    this.cache = options.cache || new GeometryCache(options.cacheOptions || {});
    this._refs = new Map();
  }

  register(ref) {
    if (!ref || !ref.host || ref.id === undefined || ref.id === null) {
      throw new TypeError('GeometryStore.register requires a GeometryRef-like object.');
    }
    this._refs.set(this.refKey(ref), ref);
    if (ref.bounds) this.cache.set(ref, GEOMETRY_LEVELS.BOUNDS, ref.bounds);
    return ref;
  }

  createRef(options) {
    return this.register(createGeometryRef(options));
  }

  refKey(ref) {
    return [ref.host, ref.id, ref.versionId || (ref.metadata && ref.metadata.versionId) || ''].join(':');
  }

  get(host, id, versionId = '') {
    return this._refs.get([host, String(id), String(versionId || '')].join(':')) || null;
  }

  async load(ref, level = GEOMETRY_LEVELS.FULL_MESH) {
    const registered = this.register(ref);
    return this.cache.getOrLoad(registered, level);
  }

  getCached(ref, level = GEOMETRY_LEVELS.FULL_MESH) {
    return this.cache.get(ref, level);
  }

  async promote(ref, level) {
    return this.load(ref, level);
  }

  clear() {
    this._refs.clear();
    this.cache.clear();
  }
}

export const geometryStore = new GeometryStore();

export default geometryStore;
