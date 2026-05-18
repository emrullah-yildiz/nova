import { FormulaEval } from '../src/core/formula-eval.js';

function createElementStub() {
  return {
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    style: {},
    children: [],
    textContent: '',
    innerHTML: '',
    value: '',
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    contains() { return false; }
  };
}

beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.document = {
    addEventListener() {},
    getElementById() { return createElementStub(); },
    querySelector() { return createElementStub(); },
    querySelectorAll() { return []; },
    createElement() { return createElementStub(); },
    body: createElementStub()
  };
  globalThis.FormulaEval = FormulaEval;

  globalThis.app = {
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

  const { installEngine } = await import('../src/core/engine.js');
  installEngine(globalThis.app);
});

describe('Engine extended computeNodeValue behavior', () => {
  it('computes formulas inside math-multiply nodes', () => {
    app.nodes = [{ id: 1, type: 'math-multiply', controlValues: { a: '2+3', b: '4' } }];
    app.wires = [];
    expect(app.computeNodeValue(app.nodes[0])).toBe(20);
  });

  it('clamps wired values using default bounds', () => {
    app.nodes = [
      { id: 1, type: 'number-input', controlValues: { val: '5' } },
      { id: 2, type: 'math-clamp', controlValues: { min: '0', max: '1' } }
    ];
    app.wires = [{ fromNode: 1, fromPort: 'result', toNode: 2, toPort: 'value' }];
    expect(app.computeNodeValue(app.nodes[1])).toBe(1);
  });
});
