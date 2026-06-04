import { describe, it, expect, beforeAll } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import { panelFrames, panelPlanarity } from '../../src/geometry/panel-frames.js';
import { planeBasis } from '../../src/geometry/frames.js';

function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

// A flat unit quad in the XY plane (z = 0), as a Mesh3 the way Pattern.Facade-
// Panels emits them: 4 corner vertices, two triangles.
function flatQuad(z = 0) {
  return new Geo.Mesh3(
    [
      new Geo.Point3(0, 0, z),
      new Geo.Point3(1, 0, z),
      new Geo.Point3(1, 1, z),
      new Geo.Point3(0, 1, z)
    ],
    [[0, 1, 2], [0, 2, 3]],
    0xfab387
  );
}

// A warped quad: one corner lifted off the z=0 plane by `warp`.
function warpedQuad(warp) {
  return new Geo.Mesh3(
    [
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(1, 0, 0),
      new Geo.Point3(1, 1, warp),
      new Geo.Point3(0, 1, 0)
    ],
    [[0, 1, 2], [0, 2, 3]],
    0xfab387
  );
}

// A vertical quad in the XZ plane → normal should be ±Y.
function verticalQuad() {
  return new Geo.Mesh3(
    [
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(2, 0, 0),
      new Geo.Point3(2, 0, 2),
      new Geo.Point3(0, 0, 2)
    ],
    [[0, 1, 2], [0, 2, 3]],
    0xfab387
  );
}

describe('panel-frames', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  it('panelFrames returns one Geo.Plane per panel', () => {
    const frames = panelFrames([flatQuad(), flatQuad(3)]);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toBeInstanceOf(Geo.Plane);
    expect(frames[1]).toBeInstanceOf(Geo.Plane);
  });

  it('frame origin is the panel centroid', () => {
    const [frame] = panelFrames([flatQuad()]);
    expect(frame.origin.x).toBeCloseTo(0.5, 9);
    expect(frame.origin.y).toBeCloseTo(0.5, 9);
    expect(frame.origin.z).toBeCloseTo(0, 9);
  });

  it('flat XY quad → frame normal is ±Z, orthonormal basis', () => {
    const [frame] = panelFrames([flatQuad()]);
    const b = planeBasis(frame);
    expect(Math.abs(b.normal.z)).toBeCloseTo(1, 9);
    expect(b.normal.x).toBeCloseTo(0, 9);
    expect(b.normal.y).toBeCloseTo(0, 9);
    // Orthonormal: unit axes, mutually perpendicular.
    expect(len(b.xAxis)).toBeCloseTo(1, 9);
    expect(len(b.yAxis)).toBeCloseTo(1, 9);
    expect(b.xAxis.dot(b.yAxis)).toBeCloseTo(0, 9);
    expect(b.xAxis.dot(b.normal)).toBeCloseTo(0, 9);
  });

  it('vertical XZ quad → frame normal is ±Y', () => {
    const [frame] = panelFrames([verticalQuad()]);
    const b = planeBasis(frame);
    expect(Math.abs(b.normal.y)).toBeCloseTo(1, 9);
    expect(b.normal.x).toBeCloseTo(0, 9);
    expect(b.normal.z).toBeCloseTo(0, 9);
  });

  it('produced frame is consumable by Geometry.Orient (Geo.orient)', () => {
    const [frame] = panelFrames([flatQuad(5)]);
    // Orient the world origin onto the frame: result should sit at the centroid.
    const from = Geo.planeFromOriginXY(
      new Geo.Point3(0, 0, 0),
      new Geo.Vector3(1, 0, 0),
      new Geo.Vector3(0, 1, 0)
    );
    const moved = Geo.orient(new Geo.Point3(0, 0, 0), from, frame);
    expect(moved.x).toBeCloseTo(0.5, 6);
    expect(moved.y).toBeCloseTo(0.5, 6);
    expect(moved.z).toBeCloseTo(5, 6);
  });

  it('panelPlanarity is 0 for a perfectly flat quad', () => {
    const dev = panelPlanarity([flatQuad(), flatQuad(7)]);
    expect(dev).toHaveLength(2);
    expect(dev[0]).toBeCloseTo(0, 9);
    expect(dev[1]).toBeCloseTo(0, 9);
  });

  it('panelPlanarity is > 0 for a warped quad and grows with warp', () => {
    const small = panelPlanarity([warpedQuad(0.1)])[0];
    const large = panelPlanarity([warpedQuad(1.0)])[0];
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
  });

  it('degenerate inputs are handled (empty list, < 3 corners)', () => {
    expect(panelFrames([])).toEqual([]);
    expect(panelPlanarity([])).toEqual([]);
    expect(panelFrames(null)).toEqual([]);
    expect(panelPlanarity(undefined)).toEqual([]);
    const degenerate = new Geo.Mesh3([new Geo.Point3(0, 0, 0), new Geo.Point3(1, 0, 0)], [], 0);
    expect(panelFrames([degenerate])[0]).toBeNull();
    expect(panelPlanarity([degenerate])[0]).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Codegen ↔ runtime-Geo contract guard: the M5 globals the index.js thin wire
// exposes must resolve to FUNCTIONS on the assembled global Geo so the
// Pattern.Panel* node codegen that emits `Geo.<name>(...)` resolves at runtime.
// ──────────────────────────────────────────────────────────────────────────
describe('M5 panel-frame globals resolve on the assembled global Geo', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  for (const name of ['panelFrames', 'panelPlanarity']) {
    it(`Geo.${name} is a function on the global Geo`, () => {
      expect(typeof Geo[name], `Geo.${name} must be a function on the assembled global Geo`).toBe('function');
    });
  }

  it('Geo.panelFrames yields Geo.Plane frames end to end', () => {
    const quad = new Geo.Mesh3(
      [new Geo.Point3(0, 0, 0), new Geo.Point3(1, 0, 0), new Geo.Point3(1, 1, 0), new Geo.Point3(0, 1, 0)],
      [[0, 1, 2], [0, 2, 3]],
      0
    );
    const frames = Geo.panelFrames([quad]);
    expect(frames[0]).toBeInstanceOf(Geo.Plane);
    expect(Geo.panelPlanarity([quad])[0]).toBeCloseTo(0, 9);
  });
});
