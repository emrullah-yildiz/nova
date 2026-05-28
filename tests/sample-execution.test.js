import { describe, it, expect, beforeAll } from 'vitest';
import { FormulaEval } from '../src/core/formula-eval.js';
import { Geo } from '../src/geometry/index.js';
import { NODE_TYPE_MAP } from '../src/core/nodes.js';
import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';

function createElementStub() {
  const el = {
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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
  return el;
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

  // Trigger registry merge so modern canonical types and their aliases are
  // present in NODE_TYPE_MAP before installEngine reads it.
  getLiveCoreRegistry();

  const { installEngine } = await import('../src/core/engine.js');
  installEngine(globalThis.app);
});

function isModernNode(node) {
  return node && (!node.metadata || node.metadata.source !== 'legacy-node-library');
}

function buildSampleGraph(example) {
  const created = [];
  let nextId = 1;
  const nodes = [];

  example.nodes.forEach((sampleNode) => {
    const def = NODE_TYPE_MAP[sampleNode.type];
    if (!def) {
      created.push(null);
      return;
    }
    const nd = {
      id: 'n' + nextId++,
      type: sampleNode.type,
      x: sampleNode.x || 0,
      y: sampleNode.y || 0,
      def: {
        ...def,
        inputs: (def.inputs || []).map((inp) => ({ ...inp })),
        outputs: (def.outputs || []).map((out) => ({ ...out }))
      },
      controlValues: {}
    };
    (def.controls || []).forEach((c) => {
      if (c.default !== undefined) nd.controlValues[c.id] = c.default;
    });
    if (sampleNode.controls) {
      Object.keys(sampleNode.controls).forEach((k) => {
        nd.controlValues[k] = sampleNode.controls[k];
      });
    }
    nodes.push(nd);
    created.push(nd);
  });

  // Expand dynamic inputs based on the wires referencing item<N>.
  created.forEach((nd, i) => {
    if (!nd || !nd.def.dynamicInputs) return;
    let maxIdx = nd.def.inputs.length - 1;
    example.wires.forEach((w) => {
      if (w[2] !== i) return;
      const m = /^item(\d+)$/.exec(w[3]);
      if (m && parseInt(m[1], 10) > maxIdx) maxIdx = parseInt(m[1], 10);
    });
    while (nd.def.inputs.length <= maxIdx) {
      const idx = nd.def.inputs.length;
      nd.def.inputs.push({ id: 'item' + idx, name: 'Item ' + idx, type: 'any' });
    }
    nd._dynInputIds = nd.def.inputs.map((inp) => inp.id);
  });

  const wires = [];
  example.wires.forEach((w) => {
    const from = created[w[0]];
    const to = created[w[2]];
    if (!from || !to) return;
    wires.push({ fromNode: from.id, fromPort: w[1], toNode: to.id, toPort: w[3] });
  });

  return { nodes, wires, created };
}

describe('every modern node sample executes end-to-end', () => {
  const registry = getLiveCoreRegistry();
  const modernNodes = registry.listNodes().filter(isModernNode);

  modernNodes.forEach((node) => {
    if (!node.help || !node.help.example) return;

    it(`${node.type} sample produces a defined value at the focal node`, () => {
      const example = node.help.example;
      const app = globalThis.app;

      const { nodes, wires, created } = buildSampleGraph(example);
      app.nodes = nodes;
      app.wires = wires;

      // The focal node is the first sample node whose type matches the
      // documented node. (Some samples reference the focal type more than
      // once when they reuse it as a helper — the first one is the focal.)
      const focalIndex = example.nodes.findIndex((n) => n.type === node.type);
      const focal = created[focalIndex];
      expect(focal, `${node.type}: focal node missing from sample`).toBeTruthy();

      if (app.invalidateCompute) app.invalidateCompute();

      const captured = { warnings: [] };
      const originalWarn = console.warn;
      const originalError = console.error;
      console.warn = (...args) => { captured.warnings.push(args.join(' ')); };
      console.error = (...args) => { captured.warnings.push(args.join(' ')); };

      let result;
      try {
        result = app.computeNodeValue(focal);
      } finally {
        console.warn = originalWarn;
        console.error = originalError;
      }

      expect(result, `${node.type}: focal node returned undefined`).not.toBeUndefined();
      expect(result, `${node.type}: focal node returned null`).not.toBeNull();

      if (typeof result === 'number') {
        expect(Number.isNaN(result), `${node.type}: focal node returned NaN`).toBe(false);
      }

      expect(
        captured.warnings,
        `${node.type}: sample execution produced console warnings/errors: ${captured.warnings.join(' | ')}`
      ).toEqual([]);
    });
  });
});
