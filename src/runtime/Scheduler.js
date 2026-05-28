// ============================================
// Scheduler — parallel execution of independent branches
// ============================================

import { CancellationError } from './Cancellation.js';

/**
 * Schedules node execution across levels of the dependency graph.
 * Nodes within the same level (no cross-dependencies) execute in parallel.
 * Nodes in subsequent levels execute after all predecessors complete.
 *
 * Supports:
 * - Parallel execution of independent branches via configurable concurrency
 * - Streaming of large results between nodes
 * - Progress reporting
 * - Cancellation of in-flight work
 * - Configurable concurrency limit
 */
export class Scheduler {
  /**
   * @param {object} options
   * @param {number} [options.concurrency=4] max parallel node executions
   * @param {boolean} [options.streamEnabled=false] enable streaming for large results
   * @param {number} [options.chunkSize=1000] chunk size for streaming
   */
  constructor(options = {}) {
    /** @type {number} max parallel executions */
    this._concurrency = options.concurrency || 4;
    /** @type {boolean} */
    this._streamEnabled = options.streamEnabled || false;
    /** @type {number} */
    this._chunkSize = options.chunkSize || 1000;
    /** @type {Map<string, Promise>} in-flight computations */
    this._inFlight = new Map();
    /** @type {boolean} */
    this._paused = false;
    /** @type {function(string, any): void} callback when a node completes */
    this._onNodeComplete = null;
    /** @type {function(string, Error): void} callback when a node fails */
    this._onNodeError = null;
    /** @type {function(number, number): void} callback (completed, total) */
    this._onProgress = null;
  }

  /**
   * Set callback for node completion.
   * @param {function(string, any): void} fn
   */
  onNodeComplete(fn) {
    this._onNodeComplete = fn;
  }

  /**
   * Set callback for node error.
   * @param {function(string, Error): void} fn
   */
  onNodeError(fn) {
    this._onNodeError = fn;
  }

  /**
   * Set callback for progress updates.
   * @param {function(number, number): void} fn
   */
  onProgress(fn) {
    this._onProgress = fn;
  }

  /**
   * Execute all nodes in the graph using level-based scheduling.
   * Nodes at the same level run in parallel (subject to concurrency).
   *
   * @param {Map<number, string[]>} levels - map of level → node IDs
   * @param {function(string): Promise<any>} executeNode - async function to run a node
   * @param {object} [options]
   * @param {AbortSignal} [options.signal] - cancellation signal
   * @returns {Promise<{ completed: number, failed: number, errors: Map<string, Error> }>}
   */
  async executeLevels(levels, executeNode, options = {}) {
    const { signal } = options;
    let completed = 0;
    let failed = 0;
    const errors = new Map();
    const totalNodes = this._countNodes(levels);

    // Sort levels ascending
    const sortedLevels = Array.from(levels.entries()).sort((a, b) => a[0] - b[0]);

    for (const [level, nodeIds] of sortedLevels) {
      if (signal?.aborted) break;
      if (this._paused) await this._waitForResume();

      // Execute all nodes at this level in parallel, with concurrency limit
      const results = await this._runBatched(nodeIds, async (nodeId) => {
        if (signal?.aborted) return;
        if (this._paused) await this._waitForResume();

        try {
          const promise = executeNode(nodeId);
          this._inFlight.set(nodeId, promise);
          const value = await promise;

          if (!signal?.aborted) {
            completed++;
            if (this._onNodeComplete) this._onNodeComplete(nodeId, value);
            if (this._onProgress) this._onProgress(completed, totalNodes);
          }
        } catch (err) {
          if (err instanceof CancellationError) {
            // Cancelled operations are not counted as failures
            return;
          }
          failed++;
          errors.set(nodeId, err);
          if (this._onNodeError) this._onNodeError(nodeId, err);
          if (this._onProgress) this._onProgress(completed, totalNodes);
        } finally {
          this._inFlight.delete(nodeId);
        }
      });
    }

    return { completed, failed, errors };
  }

  /**
   * Execute a single node and its downstream chain in topological order.
   * Used for incremental recomputation when only a subset of nodes is dirty.
   *
   * @param {string} rootNodeId - the changed node
   * @param {string[]} topoOrder - full topological order
   * @param {Set<string>} dirtySet - set of dirty node IDs
   * @param {function(string): Promise<any>} executeNode
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<{ completed: number, failed: number, errors: Map<string, Error> }>}
   */
  async executeDirtySubgraph(rootNodeId, topoOrder, dirtySet, executeNode, options = {}) {
    const { signal } = options;
    let completed = 0;
    let failed = 0;
    const errors = new Map();

    // Filter topo order to only dirty nodes
    const dirtyOrder = topoOrder.filter(id => dirtySet.has(id));

    for (const nodeId of dirtyOrder) {
      if (signal?.aborted) break;
      if (this._paused) await this._waitForResume();

      try {
        const promise = executeNode(nodeId);
        this._inFlight.set(nodeId, promise);
        const value = await promise;

        if (!signal?.aborted) {
          completed++;
          if (this._onNodeComplete) this._onNodeComplete(nodeId, value);
        }
      } catch (err) {
        if (err instanceof CancellationError) continue;
        failed++;
        errors.set(nodeId, err);
        if (this._onNodeError) this._onNodeError(nodeId, err);
      } finally {
        this._inFlight.delete(nodeId);
      }
    }

    return { completed, failed, errors };
  }

  /**
   * Execute nodes in parallel with streaming support.
   * For nodes that produce large arrays (e.g. geometry lists), the result
   * is yielded as chunks so downstream nodes can start processing early.
   *
   * @param {string[]} nodeIds
   * @param {function(string): AsyncGenerator|Promise<any>} executeNodeStream
   * @param {object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Map<string, any>>}
   */
  async executeStreaming(nodeIds, executeNodeStream, options = {}) {
    const { signal } = options;
    const results = new Map();

    const runNode = async (nodeId) => {
      if (signal?.aborted) return;
      const genOrPromise = executeNodeStream(nodeId);

      // Check if it's an async generator (streaming)
      if (genOrPromise && typeof genOrPromise[Symbol.asyncIterator] === 'function') {
        const chunks = [];
        for await (const chunk of genOrPromise) {
          if (signal?.aborted) break;
          chunks.push(chunk);
          // Early yield: allow downstream to start processing this chunk
          if (this._onNodeComplete) {
            this._onNodeComplete(nodeId, { chunk, partial: true });
          }
        }
        if (!signal?.aborted) {
          const combined = this._combineChunks(chunks);
          results.set(nodeId, combined);
          if (this._onNodeComplete) {
            this._onNodeComplete(nodeId, combined);
          }
        }
      } else {
        // Regular promise
        const value = await genOrPromise;
        if (!signal?.aborted) {
          results.set(nodeId, value);
          if (this._onNodeComplete) {
            this._onNodeComplete(nodeId, value);
          }
        }
      }
    };

    await this._runBatched(nodeIds, runNode);
    return results;
  }

  /**
   * Pause scheduling. In-flight operations continue but no new nodes start.
   */
  pause() {
    this._paused = true;
  }

  /**
   * Resume scheduling.
   */
  resume() {
    this._paused = false;
  }

  /**
   * Check if scheduler is paused.
   * @returns {boolean}
   */
  get isPaused() {
    return this._paused;
  }

  /**
   * Wait for all in-flight operations to complete.
   * @returns {Promise<void>}
   */
  async drain() {
    const inFlight = Array.from(this._inFlight.values());
    await Promise.allSettled(inFlight);
  }

  /**
   * Cancel all in-flight operations.
   * @param {CancellationManager} cancellationManager
   */
  cancelAll(cancellationManager) {
    for (const [nodeId] of this._inFlight) {
      cancellationManager.cancel(nodeId);
    }
    this._inFlight.clear();
  }

  /**
   * Number of currently executing nodes.
   * @returns {number}
   */
  get inFlightCount() {
    return this._inFlight.size;
  }

  /**
   * Update concurrency limit.
   * @param {number} limit
   */
  setConcurrency(limit) {
    this._concurrency = Math.max(1, limit);
  }

  // ── Private ──

  /**
   * Run an array of items through an async mapper with concurrency control.
   * @template T, R
   * @param {T[]} items
   * @param {function(T): Promise<R>} mapper
   * @returns {Promise<R[]>}
   */
  async _runBatched(items, mapper) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
      // Wait if at concurrency limit
      if (executing.size >= this._concurrency) {
        await Promise.race(executing);
      }

      const promise = mapper(item).then(result => {
        executing.delete(promise);
        return result;
      });

      executing.add(promise);
      results.push(promise);
    }

    return Promise.all(results);
  }

  /**
   * Count total nodes across all levels.
   * @param {Map<number, string[]>} levels
   * @returns {number}
   */
  _countNodes(levels) {
    let count = 0;
    for (const [, ids] of levels) {
      count += ids.length;
    }
    return count;
  }

  /**
   * Wait until resumed (for paused state).
   * @returns {Promise<void>}
   */
  async _waitForResume() {
    return new Promise(resolve => {
      const check = () => {
        if (!this._paused) {
          resolve();
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  }

  /**
   * Combine streamed chunks into a single result.
   * @param {any[][]} chunks
   * @returns {any[]}
   */
  _combineChunks(chunks) {
    if (chunks.length === 0) return [];
    if (chunks.length === 1) return chunks[0];
    // Flatten array chunks
    const combined = [];
    for (const chunk of chunks) {
      if (Array.isArray(chunk)) {
        for (const item of chunk) {
          combined.push(item);
        }
      } else {
        combined.push(chunk);
      }
    }
    return combined;
  }
}

export default Scheduler;