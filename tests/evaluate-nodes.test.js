import { describe, it, expect } from 'vitest';
import { Geo } from '../src/geometry/index.js';
import { evaluateNodes } from '../src/nodes/categories/evaluate.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';

// ──────────────────────────────────────────────────────────────────────────
// T5 — Curve/Surface Evaluate & Divide node category (exposes the T4 kernel).
//
// Four guards:
//   1. registration — every Evaluate node registers in a fresh FULL core
//      registry with no duplicate-type / duplicate-alias collision.
//   2. def shape — standard shape (glyph icon, description, codegen, help graph).
//   3. execute() smoke — each node wires to the real T4 eval op; the
//      count-conventions (open curve → count+1, closed → count, surface →
//      (u+1)×(v+1) row-major) hold; frames are Geo.Plane.
//   4. codegen ↔ runtime-Geo guard — every `Geo.<name>` emitted in each node's
//      codegen.python AND codegen.csharp resolves to a FUNCTION on the assembled
//      global Geo (the T2/M1 lesson: generated code runs against the runtime Geo,
//      not the ES-module exports execute() uses).
// ──────────────────────────────────────────────────────────────────────────

const byType = (type) => evaluateNodes.find((n) => n.type === type);

const P = (x, y, z) => new Geo.Point3(x, y, z);

// A flat 3×3 grid surface in the world XY plane, spanning [0,2]². Geo's mesh
// surface evaluator infers an n×n grid from sqrt(vertexCount), so a square grid
// gives deterministic, well-defined UV sampling.
function flatSurface() {
  const pts = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) pts.push(P(i, j, 0));
  }
  return Geo.surfaceFromGrid(pts, 3, 3);
}

const isPlane = (p) => !!p && p._type === 'Plane' && !!p.origin && !!p.normal;

describe('evaluate-category registration & shape', () => {
  it('ships the eight expected evaluate nodes in order', () => {
    expect(evaluateNodes.map((n) => n.type)).toEqual([
      'Curve.PointAtParameter',
      'Curve.TangentAtParameter',
      'Curve.FrameAtParameter',
      'Curve.Divide',
      'Surface.PointAtUV',
      'Surface.NormalAtUV',
      'Surface.FrameAtUV',
      'Surface.Divide'
    ]);
  });

  it('registers cleanly in a fresh full core registry (no type/alias collision)', () => {
    // createCoreNodeRegistry throws on any duplicate type or alias, so a clean
    // build is itself the assertion that the new category collides with nothing.
    const registry = createCoreNodeRegistry();
    for (const node of evaluateNodes) {
      expect(registry.getNode(node.type), `${node.type} resolves in the registry`).toBeTruthy();
    }
  });

  it('every node carries the standard def shape (glyph icon, description, codegen, help graph)', () => {
    for (const node of evaluateNodes) {
      expect(node.icon, `${node.type} icon`).toBeTruthy();
      // Icons must be symbols, never text abbreviations.
      expect(/^[a-z0-9]+$/i.test(node.icon), `${node.type} icon must be a glyph, not text`).toBe(false);
      expect(typeof node.description).toBe('string');
      expect(node.codegen && typeof node.codegen.python).toBe('string');
      expect(node.codegen && typeof node.codegen.csharp).toBe('string');
      // help.example must be a complete graph (producer -> focal -> consumer).
      expect(node.help && node.help.example, `${node.type} help.example`).toBeTruthy();
      expect(Array.isArray(node.help.example.nodes)).toBe(true);
      expect(Array.isArray(node.help.example.wires)).toBe(true);
      expect(node.help.example.nodes.length).toBeGreaterThan(2);
      expect(node.help.example.wires.length).toBeGreaterThan(1);
    }
  });
});

describe('evaluate-category execute() smoke', () => {
  it('Curve.PointAtParameter: midpoint of a line', () => {
    const line = new Geo.Line3(P(0, 0, 0), P(4, 0, 0));
    const { point } = byType('Curve.PointAtParameter').execute({}, { curve: line, t: 0.5 });
    expect(point.x).toBeCloseTo(2, 9);
    expect(point.y).toBeCloseTo(0, 9);
  });

  it('Curve.TangentAtParameter: unit tangent of a line points along it', () => {
    const line = new Geo.Line3(P(0, 0, 0), P(0, 5, 0));
    const { tangent } = byType('Curve.TangentAtParameter').execute({}, { curve: line, t: 0.5 });
    expect(tangent.length()).toBeCloseTo(1, 6);
    expect(tangent.y).toBeCloseTo(1, 6);
  });

  it('Curve.FrameAtParameter on a line returns a Geo.Plane whose normal is the tangent', () => {
    const line = new Geo.Line3(P(0, 0, 0), P(5, 0, 0));
    const { plane } = byType('Curve.FrameAtParameter').execute({}, { curve: line, t: 0.5 });
    expect(isPlane(plane), 'frame must be a Geo.Plane').toBe(true);
    // Normal runs ALONG the curve (the T4 convention).
    expect(Math.abs(plane.normal.x)).toBeCloseTo(1, 6);
    expect(plane.origin.x).toBeCloseTo(2.5, 6);
  });

  it('Curve.Divide: open curve → count+1 points/frames (count convention)', () => {
    const line = new Geo.Line3(P(0, 0, 0), P(8, 0, 0));
    const out = byType('Curve.Divide').execute({}, { curve: line, count: 4 });
    expect(out.points.length).toBe(5); // 4 segments → 5 points
    expect(out.frames.length).toBe(5);
    expect(out.frames.every(isPlane)).toBe(true);
    // Endpoints included.
    expect(out.points[0].x).toBeCloseTo(0, 6);
    expect(out.points[4].x).toBeCloseTo(8, 6);
  });

  it('Curve.Divide: closed curve (circle) → exactly count points', () => {
    const circle = new Geo.Circle3(P(0, 0, 0), 5);
    const out = byType('Curve.Divide').execute({}, { curve: circle, count: 6 });
    expect(out.points.length).toBe(6); // closed → wrap-around duplicate dropped
    expect(out.frames.length).toBe(6);
  });

  it('Surface.PointAtUV: center of a flat [0,2]² grid → (1,1,0)', () => {
    const { point } = byType('Surface.PointAtUV').execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    expect(point.x).toBeCloseTo(1, 6);
    expect(point.y).toBeCloseTo(1, 6);
    expect(point.z).toBeCloseTo(0, 6);
  });

  it('Surface.NormalAtUV: flat XY surface → unit normal along ±Z', () => {
    const { normal } = byType('Surface.NormalAtUV').execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    expect(normal.length()).toBeCloseTo(1, 6);
    expect(Math.abs(normal.z)).toBeCloseTo(1, 6);
  });

  it('Surface.FrameAtUV: returns a Geo.Plane normal to the flat surface', () => {
    const { plane } = byType('Surface.FrameAtUV').execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    expect(isPlane(plane)).toBe(true);
    expect(Math.abs(plane.normal.z)).toBeCloseTo(1, 6);
  });

  it('Surface.Divide: (u,v) segments → (u+1)×(v+1) row-major points/frames', () => {
    const out = byType('Surface.Divide').execute({}, { surface: flatSurface(), uCount: 3, vCount: 2 });
    expect(out.points.length).toBe((3 + 1) * (2 + 1)); // 12
    expect(out.frames.length).toBe(12);
    expect(out.frames.every(isPlane)).toBe(true);
  });

  it('null inputs degrade gracefully (no throw, empty/undefined outputs)', () => {
    expect(byType('Curve.PointAtParameter').execute({}, {}).point).toBeUndefined();
    expect(byType('Curve.Divide').execute({}, {}).points).toEqual([]);
    expect(byType('Surface.Divide').execute({}, {}).frames).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// CODEGEN ↔ RUNTIME-GEO CONTRACT GUARD (mirrors tests/transform-codegen.test.js)
// ──────────────────────────────────────────────────────────────────────────
const GEO_CALL = /\bGeo\.([A-Za-z_$][\w$]*)/g;

function geoTokens(code) {
  const names = new Set();
  if (typeof code !== 'string') return names;
  let m;
  while ((m = GEO_CALL.exec(code)) !== null) names.add(m[1]);
  return names;
}

describe('evaluate-category codegen resolves on the global Geo object', () => {
  for (const node of evaluateNodes) {
    it(`${node.type}: every Geo.<name> in codegen.python is a function on global Geo`, () => {
      const tokens = geoTokens(node.codegen && node.codegen.python);
      expect(tokens.size, `${node.type} should emit at least one Geo.<name> call`).toBeGreaterThan(0);
      for (const name of tokens) {
        expect(typeof Geo[name], `Geo.${name} (from ${node.type} codegen.python) must be a function on global Geo`).toBe('function');
      }
    });

    it(`${node.type}: every Geo.<name> in codegen.csharp is a function on global Geo`, () => {
      const tokens = geoTokens(node.codegen && node.codegen.csharp);
      for (const name of tokens) {
        expect(typeof Geo[name], `Geo.${name} (from ${node.type} codegen.csharp) must be a function on global Geo`).toBe('function');
      }
    });
  }

  it('the eight T4 evaluation globals are all present as functions', () => {
    for (const name of [
      'pointAtT', 'tangentAtT', 'frameAtT', 'divideCurve',
      'pointAtUV', 'normalAtUV', 'frameAtUV', 'divideSurface'
    ]) {
      expect(typeof Geo[name], `Geo.${name}`).toBe('function');
    }
  });

  it('the Divide globals return {points, frames} so codegen destructuring maps right', () => {
    const line = new Geo.Line3(P(0, 0, 0), P(8, 0, 0));
    const dc = Geo.divideCurve(line, 4);
    expect(Array.isArray(dc.points)).toBe(true);
    expect(Array.isArray(dc.frames)).toBe(true);
    const ds = Geo.divideSurface(flatSurface(), 3, 2);
    expect(ds.points.length).toBe(12);
    expect(ds.frames.length).toBe(12);
  });
});
