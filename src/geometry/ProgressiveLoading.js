import { GEOMETRY_LEVELS } from './GeometryRef.js';
import { geometryStore as defaultStore } from './GeometryStore.js';

export class ProgressiveLoading {
  constructor(options = {}) {
    this.store = options.store || defaultStore;
    this.batchSize = options.batchSize || 250;
  }

  async loadBounds(refs, callbacks = {}) {
    return this._loadLevel(refs, GEOMETRY_LEVELS.BOUNDS, callbacks);
  }

  async loadPreviewMeshes(refs, callbacks = {}) {
    return this._loadLevel(refs, GEOMETRY_LEVELS.PREVIEW_MESH, callbacks);
  }

  async loadFullMesh(ref, callbacks = {}) {
    const value = await this.store.load(ref, GEOMETRY_LEVELS.FULL_MESH);
    if (callbacks.onProgress) callbacks.onProgress({ loaded: 1, total: 1, level: GEOMETRY_LEVELS.FULL_MESH });
    return value;
  }

  async loadInitial(refs, callbacks = {}) {
    const bounds = await this.loadBounds(refs, callbacks);
    const previewMeshes = await this.loadPreviewMeshes(refs, callbacks);
    return { bounds, previewMeshes };
  }

  async _loadLevel(refs, level, callbacks) {
    const list = Array.isArray(refs) ? refs : [refs];
    const result = [];
    for (let offset = 0; offset < list.length; offset += this.batchSize) {
      const batch = list.slice(offset, offset + this.batchSize);
      const values = await Promise.all(batch.map(ref => this.store.load(ref, level)));
      result.push(...values);
      if (callbacks.onBatch) callbacks.onBatch(values, { offset, level });
      if (callbacks.onProgress) callbacks.onProgress({ loaded: result.length, total: list.length, level });
    }
    return result;
  }
}

export default ProgressiveLoading;
