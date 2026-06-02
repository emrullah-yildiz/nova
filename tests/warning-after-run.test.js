import { describe, it, expect } from 'vitest';

// A node placed AFTER a Run must not be treated as part of that run — that was
// the cause of "first placed node shows a warning". _commitRunSnapshot stamps
// each participating node with the run version; the warning gate compares it to
// app._lastRunVersion, so a freshly placed node (no stamp) is excluded.
function createAppStub() {
  return {
    nodes: [], wires: [],
    approveCode() {}, runEditedCode() {}, ctxAction() {}, showContextMenu() {},
    renderWires() {}, toggleNodeLibrary() {}, toggleChat() {}, fitAll() {},
    runGraph() {}, initKeyboard() {}, initCanvasEvents() {}, initLandingChat() {},
    renderTemplates() {}, renderRecentProjects() {}, renderNodeLibrary() {}
  };
}

describe('run-version stamping (warnings only for nodes in the latest run)', () => {
  it('stamps run-participating nodes and excludes nodes added afterwards', async () => {
    globalThis.window = globalThis;
    globalThis.document = {
      getElementById() { return null; }, querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, classList: { add() {}, remove() {}, toggle() {} } }; }
    };
    const app = createAppStub();
    globalThis.app = app;

    const { installEngine } = await import('../src/core/engine.js');
    installEngine(app);

    const a = { id: 'n1', type: 'number-input', controlValues: { val: '10' }, def: { inputs: [], outputs: [{ id: 'value', type: 'number' }], controls: [] } };
    app.nodes = [a];

    app._isRunningGraph = true;
    a._lastComputedValue = app.computeNodeValue(a);
    app._commitRunSnapshot();
    app._isRunningGraph = false;

    // The node present during the run is stamped with the current run version.
    expect(a._ranAtVersion).toBe(app._lastRunVersion);

    // A node placed AFTER the run has no stamp → excluded from "latest run".
    const b = { id: 'n2', type: 'geo-point', controlValues: {}, def: { inputs: [], outputs: [{ id: 'point', type: 'point' }], controls: [] } };
    app.nodes.push(b);
    expect(b._ranAtVersion).toBeUndefined();
    expect(b._ranAtVersion === app._lastRunVersion).toBe(false);

    // After the next run it participates and is stamped.
    app._isRunningGraph = true;
    app._commitRunSnapshot();
    app._isRunningGraph = false;
    expect(b._ranAtVersion).toBe(app._lastRunVersion);
    expect(a._ranAtVersion).toBe(app._lastRunVersion);
  });
});
