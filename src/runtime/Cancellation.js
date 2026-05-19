// ============================================
// Cancellation — cancel stale async operations
// ============================================

/**
 * Manages cancellation of in-flight async operations.
 * When a node is re-triggered before its previous async operation completes,
 * the old operation is cancelled and only the latest result is used.
 *
 * Supports:
 * - AbortController-based cancellation for fetch/async operations
 * - Token-based cooperative cancellation for long-running computes
 * - Per-node cancellation tracking
 * - Group cancellation (e.g. cancel all nodes in a level)
 */
export class CancellationManager {
  constructor() {
    /** @type {Map<string, CancellationToken>} nodeId → current token */
    this._tokens = new Map();
    /** @type {Map<string, Set<string>>} groupKey → set of node IDs */
    this._groups = new Map();
    /** @type {number} */
    this._tokenCounter = 0;
  }

  /**
   * Create a new cancellation token for a node.
   * If a previous token exists, it is cancelled first.
   * @param {string} nodeId
   * @returns {CancellationToken}
   */
  createToken(nodeId) {
    // Cancel any existing operation for this node
    this.cancel(nodeId);

    const tokenId = ++this._tokenCounter;
    const abortController = new AbortController();
    const token = new CancellationToken(tokenId, abortController);

    this._tokens.set(nodeId, token);
    return token;
  }

  /**
   * Get the current cancellation token for a node.
   * @param {string} nodeId
   * @returns {CancellationToken|undefined}
   */
  getToken(nodeId) {
    return this._tokens.get(nodeId);
  }

  /**
   * Cancel the current operation for a specific node.
   * @param {string} nodeId
   */
  cancel(nodeId) {
    const token = this._tokens.get(nodeId);
    if (token && !token.cancelled) {
      token.cancel();
    }
    this._tokens.delete(nodeId);
  }

  /**
   * Cancel all operations for a group of nodes.
   * @param {string} groupKey
   */
  cancelGroup(groupKey) {
    const group = this._groups.get(groupKey);
    if (!group) return;
    for (const nodeId of group) {
      this.cancel(nodeId);
    }
    this._groups.delete(groupKey);
  }

  /**
   * Cancel all operations.
   */
  cancelAll() {
    for (const [nodeId] of this._tokens) {
      this.cancel(nodeId);
    }
    this._groups.clear();
  }

  /**
   * Register a node in a cancellation group.
   * @param {string} nodeId
   * @param {string} groupKey
   */
  addToGroup(nodeId, groupKey) {
    if (!this._groups.has(groupKey)) {
      this._groups.set(groupKey, new Set());
    }
    this._groups.get(groupKey).add(nodeId);
  }

  /**
   * Remove a node from its cancellation group.
   * @param {string} nodeId
   * @param {string} groupKey
   */
  removeFromGroup(nodeId, groupKey) {
    const group = this._groups.get(groupKey);
    if (group) {
      group.delete(nodeId);
      if (group.size === 0) this._groups.delete(groupKey);
    }
  }

  /**
   * Check if a specific token is still valid (not cancelled).
   * @param {number} tokenId
   * @returns {boolean}
   */
  isTokenValid(tokenId) {
    for (const [, token] of this._tokens) {
      if (token.id === tokenId) return !token.cancelled;
    }
    return false;
  }

  /**
   * Number of active (non-cancelled) tokens.
   * @returns {number}
   */
  get activeCount() {
    let count = 0;
    for (const [, token] of this._tokens) {
      if (!token.cancelled) count++;
    }
    return count;
  }

  /**
   * Get all active node IDs.
   * @returns {string[]}
   */
  get activeNodes() {
    const nodes = [];
    for (const [nodeId, token] of this._tokens) {
      if (!token.cancelled) nodes.push(nodeId);
    }
    return nodes;
  }

  /**
   * Reset all state.
   */
  reset() {
    this.cancelAll();
    this._tokens.clear();
    this._groups.clear();
    this._tokenCounter = 0;
  }
}

/**
 * A cooperative cancellation token wrapping AbortController.
 * Check `token.cancelled` or call `token.throwIfCancelled()` in long-running operations.
 */
export class CancellationToken {
  /**
   * @param {number} id
   * @param {AbortController} abortController
   */
  constructor(id, abortController) {
    /** @type {number} unique token ID */
    this.id = id;
    /** @type {AbortController} */
    this._abortController = abortController;
    /** @type {boolean} */
    this.cancelled = false;
    /** @type {string|null} reason for cancellation */
    this.reason = null;
    /** @type {number} timestamp when cancelled */
    this.cancelledAt = null;
  }

  /**
   * Get the AbortSignal for use with fetch() or other async APIs.
   * @returns {AbortSignal}
   */
  get signal() {
    return this._abortController.signal;
  }

  /**
   * Cancel this token.
   * @param {string} [reason]
   */
  cancel(reason) {
    if (this.cancelled) return;
    this.cancelled = true;
    this.reason = reason || 'cancelled';
    this.cancelledAt = Date.now();
    this._abortController.abort(reason);
  }

  /**
   * Throws if this token has been cancelled.
   * Use inside long-running computations for cooperative cancellation:
   *
   * ```js
   * function computeExpensive(nd, token) {
   *   for (let i = 0; i < 1e6; i++) {
   *     token.throwIfCancelled();
   *     // ... work ...
   *   }
   * }
   * ```
   */
  throwIfCancelled() {
    if (this.cancelled) {
      throw new CancellationError(this.reason || 'Operation cancelled');
    }
  }

  /**
   * Returns a promise that rejects if this token is cancelled.
   * Useful with Promise.race:
   *
   * ```js
   * const result = await Promise.race([
   *   fetch(url, { signal: token.signal }),
   *   token.cancelledPromise()
   * ]);
   * ```
   * @returns {Promise<never>}
   */
  cancelledPromise() {
    return new Promise((_, reject) => {
      if (this.cancelled) {
        reject(new CancellationError(this.reason || 'Operation cancelled'));
        return;
      }
      this._abortController.signal.addEventListener('abort', () => {
        reject(new CancellationError(this.reason || 'Operation cancelled'));
      }, { once: true });
    });
  }
}

/**
 * Error thrown when an operation is cancelled.
 */
export class CancellationError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message = 'Operation cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}

export default CancellationManager;