import { FormulaEval } from '../src/core/formula-eval.js';
import { NODE_LIBRARY, NODE_TYPE_MAP } from '../src/core/nodes.js';
import { Geo } from '../src/geometry/index.js';
import { buildNodeHelpDoc } from '../src/ui/node-help-docs.js';
import { installNodeHelp } from '../src/ui/node-help.js';

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

function createHelpRuntime() {
  const runtime = {};
  const app = {
    nodes: [],
    addNodeToCanvas() { return null; },
    addWire() {},
    updatePortDots() {}
  };
  installNodeHelp(app, runtime);
  return runtime;
}

function cloneNodeDef(def) {
  return {
    ...def,
    inputs: (def.inputs || []).map(input => ({ ...input })),
    outputs: (def.outputs || []).map(output => ({ ...output })),
    controls: (def.controls || []).map(control => ({ ...control }))
  };
}

function defaultControlValues(def) {
  const values = {};
  (def.controls || []).forEach(control => {
    if (control.default !== undefined) values[control.id] = control.default;
  });
  return values;
}

function dynamicInputIdsFor(example, nodeIndex, def) {
  if (!def.dynamicInputs) return undefined;
  const inputIds = new Set((def.inputs || []).map(input => input.id));
  (example.wires || []).forEach(wire => {
    const toIndex = wire[2];
    const toPort = wire[3];
    if (toIndex === nodeIndex) inputIds.add(toPort);
  });
  return Array.from(inputIds).sort((a, b) => {
    const aNumber = Number((a.match(/\d+$/) || ['0'])[0]);
    const bNumber = Number((b.match(/\d+$/) || ['0'])[0]);
    return aNumber - bNumber;
  });
}

function createRuntimeApp() {
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

function buildExampleGraph(app, helpDoc) {
  const example = helpDoc.example;

  app.nodes = example.nodes.map((exampleNode, index) => {
    const sourceDef = NODE_TYPE_MAP[exampleNode.type];
    const def = cloneNodeDef(sourceDef);
    const node = {
      id: 'node-' + index,
      type: exampleNode.type,
      def,
      controlValues: {
        ...defaultControlValues(def),
        ...(exampleNode.controls || {})
      }
    };
    const dynamicIds = dynamicInputIdsFor(example, index, def);
    if (dynamicIds) node._dynInputIds = dynamicIds;
    return node;
  });

  app.wires = (example.wires || []).map(wire => ({
    fromNode: 'node-' + wire[0],
    fromPort: wire[1],
    toNode: 'node-' + wire[2],
    toPort: wire[3]
  }));
}

function outputValueFor(node, outputId, computedValue) {
  if (node._portValues && node._portValues[outputId] !== undefined) {
    return node._portValues[outputId];
  }
  if (computedValue && typeof computedValue === 'object' && computedValue[outputId] !== undefined) {
    return computedValue[outputId];
  }
  if ((node.def.outputs || []).length === 1) return computedValue;
  return undefined;
}

function expectNodeOutputs(node, computedValue) {
  const missing = (node.def.outputs || [])
    .map(output => output.id)
    .filter(outputId => outputValueFor(node, outputId, computedValue) === undefined);

  expect(missing).toEqual([]);
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
  globalThis.Geo = Geo;
});

describe('curves category node execution', () => {
  const helpRuntime = createHelpRuntime();
  const curvesCategory = NODE_LIBRARY.categories.find(category => category.id === 'curves');

  it('produces declared outputs for every curve node help sample', async () => {
    const { installEngine } = await import('../src/core/engine.js');
    const failures = [];

    curvesCategory.nodes.forEach(nodeDef => {
      const app = createRuntimeApp();
      installEngine(app);

      const helpDoc = buildNodeHelpDoc(nodeDef, helpRuntime.NODE_HELP[nodeDef.type]);
      buildExampleGraph(app, helpDoc);

      const targetIndex = helpDoc.example.nodes
        .map((node, index) => ({ node, index }))
        .filter(item => item.node.type === nodeDef.type)
        .map(item => item.index)
        .pop();
      const targetNode = app.nodes[targetIndex];
      const computedValue = app.computeNodeValue(targetNode);

      try {
        expect(computedValue).not.toBeUndefined();
        expectNodeOutputs(targetNode, computedValue);
      } catch (error) {
        failures.push(nodeDef.type + ': ' + error.message);
      }
    });

    expect(failures).toEqual([]);
  });
});
