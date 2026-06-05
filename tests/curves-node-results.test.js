import { describe, it, expect, beforeAll } from 'vitest';
import { FormulaEval } from '../src/core/formula-eval.js';
import { NODE_LIBRARY, NODE_TYPE_MAP } from '../src/core/nodes.js';
import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { pointAtTExtrapolated } from '../src/geometry/curve-eval.js';

// Ensure modern category nodes and their aliases are registered into
// NODE_TYPE_MAP so legacy NODE_HELP examples that reference aliases
// like "list-create" resolve correctly.
getLiveCoreRegistry();
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

// ─── Curve.PointAtParameter extrapolation ────────────────────────────────────
//
// pointAtTExtrapolated must return a point BEYOND the endpoint when t<0 or t>1,
// not the clamped endpoint. We use a Line3 (from (0,0,0) to (10,0,0)) so the
// expected extrapolated positions are trivially computable.
//
// A Line3 from start=(0,0,0) to end=(10,0,0) has:
//   pointAt(0) = (0,0,0), pointAt(1) = (10,0,0), tangent = (1,0,0)
//   arc-speed near t=0: distance(pointAt(DT) - pointAt(0)) / DT = 10/1 = 10
//   so extrapolation: p0 + tangent * speed * t = (10*t, 0, 0)
//   e.g. t=-0.5 → (-5, 0, 0), t=1.5 → (15, 0, 0)

describe('Curve.PointAtParameter extrapolation beyond [0,1]', () => {
  let Geo;

  beforeAll(async () => {
    const mod = await import('../src/geometry/index.js');
    Geo = mod.Geo;
    globalThis.Geo = Geo;
  });

  function makeLine(x0, y0, z0, x1, y1, z1) {
    return new Geo.Line3(new Geo.Point3(x0, y0, z0), new Geo.Point3(x1, y1, z1));
  }

  it('t=0.5 (in-domain) returns the true midpoint — no regression', () => {
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const p = pointAtTExtrapolated(line, 0.5);
    expect(p.x).toBeCloseTo(5, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('t=0 returns the start point exactly', () => {
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const p = pointAtTExtrapolated(line, 0);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('t=1 returns the end point exactly', () => {
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const p = pointAtTExtrapolated(line, 1);
    expect(p.x).toBeCloseTo(10, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('t=1.5 extrapolates PAST the end — point is NOT the same as t=1', () => {
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const pEnd = pointAtTExtrapolated(line, 1);
    const pBeyond = pointAtTExtrapolated(line, 1.5);
    // The extrapolated point must differ from the endpoint (old clamp behaviour returned pEnd).
    expect(pBeyond.x).not.toBeCloseTo(pEnd.x, 1);
    // And must be beyond: x > 10 for a rightward line.
    expect(pBeyond.x).toBeGreaterThan(10);
  });

  it('t=-0.5 extrapolates BEFORE the start — point is NOT the same as t=0', () => {
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const pStart = pointAtTExtrapolated(line, 0);
    const pBefore = pointAtTExtrapolated(line, -0.5);
    expect(pBefore.x).not.toBeCloseTo(pStart.x, 1);
    // For a leftward line starting at 0: x < 0.
    expect(pBefore.x).toBeLessThan(0);
  });

  it('t=1.5 on a unit-length line → point at x≈15 (speed=10 per unit t, excess=0.5)', () => {
    // line from (0,0,0) to (10,0,0), length=10.  Speed per unit t = 10.
    // Extrapolation: p1=(10,0,0) + tangent*(1,0,0) * 10 * 0.5 = (15, 0, 0).
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const p = pointAtTExtrapolated(line, 1.5);
    expect(p.x).toBeCloseTo(15, 2);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('t=-0.5 on a unit-length line → point at x≈-5', () => {
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const p = pointAtTExtrapolated(line, -0.5);
    expect(p.x).toBeCloseTo(-5, 2);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('extrapolation is monotone: t=-1 is farther from start than t=-0.5', () => {
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const pFarther = pointAtTExtrapolated(line, -1);
    const pCloser = pointAtTExtrapolated(line, -0.5);
    expect(pFarther.x).toBeLessThan(pCloser.x);
  });

  it('Curve.PointAtParameter node execute returns extrapolated point for t=1.5', () => {
    getLiveCoreRegistry();
    const nodeDef = NODE_TYPE_MAP['Curve.PointAtParameter'];
    expect(nodeDef).toBeTruthy();
    const line = makeLine(0, 0, 0, 10, 0, 0);
    const result = nodeDef.execute({}, { curve: line, t: 1.5 });
    expect(result.point).toBeTruthy();
    expect(result.point.x).toBeGreaterThan(10);
  });
});
