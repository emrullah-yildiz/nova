import { FormulaEval } from '../src/core/formula-eval.js';
import { hostRegistry } from '../src/hosts/HostRegistry.js';

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

  it('applies shortest lacing in legacy math nodes', () => {
    app.nodes = [
      { id: 'a1', type: 'number-input', controlValues: { val: '1' } },
      { id: 'a2', type: 'number-input', controlValues: { val: '2' } },
      { id: 'a3', type: 'number-input', controlValues: { val: '3' } },
      { id: 'b1', type: 'number-input', controlValues: { val: '10' } },
      { id: 'b2', type: 'number-input', controlValues: { val: '20' } },
      { id: 'list-a', type: 'list-create', controlValues: {}, _dynInputIds: ['item0', 'item1', 'item2'] },
      { id: 'list-b', type: 'list-create', controlValues: {}, _dynInputIds: ['item0', 'item1'] },
      { id: 'sum', type: 'math-add', controlValues: { a: '0', b: '0', _lacingMode: 'shortest' } }
    ];
    app.wires = [
      { fromNode: 'a1', fromPort: 'value', toNode: 'list-a', toPort: 'item0' },
      { fromNode: 'a2', fromPort: 'value', toNode: 'list-a', toPort: 'item1' },
      { fromNode: 'a3', fromPort: 'value', toNode: 'list-a', toPort: 'item2' },
      { fromNode: 'b1', fromPort: 'value', toNode: 'list-b', toPort: 'item0' },
      { fromNode: 'b2', fromPort: 'value', toNode: 'list-b', toPort: 'item1' },
      { fromNode: 'list-a', fromPort: 'list', toNode: 'sum', toPort: 'a' },
      { fromNode: 'list-b', fromPort: 'list', toNode: 'sum', toPort: 'b' }
    ];

    expect(app.computeNodeValue(app.nodes[7])).toEqual([11, 22]);
  });

  it('applies longest lacing overrides in legacy math nodes', () => {
    app.nodes = [
      { id: 'a1', type: 'number-input', controlValues: { val: '1' } },
      { id: 'a2', type: 'number-input', controlValues: { val: '2' } },
      { id: 'a3', type: 'number-input', controlValues: { val: '3' } },
      { id: 'b1', type: 'number-input', controlValues: { val: '10' } },
      { id: 'b2', type: 'number-input', controlValues: { val: '20' } },
      { id: 'list-a', type: 'list-create', controlValues: {}, _dynInputIds: ['item0', 'item1', 'item2'] },
      { id: 'list-b', type: 'list-create', controlValues: {}, _dynInputIds: ['item0', 'item1'] },
      { id: 'sum', type: 'math-add', controlValues: { a: '0', b: '0', _lacingMode: 'longest' } }
    ];
    app.wires = [
      { fromNode: 'a1', fromPort: 'value', toNode: 'list-a', toPort: 'item0' },
      { fromNode: 'a2', fromPort: 'value', toNode: 'list-a', toPort: 'item1' },
      { fromNode: 'a3', fromPort: 'value', toNode: 'list-a', toPort: 'item2' },
      { fromNode: 'b1', fromPort: 'value', toNode: 'list-b', toPort: 'item0' },
      { fromNode: 'b2', fromPort: 'value', toNode: 'list-b', toPort: 'item1' },
      { fromNode: 'list-a', fromPort: 'list', toNode: 'sum', toPort: 'a' },
      { fromNode: 'list-b', fromPort: 'list', toNode: 'sum', toPort: 'b' }
    ];

    expect(app.computeNodeValue(app.nodes[7])).toEqual([11, 22, 23]);
  });

  it('groups cross product lacing by the first input list in legacy math nodes', () => {
    app.nodes = [
      { id: 'a1', type: 'number-input', controlValues: { val: '1' } },
      { id: 'a2', type: 'number-input', controlValues: { val: '2' } },
      { id: 'b1', type: 'number-input', controlValues: { val: '10' } },
      { id: 'b2', type: 'number-input', controlValues: { val: '20' } },
      { id: 'b3', type: 'number-input', controlValues: { val: '30' } },
      { id: 'list-a', type: 'list-create', controlValues: {}, _dynInputIds: ['item0', 'item1'] },
      { id: 'list-b', type: 'list-create', controlValues: {}, _dynInputIds: ['item0', 'item1', 'item2'] },
      { id: 'sum', type: 'math-add', controlValues: { a: '0', b: '0', _lacingMode: 'crossProduct' } }
    ];
    app.wires = [
      { fromNode: 'a1', fromPort: 'value', toNode: 'list-a', toPort: 'item0' },
      { fromNode: 'a2', fromPort: 'value', toNode: 'list-a', toPort: 'item1' },
      { fromNode: 'b1', fromPort: 'value', toNode: 'list-b', toPort: 'item0' },
      { fromNode: 'b2', fromPort: 'value', toNode: 'list-b', toPort: 'item1' },
      { fromNode: 'b3', fromPort: 'value', toNode: 'list-b', toPort: 'item2' },
      { fromNode: 'list-a', fromPort: 'list', toNode: 'sum', toPort: 'a' },
      { fromNode: 'list-b', fromPort: 'list', toNode: 'sum', toPort: 'b' }
    ];

    expect(app.computeNodeValue(app.nodes[7])).toEqual([
      [11, 21, 31],
      [12, 22, 32]
    ]);
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

  it('computes host-agnostic Host.GetElements through the active adapter', () => {
    const previous = hostRegistry.get('test-host');
    hostRegistry.register({
      id: 'test-host',
      getElements(query) {
        return [{ id: 'a', category: query.category }];
      }
    });

    app.nodes = [
      {
        id: 'host',
        type: 'host-get-elements',
        controlValues: { host: 'test-host', category: 'Walls' }
      }
    ];
    app.wires = [];

    try {
      expect(app.computeNodeValue(app.nodes[0])).toEqual({
        elements: [{ id: 'a', category: 'Walls' }],
        count: 1,
        host: 'test-host'
      });
    } finally {
      hostRegistry.unregister('test-host');
      if (previous) hostRegistry.register(previous);
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

  it('prefetches live Revit geometry sends for SendGeometry nodes', async () => {
    const previousBridge = globalThis.RevitBridge;
    const mesh = { _type: 'Mesh3', vertices: [], faces: [] };
    let sendOptions = null;
    globalThis.RevitBridge = {
      async sendGeometry(geometry, identity, options) {
        sendOptions = options;
        return {
          ok: geometry === mesh,
          data: { directShapeId: '9001' }
        };
      }
    };
    app.nodes = [
      { id: 'mesh', type: 'custom-code', controlValues: {}, _pyResults: { mesh } },
      {
        id: 'send',
        type: 'revit-send-geometry',
        controlValues: {
          category: 'Generic Models',
          name: 'Nova Test'
        }
      }
    ];
    app.wires = [{ fromNode: 'mesh', fromPort: 'mesh', toNode: 'send', toPort: 'geometry' }];

    try {
      await app._prepareLiveRevitGeometries();
      const result = app.computeNodeValue(app.nodes[1]);

      expect(sendOptions.category).toBe('Generic Models');
      expect(sendOptions.name).toBe('Nova Test');
      expect(result).toEqual({
        result: { ok: true, data: { directShapeId: '9001' } },
        elementId: '9001',
        success: true
      });
    } finally {
      if (previousBridge === undefined) delete globalThis.RevitBridge;
      else globalThis.RevitBridge = previousBridge;
    }
  });
});
