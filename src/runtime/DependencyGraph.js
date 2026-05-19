// ============================================
// DependencyGraph — builds and queries the node dependency DAG
// ============================================

/**
 * Represents a directed acyclic graph of node dependencies derived from wires.
 * Provides topological ordering, downstream/upstream traversal, and level computation
 * for parallel scheduling.
 */
export class DependencyGraph {
  constructor() {
    /** @type {Map<string, Set<string>>} nodeId → set of downstream node IDs (edges to) */
    this._downstream = new Map();
    /** @type {Map<string, Set<string>>} nodeId → set of upstream node IDs (edges from) */
    this._upstream = new Map();
    /** @type {Map<string, string[]>} nodeId → ordered list of (port, targetNodeId, targetPort) tuples */
    this._edges = new Map();
    /** @type {string[]} topological ordering of node IDs */
    this._topoOrder = [];
    /** @type {Map<string, number>} nodeId → execution level (0 = root, higher = deeper) */
    this._levels = new Map();
    /** @type {boolean} */
    this._dirty = true;
  }

  /**
   * Rebuild the entire dependency graph from a set of wires and node IDs.
   * @param {{ fromNode: string, fromPort: string, toNode: string, toPort: string }[]} wires
   * @param {string[]} nodeIds
   */
  build(wires, nodeIds) {
    this._downstream.clear();
    this._upstream.clear();
    this._edges.clear();
    this._topoOrder = [];
    this._levels.clear();

    // Initialise all known nodes
    for (const id of nodeIds) {
      this._downstream.set(id, new Set());
      this._upstream.set(id, new Set());
      this._edges.set(id, []);
    }

    // Add edges from wires, skip orphan wires
    for (const w of wires) {
      if (!this._downstream.has(w.fromNode) || !this._downstream.has(w.toNode)) continue;
      this._downstream.get(w.fromNode).add(w.toNode);
      this._upstream.get(w.toNode).add(w.fromNode);
      this._edges.get(w.fromNode).push({ port: w.fromPort, to: w.toNode, toPort: w.toPort });
    }

    this._computeTopologicalOrder();
    this._computeLevels();
    this._dirty = false;
  }

  /**
   * Incrementally add or update a single node's downstream edges.
   * Used when a wire is added/removed without a full rebuild.
   * @param {string} nodeId
   * @param {{ fromNode: string, fromPort: string, toNode: string, toPort: string }[]} outgoingWires
   */
  updateNode(nodeId, outgoingWires) {
    if (!this._downstream.has(nodeId)) {
      this._downstream.set(nodeId, new Set());
      this._upstream.set(nodeId, new Set());
      this._edges.set(nodeId, []);
    }
    const downstream = this._downstream.get(nodeId);
    downstream.clear();
    const edges = this._edges.get(nodeId);
    edges.length = 0;

    for (const w of outgoingWires) {
      if (w.fromNode !== nodeId) continue;
      if (!this._downstream.has(w.toNode)) continue; // target doesn't exist yet, skip
      downstream.add(w.toNode);
      this._upstream.get(w.toNode).add(nodeId);
      edges.push({ port: w.fromPort, to: w.toNode, toPort: w.toPort });
    }

    this._dirty = true;
  }

  /**
   * Get all downstream (dependent) node IDs for a node.
   * @param {string} nodeId
   * @returns {string[]}
   */
  getDownstream(nodeId) {
    const set = this._downstream.get(nodeId);
    return set ? Array.from(set) : [];
  }

  /**
   * Get all upstream (prerequisite) node IDs for a node.
   * @param {string} nodeId
   * @returns {string[]}
   */
  getUpstream(nodeId) {
    const set = this._upstream.get(nodeId);
    return set ? Array.from(set) : [];
  }

  /**
   * Recursively collect ALL downstream nodes (transitive closure).
   * @param {string} nodeId
   * @param {Set<string>} [visited]
   * @returns {string[]}
   */
  getAllDownstream(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);
    const result = [];
    for (const dep of this.getDownstream(nodeId)) {
      result.push(dep);
      result.push(...this.getAllDownstream(dep, visited));
    }
    return result;
  }

  /**
   * Recursively collect ALL upstream nodes (transitive closure).
   * @param {string} nodeId
   * @param {Set<string>} [visited]
   * @returns {string[]}
   */
  getAllUpstream(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);
    const result = [];
    for (const dep of this.getUpstream(nodeId)) {
      result.push(dep);
      result.push(...this.getAllUpstream(dep, visited));
    }
    return result;
  }

  /**
   * Return the topological order (upstream-first).
   * @returns {string[]}
   */
  getTopologicalOrder() {
    if (this._dirty) {
      this._computeTopologicalOrder();
      this._computeLevels();
      this._dirty = false;
    }
    return this._topoOrder;
  }

  /**
   * Return nodes grouped by execution level for parallel scheduling.
   * Level 0 = no upstream dependencies (roots).
   * Level N = depends on at least one node at level N-1, max parent level + 1.
   * @returns {Map<number, string[]>}
   */
  getLevels() {
    if (this._dirty) {
      this._computeTopologicalOrder();
      this._computeLevels();
      this._dirty = false;
    }
    const groups = new Map();
    for (const [id, level] of this._levels) {
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level).push(id);
    }
    return groups;
  }

  /**
   * Get the execution level of a single node.
   * @param {string} nodeId
   * @returns {number}
   */
  getLevel(nodeId) {
    if (this._dirty) {
      this._computeTopologicalOrder();
      this._computeLevels();
      this._dirty = false;
    }
    return this._levels.get(nodeId) ?? 0;
  }

  /**
   * Check if the graph has cycles (returns true if cyclic).
   * @returns {boolean}
   */
  hasCycle() {
    const visited = new Set();
    const inStack = new Set();

    const dfs = (nodeId) => {
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const dep of this.getDownstream(nodeId)) {
        if (!visited.has(dep)) {
          if (dfs(dep)) return true;
        } else if (inStack.has(dep)) {
          return true; // back edge → cycle
        }
      }
      inStack.delete(nodeId);
      return false;
    };

    for (const id of this._downstream.keys()) {
      if (!visited.has(id)) {
        if (dfs(id)) return true;
      }
    }
    return false;
  }

  /**
   * Find root nodes (no upstream dependencies).
   * @returns {string[]}
   */
  getRoots() {
    const roots = [];
    for (const [id, upstream] of this._upstream) {
      if (upstream.size === 0) roots.push(id);
    }
    return roots;
  }

  /**
   * Find leaf nodes (no downstream dependencies).
   * @returns {string[]}
   */
  getLeaves() {
    const leaves = [];
    for (const [id, downstream] of this._downstream) {
      if (downstream.size === 0) leaves.push(id);
    }
    return leaves;
  }

  /**
   * Get edge metadata for a node's outputs.
   * @param {string} nodeId
   * @returns {{ port: string, to: string, toPort: string }[]}
   */
  getEdges(nodeId) {
    return this._edges.get(nodeId) ?? [];
  }

  // ── Private ──

  /** Compute topological order using Kahn's algorithm. */
  _computeTopologicalOrder() {
    this._topoOrder = [];
    const inDegree = new Map();
    const queue = [];

    for (const id of this._downstream.keys()) {
      const deg = this._upstream.get(id)?.size ?? 0;
      inDegree.set(id, deg);
      if (deg === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const id = queue.shift();
      this._topoOrder.push(id);
      for (const dep of this.getDownstream(id)) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }
  }

  /** Compute execution levels. Level = max(parent levels) + 1. */
  _computeLevels() {
    this._levels.clear();
    for (const id of this._topoOrder) {
      let maxParentLevel = -1;
      for (const parent of this.getUpstream(id)) {
        const pl = this._levels.get(parent) ?? 0;
        if (pl > maxParentLevel) maxParentLevel = pl;
      }
      this._levels.set(id, maxParentLevel + 1);
    }
  }
}

export default DependencyGraph;