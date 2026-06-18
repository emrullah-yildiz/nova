import { describe, it, expect, beforeAll } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import { pointAtUV, normalAtUV } from '../../src/geometry/surface-eval.js';

// Surface.ByPatch produces a fan/centroid mesh with no square vertex grid.
// These tests verify it carries a proper polar UV parametrization so points
// from Surface.PointAtUV spread across the patch interior instead of collapsing
// onto a few clustered positions (the old grid-sampler behaviour).
describe('Surface.ByPatch UV evaluation', () => {
  beforeAll(() => { if (typeof window === 'undefined') globalThis.window = globalThis; });

  const P = (x, y, z) => new Geo.Point3(x, y, z);
  // A unit-ish square patch in the XY plane, centred at the origin.
  const squarePatch = () => Geo.surfaceByPatch(
    new Geo.Polyline3([P(-5, -5, 0), P(5, -5, 0), P(5, 5, 0), P(-5, 5, 0)], true),
    4
  );

  it('the patch mesh is flagged UV-evaluable', () => {
    const s = squarePatch();
    expect(s._type).toBe('Mesh3');
    expect(s._isPatch).toBe(true);
    expect(typeof s.evaluate).toBe('function');
  });

  it('v=0 returns the centroid for any u', () => {
    const s = squarePatch();
    const a = pointAtUV(s, 0, 0);
    const b = pointAtUV(s, 0.5, 0);
    const c = pointAtUV(s, 0.9, 0);
    for (const p of [a, b, c]) {
      expect(Math.abs(p.x)).toBeLessThan(1e-9);
      expect(Math.abs(p.y)).toBeLessThan(1e-9);
      expect(Math.abs(p.z)).toBeLessThan(1e-9);
    }
  });

  it('points spread across the interior (many distinct positions on a UV grid)', () => {
    const s = squarePatch();
    const seen = new Set();
    let maxR = 0;
    for (let iu = 0; iu < 5; iu++) {
      for (let iv = 0; iv < 5; iv++) {
        const u = iu / 4, v = iv / 4;
        const p = pointAtUV(s, u, v);
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
        seen.add(`${p.x.toFixed(3)},${p.y.toFixed(3)}`);
        maxR = Math.max(maxR, Math.hypot(p.x, p.y));
      }
    }
    // A real spread yields many distinct points (the old broken eval collapsed
    // these to a tiny cluster), and reaches out toward the boundary.
    expect(seen.size).toBeGreaterThan(10);
    expect(maxR).toBeGreaterThan(3);
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
