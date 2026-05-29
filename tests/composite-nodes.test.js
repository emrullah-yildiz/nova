// Phase 8: composite architectural nodes.
//
// Verifies each new composite (a) has a working Geo.* implementation
// (b) exposes a node definition the registry can find (c) produces
// the expected output shape so downstream nodes (Solid.ByLoft, etc.)
// can consume it.
//
// The point of these composites is to absorb the for-loops the AI used
// to dump into a Custom.Python block. With them, plan-mode can express
// "twisted tower" / "organic pavilion" / "wavy canopy" / "diagrid
// facade" / "helix" without falling back to opaque Python.

import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { Geo } from '../src/geometry/index.js';
import { NODE_TYPE_MAP } from '../src/core/nodes.js';

const registry = getLiveCoreRegistry();

describe('Geo composite helpers', () => {
  it('twistedEllipsePlates returns floors+1 rings with the requested resolution', () => {
    const profiles = Geo.twistedEllipsePlates(10, 100, 18, 12, 60, 0.2, 16);
    expect(profiles).toHaveLength(11); // 0..floors inclusive
    expect(profiles[0]).toHaveLength(16);
    // First ring sits at z=0, last at z=height.
    expect(profiles[0][0].z).toBeCloseTo(0);
    expect(profiles[10][0].z).toBeCloseTo(100);
  });

  it('twistedEllipsePlates tapers — top ring radius is smaller than the base', () => {
    const profiles = Geo.twistedEllipsePlates(20, 50, 20, 20, 0, 0.5, 24);
    const baseR = Math.hypot(profiles[0][0].x, profiles[0][0].y);
    const topR  = Math.hypot(profiles[20][0].x, profiles[20][0].y);
    expect(topR).toBeLessThan(baseR);
  });

  it('twistedEllipsePlates twist is monotonic along height (taper=0)', () => {
    const profiles = Geo.twistedEllipsePlates(10, 10, 10, 10, 90, 0, 32);
    // With taper=0 the ellipse is circular; first point's angle should
    // increase linearly. We pick angle of points[0] per ring.
    const angles = profiles.map(ring => Math.atan2(ring[0].y, ring[0].x));
    for (let i = 1; i < angles.length; i++) {
      // Angle should grow (modulo wrap) — over 90 deg total this stays
      // within 0..pi/2 so no wrap.
      expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1] - 1e-6);
    }
  });

  it('organicProfileStack pinches the middle when pinch>0', () => {
    const profiles = Geo.organicProfileStack(11, 10, 10, 24, 1);
    const baseR = Math.hypot(profiles[0][0].x, profiles[0][0].y);
    const midR  = Math.hypot(profiles[5][0].x, profiles[5][0].y);
    // With pinch=1, base ≈ 0 and middle ≈ baseRadius (it's a sin wave).
    expect(midR).toBeGreaterThan(baseR);
  });

  it('wavyGrid returns a mesh (or at minimum a points array for legacy fallback)', () => {
    const result = Geo.wavyGrid(20, 20, 5, 5, 2, 0.5, 0.5);
    // surfaceFromGrid returns an object with _type Mesh3; if it isn't
    // available the function falls back to the raw point grid.
    expect(result).toBeDefined();
    if (Array.isArray(result)) {
      expect(result).toHaveLength(25);
    } else {
      expect(result._type).toBe('Mesh3');
    }
  });

  it('helicalCurve produces segments+1 points and reaches full height after `turns` revolutions', () => {
    const pts = Geo.helicalCurve(2, 20, 5, 100);
    expect(pts).toHaveLength(101);
    expect(pts[0].z).toBeCloseTo(0);
    expect(pts[100].z).toBeCloseTo(20);
    // After 2 turns, the (x,y) returns to ≈ start.
    expect(Math.hypot(pts[100].x - 5, pts[100].y - 0)).toBeLessThan(1e-6);
  });

  it('diagridPattern returns lines that fit within the bounds', () => {
    const lines = Geo.diagridPattern(40, 30, 8, 6);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const p of line) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(40 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(30 + 1e-6);
      }
    }
  });

  it('every composite uses safe defaults when given zero/undefined args', () => {
    // Real AI prompts sometimes leave a control empty. Defaults must
    // produce a sane result rather than NaN or an empty list.
    expect(Geo.twistedEllipsePlates().length).toBeGreaterThan(0);
    expect(Geo.organicProfileStack().length).toBeGreaterThan(0);
    expect(Geo.helicalCurve().length).toBeGreaterThan(0);
    expect(Geo.diagridPattern().length).toBeGreaterThan(0);
  });
});

describe('composite node definitions', () => {
  const composites = [
    'Pattern.TwistedEllipsePlates',
    'Pattern.OrganicProfileStack',
    'Pattern.HelicalCurve',
    'Pattern.DiagridFacade',
    'Surface.WavyGrid'
  ];

  for (const type of composites) {
    it(`${type} is registered with single-line codegen.python`, () => {
      const def = NODE_TYPE_MAP[type];
      expect(def).toBeDefined();
      expect(def.codegen).toBeDefined();
      expect(typeof def.codegen.python).toBe('string');
      // The plan-mode codegen path requires a single-line template so it
      // produces parser-friendly Python; multi-line codegens fall back
      // to a comment skip.
      expect(def.codegen.python.indexOf('\n')).toBe(-1);
    });

    it(`${type} declares inputs and at least one output`, () => {
      const def = NODE_TYPE_MAP[type];
      expect(Array.isArray(def.inputs)).toBe(true);
      expect(def.inputs.length).toBeGreaterThan(0);
      expect(Array.isArray(def.outputs)).toBe(true);
      expect(def.outputs.length).toBeGreaterThan(0);
    });

    it(`${type}.execute() runs with default-typed empty inputs and returns the declared output keys`, () => {
      // execute lives on the modern registry shape; the legacy NODE_TYPE_MAP
      // strips it because that map is for UI metadata only.
      const node = registry.getNode(type);
      expect(node).toBeDefined();
      expect(typeof node.execute).toBe('function');
      const result = node.execute({}, {});
      expect(result).toBeDefined();
      for (const out of node.outputs) {
        expect(result).toHaveProperty(out.id);
      }
    });
  }

  it('Pattern.TwistedEllipsePlates output feeds Solid.ByLoft (shape compatibility)', () => {
    // The composite emits point[][] which loft accepts as a list of
    // profile curves. This is the key downstream connection the spike
    // depends on; if it ever stops working, no Tower prompt resolves.
    const node = registry.getNode('Pattern.TwistedEllipsePlates');
    const result = node.execute({}, {});
    expect(Array.isArray(result.profiles)).toBe(true);
    expect(Array.isArray(result.profiles[0])).toBe(true);
    expect(result.profiles[0][0]._type).toBe('Point3');
  });
});
