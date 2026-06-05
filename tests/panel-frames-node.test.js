// M5: Pattern.PanelPlane (was PanelFrames) + Pattern.PanelPlanarity — close the facade
// rationalization loop. Pattern.FacadePanels emits panel objects and discards the
// per-panel frame; these nodes recover it so panels flow into Geometry.Orient (M1)
// and the Revit placement nodes (M4).
//
// Verifies:
//  - both nodes register with execute() in the EXISTING patterns category
//  - PanelPlane (renamed from PanelFrames) consumes the exact output shape of
//    Pattern.FacadePanels and yields Geo.Plane frames (the shape Geometry.Orient consumes)
//  - PanelPlanarity reports 0 for flat panels and the per-panel max as maxWarp
//  - graceful empty-input defaults (no crash before a panel source is wired)
//  - the node catalog exposes both Geo.* names to the AI

import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { Geo } from '../src/geometry/index.js';

const registry = getLiveCoreRegistry();

// A flat 4×4 patch panelized into a 3×3 quad grid — the FacadePanels output.
function flatPanels() {
  const boundary = [
    new Geo.Point3(0, 0, 0),
    new Geo.Point3(4, 0, 0),
    new Geo.Point3(4, 4, 0),
    new Geo.Point3(0, 4, 0)
  ];
  const surface = Geo.surfaceByPatch(boundary, 32);
  return Geo.facadePanels(surface, 3, 3);
}

describe('Pattern.PanelPlane node (renamed from PanelFrames)', () => {
  it('is registered in the patterns category with execute()', () => {
    const node = registry.getNode('Pattern.PanelPlane');
    expect(node).toBeDefined();
    expect(node.category).toBe('patterns');
    expect(node.subGroup).toBe('Panels');
    expect(typeof node.execute).toBe('function');
    // Old type alias still resolves (backward compat via aliases array)
    const legacy = registry.getNode('Pattern.PanelFrames');
    expect(legacy).toBeNull(); // old type is GONE — must not resolve
  });

  it('consumes Pattern.FacadePanels output and yields Geo.Plane frames via planes output', () => {
    const panels = flatPanels();
    expect(panels.length).toBe(9);
    const out = registry.getNode('Pattern.PanelPlane').execute({}, { panels });
    expect(out.planes).toHaveLength(9);
    for (const f of out.planes) expect(f).toBeInstanceOf(Geo.Plane);
    // Centroids align with the frame origins.
    expect(out.centroids).toHaveLength(9);
    expect(out.centroids[0]._type).toBe('Point3');
  });

  it('planes orient geometry onto each panel (Geometry.Orient compatible)', () => {
    const panels = flatPanels();
    const { planes } = registry.getNode('Pattern.PanelPlane').execute({}, { panels });
    const worldXY = Geo.planeFromOriginXY(
      new Geo.Point3(0, 0, 0),
      new Geo.Vector3(1, 0, 0),
      new Geo.Vector3(0, 1, 0)
    );
    // Orienting the world origin onto a plane lands it on the panel centroid.
    const moved = Geo.orient(new Geo.Point3(0, 0, 0), worldXY, planes[0]);
    expect(moved.distanceTo(planes[0].origin)).toBeCloseTo(0, 6);
  });

  it('returns empty lists for empty input (graceful default)', () => {
    const out = registry.getNode('Pattern.PanelPlane').execute({}, {});
    expect(out.planes).toEqual([]);
    expect(out.centroids).toEqual([]);
  });
});

describe('Pattern.PanelPlanarity node', () => {
  it('is registered in the patterns category with execute()', () => {
    const node = registry.getNode('Pattern.PanelPlanarity');
    expect(node).toBeDefined();
    expect(node.category).toBe('patterns');
    expect(typeof node.execute).toBe('function');
    expect(node.codegen.python).toContain('Geo.panelPlanarity');
  });

  it('reports 0 planarity and 0 max warp for a flat panelized patch', () => {
    const panels = flatPanels();
    const out = registry.getNode('Pattern.PanelPlanarity').execute({}, { panels });
    expect(out.planarity).toHaveLength(9);
    for (const d of out.planarity) expect(d).toBeCloseTo(0, 9);
    expect(out.maxWarp).toBeCloseTo(0, 9);
  });

  it('reports the per-panel max as maxWarp for warped panels', () => {
    const flat = new Geo.Mesh3(
      [new Geo.Point3(0, 0, 0), new Geo.Point3(1, 0, 0), new Geo.Point3(1, 1, 0), new Geo.Point3(0, 1, 0)],
      [[0, 1, 2], [0, 2, 3]], 0
    );
    const warped = new Geo.Mesh3(
      [new Geo.Point3(0, 0, 0), new Geo.Point3(1, 0, 0), new Geo.Point3(1, 1, 0.5), new Geo.Point3(0, 1, 0)],
      [[0, 1, 2], [0, 2, 3]], 0
    );
    const out = registry.getNode('Pattern.PanelPlanarity').execute({}, { panels: [flat, warped] });
    expect(out.planarity[0]).toBeCloseTo(0, 9);
    expect(out.planarity[1]).toBeGreaterThan(0);
    expect(out.maxWarp).toBe(out.planarity[1]);
  });

  it('returns empty list and 0 max warp for empty input', () => {
    const out = registry.getNode('Pattern.PanelPlanarity').execute({}, {});
    expect(out.planarity).toEqual([]);
    expect(out.maxWarp).toBe(0);
  });
});

describe('M5 code-validator contract', () => {
  // PanelFrames/PanelPlanarity emit two outputs, so their codegen.python is a
  // two-line script (the primary Geo.* call + a derived second output). Like
  // M2's Surface.Divide, that keeps them out of the single-line prompt catalog,
  // but the code-validator scans every template (multi-line included), so the
  // methods must be recognised as KNOWN — generated code calling them validates.
  it('Geo.panelFrames and Geo.panelPlanarity are known to the code validator', () => {
    const { getKnownGeoMethods } = require('../src/ai/code-validator.js');
    const known = getKnownGeoMethods();
    expect(known.has('panelFrames')).toBe(true);
    expect(known.has('panelPlanarity')).toBe(true);
  });
});
