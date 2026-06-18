import { describe, it, expect, beforeAll } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import { pointAtUV, normalAtUV } from '../../src/geometry/surface-eval.js';

// Surface.ByPatch produces a fan/centroid mesh with no square vertex grid.
// These tests verify it carries a PLANAR bilinear UV parametrization so a
// uniform (u,v) grid from Surface.PointAtParameter FILLS the patch's 2D extent
// like a Cartesian grid — instead of (a) collapsing onto a few clustered mesh
// vertices (the old grid-sampler) or (b) radiating as polar spokes / a "cross
// not a grid" (the interim polar parametrization). The single-point interior
// win of the polar fix is preserved: (0.5,0.5) → patch centroid.
describe('Surface.ByPatch UV evaluation', () => {
  beforeAll(() => { if (typeof window === 'undefined') globalThis.window = globalThis; });

  const P = (x, y, z) => new Geo.Point3(x, y, z);
  // A square patch in the XY plane, centred at the origin, spanning [-5,5]².
  const squarePatch = () => Geo.surfaceByPatch(
    new Geo.Polyline3([P(-5, -5, 0), P(5, -5, 0), P(5, 5, 0), P(-5, 5, 0)], true),
    4
  );
  // A circular patch (radius 5, origin, XY plane) — the help.example producer.
  const circlePatch = () => Geo.surfaceByPatch(
    new Geo.Circle3(P(0, 0, 0), 5, new Geo.Vector3(0, 0, 1)),
    32
  );

  it('the patch mesh is flagged UV-evaluable (planar + legacy polar)', () => {
    const s = squarePatch();
    expect(s._type).toBe('Mesh3');
    expect(s._isPatch).toBe(true);
    expect(typeof s.evaluatePlanar).toBe('function');
    // Legacy polar evaluate is retained for any consumer that still wants it.
    expect(typeof s.evaluate).toBe('function');
  });

  it('(0.5, 0.5) returns the patch centroid (preserves the accb60e interior win)', () => {
    const s = circlePatch();
    const c = pointAtUV(s, 0.5, 0.5);
    // Circle patch centroid is the origin.
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
    expect(Math.abs(c.y)).toBeLessThan(1e-6);
    expect(Math.abs(c.z)).toBeLessThan(1e-9);
  });

  it('(0,0) and (1,1) map to OPPOSITE bbox corners (not the same point)', () => {
    const s = squarePatch();
    const a = pointAtUV(s, 0, 0);
    const b = pointAtUV(s, 1, 1);
    // Square spans [-5,5]² → corners at (-5,-5) and (5,5).
    expect(a.x).toBeCloseTo(-5, 6);
    expect(a.y).toBeCloseTo(-5, 6);
    expect(b.x).toBeCloseTo(5, 6);
    expect(b.y).toBeCloseTo(5, 6);
  });

  it('u and v move the point in TWO INDEPENDENT directions (a grid, not spokes)', () => {
    const s = squarePatch();
    // Hold v, vary u → moves along the bbox X axis (Y roughly fixed).
    const uA = pointAtUV(s, 0.2, 0.5);
    const uB = pointAtUV(s, 0.8, 0.5);
    expect(Math.abs(uB.x - uA.x)).toBeGreaterThan(1); // X changes with u
    expect(Math.abs(uB.y - uA.y)).toBeLessThan(1e-6); // Y fixed when v fixed
    // Hold u, vary v → moves along the bbox Y axis (X roughly fixed).
    const vA = pointAtUV(s, 0.5, 0.2);
    const vB = pointAtUV(s, 0.5, 0.8);
    expect(Math.abs(vB.y - vA.y)).toBeGreaterThan(1); // Y changes with v
    expect(Math.abs(vB.x - vA.x)).toBeLessThan(1e-6); // X fixed when u fixed
  });

  it('a uniform 5×5 (u,v) grid FILLS the bbox — many distinct points, large hull area, not a cross', () => {
    const s = circlePatch(); // radius 5 → bbox [-5,5]²
    const grid = [];
    const seen = new Set();
    for (let iu = 0; iu < 5; iu++) {
      for (let iv = 0; iv < 5; iv++) {
        const p = pointAtUV(s, iu / 4, iv / 4);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
        grid.push(p);
        seen.add(`${p.x.toFixed(3)},${p.y.toFixed(3)}`);
      }
    }
    // The interim polar parametrization produced only 17 distinct points of 25
    // (a plus/asterisk: 5 spokes × 5 radii sharing a centre + endpoint overlaps).
    // A real Cartesian grid keeps ALL 25 distinct.
    expect(seen.size).toBe(25);

    // The grid must span both X and Y broadly (≈ the full [-5,5] bbox), not lie
    // on a thin cross. Compare the convex-hull-ish bbox area of the sampled
    // points to the patch bbox area: a filling grid covers nearly all of it.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of grid) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    expect(maxX - minX).toBeGreaterThan(9); // spans ~[-5,5] in X
    expect(maxY - minY).toBeGreaterThan(9); // spans ~[-5,5] in Y

    // Not a cross: for a FIXED v band (the middle row, v=0.5), varying u must
    // visit MANY distinct X values — a spoke set would collapse these onto one
    // radial line (constant X or constant Y). Here every u step is a distinct X.
    const rowXs = new Set();
    for (let iu = 0; iu < 5; iu++) {
      const p = pointAtUV(s, iu / 4, 0.5);
      rowXs.add(p.x.toFixed(3));
    }
    expect(rowXs.size).toBe(5);
  });

  it('all evaluated points stay in the patch plane (z≈0)', () => {
    const s = squarePatch();
    for (let iu = 0; iu <= 4; iu++) {
      for (let iv = 0; iv <= 4; iv++) {
        const p = pointAtUV(s, iu / 4, iv / 4);
        expect(Math.abs(p.z)).toBeLessThan(1e-9);
      }
    }
  });

  it('normalAtUV on a flat XY patch is unit length and axial (±Z)', () => {
    const s = squarePatch();
    const n = normalAtUV(s, 0.3, 0.6);
    const len = Math.hypot(n.x, n.y, n.z);
    expect(len).toBeCloseTo(1, 6);
    expect(Math.abs(n.z)).toBeCloseTo(1, 6);
  });
});
