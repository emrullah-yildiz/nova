import fs from 'fs';
import path from 'path';

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

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.document = {
    addEventListener(name, cb) {
      if (name === 'DOMContentLoaded') cb();
    },
    getElementById() { return createElementStub(); },
    querySelector() { return createElementStub(); },
    querySelectorAll() { return []; },
    createElement() { return createElementStub(); },
    body: createElementStub()
  };

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

  const formulaPath = path.resolve(process.cwd(), 'formula-eval.js');
  eval(fs.readFileSync(formulaPath, 'utf8'));

  const enginePath = path.resolve(process.cwd(), 'engine.js');
  const code = fs.readFileSync(enginePath, 'utf8');
  eval(code);
});

describe('Engine computeNodeValue', () => {
  it('computes basic number-input controls', () => {
    app.nodes = [{ id: 1, type: 'number-input', controlValues: { val: '123' } }];
    app.wires = [];
    expect(app.computeNodeValue(app.nodes[0])).toBe(123);
  });

  it('propagates values through math-add nodes', () => {
    app.nodes = [
      { id: 1, type: 'number-input', controlValues: { val: '3' } },
      { id: 2, type: 'number-input', controlValues: { val: '4' } },
      { id: 3, type: 'math-add', controlValues: { a: 0, b: 0 } }
    ];
    app.wires = [
      { fromNode: 1, fromPort: 'result', toNode: 3, toPort: 'a' },
      { fromNode: 2, fromPort: 'result', toNode: 3, toPort: 'b' }
    ];
    expect(app.computeNodeValue(app.nodes[2])).toBe(7);
  });

  it('evaluates formula strings when provided as control values', () => {
    app.nodes = [
      { id: 2, type: 'math-add', controlValues: { a: '1+2', b: '3*2' } }
    ];
    app.wires = [];
    expect(app.computeNodeValue(app.nodes[0])).toBe(9);
  });
});
