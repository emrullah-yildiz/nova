// ============================================
// ExecutionEngine — scalable graph execution v2
// ============================================
//
// Integrates DependencyGraph, DirtyTracker, ExecutionCache,
// CancellationManager, and Scheduler to provide:
//
// - Compute only dirty downstream nodes (no full recompute)
// - Cache node outputs with version-aware invalidation
// - Cancel stale async operations automatically
// - Run independent branches in parallel
// - Stream large results (geometry sets) without freezing the app
// - Progress reporting and error recovery
//
// Usage:
//   import { ExecutionEngine } from './runtime/ExecutionEngine.js';
//   const engine = new ExecutionEngine();
//   engine.attach(app); // connects to existing NodeFlow app
//   await engine.run(); // incremental, dirty-only execution
// ============================================

import { DependencyGraph } from './DependencyGraph.js';
import { DirtyTracker } from './DirtyTracker.js';
import { ExecutionCache } from './ExecutionCache.js';
import { CancellationManager, CancellationError } from './Cancellation.js';
import { Scheduler } from './Scheduler.js';

export class ExecutionEngine {
  /**
   * @param {object} [options]
   * @param {number} [options.concurrency=4] max parallel nodes
   * @param {boolean} [options.cacheEnabled=true]
   * @param {boolean} [options.streamEnabled=false]
   * @param {number} [options.cacheMaxEntries=5000]
   * @param {number} [options.cacheMaxMemoryMB=50]
   */
  constructor(options = {}) {
    /** @type {DependencyGraph} */
    this.depGraph = new DependencyGraph();
    /** @type {DirtyTracker} */
    this.dirtyTracker = new DirtyTracker();
    /** @type {ExecutionCache} */
    this.cache = new ExecutionCache({
      maxEntries: options.cacheMaxEntries || 5000,
      maxMemoryBytes: (options.cacheMaxMemoryMB || 50) * 1024 * 1024
    });
    /** @type {CancellationManager} */
    this.cancellation = new CancellationManager();
    /** @type {Scheduler} */
    this.scheduler = new Scheduler({
      concurrency: options.concurrency || 4,
      streamEnabled: options.streamEnabled || false
    });

    /** @type {boolean} allows legacy V1 engine integration */
    this._cacheEnabled = options.cacheEnabled !== false;
    /** @type {object|null} reference to the attached app (NodeFlow) */
    this._app = null;
    /** @type {boolean} whether a run is in progress */
    this._running = false;
    /** @type {number} execution version counter */
    this._version = 0;
    /** @type {function(string, any): void} */
    this._onNodeResult = null;
    /** @type {function(string, Error): void} */
    this._onNodeError = null;
    /** @type {function(number, number): void} */
    this._onProgress = null;
    /** @type {function(string): void} */
    this._onDirty = null;

    // Wire up dependencies
    this.dirtyTracker.setDownstreamFn((id) => this.depGraph.getDownstream(id));
    this.dirtyTracker.setUpstreamFn((id) => this.depGraph.getUpstream(id));

    // Wire up scheduler callbacks
    this.scheduler.onNodeComplete((nodeId, value) => {
      if (this._onNodeResult) this._onNodeResult(nodeId, value);
    });
    this.scheduler.onNodeError((nodeId, err) => {
      if (this._onNodeError) this._onNodeError(nodeId, err);
    });
    this.scheduler.onProgress((completed, total) => {
      if (this._onProgress) this._onProgress(completed, total);
    });
  }

  /**
   * Attach the engine to an existing NodeFlow app.
   * This patches the app's runGraph, computeNodeValue, and node mutation methods
   * to use the V2 execution pipeline while remaining backward-compatible.
   *
   * @param {object} app - the NodeFlow application object
   */
  attach(app) {
    this._app = app;
    this._version = 0;

    // Store reference on app for external access
    app._executionEngineV2 = this;

    // Initialise dependency graph from existing wires
    this._rebuildGraph();

    // ── Patch node mutation methods ──

    // Intercept node add. Current Nova uses addNodeToCanvas; keep addNode support
    // for older callers.
    if (typeof app.addNode === 'function') {
      const origAddNode = app.addNode.bind(app);
      app.addNode = (type, x, y) => {
        const nd = origAddNode(type, x, y);
        if (nd) this._onNodeAdded(nd);
        return nd;
      };
    }

    if (typeof app.addNodeToCanvas === 'function') {
      const origAddNodeToCanvas = app.addNodeToCanvas.bind(app);
      app.addNodeToCanvas = (type, x, y) => {
        const nd = origAddNodeToCanvas(type, x, y);
        if (nd) this._onNodeAdded(nd);
        return nd;
      };
    }

    // Intercept node remove
    const origRemoveNode = app.removeNode.bind(app);
    app.removeNode = (nodeId) => {
      origRemoveNode(nodeId);
      this._onNodeRemoved(nodeId);
    };

    // Intercept wire add
    const origAddWire = app.addWire.bind(app);
    app.addWire = (fromNode, fromPort, toNode, toPort) => {
      origAddWire(fromNode, fromPort, toNode, toPort);
      this._onWireAdded(fromNode, fromPort, toNode, toPort);
    };

    // Intercept wire remove
    if (typeof app.removeWire === 'function') {
      const origRemoveWire = app.removeWire.bind(app);
      app.removeWire = (fromNode, fromPort, toNode, toPort) => {
        origRemoveWire(fromNode, fromPort, toNode, toPort);
        this._onWireRemoved(fromNode, fromPort, toNode, toPort);
      };
    }

    // Intercept control value changes
    const origSetControlValue = app.setControlValue ? app.setControlValue.bind(app) : null;
    if (origSetControlValue || typeof app.setControlValue === 'function') {
      app.setControlValue = (nodeId, ctrlId, value) => {
        if (origSetControlValue) origSetControlValue(nodeId, ctrlId, value);
        this._onControlChanged(nodeId, ctrlId, value);
      };
    }

    // ── Patch computeNodeValue for cache integration ──
    const origCompute = app.computeNodeValue.bind(app);
    app.computeNodeValue = (nd) => {
      if (app._manualRunMode && !app._isRunningGraph) {
        return typeof app.getLastRunNodeValue === 'function' ? app.getLastRunNodeValue(nd) : undefined;
      }
      // Use V2 caching if enabled
      if (this._cacheEnabled && nd) {
        const cached = this.cache.get(nd.id, this._version);
        if (cached.found) {
          nd._debug = { ...(nd._debug || {}), cache: 'hit' };
          return cached.value;
        }
        const result = origCompute(nd);
        nd._debug = { ...(nd._debug || {}), cache: 'miss' };
        this.cache.set(nd.id, result, this._version);
        return result;
      }
      return origCompute(nd);
    };

    // ── Patch runGraph ──
    const origRunGraph = app.runGraph.bind(app);
    app.runGraph = async () => {
      if (Array.isArray(app.wires)) {
        app._lastRunWires = app.wires.map(w => `${w.fromNode}:${w.fromPort}>${w.toNode}:${w.toPort}`);
      }
      app._graphDirty = false;
      // Run V2 execution
      const result = await this.run();
      // Fall through to legacy rendering for backward compat
      if (result.completed > 0 || result.failed > 0) {
        // Still call the legacy rendering pipeline for 3D viewer updates
        if (typeof app._renderFromCompute === 'function') {
          app._renderFromCompute();
        }
        // Refresh data inspectors
        if (typeof app.invalidateCompute === 'function') {
          app.invalidateCompute();
          app.beginCompute();
          app.nodes.forEach((nd) => {
            if (nd._inspOpen || nd.inspectorOpen) {
              const content = document.getElementById(nd.id + '-insp-content');
              if (content && app._universalInspector) {
                content.innerHTML = app._universalInspector(nd);
              }
            } else if (nd.dataPanelOpen) {
              const dc = document.getElementById(nd.id + '-dc');
              if (dc) dc.innerHTML = app.nodeDataHTML(nd);
            }
          });
          app.endCompute();
        }
        app._graphDirty = false;
        if (typeof app.refreshNodeWarningBadges === 'function') app.refreshNodeWarningBadges();
        // Re-render wires with animation
        if (typeof app.renderWires === 'function') {
          app.renderWires();
        }
      }
      return result;
    };

    // ── Patch invalidateCompute for dirty tracking ──
    const origInvalidate = app.invalidateCompute.bind(app);
    app.invalidateCompute = () => {
      origInvalidate();
      // Also mark all nodes as dirty in V2 tracker
      const nodeIds = (app.nodes || []).map(n => n.id);
      this.dirtyTracker.markAllDirty(nodeIds);
      this._version++;
    };

    // ── Wire Cancel button (lazy lookup – buttons may not be in DOM yet) ──
    this._getButtons = () => {
      if (!this._cancelBtn) this._cancelBtn = document.getElementById('menu-cancel');
      if (!this._runBtn) this._runBtn = document.getElementById('toolbar-run') || document.getElementById('menu-run');
      return { run: this._runBtn, cancel: this._cancelBtn };
    };

    // Lazy event binding — only wire click once
    const self = this;
    function cancelHandler() {
      if (!self._running) return;
      self.cancel();
      const btns = self._getButtons();
      if (app && typeof app._hideCancelButton === 'function') app._hideCancelButton();
      if (!app._hideCancelButton && btns.run) {
        btns.run.classList.remove('disabled');
        btns.run.textContent = '▶ Run';
      }
      if (btns.cancel) {
        btns.cancel.classList.add('hidden');
      }
      if (app && typeof app.addAIMessage === 'function') {
        app.addAIMessage('workspace', '⏹ **Execution cancelled** by user.');
      }
    }
    // Bind cancel handler to button once found
    Object.defineProperty(this, '_cancelHandler', { value: cancelHandler, writable: false });

    // Try to find cancel button and attach handler now; if not found, will be found on next run()
    const btns = this._getButtons();
    if (btns.cancel) {
      btns.cancel.addEventListener('click', cancelHandler);
    }

    // Add cancelExecution method to app for external access (e.g. toolbar button)
    app.cancelExecution = () => {
      cancelHandler();
    };

    if (typeof app._graphDirty !== 'undefined') {
      app._graphDirty = true;
    }

    console.log('[ExecutionEngine v2] Attached to app — cancel button will appear on Run()');
    return this;
  }

  /**
   * Detach the engine, restoring original app methods.
   * @param {object} app
   */
  detach(app) {
    // Future: restore original methods if stored
    delete app._executionEngineV2;
  }

  /**
   * Run the execution pipeline.
   * Computes only dirty nodes (transitive downstream of changed nodes).
   *
   * @param {object} [options]
   * @param {string[]} [options.dirtyNodes] - specific nodes to mark dirty (default: auto-detected)
   * @param {AbortSignal} [options.signal] - external cancellation signal
   * @returns {Promise<{ completed: number, failed: number, errors: Map<string, Error> }>}
   */
  async run(options = {}) {
    if (this._running) {
      return { completed: 0, failed: 0, errors: new Map(), running: true };
    }
    this._running = true;
    if (this._app) this._app._isRunningGraph = true;
    this._version++;
    this._cancelRequested = false;

    const app = this._app;
    if (app && app.nodes) {
      for (const nd of app.nodes) {
        nd._cancelled = false;
      }
    }

    // Ensure buttons are looked up (lazy, in case DOM wasn't ready at attach time)
    this._getButtons();

    if (app && typeof app._showCancelButton === 'function') app._showCancelButton();

    // Toggle UI buttons: show Cancel, hide Run
    if (!app._showCancelButton && this._runBtn) {
      this._runBtn.textContent = '▶ Running…';
      this._runBtn.classList.add('disabled');
    }
    if (this._cancelBtn) {
      this._cancelBtn.classList.remove('hidden');
    }

    if (!app) {
      this._running = false;
      return { completed: 0, failed: 0, errors: new Map() };
    }

    // Build/rebuild dependency graph from current state
    this._rebuildGraph();

    // If specific dirty nodes provided, mark them
    if (options.dirtyNodes && options.dirtyNodes.length > 0) {
      this.dirtyTracker.markDirtyAll(options.dirtyNodes);
    } else if (this.dirtyTracker.dirtyCount === 0) {
      // Nothing dirty — mark all (full recompute)
      const nodeIds = (app.nodes || []).map(n => n.id);
      this.dirtyTracker.markAllDirty(nodeIds);
    }

    const dirtySet = this.dirtyTracker.getDirty();
    if (dirtySet.size === 0) {
      this._running = false;
      if (app && typeof app._hideCancelButton === 'function') app._hideCancelButton();
      return { completed: 0, failed: 0, errors: new Map() };
    }

    // Merge external signal if provided
    const signal = options.signal;

    // Get execution levels for parallel scheduling
    const levels = this.depGraph.getLevels();

    // Execute via scheduler
    const executeNodeFn = async (nodeId) => {
      if (this._cancelRequested) throw new CancellationError('Execution cancelled by user');
      if (signal?.aborted) throw new CancellationError('Execution cancelled by external signal');
      if (!this.dirtyTracker.isDirty(nodeId) && this.cache.has(nodeId, this._version)) {
        return this.cache.get(nodeId, this._version).value;
      }

      // Create cancellation token for this node
      const token = this.cancellation.createToken(nodeId);
      this.dirtyTracker.startComputing(nodeId);

      try {
        const nd = app.nodes.find(n => n.id === nodeId);
        if (!nd) return undefined;

        // Check for cache hit
        if (this._cacheEnabled) {
          const cached = this.cache.get(nodeId, this._version);
          if (cached.found) {
            this.dirtyTracker.markClean(nodeId);
            return cached.value;
          }
        }

        // Compute the node value using the app's compute pipeline
        const result = await this._computeNode(nodeId, nd, token);
        if (this._cancelRequested) throw new CancellationError('Execution cancelled by user');
        token.throwIfCancelled();

        // Store in cache
        if (this._cacheEnabled) {
          this.cache.set(nodeId, result, this._version);
        }

        this.dirtyTracker.markClean(nodeId);
        return result;
      } catch (err) {
        if (err instanceof CancellationError) {
          this.dirtyTracker.finishComputing(nodeId);
          throw err;
        }
        this.dirtyTracker.finishComputing(nodeId);
        throw err;
      }
    };

    let result;
    try {
    if (this.scheduler._streamEnabled) {
      // Streaming execution (large geometry sets)
      const streamResults = await this.scheduler.executeStreaming(
        Array.from(dirtySet),
        (nodeId) => this._computeNodeStream(nodeId),
        { signal }
      );
      result = { completed: streamResults.size, failed: 0, errors: new Map() };
    } else {
      // Level-based parallel execution
      result = await this.scheduler.executeLevels(levels, executeNodeFn, { signal });
    }

    // Flush dirty tracker — all clean after successful run
    if (!this._cancelRequested) this.dirtyTracker.flush();

    if (!this._cancelRequested && app && typeof app._commitRunSnapshot === 'function') {
      app._commitRunSnapshot();
    }

    this._running = false;

    if (app && typeof app._hideCancelButton === 'function') app._hideCancelButton();

    // Restore UI buttons after execution
    if (!app._hideCancelButton && this._runBtn) {
      this._runBtn.textContent = '▶ Run';
      this._runBtn.classList.remove('disabled');
    }
    if (this._cancelBtn) {
      this._cancelBtn.classList.add('hidden');
    }

    } finally {
      this._running = false;
      if (app) app._isRunningGraph = false;
      if (app && typeof app._hideCancelButton === 'function') app._hideCancelButton();
      if (this._cancelBtn) this._cancelBtn.classList.add('hidden');
    }

    return result;
  }

  /**
   * Incrementally recompute only the dirty subgraph starting from a changed node.
   * More efficient than full run() when only one or a few nodes change.
   *
   * @param {string} rootNodeId
   * @returns {Promise<{ completed: number, failed: number, errors: Map<string, Error> }>}
   */
  async recomputeDirty(rootNodeId) {
    const app = this._app;
    if (!app) return { completed: 0, failed: 0, errors: new Map() };

    this._rebuildGraph();

    // Mark the root and all downstream as dirty
    this.dirtyTracker.markDirty(rootNodeId);
    // Also propagate downstream transitively
    const allDownstream = this.depGraph.getAllDownstream(rootNodeId);
    this.dirtyTracker.markDirtyAll(allDownstream);

    const dirtySet = this.dirtyTracker.getDirty();
    if (dirtySet.size === 0) return { completed: 0, failed: 0, errors: new Map() };

    const topoOrder = this.depGraph.getTopologicalOrder();

    const executeNodeFn = async (nodeId) => {
      const nd = app.nodes.find(n => n.id === nodeId);
      if (!nd) return undefined;
      const token = this.cancellation.createToken(nodeId);
      this.dirtyTracker.startComputing(nodeId);
      try {
        const result = this._computeNode(nodeId, nd, token);
        if (this._cacheEnabled) this.cache.set(nodeId, result, this._version);
        this.dirtyTracker.markClean(nodeId);
        return result;
      } catch (err) {
        this.dirtyTracker.finishComputing(nodeId);
        throw err;
      }
    };

    const result = await this.scheduler.executeDirtySubgraph(
      rootNodeId, topoOrder, dirtySet, executeNodeFn
    );

    this.dirtyTracker.flush();
    return result;
  }

  /**
   * Mark a node as dirty (value changed, needs recompute).
   * Automatically propagates dirtiness to downstream nodes.
   * @param {string} nodeId
   */
  markDirty(nodeId) {
    this.dirtyTracker.markDirty(nodeId);
    if (this._onDirty) this._onDirty(nodeId);
  }

  /**
   * Register a callback when a node's computed result is available.
   * @param {function(string, any): void} fn
   */
  onNodeResult(fn) {
    this._onNodeResult = fn;
  }

  /**
   * Register a callback when a node computation errors.
   * @param {function(string, Error): void} fn
   */
  onNodeError(fn) {
    this._onNodeError = fn;
  }

  /**
   * Register a progress callback (completed, total).
   * @param {function(number, number): void} fn
   */
  onProgress(fn) {
    this._onProgress = fn;
  }

  /**
   * Register a callback when a node is marked dirty.
   * @param {function(string): void} fn
   */
  onDirty(fn) {
    this._onDirty = fn;
  }

  /**
   * Get execution statistics.
   * @returns {{ cache: object, scheduler: { inFlight: number, paused: boolean }, dirtyCount: number, version: number, running: boolean }}
   */
  getStats() {
    return {
      cache: this.cache.getStats(),
      scheduler: {
        inFlight: this.scheduler.inFlightCount,
        paused: this.scheduler.isPaused
      },
      dirtyCount: this.dirtyTracker.dirtyCount,
      computingCount: this.dirtyTracker.computingCount,
      version: this._version,
      running: this._running
    };
  }

  /**
   * Pause execution (in-flight ops continue, but no new ones start).
   */
  pause() {
    this.scheduler.pause();
  }

  /**
   * Resume execution.
   */
  resume() {
    this.scheduler.resume();
  }

  /**
   * Whether the engine is currently running.
   * @returns {boolean}
   */
  get isRunning() {
    return this._running;
  }

  /**
   * Cancel all in-flight operations and reset state.
   */
  cancel() {
    this._cancelRequested = true;
    this.cancellation.cancelAll();
    this.dirtyTracker.reset();
    this._running = false;

    // Mark all nodes as cancelled so async slow-compute Promises resolve quickly
    const app = this._app;
    if (app && app.nodes) {
      for (const nd of app.nodes) {
        nd._cancelled = true;
      }
    }
  }

  /**
   * Reset the entire engine (cache, dirty state, cancellation).
   */
  reset() {
    this.cancel();
    this.cache.clear();
    this.depGraph = new DependencyGraph();
    this.dirtyTracker = new DirtyTracker();
    this.dirtyTracker.setDownstreamFn((id) => this.depGraph.getDownstream(id));
    this.dirtyTracker.setUpstreamFn((id) => this.depGraph.getUpstream(id));
    this._version = 0;
  }

  /**
   * Set concurrency limit for parallel execution.
   * @param {number} limit
   */
  setConcurrency(limit) {
    this.scheduler.setConcurrency(limit);
  }

  /**
   * Enable or disable streaming for large geometry sets.
   * @param {boolean} enabled
   */
  setStreaming(enabled) {
    this.scheduler._streamEnabled = enabled;
  }

  /**
   * Enable or disable caching.
   * @param {boolean} enabled
   */
  setCacheEnabled(enabled) {
    this._cacheEnabled = enabled;
    if (!enabled) this.cache.clear();
  }

  /**
   * Get the current execution version.
   * @returns {number}
   */
  get version() {
    return this._version;
  }

  // ── Private ──

  /** Rebuild the dependency graph from app wires. */
  _rebuildGraph() {
    const app = this._app;
    if (!app) return;
    const nodeIds = (app.nodes || []).map(n => n.id);
    this.depGraph.build(app.wires || [], nodeIds);
  }

  /** Handle node added event. */
  _onNodeAdded(nd) {
    this.depGraph.updateNode(nd.id, []);
    this.dirtyTracker.markDirty(nd.id);
  }

  /** Handle node removed event. */
  _onNodeRemoved(nodeId) {
    this.dirtyTracker.markAllDirty(
      this.depGraph.getDownstream(nodeId)
    );
    this._rebuildGraph();
  }

  /** Handle wire added event. */
  _onWireAdded(fromNode, fromPort, toNode, toPort) {
    const app = this._app;
    if (!app) return;
    const outgoing = (app.wires || []).filter(w => w.fromNode === fromNode);
    this.depGraph.updateNode(fromNode, outgoing);

    // Mark downstream as dirty
    this.dirtyTracker.markDirty(fromNode);
  }

  /** Handle wire removed event. */
  _onWireRemoved(fromNode, fromPort, toNode, toPort) {
    const app = this._app;
    if (!app) return;
    const outgoing = (app.wires || []).filter(w => w.fromNode === fromNode);
    this.depGraph.updateNode(fromNode, outgoing);

    // Mark downstream of both ends as dirty
    this.dirtyTracker.markDirty(fromNode);
    this.dirtyTracker.markDirty(toNode);
  }

  /** Handle control value change event. */
  _onControlChanged(nodeId, ctrlId, value) {
    // Invalidate cache for this node
    if (this._cacheEnabled) {
      this.cache.invalidateNode(nodeId);
    }
    // Mark dirty and propagate downstream
    this.dirtyTracker.markDirty(nodeId);
    const downstream = this.depGraph.getAllDownstream(nodeId);
    this.dirtyTracker.markDirtyAll(downstream);
  }

  /**
   * Compute a single node's value.
   * Delegates to the app's computeNodeValue if available, otherwise returns undefined.
   * @param {string} nodeId
   * @param {object} nd
   * @param {object} token
   * @returns {any}
   */
  _computeNode(nodeId, nd, token) {
    const app = this._app;
    if (!app || !app.computeNodeValue) return undefined;

    const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    const startedAt = now();
    nd._debug = { ...(nd._debug || {}), cache: 'miss', error: null };

    try {
    // Use V1 compute pipeline for all node types
    const result = app.computeNodeValue(nd);
    nd._lastComputedValue = result;

    // Handle multi-output nodes
    if (nd._portValues) {
      nd._portValues = { ...nd._portValues };
    }

    return result;
    } catch (err) {
      const errorValue = app.createErrorValue ? app.createErrorValue(err, nodeId) : { type: 'ErrorValue', message: err.message || String(err) };
      nd._lastComputedValue = errorValue;
      nd._portValues = { error: errorValue };
      nd._debug = { ...(nd._debug || {}), error: errorValue, cache: 'miss' };
      return errorValue;
    } finally {
      const endedAt = now();
      if (app._recordNodeTiming) app._recordNodeTiming(nd, endedAt - startedAt, nd._debug && nd._debug.cache);
    }
  }

  /**
   * Stream-enabled compute for a node (used by scheduler when streaming is on).
   * @param {string} nodeId
   * @returns {AsyncGenerator|Promise<any>}
   */
  async *_computeNodeStream(nodeId) {
    const app = this._app;
    if (!app) return;

    const nd = app.nodes.find(n => n.id === nodeId);
    if (!nd) return;

    const token = this.cancellation.createToken(nodeId);
    this.dirtyTracker.startComputing(nodeId);

    try {
      const result = app.computeNodeValue(nd);

      // If the result is a large array, yield it in chunks
      if (Array.isArray(result) && result.length > 100) {
        const chunkSize = this.scheduler._chunkSize || 1000;
        for (let i = 0; i < result.length; i += chunkSize) {
          token.throwIfCancelled();
          const chunk = result.slice(i, i + chunkSize);
          yield chunk;
        }
      } else {
        yield result;
      }

      if (this._cacheEnabled) {
        this.cache.set(nodeId, result, this._version);
      }
      this.dirtyTracker.markClean(nodeId);
    } catch (err) {
      this.dirtyTracker.finishComputing(nodeId);
      if (!(err instanceof CancellationError)) throw err;
    }
  }
}

export default ExecutionEngine;
