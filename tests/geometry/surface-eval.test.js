import { describe, it, expect, beforeAll } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import {
  pointAtUV,
  normalAtUV,
  frameAtUV,
  divideSurface
} from '../../src/geometry/surface-eval.js';
import { planeBasis } from '../../src/geometry/frames.js';

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

describe('surface-eval', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  // A flat parametric Surface in the XY plane spanning [0,10]×[0,10] → normal +Z.
  const makeFlatSurface = () => new Geo.Surface(
    (u, v) => new Geo.Point3(u, v, 0),
    [0, 10],
    [0, 10],
    10,
    10
  );

  it('pointAtUV maps normalized (u,v) onto the surface domain', () => {
    const s = makeFlatSurface();
    const p00 = pointAtUV(s, 0, 0);
    const pmm = pointAtUV(s, 0.5, 0.5);
    const p11 = pointAtUV(s, 1, 1);
    expect([p00.x, p00.y, p00.z]).toEqual([0, 0, 0]);
    expect([pmm.x, pmm.y, pmm.z]).toEqual([5, 5, 0]);
    expect([p11.x, p11.y, p11.z]).toEqual([10, 10, 0]);
  });

  it('normalAtUV on a flat XY surface is unit-length +Z', () => {
    const s = makeFlatSurface();
    const n = normalAtUV(s, 0.5, 0.5);
    expect(len(n)).toBeCloseTo(1, 9);
    expect(Math.abs(n.z)).toBeCloseTo(1, 9);
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(0, 9);
  });

  it('frameAtUV: origin on surface, normal = surface normal, orthonormal basis with X along U', () => {
    const s = makeFlatSurface();
    const frame = frameAtUV(s, 0.5, 0.5);
    const onSurf = pointAtUV(s, 0.5, 0.5);
    expect(frame.origin.distanceTo(onSurf)).toBeCloseTo(0, 9);

    const b = planeBasis(frame);
    // Normal is the (+Z) surface normal.
    expect(Math.abs(b.normal.z)).toBeCloseTo(1, 9);
    // X follows dU = +X for this surface.
    expect(b.xAxis.x).toBeCloseTo(1, 6);
    expect(b.xAxis.y).toBeCloseTo(0, 6);
    // Orthonormal.
    expect(len(b.xAxis)).toBeCloseTo(1, 9);
    expect(len(b.yAxis)).toBeCloseTo(1, 9);
    expect(dot(b.xAxis, b.yAxis)).toBeCloseTo(0, 9);
    expect(dot(b.xAxis, b.normal)).toBeCloseTo(0, 9);

    // Same Geo.Plane shape M1 produces.
    expect(frame).toBeInstanceOf(Geo.Plane);
    expect(frame.xaxis).toBeTruthy();
    expect(frame.yaxis).toBeTruthy();
  });

  it('divideSurface returns a (uCount+1)×(vCount+1) grid of points and frames', () => {
    const s = makeFlatSurface();
    const uCount = 3;
    const vCount = 2;
    const { points, frames } = divideSurface(s, uCount, vCount);
    expect(points.length).toBe((uCount + 1) * (vCount + 1));
    expect(frames.length).toBe((uCount + 1) * (vCount + 1));
    for (const f of frames) {
      expect(f).toBeInstanceOf(Geo.Plane);
      expect(f.xaxis).toBeTruthy();
      expect(f.yaxis).toBeTruthy();
    }
  });

  it('evaluates a NurbsSurface and a grid (Mesh3) surface without throwing', () => {
    const grid = [];
    for (let i = 0; i < 4; i++) {
      const row = [];
      for (let j = 0; j < 4; j++) row.push(new Geo.Point3(i, j, 0));
      grid.push(row);
    }
    const nurbs = new Geo.NurbsSurface(grid, 3, 3);
    const np = pointAtUV(nurbs, 0.5, 0.5);
    expect(np).toBeInstanceOf(Geo.Point3);
    expect(len(normalAtUV(nurbs, 0.5, 0.5))).toBeCloseTo(1, 6);
    expect(frameAtUV(nurbs, 0.5, 0.5)).toBeInstanceOf(Geo.Plane);

    // Grid/mesh surface (square vertex grid) via Geo.evaluateSurface.
    const mesh = Geo.surfaceFromGrid(
      grid.flat(),
      4,
      4
    );
    expect(pointAtUV(mesh, 0.5, 0.5)).toBeInstanceOf(Geo.Point3);
    expect(len(normalAtUV(mesh, 0.5, 0.5))).toBeCloseTo(1, 6);
    expect(frameAtUV(mesh, 0.5, 0.5)).toBeInstanceOf(Geo.Plane);
  });

  it('throws a clear error for a genuinely non-evaluable surface', () => {
    expect(() => pointAtUV({ _type: 'Mesh3junk' }, 0, 0)).toThrow(/unsupported surface type/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Codegen ↔ runtime-Geo contract guard (mirrors tests/transform-codegen.test.js):
// every Geo.<name> the T4 thin wire (index.js) exposes must resolve to a
// FUNCTION on the assembled global Geo, so downstream node codegen (T5) that
// emits `Geo.<name>(...)` resolves at runtime.
// ──────────────────────────────────────────────────────────────────────────
describe('T4 curve/surface eval globals resolve on the assembled global Geo', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  const EXPOSED = [
    'pointAtT', 'tangentAtT', 'frameAtT', 'divideCurve',
    'pointAtUV', 'normalAtUV', 'frameAtUV', 'divideSurface'
  ];

  for (const name of EXPOSED) {
    it(`Geo.${name} is a function on the global Geo`, () => {
      expect(typeof Geo[name], `Geo.${name} must be a function on the assembled global Geo`).toBe('function');
    });
  }

  it('the exposed globals are the same functions the module exports (no shadowing)', () => {
    // Sanity: Geo.frameAtT consumes a curve and yields a Geo.Plane end to end.
    const line = new Geo.Line3(new Geo.Point3(0, 0, 0), new Geo.Point3(1, 0, 0));
    expect(Geo.frameAtT(line, 0.5)).toBeInstanceOf(Geo.Plane);
    const s = new Geo.Surface((u, v) => new Geo.Point3(u, v, 0), [0, 1], [0, 1], 4, 4);
    expect(Geo.frameAtUV(s, 0.5, 0.5)).toBeInstanceOf(Geo.Plane);
  });
});
