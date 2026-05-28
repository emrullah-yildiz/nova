// ============================================
// DirtyTracker — tracks which nodes need recomputation
// ============================================

/**
 * Tracks dirty (invalidated) nodes and computes the minimal set of
 * downstream nodes that need recomputation when a node's value changes.
 * Instead of marking the whole graph dirty, it propagates dirtiness
 * through the dependency graph so only affected nodes recompute.
 */
export class DirtyTracker {
  constructor() {
    /** @type {Set<string>} node IDs that are dirty (need recompute) */
    this._dirty = new Set();
    /** @type {Set<string>} node IDs currently being computed (in-flight) */
    this._computing = new Set();
    /** @type {function(string): string[]} callback to get downstream node IDs */
    this._getDownstream = () => [];
    /** @type {number} version counter incremented on each flush */
    this._version = 0;
    /** @type {Map<string, number>} nodeId → version when it was last cleaned */
    this._cleanVersions = new Map();
  }

  /**
   * Set the downstream lookup function (should connect to DependencyGraph).
   * @param {function(string): string[]} fn
   */
  setDownstreamFn(fn) {
    this._getDownstream = fn;
  }

  /**
   * Mark a node as dirty. Propagates dirtiness to all downstream nodes
   * transitively so the full affected subgraph is tracked.
   * @param {string} nodeId
   */
  markDirty(nodeId) {
    if (this._dirty.has(nodeId)) return; // already dirty
    this._dirty.add(nodeId);

    // Propagate downstream
    const downstream = this._getDownstream(nodeId);
    for (const depId of downstream) {
      this.markDirty(depId);
    }
  }

  /**
   * Mark multiple nodes as dirty at once.
   * @param {string[]} nodeIds
   */
  markDirtyAll(nodeIds) {
    for (const id of nodeIds) {
      this.markDirty(id);
    }
  }

  /**
   * Mark a single node (and downstream) as clean after successful computation.
   * @param {string} nodeId
   */
  markClean(nodeId) {
    this._dirty.delete(nodeId);
    this._computing.delete(nodeId);
    this._cleanVersions.set(nodeId, this._version);
  }

  /**
   * Mark the entire graph as dirty (all nodes).
   * @param {string[]} allNodeIds
   */
  markAllDirty(allNodeIds) {
    for (const id of allNodeIds) {
      this._dirty.add(id);
    }
  }

  /**
   * Check if a node is dirty.
   * @param {string} nodeId
   * @returns {boolean}
   */
  isDirty(nodeId) {
    return this._dirty.has(nodeId);
  }

  /**
   * Check if a node is currently being computed.
   * @param {string} nodeId
   * @returns {boolean}
   */
  isComputing(nodeId) {
    return this._computing.has(nodeId);
  }

  /**
   * Mark that computation has started for a node.
   * @param {string} nodeId
   */
  startComputing(nodeId) {
    this._computing.add(nodeId);
  }

  /**
   * Mark that computation has finished for a node.
   * @param {string} nodeId
   */
  finishComputing(nodeId) {
    this._computing.delete(nodeId);
  }

  /**
   * Get the set of all currently dirty node IDs.
   * @returns {Set<string>}
   */
  getDirty() {
    return new Set(this._dirty);
  }

  /**
   * Get dirty nodes as an array, optionally filtered to those that
   * have all their upstream dependencies clean (ready to compute).
   * @returns {string[]}
   */
  getReadyNodes() {
    const ready = [];
    for (const id of this._dirty) {
      let upstreamDirty = false;
      for (const parentId of this._getUpstream(id)) {
        if (this._dirty.has(parentId) || this._computing.has(parentId)) {
          upstreamDirty = true;
          break;
        }
      }
      if (!upstreamDirty) ready.push(id);
    }
    return ready;
  }

  /**
   * Get the count of dirty nodes.
   * @returns {number}
   */
  get dirtyCount() {
    return this._dirty.size;
  }

  /**
   * Get the count of currently computing nodes.
   * @returns {number}
   */
  get computingCount() {
    return this._computing.size;
  }

  /**
   * Get the current version number.
   * @returns {number}
   */
  get version() {
    return this._version;
  }

  /**
   * Check if a node's cached value is stale relative to a given version.
   * @param {string} nodeId
   * @param {number} version
   * @returns {boolean}
   */
  isStale(nodeId, version) {
    const cleanVersion = this._cleanVersions.get(nodeId) ?? -1;
    return version > cleanVersion;
  }

  /**
   * Flush all dirty state — called after a full graph recompute.
   * Increments the version counter.
   */
  flush() {
    this._dirty.clear();
    this._computing.clear();
    this._version++;
  }

  /**
   * Reset all state.
   */
  reset() {
    this._dirty.clear();
    this._computing.clear();
    this._cleanVersions.clear();
    this._version = 0;
  }

  /**
   * Set upstream lookup (optional, used by getReadyNodes).
   * @param {function(string): string[]} fn
   */
  setUpstreamFn(fn) {
    this._getUpstream = fn;
  }
}

// Default upstream getter (can be overridden via setUpstreamFn)
DirtyTracker.prototype._getUpstream = () => [];

export default DirtyTracker;