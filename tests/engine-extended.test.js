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
  eval(fs.readFileSync(enginePath, 'utf8'));
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
