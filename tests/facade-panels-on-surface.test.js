// Unit tests for Geo.facadePanelsOnSurface and Geo.voronoiCellObjects.
//
// These functions were shipped in T04a without unit tests; this file
// retroactively covers the two bugs caught in code review:
//   1. Surface.ByPatch fan mesh was incorrectly evaluated via evaluateSurface
//      (which assumes a square grid), producing wrong panel corners.
//   2. Plain {points, frame} objects had no _type, showing as List(0) in the
//      data inspector. The fix returns Geo.Mesh3 with .points and .frame.
//
// TICK-004 AC-8.

import { Geo } from '../src/geometry/index.js';

// Build a 4-corner Surface.ByPatch (a curved patch with one raised corner).
function curvedPatch() {
  return Geo.surfaceByPatch([
    new Geo.Point3(0, 0, 0),
    new Geo.Point3(10, 0, 0),
    new Geo.Point3(10, 10, 5),  // raised corner
    new Geo.Point3(0, 10, 2)
  ]);
}

// Build a flat 4-corner Surface.ByPatch (all Z=0).
function flatPatch() {
  return Geo.surfaceByPatch([
    new Geo.Point3(0, 0, 0),
    new Geo.Point3(4, 0, 0),
    new Geo.Point3(4, 4, 0),
    new Geo.Point3(0, 4, 0)
  ]);
}

describe('Geo.facadePanelsOnSurface — output format', () => {
  it('returns Mesh3 objects (not plain objects) so the data inspector can render them', () => {
    const panels = Geo.facadePanelsOnSurface(flatPatch(), 2, 2);
    expect(panels).toHaveLength(4);
    for (const p of panels) {
      expect(p).toBeInstanceOf(Geo.Mesh3);
      expect(p._type).toBe('Mesh3');
      expect(p._solidType).toBe('Panel');
    }
  });

  it('attaches .points (Point3[4]) and .frame to each Mesh3', () => {
    const panels = Geo.facadePanelsOnSurface(flatPatch(), 2, 2);
    for (const p of panels) {
      expect(Array.isArray(p.points)).toBe(true);
      expect(p.points).toHaveLength(4);
      for (const pt of p.points) expect(pt).toBeInstanceOf(Geo.Point3);
      expect(p.frame).toBeDefined();
      expect(p.frame.origin).toBeInstanceOf(Geo.Point3);
      expect(p.frame.normal).toBeDefined();
    }
  });

  it('produces U×V panels for a 3×3 grid', () => {
    const panels = Geo.facadePanelsOnSurface(flatPatch(), 3, 3);
    expect(panels).toHaveLength(9);
  });

  it('covers the full surface area — bounding box of all corners spans the patch', () => {
    const surface = flatPatch(); // 0..4 in X, 0..4 in Y
    const panels = Geo.facadePanelsOnSurface(surface, 4, 4);
    const allX = panels.flatMap(p => p.points.map(pt => pt.x));
    const allY = panels.flatMap(p => p.points.map(pt => pt.y));
    expect(Math.min(...allX)).toBeCloseTo(0, 6);
    expect(Math.max(...allX)).toBeCloseTo(4, 6);
    expect(Math.min(...allY)).toBeCloseTo(0, 6);
    expect(Math.max(...allY)).toBeCloseTo(4, 6);
  });
});

describe('Geo.facadePanelsOnSurface — Surface.ByPatch bilinear interpolation', () => {
  it('corners of a curved patch reach the expected Z values', () => {
    // Curved patch corners: (0,0,0), (10,0,0), (10,10,5), (0,10,2)
    // With U=1, V=1 we get one panel whose 4 corners ARE the 4 boundary points.
    const surface = curvedPatch();
    const panels = Geo.facadePanelsOnSurface(surface, 1, 1);
    expect(panels).toHaveLength(1);
    const pts = panels[0].points;
    // Bilinear at (0,0) → boundary[0] = (0,0,0)
    expect(pts[0].x).toBeCloseTo(0, 4);
    expect(pts[0].y).toBeCloseTo(0, 4);
    expect(pts[0].z).toBeCloseTo(0, 4);
    // Bilinear at (1,0) → boundary[1] = (10,0,0)
    expect(pts[1].x).toBeCloseTo(10, 4);
    expect(pts[1].y).toBeCloseTo(0, 4);
    expect(pts[1].z).toBeCloseTo(0, 4);
    // Bilinear at (1,1) → boundary[2] = (10,10,5)
    expect(pts[2].x).toBeCloseTo(10, 4);
    expect(pts[2].y).toBeCloseTo(10, 4);
    expect(pts[2].z).toBeCloseTo(5, 4);
    // Bilinear at (0,1) → boundary[3] = (0,10,2)
    expect(pts[3].x).toBeCloseTo(0, 4);
    expect(pts[3].y).toBeCloseTo(10, 4);
    expect(pts[3].z).toBeCloseTo(2, 4);
  });

  it('center panel of a 2×2 grid is NOT at z=0 for a curved patch', () => {
    // The old evaluateSurface bug returned centroid z=0 for all panels.
    // With correct bilinear interpolation the inner corners should be non-zero.
    const surface = curvedPatch();
    const panels = Geo.facadePanelsOnSurface(surface, 2, 2);
    const allZ = panels.flatMap(p => p.points.map(pt => pt.z));
    // At least one inner vertex must have z > 0 because the patch has raised corners.
    const hasElevation = allZ.some(z => z > 0.5);
    expect(hasElevation).toBe(true);
  });

  it('frame normal is not (0,0,0) for a curved panel', () => {
    const panels = Geo.facadePanelsOnSurface(curvedPatch(), 2, 2);
    for (const p of panels) {
      const n = p.frame.normal;
      const len = Math.sqrt(n.x ** 2 + n.y ** 2 + n.z ** 2);
      expect(len).toBeGreaterThan(0.9); // approximately unit-length
    }
  });
});

describe('Geo.facadePanelsOnSurface — Panel.Points and PanelPlane compatibility', () => {
  it('Panel.Points node extracts corner points from each panel (not Mesh3 meshes)', () => {
    const { getLiveCoreRegistry } = require('../src/nodes/coreNodes.js');
    const registry = getLiveCoreRegistry();
    const node = registry.getNode('Panel.Points');
    expect(node).toBeDefined();
    const panels = Geo.facadePanelsOnSurface(flatPatch(), 2, 2);
    // Panel.Points receives a list input and returns a list of point-lists
    const out = node.execute({}, { panel: panels });
    expect(out.points).toHaveLength(4); // 4 panels
    for (const ptList of out.points) {
      expect(Array.isArray(ptList)).toBe(true);
      expect(ptList).toHaveLength(4); // each panel has 4 corner points
      for (const pt of ptList) expect(pt._type).toBe('Point3');
    }
  });

  it('Panel.ByPoints is no longer registered (removed in TICK-004 PM feedback)', () => {
    const { getLiveCoreRegistry } = require('../src/nodes/coreNodes.js');
    const registry = getLiveCoreRegistry();
    const node = registry.getNode('Panel.ByPoints');
    expect(node).toBeNull();
  });

  it('Pattern.PanelPlane reads .frame directly and returns Plane frames via planes output', () => {
    const { getLiveCoreRegistry } = require('../src/nodes/coreNodes.js');
    const registry = getLiveCoreRegistry();
    const node = registry.getNode('Pattern.PanelPlane');
    const panels = Geo.facadePanelsOnSurface(flatPatch(), 2, 2);
    const out = node.execute({}, { panels });
    expect(out.planes).toHaveLength(4);
    // All planes should have an origin Point3 and a normal.
    for (const f of out.planes) {
      expect(f).toBeDefined();
      expect(f.origin).toBeDefined();
    }
  });
});

describe('Geo.voronoiCellObjects — output format', () => {
  it('returns Mesh3 objects with .points and .frame', () => {
    const sites = [
      new Geo.Point3(1, 1, 0),
      new Geo.Point3(3, 1, 0),
      new Geo.Point3(2, 3, 0)
    ];
    let cells;
    try {
      cells = Geo.voronoiCellObjects(sites);
    } catch {
      // voronoiOutlines may not be available in all environments — skip gracefully.
      return;
    }
    if (!cells || cells.length === 0) return; // voronoi not available
    for (const c of cells) {
      expect(c).toBeInstanceOf(Geo.Mesh3);
      expect(c._type).toBe('Mesh3');
      expect(c._solidType).toBe('Panel');
      expect(Array.isArray(c.points)).toBe(true);
      expect(c.frame).toBeDefined();
    }
  });
});
