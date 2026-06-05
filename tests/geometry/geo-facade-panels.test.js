// NOVA — Geometry Kernel: Facade Panels Unit Tests (T04a / AC-8)
//
// Asserts that Geo.facadePanelsOnSurface:
//   1. Returns the expected count of panel objects for a given U×V grid.
//   2. Each panel object has the contract shape: { points: Point3[4], frame: Plane }.
//   3. When a curved surface (corners at different Z) is given, the panel
//      corner points[0].z values are NOT all equal — they follow the surface shape.
//   4. When a flat mesh is given (fallback path), a flat surface produces panels
//      whose corner z values are all equal (regression guard).

import { describe, it, expect, beforeAll } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import { facadePanelsOnSurface } from '../../src/geometry/geo-facade-panels.js';

// Build a bilinear-patch Mesh3 from 4 corner points. This is the same shape
// that Surface.ByPatch would produce for a 4-point boundary — it has a `_type`
// of 'Mesh3' so surface-eval's resolveSurface picks it up correctly.
function makePatch(p00, p10, p11, p01) {
  // Minimal 2×2 grid mesh: 4 vertices, 2 triangles.
  return new Geo.Mesh3(
    [p00, p10, p11, p01],
    [[0, 1, 2], [0, 2, 3]],
    0xfab387
  );
}

// AC-8 curved surface: four non-coplanar corners at different Z heights.
function curvedPatch() {
  return makePatch(
    new Geo.Point3(0, 0, 0),   // (0,0)  z=0
    new Geo.Point3(10, 0, 0),  // (1,0)  z=0
    new Geo.Point3(10, 10, 5), // (1,1)  z=5
    new Geo.Point3(0, 10, 2)   // (0,1)  z=2
  );
}

// Flat surface: all corners at z=0.
function flatPatch() {
  return makePatch(
    new Geo.Point3(0, 0, 0),
    new Geo.Point3(10, 0, 0),
    new Geo.Point3(10, 10, 0),
    new Geo.Point3(0, 10, 0)
  );
}

describe('geo-facade-panels (T04a / AC-8)', () => {
  beforeAll(() => {
    // The kernel may attach globals to window in a browser context.
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  // ── Count ───────────────────────────────────────────────────────────────

  it('returns exactly U×V panel objects for a 4×4 grid', () => {
    const panels = facadePanelsOnSurface(curvedPatch(), 4, 4);
    expect(panels).toHaveLength(16);
  });

  it('returns exactly U×V panel objects for a 2×3 grid', () => {
    const panels = facadePanelsOnSurface(curvedPatch(), 2, 3);
    expect(panels).toHaveLength(6);
  });

  // ── Contract shape ───────────────────────────────────────────────────────

  it('each panel object has a points array with 4 items', () => {
    const panels = facadePanelsOnSurface(curvedPatch(), 4, 4);
    for (const panel of panels) {
      expect(panel).toBeDefined();
      expect(Array.isArray(panel.points)).toBe(true);
      expect(panel.points).toHaveLength(4);
    }
  });

  it('each panel has a frame with origin, xAxis, yAxis, normal', () => {
    const panels = facadePanelsOnSurface(curvedPatch(), 4, 4);
    for (const panel of panels) {
      expect(panel.frame).toBeDefined();
      expect(panel.frame.origin).toBeDefined();
      expect(panel.frame.normal).toBeDefined();
      // xAxis and yAxis are computed (may fall back to defaults on degenerate panels).
    }
  });

  // ── AC-8: curved surface → corner Z values differ ────────────────────────

  it('AC-8: points[0].z values are NOT all equal on a curved surface (4×4)', () => {
    const panels = facadePanelsOnSurface(curvedPatch(), 4, 4);
    expect(panels).toHaveLength(16);
    const z0Values = panels.map((p) => p.points[0].z);
    const allEqual = z0Values.every((z) => Math.abs(z - z0Values[0]) < 1e-9);
    expect(allEqual).toBe(false);
  });

  it('AC-8: frame normals are not all pointing straight up on a curved surface', () => {
    const panels = facadePanelsOnSurface(curvedPatch(), 4, 4);
    // On a curved surface, at least one panel normal should have a non-zero XY component.
    const hasAngle = panels.some((p) => {
      const n = p.frame.normal;
      return Math.abs(n.x) > 0.01 || Math.abs(n.y) > 0.01;
    });
    expect(hasAngle).toBe(true);
  });

  // ── Flat surface regression guard ────────────────────────────────────────

  it('on a flat patch all points[0].z values are equal (regression guard)', () => {
    const panels = facadePanelsOnSurface(flatPatch(), 4, 4);
    expect(panels).toHaveLength(16);
    const z0Values = panels.map((p) => p.points[0].z);
    const allEqual = z0Values.every((z) => Math.abs(z) < 1e-9);
    expect(allEqual).toBe(true);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('does not throw and returns panel objects when surface is null (flat XY fallback)', () => {
    // When no surface is given the sampler falls back to a flat XY parametric
    // grid; the function still produces U*V panels on the unit [0,1]^2 plane.
    // This matches the "no surface -> flat tessellation" fallback contract.
    let panels;
    expect(() => { panels = facadePanelsOnSurface(null, 4, 4); }).not.toThrow();
    expect(Array.isArray(panels)).toBe(true);
    expect(panels.length).toBe(16);
    // All z values should be 0 in the flat fallback.
    for (const p of panels) {
      for (const pt of p.points) {
        expect(Math.abs(pt.z)).toBeLessThan(1e-9);
      }
    }
  });

  it('does not throw when surface is undefined (flat XY fallback)', () => {
    let panels;
    expect(() => { panels = facadePanelsOnSurface(undefined, 4, 4); }).not.toThrow();
    expect(Array.isArray(panels)).toBe(true);
    expect(panels.length).toBe(16);
  });

  it('clamps negative U/V to at least 1 (no crash)', () => {
    const panels = facadePanelsOnSurface(flatPatch(), -1, 0);
    expect(panels.length).toBeGreaterThanOrEqual(1);
  });
});
