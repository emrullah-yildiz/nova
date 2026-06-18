import { describe, it, expect } from 'vitest';
import { Geo } from '../src/geometry/index.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';

// ──────────────────────────────────────────────────────────────────────────
// Library-reorg coverage guard (fix/library-reorg).
//
// The parallel `transform` / `evaluate` / `tree` categories were dissolved and
// their genuinely-new nodes folded into their existing home categories:
//   • Geometry.Orient            → 'geometry'
//   • Plane.ByOriginXAxisYAxis   → 'plane'
//   • Curve.PointAtParameter / TangentAtParameter / FrameAtParameter / Divide
//                                → 'curves'
//   • Surface.PointAtParameter (was PointAtUV) / NormalAtUV / FrameAtUV / Divide
//                                → 'surfaces'
// The duplicate Geometry.ArrayLinear / ArrayPolar and the whole Tree.* set were
// deleted (Geometry.LinearArray/PolarArray and List.* remain the canonical ops).
//
// This file replaces the deleted transform / transform-codegen / evaluate-nodes
// / tree-nodes(-lacing) tests. It asserts the moved nodes still register in
// their NEW categories, execute correctly, and that every `Geo.<name>` their
// codegen emits resolves to a FUNCTION on the assembled global Geo (the runtime
// the generated Python/C# actually runs against).
// ──────────────────────────────────────────────────────────────────────────

const P = (x, y, z) => new Geo.Point3(x, y, z);
const V = (x, y, z) => new Geo.Vector3(x, y, z);
const isPlane = (p) => !!p && p._type === 'Plane' && !!p.origin && !!p.normal;

// A flat 3×3 grid surface in the world XY plane spanning [0,2]². The mesh
// surface evaluator infers an n×n grid from sqrt(vertexCount).
function flatSurface() {
  const pts = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) pts.push(P(i, j, 0));
  }
  return Geo.surfaceFromGrid(pts, 3, 3);
}

// One shared registry: createCoreNodeRegistry throws on any duplicate type or
// alias, so a successful build is itself proof the reorg introduced no
// duplicate-type collision.
const registry = createCoreNodeRegistry();

const MOVED = [
  { type: 'Geometry.Orient', category: 'geometry' },
  { type: 'Plane.ByOriginXAxisYAxis', category: 'plane' },
  { type: 'Curve.PointAtParameter', category: 'curves' },
  { type: 'Curve.TangentAtParameter', category: 'curves' },
  { type: 'Curve.FrameAtParameter', category: 'curves' },
  { type: 'Curve.Divide', category: 'curves' },
  { type: 'Surface.PointAtParameter', category: 'surfaces' },
  { type: 'Surface.NormalAtUV', category: 'surfaces' },
  { type: 'Surface.FrameAtUV', category: 'surfaces' },
  { type: 'Surface.Divide', category: 'surfaces' }
];

describe('library-reorg: moved nodes register in their new home categories', () => {
  for (const { type, category } of MOVED) {
    it(`${type} registers in the '${category}' category`, () => {
      const node = registry.getNode(type);
      expect(node, `${type} resolves in the fresh core registry`).toBeTruthy();
      expect(node.category, `${type} should live in '${category}'`).toBe(category);
    });
  }

  it('the dissolved parallel categories no longer exist', () => {
    expect(registry.getCategory('transform')).toBeNull();
    expect(registry.getCategory('evaluate')).toBeNull();
    expect(registry.getCategory('tree')).toBeNull();
  });

  it('the duplicate array nodes and all Tree.* nodes are gone', () => {
    for (const gone of [
      'Geometry.ArrayLinear',
      'Geometry.ArrayPolar',
      'Tree.Graft',
      'Tree.Flatten',
      'Tree.Simplify',
      'Tree.Transpose',
      'Tree.Partition',
      'Tree.GroupByKey',
      'List.SortByKey'
    ]) {
      expect(registry.getNode(gone), `${gone} must be deleted`).toBeNull();
    }
  });

  it('the canonical array nodes they duplicated are still present', () => {
    expect(registry.getNode('Geometry.LinearArray')).toBeTruthy();
    expect(registry.getNode('Geometry.PolarArray')).toBeTruthy();
  });
});

describe('library-reorg: moved nodes execute correctly', () => {
  it('Geometry.Orient: rigid frame map preserves a 3-4-5 line length', () => {
    const node = registry.getNode('Geometry.Orient');
    const line = new Geo.Line3(P(0, 0, 0), P(3, 4, 0));
    const from = new Geo.Plane(P(0, 0, 0), V(0, 0, 1));
    const to = new Geo.Plane(P(0, 0, 0), V(0, 1, 0));
    const { result } = node.execute({}, { geometry: line, fromPlane: from, toPlane: to });
    expect(result, 'orient returns geometry').toBeTruthy();
    const len = Math.hypot(
      result.end.x - result.start.x,
      result.end.y - result.start.y,
      result.end.z - result.start.z
    );
    expect(len).toBeCloseTo(5, 6);
  });

  it('Plane.ByOriginXAxisYAxis: X=(1,0,0), Y=(0,1,0) → normal +Z', () => {
    const node = registry.getNode('Plane.ByOriginXAxisYAxis');
    const { plane } = node.execute({}, { origin: P(0, 0, 0), xAxis: V(1, 0, 0), yAxis: V(0, 1, 0) });
    expect(isPlane(plane)).toBe(true);
    expect(plane.normal.z).toBeCloseTo(1, 6);
  });

  it('Curve.PointAtParameter: midpoint of a line', () => {
    const { point } = registry.getNode('Curve.PointAtParameter')
      .execute({}, { curve: new Geo.Line3(P(0, 0, 0), P(4, 0, 0)), t: 0.5 });
    expect(point.x).toBeCloseTo(2, 6);
  });

  it('Curve.TangentAtParameter: unit tangent points along the line', () => {
    const { tangent } = registry.getNode('Curve.TangentAtParameter')
      .execute({}, { curve: new Geo.Line3(P(0, 0, 0), P(0, 5, 0)), t: 0.5 });
    expect(tangent.length()).toBeCloseTo(1, 6);
    expect(tangent.y).toBeCloseTo(1, 6);
  });

  it('Curve.FrameAtParameter: returns a Geo.Plane whose normal is the tangent', () => {
    const { plane } = registry.getNode('Curve.FrameAtParameter')
      .execute({}, { curve: new Geo.Line3(P(0, 0, 0), P(5, 0, 0)), t: 0.5 });
    expect(isPlane(plane)).toBe(true);
    expect(Math.abs(plane.normal.x)).toBeCloseTo(1, 6);
  });

  it('Curve.Divide: open curve → count+1 points/frames', () => {
    const out = registry.getNode('Curve.Divide')
      .execute({}, { curve: new Geo.Line3(P(0, 0, 0), P(8, 0, 0)), count: 4 });
    expect(out.points.length).toBe(5);
    expect(out.frames.length).toBe(5);
    expect(out.frames.every(isPlane)).toBe(true);
  });

  it('Surface.PointAtParameter: center of a flat [0,2]² grid → (1,1,0)', () => {
    const { point } = registry.getNode('Surface.PointAtParameter')
      .execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    expect(point.x).toBeCloseTo(1, 6);
    expect(point.y).toBeCloseTo(1, 6);
  });

  it('Surface.NormalAtUV: flat XY surface → unit normal along ±Z', () => {
    const { normal } = registry.getNode('Surface.NormalAtUV')
      .execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    expect(normal.length()).toBeCloseTo(1, 6);
    expect(Math.abs(normal.z)).toBeCloseTo(1, 6);
  });

  it('Surface.FrameAtUV: returns a Geo.Plane normal to the flat surface', () => {
    const { plane } = registry.getNode('Surface.FrameAtUV')
      .execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    expect(isPlane(plane)).toBe(true);
    expect(Math.abs(plane.normal.z)).toBeCloseTo(1, 6);
  });

  it('Surface.Divide: (u,v) segments → (u+1)×(v+1) row-major points/frames', () => {
    const out = registry.getNode('Surface.Divide')
      .execute({}, { surface: flatSurface(), uCount: 3, vCount: 2 });
    expect(out.points.length).toBe((3 + 1) * (2 + 1));
    expect(out.frames.length).toBe(12);
    expect(out.frames.every(isPlane)).toBe(true);
  });

  it('null inputs degrade gracefully (no throw, empty/undefined outputs)', () => {
    expect(registry.getNode('Curve.PointAtParameter').execute({}, {}).point).toBeUndefined();
    expect(registry.getNode('Curve.Divide').execute({}, {}).points).toEqual([]);
    expect(registry.getNode('Surface.Divide').execute({}, {}).frames).toEqual([]);
    expect(registry.getNode('Geometry.Orient').execute({}, {}).result).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CODEGEN ↔ RUNTIME-GEO CONTRACT GUARD
// (mirrors the deleted transform-codegen / evaluate-nodes guards)
//
// Every moved node's codegen emits `Geo.<name>(...)` that runs against the
// assembled GLOBAL Geo at runtime — not the ES-module exports execute() calls.
// Assert each emitted `Geo.<name>` resolves to a function on the global Geo.
// ──────────────────────────────────────────────────────────────────────────
const GEO_CALL = /\bGeo\.([A-Za-z_$][\w$]*)/g;

function geoTokens(code) {
  const names = new Set();
  if (typeof code !== 'string') return names;
  let m;
  while ((m = GEO_CALL.exec(code)) !== null) names.add(m[1]);
  return names;
}

describe('library-reorg: moved-node codegen resolves on the global Geo object', () => {
  for (const { type } of MOVED) {
    it(`${type}: every Geo.<name> in codegen.python is a function on global Geo`, () => {
      const node = registry.getNode(type);
      const tokens = geoTokens(node.codegen && node.codegen.python);
      expect(tokens.size, `${type} should emit at least one Geo.<name> call`).toBeGreaterThan(0);
      for (const name of tokens) {
        expect(typeof Geo[name], `Geo.${name} (from ${type} codegen.python) must be a function on global Geo`).toBe('function');
      }
    });

    it(`${type}: every Geo.<name> in codegen.csharp is a function on global Geo`, () => {
      const node = registry.getNode(type);
      const tokens = geoTokens(node.codegen && node.codegen.csharp);
      for (const name of tokens) {
        expect(typeof Geo[name], `Geo.${name} (from ${type} codegen.csharp) must be a function on global Geo`).toBe('function');
      }
    });
  }

  it('keeps Geo.orient and Geo.planeFromOriginXY; drops the orphaned array globals', () => {
    expect(typeof Geo.orient).toBe('function');
    expect(typeof Geo.planeFromOriginXY).toBe('function');
    // The duplicate array nodes are gone, so their per-step / total-angle globals
    // were removed as orphans.
    expect(Geo.arrayLinearByVector).toBeUndefined();
    expect(Geo.arrayPolarByAngle).toBeUndefined();
    // The legacy spacing-based array globals the surviving nodes use remain.
    expect(typeof Geo.arrayLinear).toBe('function');
    expect(typeof Geo.arrayPolar).toBe('function');
  });

  it('the eight curve/surface evaluation globals remain present as functions', () => {
    for (const name of [
      'pointAtT', 'tangentAtT', 'frameAtT', 'divideCurve',
      'pointAtUV', 'normalAtUV', 'frameAtUV', 'divideSurface'
    ]) {
      expect(typeof Geo[name], `Geo.${name}`).toBe('function');
    }
  });
});
