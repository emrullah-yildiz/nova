// Pure builders for the stress-test graphs, shared by the landing-page template
// cards (src/ui/node-library.js) and the file generator
// (stress-tests/generate-stress-tests.mjs) so the in-app templates and the
// on-disk .nodeflow files stay identical. Output matches app.serializeGraph()
// in save-load.js exactly (schema version 2), so app.deserializeGraph() loads
// the result directly.

// A node serialized the way save-load.js writes it. Unset controls fall back to
// the node definition's defaults on load, so controlValues only needs overrides.
function node(id, type, x, y, zIndex, controlValues) {
  return {
    id, type, version: 1, x, y, zIndex,
    controlValues: controlValues || {},
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
function pos(i) {
  return { x: X0 + (i % COLS) * DX, y: Y0 + Math.floor(i / COLS) * DY };
}

// 1000 nodes, no geometry: Input.Number(1) → a deep Math.Add chain (results
// climb 2,3,…,999), with every adder's B also fed from node-1 (so node-1 fans
// out to 999 consumers) → Output.Watch. Pure value graph — never builds a mesh,
// so it isolates node/wire count + dependency resolution from the geometry path.
export function buildNoGeometryGraph(count = 1000) {
  const N = count;
  const nodes = [];
  const wires = [];

  let p = pos(0);
  nodes.push(node('node-1', 'Input.Number', p.x, p.y, 10, { val: '1' }));

  for (let k = 2; k <= N - 1; k++) {
    p = pos(k - 1);
    nodes.push(node('node-' + k, 'Math.Add', p.x, p.y, 9 + k, { a: '0', b: '0' }));
    if (k === 2) wires.push(wire('node-1', 'value', 'node-2', 'a'));
    else wires.push(wire('node-' + (k - 1), 'result', 'node-' + k, 'a'));
    wires.push(wire('node-1', 'value', 'node-' + k, 'b'));
  }

  p = pos(N - 1);
  nodes.push(node('node-' + N, 'Output.Watch', p.x, p.y, 9 + N, {}));
  wires.push(wire('node-' + (N - 1), 'result', 'node-' + N, 'value'));

  return envelope('Stress · ' + N + ' nodes (no geometry)', nodes, wires);
}

// 1000 nodes, ~10,000 geometry primitives: 1000 Pattern.HexGrid nodes, each a
// rows×cols grid of hex-tile meshes. Terminal geometry (nothing consuming it
// downstream) previews by default, so all of it renders with no wiring. Radius
// cycles so the rings nest at varied sizes instead of perfectly overlapping.
export function buildGeometryGraph(count = 1000, rows = 2, cols = 5) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const p = pos(i);
    const radius = (1 + (i % 12) * 0.5).toFixed(1); // 1.0 … 6.5
    nodes.push(node('node-' + (i + 1), 'Pattern.HexGrid', p.x, p.y, 10 + i, {
      radius, rows: String(rows), cols: String(cols)
    }));
  }
  return envelope('Stress · ' + count + ' nodes (' + (count * rows * cols) + ' geometry)', nodes, []);
}
