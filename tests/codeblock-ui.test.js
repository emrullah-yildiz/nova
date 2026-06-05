// @vitest-environment jsdom
//
// Custom.CodeBlock UI half (Switch). Covers the on-node inline editor, dynamic
// ports re-derived on commit via resolveCodeBlockPorts, the auto-grow sizing
// (no scrollbars), the deprecated-node hiding, the Formula→CodeBlock load-time
// migration, the Series preset, and the desugared export codegen — all on the
// pure/owned UI surfaces, with a lightweight fake app where the full bootstrap
// isn't needed.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  installCodeBlockNode,
  isCodeBlockNode,
  codeBlockWidth,
  autoGrowCodeBlock,
  CB_MIN_W,
  CB_MAX_W
} from '../src/ui/codeblock-node.js';
import { desugarSeries } from '../src/runtime/codeblock-syntax.js';
import { resolveCodeBlockPorts } from '../src/runtime/python-port-decl.js';
import { migrateNodeType, isDeprecatedType } from '../src/core/node-versions.js';
import { customNodes } from '../src/nodes/categories/custom.js';
import app from '../src/app/app.js';

// A minimal fake app exposing only what the CodeBlock editor touches.
function makeFakeApp() {
  return {
    nodes: [],
    wires: [],
    invalidateCompute() { this._invalidated = (this._invalidated || 0) + 1; },
    renderWires() { this._wiresRendered = (this._wiresRendered || 0) + 1; },
    onPortDown() {},
    selectNode() {}
  };
}

// Build a rendered node card with the expected `.node-body` the editor fills.
function makeNodeEl(id) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'node';
  const body = document.createElement('div');
  body.className = 'node-body';
  el.appendChild(body);
  document.body.appendChild(el);
  return el;
}

function makeCodeBlockNode(id, code) {
  return {
    id,
    type: 'Custom.CodeBlock',
    version: 2,
    controlValues: { code },
    def: { name: 'Custom.CodeBlock', controls: [{ id: 'code', default: 'Result = x + y' }], inputs: [], outputs: [] }
  };
}

describe('isCodeBlockNode', () => {
  it('claims v2 Custom.CodeBlock / custom-codeblock', () => {
    expect(isCodeBlockNode({ type: 'Custom.CodeBlock', version: 2 })).toBe(true);
    expect(isCodeBlockNode({ type: 'custom-codeblock', version: 2 })).toBe(true);
    expect(isCodeBlockNode({ type: 'Custom.CodeBlock' })).toBe(true); // version absent → not v1
  });

  it('does NOT claim v1 (legacy JS Custom.Code) or other types', () => {
    expect(isCodeBlockNode({ type: 'Custom.CodeBlock', version: 1 })).toBe(false);
    expect(isCodeBlockNode({ type: 'Custom.Python', version: 2 })).toBe(false);
    expect(isCodeBlockNode(null)).toBe(false);
  });
});

describe('codeBlockWidth — longest line, clamped MIN..MAX', () => {
  it('a short line clamps to the minimum width', () => {
    expect(codeBlockWidth('a=1')).toBe(CB_MIN_W);
  });

  it('a very long line clamps to the maximum width (soft-wrap, no scrollbar)', () => {
    const long = 'x'.repeat(400);
    expect(codeBlockWidth(long)).toBe(CB_MAX_W);
  });

  it('width tracks the LONGEST line of a multi-line block', () => {
    const w1 = codeBlockWidth('a = 1\nb = 2');
    const w2 = codeBlockWidth('a = 1\n' + 'z'.repeat(60));
    expect(w2).toBeGreaterThan(w1);
    expect(w2).toBeLessThanOrEqual(CB_MAX_W);
  });
});

describe('autoGrowCodeBlock — no scrollbars, grows to content', () => {
  it('sets overflow:hidden styling intent and sizes height from scrollHeight', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    // jsdom reports scrollHeight 0; stub it so we can assert the height assignment.
    Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => 84 });
    ta.value = 'a = 1\nb = 2\nc = 3';
    autoGrowCodeBlock(ta, null);
    expect(ta.style.height).toBe('84px');
    // width is clamped within range
    const w = parseInt(ta.style.width, 10);
    expect(w).toBeGreaterThanOrEqual(CB_MIN_W);
    expect(w).toBeLessThanOrEqual(CB_MAX_W);
  });
});

describe('enhanceCodeBlockNode — inline editor + ports from code', () => {
  let app;
  beforeEach(() => {
    document.body.innerHTML = '';
    app = makeFakeApp();
    installCodeBlockNode(app);
  });

  it('renders a single auto-grow textarea (no scrollbars) on the node body', () => {
    const nd = makeCodeBlockNode('n1', 'Result = x + y');
    app.nodes.push(nd);
    const el = makeNodeEl('n1');
    app.enhanceCodeBlockNode(nd, el);
    const tas = el.querySelectorAll('textarea.cb-editor');
    expect(tas.length).toBe(1);
    expect(tas[0].value).toBe('Result = x + y');
    // No scrollbars: the editor must not be overflow:auto/scroll.
    expect(tas[0].className).toContain('cb-editor');
  });

  it('seeds dynamic ports from the code: free vars → inputs, assignments → outputs', () => {
    const nd = makeCodeBlockNode('n2', 'Result = x + y');
    app.nodes.push(nd);
    app.enhanceCodeBlockNode(nd, makeNodeEl('n2'));
    expect(nd._dynInputs).toEqual(['x', 'y']);
    expect(nd._dynOutputs).toEqual(['Result']);
    // and the port dots are rendered for them
    const inDots = document.querySelectorAll('#n2 .port-dot[data-dir="input"]');
    const outDots = document.querySelectorAll('#n2 .port-dot[data-dir="output"]');
    expect(inDots.length).toBe(2);
    expect(outDots.length).toBe(1);
  });

  it('typing then committing RE-DERIVES the ports (matches resolveCodeBlockPorts)', () => {
    const nd = makeCodeBlockNode('n3', 'Result = x + y');
    app.nodes.push(nd);
    app.enhanceCodeBlockNode(nd, makeNodeEl('n3'));

    // Simulate typing a multi-assignment, multi-input block + commit.
    const ta = document.querySelector('#n3 .cb-editor');
    ta.value = 'a = w\nb = a + z\ntotal = a + b';
    ta.dispatchEvent(new window.Event('input', { bubbles: true }));
    ta.dispatchEvent(new window.Event('change', { bubbles: true }));

    const expected = resolveCodeBlockPorts('a = w\nb = a + z\ntotal = a + b');
    expect(nd._dynInputs).toEqual(expected.inputs.map(p => p.id));   // ['w','z']
    expect(nd._dynOutputs).toEqual(expected.outputs.map(p => p.id)); // ['a','b','total']
    expect(nd._dynInputs).toEqual(['w', 'z']);
    expect(nd._dynOutputs).toEqual(['a', 'b', 'total']);
  });

  it('commit drops wires whose port no longer exists', () => {
    const nd = makeCodeBlockNode('n4', 'Result = x + y');
    app.nodes.push(nd);
    app.wires.push({ fromNode: 'src', fromPort: 'value', toNode: 'n4', toPort: 'y' });
    app.enhanceCodeBlockNode(nd, makeNodeEl('n4'));
    // Edit to a code that no longer reads `y`.
    app.codeBlockCommit('n4', 'Result = x');
    expect(nd._dynInputs).toEqual(['x']);
    expect(app.wires.some(w => w.toPort === 'y')).toBe(false);
  });

  it('per-keystroke input updates code + resizes but does NOT re-derive ports', () => {
    const nd = makeCodeBlockNode('n5', 'Result = x');
    app.nodes.push(nd);
    app.enhanceCodeBlockNode(nd, makeNodeEl('n5'));
    const ta = document.querySelector('#n5 .cb-editor');
    ta.value = 'Result = x + q';   // q would be a new input
    ta.dispatchEvent(new window.Event('input', { bubbles: true }));
    // code captured, but ports unchanged until commit
    expect(nd.controlValues.code).toBe('Result = x + q');
    expect(nd._dynInputs).toEqual(['x']);
    ta.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(nd._dynInputs).toEqual(['x', 'q']);
  });
});

describe('Series preset + blank drop', () => {
  let app;
  beforeEach(() => {
    app = makeFakeApp();
    app.addNodeToCanvas = (type, x, y, opts) => {
      const nd = { id: 'p' + app.nodes.length, type, x, y, controlValues: { ...(opts && opts.controls) } };
      app.nodes.push(nd);
      return nd;
    };
    installCodeBlockNode(app);
  });

  it('addCodeBlockPreset drops a Custom.CodeBlock pre-filled with the series template', () => {
    const nd = app.addCodeBlockPreset('nums = 0..10', 0, 0);
    expect(nd.type).toBe('Custom.CodeBlock');
    expect(nd.controlValues.code).toBe('nums = 0..10');
    // it desugars to the expected number list
    expect(desugarSeries(nd.controlValues.code)).toBe('nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]');
  });

  it('addBlankCodeBlock drops a blank Custom.CodeBlock of the SAME type', () => {
    const nd = app.addBlankCodeBlock(0, 0);
    expect(nd.type).toBe('Custom.CodeBlock');
    expect(nd.controlValues.code).toBe('');
  });
});

describe('deprecated node hiding (G-2b) — Formula stays resolvable but hidden', () => {
  const formula = customNodes.find(n => n.type === 'Custom.Formula');

  it('Custom.Formula is flagged deprecated so discovery surfaces can skip it', () => {
    expect(formula.metadata.deprecated).toBe(true);
    expect(isDeprecatedType(formula)).toBe(true);
  });

  it('a discovery filter on metadata.deprecated removes ONLY Formula from custom', () => {
    const visible = customNodes.filter(n => !(n.metadata && n.metadata.deprecated));
    expect(visible.some(n => n.type === 'Custom.Formula')).toBe(false);
    expect(visible.some(n => n.type === 'Custom.CodeBlock')).toBe(true);
    expect(visible.some(n => n.type === 'Custom.Python')).toBe(true);
  });
});

describe('export codegen (G-1) — generateNodeCode emits desugared Python', () => {
  it('a CodeBlock with a series exports a valid Python list literal, not 0..10', () => {
    const nd = makeCodeBlockNode('cgen', 'nums = 0..10..2');
    const out = app.generateNodeCode(nd);
    expect(out).toBe('nums = [0, 2, 4, 6, 8, 10]');
    expect(out).not.toContain('..');
    expect(out).not.toContain('{{ctrl.code}}');
  });

  it('a plain CodeBlock exports its code unchanged (round-trip)', () => {
    const nd = makeCodeBlockNode('cgen2', 'Result = x + y');
    expect(app.generateNodeCode(nd)).toBe('Result = x + y');
  });

  it('a v1 (legacy JS) CodeBlock does NOT take the desugar short-circuit', () => {
    const nd = makeCodeBlockNode('cgen3', 'return input0;');
    nd.version = 1;
    nd.def = { name: 'Custom.Code', controls: [{ id: 'code', default: 'return input0;' }], inputs: [{ id: 'input0' }], outputs: [{ id: 'output0' }], codegen: { python: '{{output0}} = (lambda input0: {{ctrl.code}})({{input0}})' } };
    app.nodes = [nd];
    app.wires = [];
    const out = app.generateNodeCode(nd);
    // routed through the def template (not the CodeBlock desugar branch)
    expect(out).toContain('lambda input0');
    app.nodes = [];
  });
});

describe('load-time Formula → CodeBlock migration (G-2a plan applied to a graph)', () => {
  const formula = customNodes.find(n => n.type === 'Custom.Formula');

  // Re-implements the save-load pre-pass over a saved graph object, to prove the
  // shape the load hook produces (type rewrite + control rewrite + wire remap).
  function migrateGraph(graph) {
    const wireMaps = {};
    graph.nodes.forEach(saved => {
      if (saved.type !== 'Custom.Formula') return;
      const plan = migrateNodeType(formula, { controlValues: saved.controlValues || {} });
      saved.type = plan.type;
      saved.controlValues = plan.controlValues;
      delete saved._dynInputs; delete saved._dynOutputs;
      if (plan.portMap) wireMaps[saved.id] = plan.portMap;
    });
    graph.wires.forEach(w => {
      const im = wireMaps[w.toNode]; if (im && im[w.toPort]) w.toPort = im[w.toPort];
      const om = wireMaps[w.fromNode]; if (om && om[w.fromPort]) w.fromPort = om[w.fromPort];
    });
    return graph;
  }

  it('rewrites a Formula instance to a CodeBlock with Result = <expr> and remaps wires', () => {
    const graph = {
      nodes: [{ id: 'f1', type: 'Custom.Formula', controlValues: { expr: 'x * y' } }],
      wires: [{ fromNode: 'f1', fromPort: 'result', toNode: 'w', toPort: 'value' }]
    };
    migrateGraph(graph);
    expect(graph.nodes[0].type).toBe('Custom.CodeBlock');
    expect(graph.nodes[0].controlValues.code).toBe('Result = x * y');
    // the result→Result wire was remapped
    expect(graph.wires[0].fromPort).toBe('Result');
    // and the migrated code resolves to the expected ports
    const ports = resolveCodeBlockPorts(graph.nodes[0].controlValues.code);
    expect(ports.inputs.map(p => p.id)).toEqual(['x', 'y']);
    expect(ports.outputs.map(p => p.id)).toEqual(['Result']);
  });
});
