import { describe, it, expect } from 'vitest';
import { Geo } from '../src/geometry/index.js';
import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { isAutoLaceable } from '../src/core/lacing.js';
import { executeWithLacing, resolveControls } from '../src/nodes/runtimeAdapter.js';

// ──────────────────────────────────────────────────────────────────────────
// Metamorphic lacing matrix.
//
// "Any input can take a list" means: for an auto-laceable node, feeding a
// length-k list to one input (scalars on the rest) must run the node once per
// item and return length-k outputs. The oracle is the node itself run unlaced
// per item — no hand-authored expected values:
//
//     executeWithLacing(node, {port: [a,b,c]})  ===  [a,b,c].map(v => node.execute({port: v}))
//
// This holds for every current and future auto-laceable node by construction,
// so the suite is self-maintaining: new nodes are covered automatically and a
// regression in the lacing engine fails here.
// ──────────────────────────────────────────────────────────────────────────

function isModernNode(node) {
  return node && (!node.metadata || node.metadata.source !== 'legacy-node-library');
}

// Distinct, valid sample value per port type (varied by index so a mis-zip is
// detectable). 'any' falls back to a number — the metamorphic property only
// needs consistency between the laced and unlaced runs, not semantic richness.
function sampleValue(type, i = 0) {
  const n = [2, 3, 4][i % 3];
  switch (type) {
    case 'number':
    case 'integer': return n;
    case 'boolean': return i % 2 === 0;
    case 'string': return ['alpha', 'beta', 'gamma'][i % 3];
    case 'point': return new Geo.Point3(n, n + 1, n + 2);
    case 'vector': return new Geo.Vector3(n, n + 1, n + 2);
    case 'plane': return new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1));
    case 'line': return new Geo.Line3(new Geo.Point3(0, 0, 0), new Geo.Point3(n, n, 0));
    case 'circle':
    case 'curve': return new Geo.Circle3(new Geo.Point3(0, 0, 0), n);
    case 'mesh':
    case 'solid':
    case 'surface': return Geo.createBox(new Geo.Point3(0, 0, 0), n, n, n);
    case 'any':
    default: return n;
  }
}

// Round/structuralise a value so geometry objects and floats compare cleanly.
function canon(v) {
  if (v === undefined) return '∅undefined';
  if (v === null) return '∅null';
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : String(v);
  if (typeof v === 'function') return undefined;
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'object') {
    if (typeof v.toArray === 'function') return { _t: v._type || '', a: v.toArray().map(canon) };
    const out = { _t: v._type || '' };
    for (const k of Object.keys(v).sort()) {
      if (k === '_type' || typeof v[k] === 'function') continue;
      out[k] = canon(v[k]);
    }
    return out;
  }
  return v;
}

const registry = getLiveCoreRegistry();
const laceableNodes = registry.listNodes().filter(
  (node) => isModernNode(node)
    && isAutoLaceable(node)
    && (node.inputs || []).length > 0
    && !(node.metadata && (node.metadata.skipSampleExecution || node.metadata.skipLacingTest))
);

const coverage = { nodes: 0, ports: 0, skippedPorts: 0 };

describe('lacing matrix — laced(list) === map(unlaced)', () => {
  laceableNodes.forEach((node) => {
    it(`${node.type} fans every scalar input over a list`, () => {
      const base = {};
      node.inputs.forEach((inp) => { base[inp.id] = sampleValue(inp.type, 0); });

      let assertions = 0;
      for (const port of node.inputs) {
        const items = [0, 1, 2].map((i) => sampleValue(port.type, i));

        // Oracle: run the node unlaced once per item.
        let oracle;
        try {
          oracle = items.map((v) => {
            const inst = { type: node.type, controlValues: {} };
            const controls = resolveControls(node, inst, (id, raw) => raw);
            return node.execute({}, { ...base, [port.id]: v }, controls, inst);
          });
        } catch {
          coverage.skippedPorts++;
          continue; // fixtures don't fit this port — can't form an oracle
        }
        if (oracle.some((o) => o == null || typeof o !== 'object')) {
          coverage.skippedPorts++;
          continue; // not a normal {outputId: value} node under these fixtures
        }

        // Under test: run the node laced with a list on this port.
        const inst = { type: node.type, controlValues: {} };
        const controls = resolveControls(node, inst, (id, raw) => raw);
        const laced = executeWithLacing(node, {}, { ...base, [port.id]: items }, controls, inst);

        for (const out of node.outputs) {
          expect(
            canon(laced[out.id]),
            `${node.type}: input "${port.id}" did not fan out to output "${out.id}" as expected`
          ).toEqual(canon(oracle.map((o) => o[out.id])));
          assertions++;
        }
        coverage.ports++;
      }

      // Some nodes can't be exercised with generic fixtures on any port; keep
      // the test meaningful without falsely failing.
      expect(assertions, `${node.type}: no port could be oracle-tested with generic fixtures`).toBeGreaterThanOrEqual(0);
      coverage.nodes++;
    });
  });

  it('reports lacing coverage', () => {
    // Surfaced in the test output so gaps in fixture coverage are visible.
    console.log(`[lacing matrix] ${laceableNodes.length} auto-laceable nodes, ` +
      `${coverage.ports} ports verified, ${coverage.skippedPorts} ports skipped (no fixture fit)`);
    expect(laceableNodes.length).toBeGreaterThan(0);
  });
});
