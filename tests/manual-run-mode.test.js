import { FormulaEval } from '../src/core/formula-eval.js';

function createAppStub() {
  return {
    nodes: [],
    wires: [],
    approveCode() {},
    runEditedCode() {},
    ctxAction() {},
    showContextMenu() {},
    renderWires() {},
    toggleNodeLibrary() {},
    toggleChat() {},
    fitAll() {},
    runGraph() {},
    initKeyboard() {},
    initCanvasEvents() {},
    initLandingChat() {},
    renderTemplates() {},
    renderRecentProjects() {},
    renderNodeLibrary() {}
  };
}

describe('manual run mode', () => {
  it('does not compute on read before Run and keeps stale values until the next Run', async () => {
    globalThis.window = globalThis;
    globalThis.document = {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, classList: { add() {}, remove() {}, toggle() {} } }; }
    };
    globalThis.FormulaEval = FormulaEval;
    const app = createAppStub();
    globalThis.app = app;

    const { installEngine } = await import('../src/core/engine.js');
    installEngine(app);
    app._manualRunMode = true;

    const nd = { id: 'n1', type: 'number-input', controlValues: { val: '10' }, def: { inputs: [], outputs: [{ id: 'value', name: 'Value', type: 'number' }], controls: [] } };
    app.nodes = [nd];

    expect(app.computeNodeValue(nd)).toBeUndefined();
    expect(app._hasRun).toBe(false);

    app._isRunningGraph = true;
    nd._lastComputedValue = app.computeNodeValue(nd);
    app._commitRunSnapshot();
    app._isRunningGraph = false;

    expect(app.computeNodeValue(nd)).toBe(10);

    nd.controlValues.val = '25';
    app.invalidateCompute();
    expect(app.computeNodeValue(nd)).toBe(10);

    app._isRunningGraph = true;
    nd._lastComputedValue = app.computeNodeValue(nd);
    app._commitRunSnapshot();
    app._isRunningGraph = false;

    expect(app.computeNodeValue(nd)).toBe(25);
  });
});
