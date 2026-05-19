// ============================================
// ExecutionCache — caches node outputs with version-aware invalidation
// ============================================

/**
 * Caches computed node values keyed by (nodeId, version).
 * Supports TTL-based expiry, memory limits, and streaming results
 * for large geometry sets.
 */
export class ExecutionCache {
  constructor(options = {}) {
    /** @type {Map<string, { value: any, version: number, size: number, timestamp: number }>} */
    this._cache = new Map();
    /** @type {number} maximum entries before eviction starts */
    this._maxEntries = options.maxEntries || 5000;
    /** @type {number} TTL in ms for cache entries (default: 5 minutes) */
    this._ttl = options.ttl || 5 * 60 * 1000;
    /** @type {number} approximate max memory in bytes (default: 50MB) */
    this._maxMemoryBytes = options.maxMemoryBytes || 50 * 1024 * 1024;
    /** @type {number} approximate current memory usage */
    this._memoryUsage = 0;
    /** @type {number} hits for cache statistics */
    this._hits = 0;
    /** @type {number} misses for cache statistics */
    this._misses = 0;
    /** @type {function(any): number} size estimator for values */
    this._sizeEstimator = options.sizeEstimator || this._estimateSize.bind(this);
  }

  /**
   * Build a cache key from nodeId and optional port.
   * @param {string} nodeId
   * @param {string} [port]
   * @returns {string}
   */
  _key(nodeId, port) {
    return port ? `${nodeId}::${port}` : nodeId;
  }

  /**
   * Get a cached value if it exists and is not stale.
   * @param {string} nodeId
   * @param {number} version - current execution version
   * @param {string} [port]
   * @returns {{ value: any, found: boolean }}
   */
  get(nodeId, version, port) {
    const key = this._key(nodeId, port);
    const entry = this._cache.get(key);

    if (!entry) {
      this._misses++;
      return { value: undefined, found: false };
    }

    // Check version staleness
    if (entry.version !== version) {
      this._cache.delete(key);
      this._memoryUsage -= entry.size;
      this._misses++;
      return { value: undefined, found: false };
    }

    // Check TTL expiry
    if (Date.now() - entry.timestamp > this._ttl) {
      this._cache.delete(key);
      this._memoryUsage -= entry.size;
      this._misses++;
      return { value: undefined, found: false };
    }

    this._hits++;
    return { value: entry.value, found: true };
  }

  /**
   * Set a cached value.
   * @param {string} nodeId
   * @param {any} value
   * @param {number} version
   * @param {string} [port]
   */
  set(nodeId, value, version, port) {
    const key = this._key(nodeId, port);
    const size = this._sizeEstimator(value);

    // If key already exists, subtract old size
    const existing = this._cache.get(key);
    if (existing) {
      this._memoryUsage -= existing.size;
    }

    this._cache.set(key, {
      value,
      version,
      size,
      timestamp: Date.now()
    });
    this._memoryUsage += size;

    // Evict if over limits
    if (this._cache.size > this._maxEntries || this._memoryUsage > this._maxMemoryBytes) {
      this._evict();
    }
  }

  /**
   * Check if a key exists and is valid for the given version.
   * @param {string} nodeId
   * @param {number} version
   * @param {string} [port]
   * @returns {boolean}
   */
  has(nodeId, version, port) {
    const key = this._key(nodeId, port);
    const entry = this._cache.get(key);
    if (!entry) return false;
    if (entry.version !== version) return false;
    if (Date.now() - entry.timestamp > this._ttl) return false;
    return true;
  }

  /**
   * Invalidate a specific node's cache entry.
   * @param {string} nodeId
   * @param {string} [port]
   */
  invalidate(nodeId, port) {
    const key = this._key(nodeId, port);
    const entry = this._cache.get(key);
    if (entry) {
      this._memoryUsage -= entry.size;
      this._cache.delete(key);
    }
  }

  /**
   * Invalidate all cached entries for a node (all ports).
   * @param {string} nodeId
   */
  invalidateNode(nodeId) {
    // Delete main entry
    this.invalidate(nodeId);
    // Delete port entries
    for (const key of this._cache.keys()) {
      if (key.startsWith(nodeId + '::')) {
        const entry = this._cache.get(key);
        if (entry) {
          this._memoryUsage -= entry.size;
          this._cache.delete(key);
        }
      }
    }
  }

  /**
   * Invalidate all entries with a version older than the given version.
   * @param {number} minVersion
   */
  invalidateOlderThan(minVersion) {
    for (const [key, entry] of this._cache) {
      if (entry.version < minVersion) {
        this._memoryUsage -= entry.size;
        this._cache.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache.
   */
  clear() {
    this._cache.clear();
    this._memoryUsage = 0;
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Get cache statistics.
   * @returns {{ entries: number, memoryUsage: number, hits: number, misses: number, hitRate: number }}
   */
  getStats() {
    const total = this._hits + this._misses;
    return {
      entries: this._cache.size,
      memoryUsage: this._memoryUsage,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? this._hits / total : 0
    };
  }

  /**
   * Store a streaming result for large geometry sets.
   * Streaming results are stored as a readable that can be consumed
   * by multiple downstream nodes without re-materialisation.
   * @param {string} nodeId
   * @param {ReadableStream|AsyncIterable} stream
   * @param {number} version
   */
  setStream(nodeId, stream, version) {
    const key = this._key(nodeId, '__stream__');
    this._cache.set(key, {
      value: stream,
      version,
      size: 1024, // streams get a fixed small size
      timestamp: Date.now(),
      isStream: true
    });
  }

  /**
   * Get a streaming result.
   * @param {string} nodeId
   * @param {number} version
   * @returns {{ value: ReadableStream|AsyncIterable|null, found: boolean }}
   */
  getStream(nodeId, version) {
    const key = this._key(nodeId, '__stream__');
    return this.get(nodeId, version, '__stream__');
  }

  // ── Private ──

  /** Evict oldest entries until under limits. */
  _evict() {
    // Sort by timestamp (oldest first)
    const entries = Array.from(this._cache.entries())
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.timestamp - b.timestamp);

    while (
      (this._cache.size > this._maxEntries || this._memoryUsage > this._maxMemoryBytes) &&
      entries.length > 0
    ) {
      const oldest = entries.shift();
      if (!oldest) break;
      this._memoryUsage -= oldest.size;
      this._cache.delete(oldest.key);
    }
  }

  /**
   * Rough size estimation for a value in bytes.
   * @param {any} value
   * @returns {number}
   */
  _estimateSize(value) {
    if (value === null || value === undefined) return 8;
    const type = typeof value;

    if (type === 'boolean' || type === 'number') return 8;
    if (type === 'string') return value.length * 2; // UTF-16

    if (Array.isArray(value)) {
      if (value.length > 1000) {
        // For large arrays, sample
        const sampleSize = this._estimateSize(value[0]) || 8;
        return sampleSize * value.length;
      }
      let total = 0;
      for (let i = 0; i < value.length; i++) {
        total += this._estimateSize(value[i]);
      }
      return total;
    }

    if (value && typeof value === 'object') {
      try {
        const str = JSON.stringify(value);
        return str ? str.length * 2 : 128;
      } catch {
        return 256; // non-serialisable objects (e.g. Geo types)
      }
    }

    return 64; // fallback
  }
}

export default ExecutionCache;