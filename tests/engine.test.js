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

  it('renders every list item in the data inspector', () => {
    const html = app.formatValue(Array.from({ length: 20 }, (_, index) => index));

    expect(html).toContain('data-list-view');
    expect(html).toContain('data-list-body');
    expect(html).toContain('(20)');
    expect(html).toContain('>19<');
    expect(html).not.toContain('more</div>');
  });

  it('prefetches live Revit geometry for Element.Geometries nodes', async () => {
    const liveMesh = { _type: 'Mesh3', vertices: [1], faces: [] };
    const previousBridge = globalThis.RevitBridge;
    let requestedElements = null;
    globalThis.RevitBridge = {
      getAllElements() {
        return [{ id: 3001, identity: { sourceId: '3001' }, category: 'Walls' }];
      },
      async getLiveGeometries(elements) {
        requestedElements = elements;
        return [liveMesh];
      },
      getGeometries() {
        return [];
      }
    };
    app.nodes = [
      { id: 'source', type: 'revit-all-elements-view', controlValues: {} },
      { id: 'geo', type: 'revit-element-geometries', controlValues: {} }
    ];
    app.wires = [{ fromNode: 'source', fromPort: 'elements', toNode: 'geo', toPort: 'elements' }];

    try {
      await app._prepareLiveRevitGeometries();
      const result = app.computeNodeValue(app.nodes[1]);

      expect(requestedElements).toHaveLength(1);
      expect(result).toEqual({ meshes: [liveMesh], count: 1 });
    } finally {
      if (previousBridge === undefined) delete globalThis.RevitBridge;
      else globalThis.RevitBridge = previousBridge;
    }
  });

  it('reads cached Revit parameter values', () => {
    const previousBridge = globalThis.RevitBridge;
    globalThis.RevitBridge = {
      getAllElements() {
        return [
          { id: 1, params: { Comments: 'A' } },
          { id: 2, params: { Comments: 'B' } }
        ];
      },
      getParameterValues(elements, parameterName) {
        return elements.map(element => element.params[parameterName] ?? null);
      }
    };
    app.nodes = [
      { id: 'source', type: 'revit-all-elements-view', controlValues: {} },
      {
        id: 'params',
        type: 'revit-get-parameter-values',
        controlValues: { parameterName: 'Comments' }
      }
    ];
    app.wires = [{ fromNode: 'source', fromPort: 'elements', toNode: 'params', toPort: 'elements' }];

    try {
      const result = app.computeNodeValue(app.nodes[1]);

      expect(result).toEqual({ values: ['A', 'B'], count: 2 });
    } finally {
      if (previousBridge === undefined) delete globalThis.RevitBridge;
      else globalThis.RevitBridge = previousBridge;
    }
  });

  it('prefetches live Revit parameter writes for SetParameterValues nodes', async () => {
    const previousBridge = globalThis.RevitBridge;
    let requestedValue = null;
    globalThis.RevitBridge = {
      getAllElements() {
        return [{ id: 10, identity: { sourceId: '10' }, params: { Comments: '' } }];
      },
      async setLiveParameterValues(elements, parameterName, value) {
        requestedValue = value;
        return elements.map(element => ({
          elementId: element.identity.sourceId,
          parameterName,
          value,
          ok: true
        }));
      }
    };
    app.nodes = [
      { id: 'source', type: 'revit-all-elements-view', controlValues: {} },
      {
        id: 'set',
        type: 'revit-set-parameter-values',
        controlValues: { parameterName: 'Comments', value: 'Updated' }
      }
    ];
    app.wires = [{ fromNode: 'source', fromPort: 'elements', toNode: 'set', toPort: 'elements' }];

    try {
      await app._prepareLiveRevitGeometries();
      const result = app.computeNodeValue(app.nodes[1]);

      expect(requestedValue).toBe('Updated');
      expect(result.count).toBe(1);
      expect(result.success).toBe(true);
      expect(result.results[0].value).toBe('Updated');
    } finally {
      if (previousBridge === undefined) delete globalThis.RevitBridge;
      else globalThis.RevitBridge = previousBridge;
    }
  });
});
