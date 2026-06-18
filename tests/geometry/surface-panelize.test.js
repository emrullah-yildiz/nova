/**
 * tests/geometry/surface-panelize.test.js
 *
 * Unit tests for the Surface.Panelize geometry kernel node (TICK-014 / T14a).
 * Covers:
 *   AC-3 — registry: Surfaces category, Surface+Shape+Scale (+U,V) inputs,
 *          outputs exactly Panels/Corners/Center.
 *   AC-4 — multi-cell surface yields panels.length > 1.
 *   AC-5 — center.length === panels.length; corners grouped per panel; each
 *          centre lies inside its panel's corner bounds.
 *   AC-6 — larger Scale → larger corner spread (and small scale leaves gaps).
 *   AC-7 — the node help.example is a runnable producer→focal→consumer graph
 *          that produces real (non-NaN) panel geometry.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import {
  surfacePanelizeNode,
  panelizeSurface
} from '../../src/geometry/nodes/Surface.Panelize.js';
import { panelShapeCurve } from '../../src/geometry/panel-shapes.js';
import { coreNodes } from '../../src/nodes/coreNodes.js';

// A flat parametric Surface in the XY plane spanning [0,10]×[0,10] → normal +Z.
function makeFlatSurface() {
  return new Geo.Surface(
    (u, v) => new Geo.Point3(u, v, 0),
    [0, 10],
    [0, 10],
    10,
    10
  );
}

// Max pairwise distance between a panel's corner points = its "spread".
function cornerSpread(corners) {
  let max = 0;
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      const d = Math.hypot(
        corners[i].x - corners[j].x,
        corners[i].y - corners[j].y,
        corners[i].z - corners[j].z
      );
      if (d > max) max = d;
    }
  }
  return max;
}

describe('Surface.Panelize — node registry (AC-3)', () => {
  it('AC-3: registered in Surfaces with Surface+Shape+Scale (+U,V) inputs', () => {
    const node = coreNodes.find((n) => n.type === 'Surface.Panelize');
    expect(node).toBeTruthy();
    expect(node.category).toBe('surfaces');
    const inputIds = node.inputs.map((i) => i.id);
    expect(inputIds).toContain('surface');
    expect(inputIds).toContain('shape');
    expect(inputIds).toContain('scale');
    expect(inputIds).toContain('u');
    expect(inputIds).toContain('v');
  });

  it('AC-3: outputs are exactly Panels, Corners, Center (in order)', () => {
    const node = coreNodes.find((n) => n.type === 'Surface.Panelize');
    expect(node.outputs.map((o) => o.id)).toEqual(['panels', 'corners', 'center']);
  });

  it('AC-3: Scale is BOTH a controls property and a wireable input', () => {
    const node = coreNodes.find((n) => n.type === 'Surface.Panelize');
    expect(node.inputs.some((i) => i.id === 'scale')).toBe(true);
    expect(node.controls.some((c) => c.id === 'scale')).toBe(true);
  });

  it('node icon is a Unicode glyph, not a text abbreviation', () => {
    expect(surfacePanelizeNode.icon).toBe('▦');
  });
});

describe('Surface.Panelize — paneling kernel', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  it('AC-4: a multi-cell surface yields panels.length > 1', () => {
    const surface = makeFlatSurface();
    const shape = panelShapeCurve('Square');
    const out = panelizeSurface(surface, shape, 4, 4, 0.9);
    expect(out.panels.length).toBe(16);
    expect(out.panels.length).toBeGreaterThan(1);
    // Panels are meshes the viewer renders (same Mesh3 shape as Surface.ByPatch).
    for (const m of out.panels) {
      expect(m._type).toBe('Mesh3');
      expect(m.vertices.length).toBeGreaterThan(0);
      expect(m.faces.length).toBeGreaterThan(0);
    }
  });

  it('AC-5: center.length === panels.length and corners are grouped per panel', () => {
    const surface = makeFlatSurface();
    const out = panelizeSurface(surface, panelShapeCurve('Square'), 3, 5, 0.9);
    expect(out.center.length).toBe(out.panels.length);
    expect(out.corners.length).toBe(out.panels.length);
    // Square → 4 corners per panel group.
    for (const group of out.corners) {
      expect(Array.isArray(group)).toBe(true);
      expect(group.length).toBe(4);
    }
  });

  it('AC-5: each centre lies inside its panel corner bounds', () => {
    const surface = makeFlatSurface();
    const out = panelizeSurface(surface, panelShapeCurve('Square'), 3, 3, 0.9);
    for (let i = 0; i < out.panels.length; i++) {
      const group = out.corners[i];
      const c = out.center[i];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of group) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      expect(c.x).toBeGreaterThanOrEqual(minX - 1e-9);
      expect(c.x).toBeLessThanOrEqual(maxX + 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(minY - 1e-9);
      expect(c.y).toBeLessThanOrEqual(maxY + 1e-9);
    }
  });

  it('AC-6: larger Scale → larger corner spread per panel', () => {
    const surface = makeFlatSurface();
    const shape = panelShapeCurve('Square');
    const small = panelizeSurface(surface, shape, 4, 4, 0.5);
    const large = panelizeSurface(surface, shape, 4, 4, 1.5);
    // Compare the same (first) panel under two scales.
    const spreadSmall = cornerSpread(small.corners[0]);
    const spreadLarge = cornerSpread(large.corners[0]);
    expect(spreadLarge).toBeGreaterThan(spreadSmall);
    // Roughly proportional to the scale ratio (1.5 / 0.5 = 3×).
    expect(spreadLarge / spreadSmall).toBeGreaterThan(2);
  });

  it('AC-6: small scale leaves gaps — panel is smaller than its cell', () => {
    const surface = makeFlatSurface();
    // Surface is 10 units wide, 4 cells → cell width 2.5; a 0.5-scale square
    // panel spans ~1.25 across, clearly smaller than the cell (gaps).
    const out = panelizeSurface(surface, panelShapeCurve('Square'), 4, 4, 0.5);
    const spread = cornerSpread(out.corners[0]);
    // Diagonal of a 1.25×1.25 square ≈ 1.77, well under the 2.5 cell width.
    expect(spread).toBeLessThan(2.5);
  });

  it('non-numeric / missing surface returns empty outputs, never throws', () => {
    const out = panelizeSurface(null, panelShapeCurve('Square'), 4, 4, 1);
    expect(out.panels).toEqual([]);
    expect(out.corners).toEqual([]);
    expect(out.center).toEqual([]);
  });

  it('execute(): wired scale input overrides the controls property', () => {
    const surface = makeFlatSurface();
    const shape = panelShapeCurve('Square');
    const viaInput = surfacePanelizeNode.execute({}, { surface, shape, scale: 1.5 }, { u: 4, v: 4, scale: 0.5 });
    const viaControl = surfacePanelizeNode.execute({}, { surface, shape }, { u: 4, v: 4, scale: 0.5 });
    expect(cornerSpread(viaInput.corners[0])).toBeGreaterThan(cornerSpread(viaControl.corners[0]));
  });
});

describe('Surface.Panelize — tessellation (gap-free hexagon honeycomb)', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  // Edge midpoints of a panel's corner loop (closed: last → first).
  function edgeMidpoints(corners) {
    const mids = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      mids.push([(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2]);
    }
    return mids;
  }

  // Nearest other-panel edge midpoint for every edge in the layout. Returns the
  // sorted list of those nearest distances. A perfectly tessellated layout has
  // every INTERIOR edge sharing a neighbour exactly (distance ≈ 0); only the
  // outer boundary edges (no neighbour) have a large nearest distance.
  function nearestEdgeDistances(out) {
    const allMids = out.corners.map(edgeMidpoints);
    const dists = [];
    for (let p = 0; p < allMids.length; p++) {
      for (const m of allMids[p]) {
        let best = Infinity;
        for (let q = 0; q < allMids.length; q++) {
          if (q === p) continue;
          for (const n of allMids[q]) {
            const d = Math.hypot(m[0] - n[0], m[1] - n[1], m[2] - n[2]);
            if (d < best) best = d;
          }
        }
        dists.push(best);
      }
    }
    return dists.sort((a, b) => a - b);
  }

  // Count edges whose nearest neighbour edge is coincident (< eps) — i.e. SHARED.
  function sharedEdgeCount(out, eps = 1e-6) {
    return nearestEdgeDistances(out).filter((d) => d < eps).length;
  }

  // Index of every panel whose centre lies strictly inside the [0,W]×[0,H] world
  // domain (not on the outer boundary), so all its edges should be shared.
  function interiorPanelIndices(out, w, h, margin) {
    const idx = [];
    out.center.forEach((c, i) => {
      if (c.x > margin && c.x < w - margin && c.y > margin && c.y < h - margin) idx.push(i);
    });
    return idx;
  }

  // The flat surface spans world [0,10]² (evaluate maps native u,v → x,y). A 4×4
  // hex lattice has ~2.5-unit world column/row pitch; the diamond row pitch ~1.25.
  const W = 10, H = 10;

  it('hexagon panels tessellate gap-free at scale 1 (every interior hex edge is shared)', () => {
    const surface = makeFlatSurface();
    const out = panelizeSurface(surface, panelShapeCurve('Hexagon'), 4, 4, 1.0);
    // Honeycomb covers extra staggered centres → more panels than a 4×4 grid.
    expect(out.panels.length).toBeGreaterThan(16);
    // Each panel is a hexagon (6 corners).
    for (const group of out.corners) expect(group.length).toBe(6);
    // The defining property: every edge of a fully-interior hexagon coincides
    // with a neighbour's edge (shared edges, no gap). Margin = half a pitch.
    const interiorIdx = interiorPanelIndices(out, W, H, 1.3);
    expect(interiorIdx.length).toBeGreaterThan(0);
    for (const i of interiorIdx) {
      for (const m of edgeMidpoints(out.corners[i])) {
        let best = Infinity;
        out.corners.forEach((grp, q) => {
          if (q === i) return;
          for (const n of edgeMidpoints(grp)) {
            best = Math.min(best, Math.hypot(m[0] - n[0], m[1] - n[1], m[2] - n[2]));
          }
        });
        expect(best).toBeLessThan(1e-6); // edge is shared → gap is zero
      }
    }
    // Sanity: a large number of edges are shared overall (vs the old buggy grid,
    // which shared NONE for hexagons — every hex sat gapped in its own cell).
    expect(sharedEdgeCount(out)).toBeGreaterThan(30);
  });

  it('hexagon scale < 1 opens uniform reveal gaps (no edges coincide any more)', () => {
    const surface = makeFlatSurface();
    const full = panelizeSurface(surface, panelShapeCurve('Hexagon'), 4, 4, 1.0);
    const shrunk = panelizeSurface(surface, panelShapeCurve('Hexagon'), 4, 4, 0.6);
    // Same lattice → same panel count; only the per-panel size changes.
    expect(shrunk.panels.length).toBe(full.panels.length);
    // At scale 1 many edges coincide; at 0.6 every panel shrinks about its
    // centre so NO edges are shared (a uniform reveal gap opens up).
    expect(sharedEdgeCount(full)).toBeGreaterThan(30);
    expect(sharedEdgeCount(shrunk)).toBe(0);
  });

  it('diagonal (diamond) panels tessellate gap-free at scale 1 (shared edges)', () => {
    const surface = makeFlatSurface();
    const out = panelizeSurface(surface, panelShapeCurve('Diagonal'), 4, 4, 1.0);
    expect(out.panels.length).toBeGreaterThan(1);
    for (const group of out.corners) expect(group.length).toBe(4);
    const interiorIdx = interiorPanelIndices(out, W, H, 1.3);
    expect(interiorIdx.length).toBeGreaterThan(0);
    for (const i of interiorIdx) {
      for (const m of edgeMidpoints(out.corners[i])) {
        let best = Infinity;
        out.corners.forEach((grp, q) => {
          if (q === i) return;
          for (const n of edgeMidpoints(grp)) {
            best = Math.min(best, Math.hypot(m[0] - n[0], m[1] - n[1], m[2] - n[2]));
          }
        });
        expect(best).toBeLessThan(1e-6);
      }
    }
  });

  it('regression: Square still tiles as an exact 4×4 grid with shared edges', () => {
    const surface = makeFlatSurface();
    const out = panelizeSurface(surface, panelShapeCurve('Square'), 4, 4, 1.0);
    // Square is unchanged: a plain 4×4 grid (no stagger).
    expect(out.panels.length).toBe(16);
    for (const group of out.corners) expect(group.length).toBe(4);
    // Adjacent squares share edges (interior grid lines coincide).
    expect(sharedEdgeCount(out)).toBeGreaterThan(0);
  });

  it('Circle is unchanged: per-cell grid (round shapes inherently leave gaps)', () => {
    const surface = makeFlatSurface();
    const out = panelizeSurface(surface, panelShapeCurve('Circle'), 4, 4, 1.0);
    // No staggering, no honeycomb — a plain 4×4 grid of circle approximations.
    expect(out.panels.length).toBe(16);
  });
});

describe('Surface.Panelize — help.example runs (AC-7)', () => {
  // Execute the node graph in the help.example by hand-wiring the same nodes,
  // verifying it produces real (non-NaN) panel geometry in the Watch consumer.
  it('AC-7: the help.example graph produces visible panels (no NaN/undefined)', () => {
    // Producer chain: a circle patch surface + a Square panel shape.
    const center = new Geo.Point3(0, 0, 0);
    const circle = new Geo.Circle3(center, 5, new Geo.Vector3(0, 0, 1));
    const surface = Geo.surfaceByPatch(circle, 32);
    const shape = panelShapeCurve('Square');

    // Focal node: Surface.Panelize via its execute() (the example's wiring).
    const out = surfacePanelizeNode.execute({}, { surface, shape }, { u: 4, v: 4, scale: 0.9 });

    // Consumer (Output.Watch) would render `panels` — assert real geometry.
    expect(out.panels.length).toBeGreaterThan(1);
    expect(out.center.length).toBe(out.panels.length);
    for (const m of out.panels) {
      expect(m._type).toBe('Mesh3');
      for (const v of m.vertices) {
        expect(Number.isNaN(v.x)).toBe(false);
        expect(Number.isNaN(v.y)).toBe(false);
        expect(Number.isNaN(v.z)).toBe(false);
      }
    }
  });
});
