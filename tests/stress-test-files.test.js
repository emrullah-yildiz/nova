import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import { NODE_TYPE_MAP } from '../src/core/nodes.js';
import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { buildNoGeometryGraph, buildGeometryGraph } from '../src/app/stress-graphs.js';

// Validates the hand-generated stress-test graphs in /stress-tests against the
// real node registry + the save/load schema (save-load.js, version 2), so a
// node rename or port change that would make them fail to load is caught here
// rather than in the browser.
function load(name) {
  const url = new URL('../stress-tests/' + name, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
}

function portIds(arr) {
  return new Set((arr || []).map((p) => p.id));
}

describe('stress-test .nodeflow files', () => {
  beforeAll(() => {
    // Populate NODE_TYPE_MAP with the modern node defs (Input.Number, Math.Add,
    // Pattern.HexGrid, Output.Watch) the way the app does at boot.
    getLiveCoreRegistry();
  });

  // Mirrors the invariants app.deserializeGraph() relies on: version 2, a
  // nodes array, every node.type present in NODE_TYPE_MAP (unknown types are
  // silently dropped on load), and every wire endpoint referencing a real
  // node + a real port id.
  function assertLoadable(graph) {
    expect(graph.version).toBe(2);
    expect(Array.isArray(graph.nodes)).toBe(true);

    const byId = {};
    graph.nodes.forEach((nd) => {
      expect(NODE_TYPE_MAP[nd.type], `unknown node type: ${nd.type}`).toBeTruthy();
      byId[nd.id] = nd;
    });

    (graph.wires || []).forEach((w) => {
      const from = byId[w.fromNode];
      const to = byId[w.toNode];
      expect(from, `wire fromNode missing: ${w.fromNode}`).toBeTruthy();
      expect(to, `wire toNode missing: ${w.toNode}`).toBeTruthy();
      expect(portIds(NODE_TYPE_MAP[from.type].outputs).has(w.fromPort),
        `bad output port ${from.type}.${w.fromPort}`).toBe(true);
      expect(portIds(NODE_TYPE_MAP[to.type].inputs).has(w.toPort),
        `bad input port ${to.type}.${w.toPort}`).toBe(true);
    });
  }

  it('no-geometry file: 1000 loadable nodes, fully wired, zero geometry', () => {
    const g = load('stress-1000-nodes-no-geometry.nodeflow');
    expect(g.nodes.length).toBe(1000);
    assertLoadable(g);
    // No geometry-producing node types in this graph.
    const geoTypes = g.nodes.filter((n) => /^(Box|Sphere|Cylinder|Cone|Torus|Pattern|Solid|Surface|Curve)\./.test(n.type));
    expect(geoTypes.length).toBe(0);
    // Exactly one Input + one Output.Watch + the Math.Add chain.
    expect(g.nodes.filter((n) => n.type === 'Input.Number').length).toBe(1);
    expect(g.nodes.filter((n) => n.type === 'Output.Watch').length).toBe(1);
    expect(g.nodes.filter((n) => n.type === 'Math.Add').length).toBe(998);
  });

  it('geometry file: 1000 loadable HexGrid nodes emitting 10,000 meshes', () => {
    const g = load('stress-1000-nodes-10k-geometry.nodeflow');
    expect(g.nodes.length).toBe(1000);
    assertLoadable(g);
    const hex = g.nodes.filter((n) => n.type === 'Pattern.HexGrid');
    expect(hex.length).toBe(1000);
    // rows × cols summed across all grids = total mesh primitives.
    const totalGeometry = hex.reduce((sum, n) =>
      sum + parseInt(n.controlValues.rows, 10) * parseInt(n.controlValues.cols, 10), 0);
    expect(totalGeometry).toBe(10000);
  });

  // The landing-page template cards (node-library.js) feed these exact builder
  // outputs to app.deserializeGraph(), so they must be loadable too — same
  // schema/registry invariants as the on-disk files.
  it('shared builders produce the same loadable graphs the templates load', () => {
    const noGeo = buildNoGeometryGraph(1000);
    expect(noGeo.nodes.length).toBe(1000);
    assertLoadable(noGeo);

    const geo = buildGeometryGraph(1000, 2, 5);
    expect(geo.nodes.length).toBe(1000);
    assertLoadable(geo);
    const totalGeometry = geo.nodes.reduce((sum, n) =>
      sum + parseInt(n.controlValues.rows, 10) * parseInt(n.controlValues.cols, 10), 0);
    expect(totalGeometry).toBe(10000);
  });
});
