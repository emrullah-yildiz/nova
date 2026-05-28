import { GEOMETRY_LEVELS, geometryCacheKey } from './GeometryRef.js';

export class GeometryCache {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 5000;
    this._entries = new Map();
  }

  key(refOrParts, level = GEOMETRY_LEVELS.FULL_MESH) {
    if (typeof refOrParts === 'string') return refOrParts;
    return geometryCacheKey({
      host: refOrParts.host,
      id: refOrParts.id,
      versionId: refOrParts.versionId || (refOrParts.metadata && refOrParts.metadata.versionId) || '',
      level
    });
  }

  has(refOrParts, level) {
    return this._entries.has(this.key(refOrParts, level));
  }

  get(refOrParts, level) {
    const key = this.key(refOrParts, level);
    const entry = this._entries.get(key);
    if (!entry) return undefined;
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(refOrParts, level, value) {
    const key = this.key(refOrParts, level);
    this._entries.set(key, {
      value,
      level,
      byteSize: estimateByteSize(value),
      createdAt: Date.now(),
      lastAccessed: Date.now()
    });
    this.evictIfNeeded();
    return value;
  }

  async getOrLoad(ref, level = GEOMETRY_LEVELS.FULL_MESH, loader) {
    if (this.has(ref, level)) return this.get(ref, level);
    const load = loader || (ref && ref.loadLevel ? () => ref.loadLevel(level) : ref && ref.load ? () => ref.load() : null);
    if (!load) return undefined;
    const value = await load();
    this.set(ref, level, value);
    return value;
  }

  evictIfNeeded() {
    while (this._entries.size > this.maxEntries) {
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this._entries) {
        if (entry.lastAccessed < oldestTime) {
          oldestKey = key;
          oldestTime = entry.lastAccessed;
        }
      }
      if (!oldestKey) break;
      this._entries.delete(oldestKey);
    }
  }

  clear() {
    this._entries.clear();
  }

  get size() {
    return this._entries.size;
  }
}

function estimateByteSize(value) {
  if (!value) return 0;
  if (value.byteLength !== undefined) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value.vertices && value.faces) return (value.vertices.length * 3 + value.faces.length * 3) * 8;
  try {
    return JSON.stringify(value).length * 2;
  } catch (_err) {
    return 0;
  }
}

export default GeometryCache;
