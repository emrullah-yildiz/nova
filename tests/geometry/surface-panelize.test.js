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
