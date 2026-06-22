// Run modes (Automatic | Manual) — app/UI-level policy in src/ui/run-mode.js.
// These tests drive the real installRunMode wiring against the real engine
// mechanism, in a jsdom-ish stub, asserting:
//   • default mode is 'auto' (legacy live recompute),
//   • Manual: a control/wire change does NOT recompute; Run does,
//   • the mode persists through serialize → deserialize (and old graphs → auto),
//   • Manual → Automatic triggers a catch-up recompute.
import { FormulaEval } from '../src/core/formula-eval.js';

function makeButton(id) {
  return {
    id,
    style: {},
    textContent: '',
    title: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    parentNode: { insertBefore() {} }
  };
}

function installDom() {
  const els = { 'toolbar-run': makeButton('toolbar-run') };
  globalThis.window = globalThis;
  globalThis.document = {
    getElementById(id) { return els[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return makeButton('created'); }
  };
  return els;
}

function createAppStub() {
  return {
    nodes: [],
    wires: [],
    _projectName: 'T',
    zoom: 1, panX: 0, panY: 0, nextNodeId: 2,
    renderWires() {},
    addWire(fromNode, fromPort, toNode, toPort) {
      this.wires = this.wires.filter(w => !(w.toNode === toNode && w.toPort === toPort));
      this.wires.push({ fromNode, fromPort, toNode, toPort });
      if (this.invalidateCompute) this.invalidateCompute();
    },
    runGraph() {},
    approveCode() {},
    runEditedCode() {},
    ctxAction() {},
    showContextMenu() {},
    // save-load surface the run-mode wrapper hooks into
    serializeGraph() {
      return { version: 2, name: this._projectName, nodes: [], wires: [] };
    },
    deserializeGraph(data) { this._deserialized = data; return !!(data && data.nodes); },
    // inspector/render hooks invoked by the engine runGraph
    _universalInspector() { return ''; },
    nodeDataHTML() { return ''; },
    generateFullScript() { return ''; },
    showCodeViewer() {},
    _renderFromCompute() {},
    _prepareLiveRevitGeometries() { return Promise.resolve(); },
    addAIMessage() {},
    refreshNodeWarningBadges() {}
  };
}

async function setup() {
  installDom();
  globalThis.FormulaEval = FormulaEval;
  globalThis.Viewer3D = {
    isInitialized: true,
    geometryGroup: { children: [], add() {}, remove() {} },
    _sceneItems: [],
    _selectedItem: null,
    _needsRebuild: false,
    init() {},
    clearGeometry() {},
    addTaggedGeo() {},
    buildFromGraph() {},
    fitAll() {},
    _renderGeoList() {}
  };
  const app = createAppStub();
  globalThis.app = app;

  const { installEngine } = await import('../src/core/engine.js');
  installEngine(app);
  const { installRunMode } = await import('../src/ui/run-mode.js');
  installRunMode(app);
  return app;
}

function numberNode(val) {
  return {
    id: 'n1', type: 'number-input',
    controlValues: { val: String(val) },
    def: { inputs: [], outputs: [{ id: 'value', name: 'Value', type: 'number' }], controls: [] }
  };
}

function waitForAutoRun() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

describe('run modes — policy module', () => {
  it('defaults to Automatic: edits recompute live', async () => {
    const app = await setup();
    expect(app.runMode).toBe('auto');
    expect(app._manualRunMode).toBe(false);

    const nd = numberNode(10);
    app.nodes = [nd];
    expect(app.computeNodeValue(nd)).toBe(10);

    // A control change is reflected immediately (live recompute).
    nd.controlValues.val = '25';
    app.invalidateCompute();
    expect(app.computeNodeValue(nd)).toBe(25);
  });

  it('Manual: a control/wire change does NOT recompute; Run does', async () => {
    const app = await setup();
    const nd = numberNode(10);
    app.nodes = [nd];

    app.setRunMode('manual');
    expect(app.runMode).toBe('manual');
    expect(app._manualRunMode).toBe(true);

    // Establish a baseline run snapshot at 10.
    await app.runGraph();
    expect(app.computeNodeValue(nd)).toBe(10);

    // Edit + invalidate → must stay stale (still 10), and the graph is dirty.
    nd.controlValues.val = '25';
    app.invalidateCompute();
    expect(app._graphDirty).toBe(true);
    expect(app.computeNodeValue(nd)).toBe(10);

    // Explicit Run recomputes and clears the stale flag.
    await app.runGraph();
    expect(app.computeNodeValue(nd)).toBe(25);
    expect(app._graphDirty).toBe(false);
  });

  it('persists runMode through serialize → deserialize; old graphs default to auto', async () => {
    const app = await setup();
    app.setRunMode('manual');

    const data = app.serializeGraph();
    expect(data.runMode).toBe('manual');

    // Loading that graph restores Manual.
    app._applyRunMode('auto');
    expect(app.runMode).toBe('auto');
    app.deserializeGraph(data);
    expect(app.runMode).toBe('manual');

    // An old graph without runMode loads as Automatic.
    app.deserializeGraph({ version: 2, nodes: [], wires: [] });
    expect(app.runMode).toBe('auto');
  });

  it('Manual → Automatic triggers a catch-up recompute', async () => {
    const app = await setup();
    const nd = numberNode(10);
    app.nodes = [nd];

    app.setRunMode('manual');
    await app.runGraph();          // snapshot 10
    nd.controlValues.val = '42';
    app.invalidateCompute();
    expect(app.computeNodeValue(nd)).toBe(10); // stale in manual

    // Switching back to Automatic catches up: live compute returns 42.
    app.setRunMode('auto');
    expect(app._manualRunMode).toBe(false);
    expect(app.computeNodeValue(nd)).toBe(42);
  });

  it('Automatic: opening a project runs the graph once after load', async () => {
    const app = await setup();
    let runs = 0;
    app.runGraph = function() {
      runs++;
      return Promise.resolve({ completed: 0, failed: 0, errors: new Map() });
    };

    app.deserializeGraph({
      version: 2,
      nodes: [{ id: 'n1', type: 'missing-type', controlValues: {} }],
      wires: [],
      runMode: 'auto'
    });
    await waitForAutoRun();

    expect(runs).toBe(1);
  });

  it('Automatic: wire connect and disconnect trigger graph runs', async () => {
    const app = await setup();
    let runs = 0;
    app.runGraph = function() {
      runs++;
      return Promise.resolve({ completed: 0, failed: 0, errors: new Map() });
    };

    app.addWire('source', 'value', 'target', 'input');
    await waitForAutoRun();
    expect(runs).toBe(1);

    app.wires = [];
    app.invalidateCompute();
    await waitForAutoRun();
    expect(runs).toBe(2);
  });

  it('Automatic: wire edits prefer the dirty v2 runner over a full graph run', async () => {
    const app = await setup();
    let fullRuns = 0;
    const dirtyRuns = [];
    let renderOptions = null;
    app.runGraph = function() {
      fullRuns++;
      return Promise.resolve({ completed: 0, failed: 0, errors: new Map() });
    };
    app._executionEngineV2 = {
      runDirtyNodes(ids) {
        dirtyRuns.push(ids.slice());
        return Promise.resolve({
          completed: ids.length,
          failed: 0,
          errors: new Map(),
          dirtyNodeIds: ids.concat('downstream')
        });
      }
    };
    app._renderFromCompute = function(opts) { renderOptions = opts; };

    app.addWire('source', 'value', 'target', 'input');
    await waitForAutoRun();

    expect(fullRuns).toBe(0);
    expect(dirtyRuns).toEqual([['target']]);
    expect(renderOptions.computeNodeIds).toEqual([]);
    expect(renderOptions.keepCamera).toBe(true);
  });

  it('Manual: project load and wire edits stay pending until Run', async () => {
    const app = await setup();
    let runs = 0;
    app.runGraph = function() {
      runs++;
      return Promise.resolve({ completed: 0, failed: 0, errors: new Map() });
    };

    app.deserializeGraph({ version: 2, nodes: [], wires: [], runMode: 'manual' });
    app.addWire('source', 'value', 'target', 'input');
    await waitForAutoRun();

    expect(app.runMode).toBe('manual');
    expect(runs).toBe(0);
  });
});
