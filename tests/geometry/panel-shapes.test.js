/**
 * tests/geometry/panel-shapes.test.js
 *
 * Unit tests for the Input.PanelShapes shape source (TICK-014 / T14a).
 * Covers AC-1 (registry + dropdown options + Shape output) and AC-2 (each
 * dropdown option yields a distinct closed shape with the expected corner count).
 */

import { describe, it, expect } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import {
  PANEL_SHAPE_OPTIONS,
  DEFAULT_PANEL_SHAPE,
  panelShapeCorners,
  panelShapeCurve,
  normalizePanelShape
} from '../../src/geometry/panel-shapes.js';
import { inputPanelShapesNode } from '../../src/geometry/nodes/Input.PanelShapes.js';
import { coreNodes } from '../../src/nodes/coreNodes.js';

describe('panel-shapes — unit shape builders', () => {
  it('AC-2: square has 4 corners, hexagon has 6, diagonal/rectangle 4', () => {
    expect(panelShapeCorners('Square').length).toBe(4);
    expect(panelShapeCorners('Hexagon').length).toBe(6);
    expect(panelShapeCorners('Diagonal').length).toBe(4);
    expect(panelShapeCorners('Rectangle').length).toBe(4);
  });

  it('AC-2: circle is a closed many-sided polygon (distinctly more corners than square)', () => {
    const circle = panelShapeCorners('Circle');
    expect(circle.length).toBeGreaterThan(8);
    // Circle corner count differs from every straight-edged option.
    expect(circle.length).not.toBe(panelShapeCorners('Square').length);
  });

  it('AC-2: every option produces a CLOSED Geo.Polyline3 with no NaN coordinates', () => {
    for (const opt of PANEL_SHAPE_OPTIONS) {
      const curve = panelShapeCurve(opt);
      expect(curve._type).toBe('Polyline3');
      expect(curve.closed).toBe(true);
      expect(curve.points.length).toBeGreaterThanOrEqual(3);
      for (const p of curve.points) {
        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
        expect(Number.isNaN(p.z)).toBe(false);
      }
    }
  });

  it('AC-2: shapes are unit-sized and centred on the origin (extent within the unit cell)', () => {
    for (const opt of PANEL_SHAPE_OPTIONS) {
      const pts = panelShapeCorners(opt);
      let cx = 0, cy = 0;
      for (const p of pts) { cx += p.x; cy += p.y; }
      cx /= pts.length; cy /= pts.length;
      // Centroid at origin (within tolerance) and all corners inside [-0.5,0.5].
      expect(Math.abs(cx)).toBeLessThan(1e-9);
      expect(Math.abs(cy)).toBeLessThan(1e-9);
      for (const p of pts) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it('normalizePanelShape is case-insensitive and falls back to the default', () => {
    expect(normalizePanelShape('hexagon')).toBe('Hexagon');
    expect(normalizePanelShape('CIRCLE')).toBe('Circle');
    expect(normalizePanelShape('nonsense')).toBe(DEFAULT_PANEL_SHAPE);
    expect(normalizePanelShape(undefined)).toBe(DEFAULT_PANEL_SHAPE);
  });
});

describe('Input.PanelShapes — node definition (AC-1)', () => {
  it('AC-1: registered in the Input category with a single Shape output', () => {
    const node = coreNodes.find((n) => n.type === 'Input.PanelShapes');
    expect(node).toBeTruthy();
    expect(node.category).toBe('input');
    expect(node.outputs).toHaveLength(1);
    expect(node.outputs[0].id).toBe('shape');
  });

  it('AC-1: exposes a dropdown whose options include the 5 required shapes', () => {
    const ctrl = inputPanelShapesNode.controls.find((c) => c.type === 'dropdown');
    expect(ctrl).toBeTruthy();
    for (const opt of ['Diagonal', 'Rectangle', 'Square', 'Hexagon', 'Circle']) {
      expect(ctrl.options).toContain(opt);
    }
  });

  it('AC-2: execute() with different dropdown options returns different shapes', () => {
    const square = inputPanelShapesNode.execute({}, {}, { shape: 'Square' }).shape;
    const hexagon = inputPanelShapesNode.execute({}, {}, { shape: 'Hexagon' }).shape;
    expect(square._type).toBe('Polyline3');
    expect(hexagon._type).toBe('Polyline3');
    expect(square.points.length).toBe(4);
    expect(hexagon.points.length).toBe(6);
  });

  it('node icon is a Unicode glyph, not a text abbreviation', () => {
    expect(inputPanelShapesNode.icon).toBe('⬡');
    expect(inputPanelShapesNode.icon.length).toBeLessThanOrEqual(2);
    expect(Geo).toBeTruthy(); // import guard
  });
});
