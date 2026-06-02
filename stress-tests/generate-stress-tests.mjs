// Generates two .nodeflow stress-test graphs for Nova:
//   1. stress-1000-nodes-no-geometry.nodeflow  — 1000 pure value/math nodes,
//      zero geometry. Exercises node-count, wire-count, and deep dependency
//      resolution without touching the geometry/render path.
//   2. stress-1000-nodes-10k-geometry.nodeflow — 1000 geometry nodes that
//      together emit ~10,000 mesh primitives. Exercises evaluation + the 3D
//      viewer under heavy geometry load.
//
// The file shape matches app.serializeGraph() in src/app/save-load.js exactly
// (version 2). Run:  node stress-tests/generate-stress-tests.mjs
//
// Node count / geometry-per-node are constants below — tweak and re-run to
// scale the stress up or down.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

// A node serialized the way save-load.js writes it. Unset controls fall back to
// the node definition's defaults on load, so controlValues only needs overrides.
function node(id, type, x, y, zIndex, controlValues = {}) {
  return {
    id, type, version: 1, x, y, zIndex,
    controlValues,
    dataPanelOpen: false,
    _preview3d: true,
    _dynInputs: null,
    _dynOutputs: null,
    _pyResults: null
  };
}

function wire(fromNode, fromPort, toNode, toPort) {
  return { fromNode, fromPort, toNode, toPort };
}

function envelope(name, nodes, wires) {
  return {
    version: 2,
    timestamp: Date.now(),
    name,
    zoom: 1, panX: 0, panY: 0,
    nextNodeId: nodes.length + 1,
    nodes,
    wires
  };
}

// Lay nodes out on a readable grid so the canvas isn't a single stack.
const COLS = 40, DX = 240, DY = 160, X0 = 60, Y0 = 60;
const pos = (i) => ({ x: X0 + (i % COLS) * DX, y: Y0 + Math.floor(i / COLS) * DY });

// ── File 1: 1000 nodes, no geometry ───────────────────────────────────────
// node-1 = Input.Number(1); node-2..999 = Math.Add forming one deep chain
// (result climbs 2,3,4,…,999), with B on every adder fed from node-1 (so
// node-1 fans out to 999 consumers); node-1000 = Output.Watch on the tail.
// Memoized evaluation walks the 998-deep chain in array order, so each adder
// finds its predecessor already cached — deep path, no recursion blow-up.
function buildNoGeometry(count = 1000) {
  const nodes = [];
  const wires = [];
  const N = count;

  // node-1: the constant feeding the whole graph.
  let p = pos(0);
  nodes.push(node('node-1', 'Input.Number', p.x, p.y, 10, { val: '1' }));

  // node-2 .. node-(N-1): the Math.Add chain.
  for (let k = 2; k <= N - 1; k++) {
    p = pos(k - 1);
    nodes.push(node('node-' + k, 'Math.Add', p.x, p.y, 9 + k, { a: '0', b: '0' }));
    // A ← previous result (node-1's port is `value`, adders' port is `result`).
    if (k === 2) wires.push(wire('node-1', 'value', 'node-2', 'a'));
    else wires.push(wire('node-' + (k - 1), 'result', 'node-' + k, 'a'));
    // B ← the shared constant (fan-out from node-1).
    wires.push(wire('node-1', 'value', 'node-' + k, 'b'));
  }

  // node-N: Output.Watch on the tail of the chain.
  p = pos(N - 1);
  nodes.push(node('node-' + N, 'Output.Watch', p.x, p.y, 9 + N, {}));
  wires.push(wire('node-' + (N - 1), 'result', 'node-' + N, 'value'));

  return envelope('Stress · 1000 nodes (no geometry)', nodes, wires);
}

// ── File 2: 1000 nodes, ~10,000 geometry primitives ───────────────────────
// 1000 Pattern.HexGrid nodes, each a 2×5 grid = 10 hex-tile meshes → 10,000
// meshes total. Terminal geometry nodes preview by default (engine.js marks
// them non-intermediate), so all 10k render with no wiring. Radius cycles so
// the rings nest at varied sizes instead of perfectly overlapping.
function buildGeometry(count = 1000, rows = 2, cols = 5) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const p = pos(i);
    const radius = (1 + (i % 12) * 0.5).toFixed(1); // 1.0 … 6.5
    nodes.push(node('node-' + (i + 1), 'Pattern.HexGrid', p.x, p.y, 10 + i, {
      radius, rows: String(rows), cols: String(cols)
    }));
  }
  const perNode = rows * cols;
  return {
    graph: envelope('Stress · 1000 nodes (10k geometry)', nodes, []),
    geometry: count * perNode
  };
}

const f1 = buildNoGeometry(1000);
const g = buildGeometry(1000, 2, 5);
const f2 = g.graph;

const f1Path = join(OUT_DIR, 'stress-1000-nodes-no-geometry.nodeflow');
const f2Path = join(OUT_DIR, 'stress-1000-nodes-10k-geometry.nodeflow');
writeFileSync(f1Path, JSON.stringify(f1));
writeFileSync(f2Path, JSON.stringify(f2));

console.log('Wrote ' + f1Path);
console.log('  nodes: ' + f1.nodes.length + ', wires: ' + f1.wires.length + ', geometry: 0');
console.log('Wrote ' + f2Path);
console.log('  nodes: ' + f2.nodes.length + ', wires: ' + f2.wires.length + ', geometry: ' + g.geometry);
