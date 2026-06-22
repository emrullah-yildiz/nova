// ============================================
// NOVA — Graph Run Modes (Automatic | Manual)
// ============================================
// App/UI-level run-mode policy on top of the engine's existing manual-run
// mechanism. The engine (src/core/engine.js) already knows HOW to defer
// computation to an explicit Run via `app._manualRunMode` + the last-run
// snapshot (getLastRunNodeValue / _commitRunSnapshot). This module owns the
// *policy*: which mode the graph is in, the default ('auto' — recompute on any
// edit, the legacy behavior), the user-facing toggle, the Run button's "stale /
// pending changes" affordance, and the catch-up recompute on Manual→Automatic.
//
// Two modes:
//   • Automatic (default) — `_manualRunMode = false`: every graph edit flows
//     through the live compute path exactly as before run-modes existed.
//   • Manual — `_manualRunMode = true`: edits do NOT recompute; the inspector /
//     viewport keep showing the last Run snapshot. Only `app.runGraph()` (the
//     Run button) recomputes. The Run button highlights while the graph is
//     dirty (changed since the last Run) so results aren't silently stale.
//
// This is thin wiring: it sets `_manualRunMode` from `app.runMode`, persists the
// mode through save-load, and reuses the engine's `runGraph` / `_graphDirty`.
// It does NOT reimplement compute gating — that lives in the engine.

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

export function installRunMode(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__runModeInstalled) return true;
  targetApp.__runModeInstalled = true;
  var app = targetApp;

  // ── Run-mode state ──────────────────────────────────────────────────────
  // Default is 'auto' (legacy behavior). The engine sets `_manualRunMode` to
  // true whenever a DOM is present; we override that here so a fresh session
  // starts Automatic, and route all mode changes through `app.runMode`.
  app._runMode = 'auto';

  Object.defineProperty(app, 'runMode', {
    configurable: true,
    enumerable: true,
    get: function () { return app._runMode; },
    set: function (mode) { app.setRunMode(mode); }
  });

  // Apply a mode without side effects beyond syncing `_manualRunMode` + UI.
  // Returns the normalized mode actually applied.
  app._applyRunMode = function (mode) {
    var next = mode === 'manual' ? 'manual' : 'auto';
    app._runMode = next;
    app._manualRunMode = next === 'manual';
    app._refreshRunModeUI();
    return next;
  };

  // setRunMode — the policy entry point. Automatic→Manual just stops auto-
  // running; Manual→Automatic catches up with a full recompute so the live
  // surface reflects the current graph immediately.
  app.setRunMode = function (mode) {
    var prev = app._runMode;
    var next = app._applyRunMode(mode);
    if (next === prev) return next;
    if (next === 'auto') {
      // Catch up: a Run reuses the same compute path the auto path uses and
      // clears the dirty/stale flag.
      if (typeof app.runGraph === 'function') {
        try {
          var r = app.runGraph();
          if (r && typeof r.then === 'function') r.then(function () {}, function () {});
        } catch (e) { /* never break the toggle on a compute error */ }
      }
    }
    return next;
  };

  app.toggleRunMode = function () {
    return app.setRunMode(app._runMode === 'manual' ? 'auto' : 'manual');
  };

  function wireKey(w) {
    return [w.fromNode, w.fromPort, w.toNode, w.toPort].join(':');
  }

  function wireMap() {
    var map = {};
    (app.wires || []).forEach(function (w) { map[wireKey(w)] = w; });
    return map;
  }

  function wireChangeRoots(prevMap, nextMap) {
    var roots = {};
    Object.keys(nextMap).forEach(function (key) {
      if (!prevMap[key] && nextMap[key].toNode) roots[nextMap[key].toNode] = true;
    });
    Object.keys(prevMap).forEach(function (key) {
      if (!nextMap[key] && prevMap[key].toNode) roots[prevMap[key].toNode] = true;
    });
    return Object.keys(roots);
  }

  function uniqueNodeIds(ids) {
    var seen = {};
    return (ids || []).filter(function (id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  app._runModeLastWireMap = wireMap();
  app._autoRunTimer = null;
  app._pendingAutoRun = null;

  app._runAutoDirtyGraph = async function (dirtyNodeIds) {
    var roots = uniqueNodeIds(dirtyNodeIds);
    var engine = app._executionEngineV2 ||
      (typeof window !== 'undefined' ? window.__executionEngineV2 : null);
    if (!engine || typeof engine.runDirtyNodes !== 'function' || roots.length === 0) {
      return app.runGraph();
    }

    if (Array.isArray(app.wires)) {
      app._lastRunWires = app.wires.map(function (w) {
        return w.fromNode + ':' + w.fromPort + '>' + w.toNode + ':' + w.toPort;
      });
    }
    app._graphDirty = false;

    var result = await engine.runDirtyNodes(roots);
    if (result && (result.completed > 0 || result.failed > 0)) {
      if (typeof app._renderFromCompute === 'function') {
        app._renderFromCompute({ computeNodeIds: [], keepCamera: true });
      }
      if (typeof app.beginCompute === 'function' && typeof app.endCompute === 'function') {
        app.beginCompute();
        (app.nodes || []).forEach(function (nd) {
          if (nd._inspOpen || nd.inspectorOpen) {
            var content = document.getElementById(nd.id + '-insp-content');
            if (content && app._universalInspector) content.innerHTML = app._universalInspector(nd);
          } else if (nd.dataPanelOpen) {
            var dc = document.getElementById(nd.id + '-dc');
            if (dc) dc.innerHTML = app.nodeDataHTML(nd);
          }
        });
        app.endCompute();
      }
      app._graphDirty = false;
      if (typeof app.refreshNodeWarningBadges === 'function') app.refreshNodeWarningBadges();
      if (typeof app.renderWires === 'function') app.renderWires();
    }
    return result;
  };

  app._scheduleAutoRun = function (options) {
    if (app._runMode !== 'auto') return false;
    if (app._isRunningGraph) return false;
    if (typeof app.runGraph !== 'function') return false;
    var opts = options || {};
    var dirtyNodeIds = uniqueNodeIds(opts.dirtyNodeIds);
    if (!app._pendingAutoRun) app._pendingAutoRun = { full: false, dirtyNodeIds: [] };
    if (opts.full || dirtyNodeIds.length === 0) {
      app._pendingAutoRun.full = true;
      app._pendingAutoRun.dirtyNodeIds = [];
    } else if (!app._pendingAutoRun.full) {
      app._pendingAutoRun.dirtyNodeIds = uniqueNodeIds(app._pendingAutoRun.dirtyNodeIds.concat(dirtyNodeIds));
    }
    if (app._autoRunTimer) clearTimeout(app._autoRunTimer);
    app._autoRunTimer = setTimeout(function () {
      var pending = app._pendingAutoRun || { full: true, dirtyNodeIds: [] };
      app._autoRunTimer = null;
      app._pendingAutoRun = null;
      if (app._runMode !== 'auto' || app._isRunningGraph || typeof app.runGraph !== 'function') return;
      try {
        var r = pending.full
          ? app.runGraph()
          : app._runAutoDirtyGraph(pending.dirtyNodeIds);
        if (r && typeof r.then === 'function') r.then(function () {}, function () {});
      } catch (e) { /* auto-run must never break graph editing */ }
    }, 0);
    return true;
  };

  // ── Run button + mode toggle UI ─────────────────────────────────────────
  // The toggle lives next to the existing Run button in the canvas toolbar.
  // The Run button itself is the engine's `#toolbar-run`; we add the mode
  // toggle as a sibling and reflect stale state on the Run button.
  function ensureToggleButton() {
    if (typeof document === 'undefined') return null;
    var existing = document.getElementById('toolbar-runmode');
    if (existing) return existing;
    var runBtn = document.getElementById('toolbar-run');
    if (!runBtn || !runBtn.parentNode) return null;
    var btn = document.createElement('button');
    btn.id = 'toolbar-runmode';
    btn.className = 'canvas-tool-btn';
    btn.style.fontSize = '11px';
    btn.style.fontWeight = '700';
    btn.style.width = 'auto';
    btn.style.minWidth = '32px';
    btn.style.padding = '0 8px';
    btn.addEventListener('click', function () { app.toggleRunMode(); });
    // Place the toggle immediately before the Run button.
    runBtn.parentNode.insertBefore(btn, runBtn);
    return btn;
  }

  // Reflect the current mode + stale state on the toolbar. Safe to call any
  // time (no-ops without a DOM). Stale = manual mode AND graph dirty since the
  // last Run; we highlight the Run button so the user knows to Run.
  app._refreshRunModeUI = function () {
    if (typeof document === 'undefined') return;
    var manual = app._runMode === 'manual';
    var toggle = ensureToggleButton();
    if (toggle) {
      toggle.textContent = manual ? 'Manual' : 'Auto';
      toggle.title = manual
        ? 'Run mode: Manual — edits do not recompute; click Run. Click to switch to Automatic.'
        : 'Run mode: Automatic — recompute on every change. Click to switch to Manual.';
      toggle.style.color = manual ? 'var(--accent-yellow, #f9e2af)' : 'var(--accent-green)';
    }
    var runBtn = document.getElementById('toolbar-run');
    if (runBtn) {
      // Don't fight the engine's cancel-state styling mid-run.
      var stale = manual && !!app._graphDirty;
      runBtn.classList.toggle('run-stale', stale);
      if (stale) {
        runBtn.style.background = 'rgba(249,226,135,0.18)';
        runBtn.style.color = 'var(--accent-yellow, #f9e2af)';
        runBtn.title = 'Run Graph — pending changes since last run';
      } else if (!app._isRunningGraph) {
        runBtn.style.background = '';
        runBtn.style.color = 'var(--accent-green)';
        runBtn.title = 'Run Graph';
      }
    }
  };

  // ── Keep the stale affordance live ──────────────────────────────────────
  // Wrap invalidateCompute (set on edits) and runGraph (clears dirty) so the
  // UI updates without each edit site needing to know about run-modes.
  if (typeof app.invalidateCompute === 'function') {
    var _origInvalidate = app.invalidateCompute.bind(app);
    app.invalidateCompute = function () {
      var prevWireMap = app._runModeLastWireMap || {};
      var r = _origInvalidate();
      var nextWireMap = wireMap();
      var changedRoots = wireChangeRoots(prevWireMap, nextWireMap);
      if (!app._runModeDeserializing && changedRoots.length > 0) {
        app._runModeLastWireMap = nextWireMap;
        app._scheduleAutoRun({ dirtyNodeIds: changedRoots });
      } else if (changedRoots.length > 0) {
        app._runModeLastWireMap = nextWireMap;
      }
      app._refreshRunModeUI();
      return r;
    };
  }

  if (typeof app.runGraph === 'function') {
    var _origRunGraph = app.runGraph.bind(app);
    app.runGraph = function () {
      var result = _origRunGraph();
      var clear = function () { app._refreshRunModeUI(); };
      if (result && typeof result.then === 'function') {
        result.then(clear, clear);
      } else {
        clear();
      }
      return result;
    };
  }

  // ── Persistence — runMode lives in the saved project graph ───────────────
  // Old graphs (no runMode) default to 'auto'. We wrap serialize/deserialize so
  // save-load doesn't need to know about run-modes.
  if (typeof app.serializeGraph === 'function') {
    var _origSerialize = app.serializeGraph.bind(app);
    app.serializeGraph = function () {
      var data = _origSerialize();
      if (data && typeof data === 'object') data.runMode = app._runMode || 'auto';
      return data;
    };
  }
  if (typeof app.deserializeGraph === 'function') {
    var _origDeserialize = app.deserializeGraph.bind(app);
    app.deserializeGraph = function (data) {
      app._runModeDeserializing = true;
      var ok;
      try {
        ok = _origDeserialize(data);
      } finally {
        app._runModeDeserializing = false;
      }
      if (ok) {
        app._applyRunMode(data && data.runMode === 'manual' ? 'manual' : 'auto');
        app._runModeLastWireMap = wireMap();
        app._scheduleAutoRun({ full: true });
      }
      return ok;
    };
  }

  // Initialize: default Automatic, sync `_manualRunMode`, draw the toggle.
  app._applyRunMode('auto');

  return true;
}

export default installRunMode;
