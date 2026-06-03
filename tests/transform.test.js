import { describe, it, expect } from 'vitest';
import { Geo } from '../src/geometry/index.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';
import { transformNodes } from '../src/nodes/categories/transform.js';
import { planeFromOriginXY } from '../src/geometry/frames.js';

// ──────────────────────────────────────────────────────────────────────────
// T2 — Transform & Frame node category.
//
// These nodes expose the T1 kernel backbone (frames.js / transforms.js) as
// modern Nova nodes. The suite checks every node registers cleanly in a fresh
// core registry and runs one execute() smoke per node, anchoring the keystone
// orient (World-XY → tilted plane), the count-based polar array, and the
// framed plane constructor.
// ──────────────────────────────────────────────────────────────────────────

const P = (x, y, z) => new Geo.Point3(x, y, z);
const V = (x, y, z) => new Geo.Vector3(x, y, z);

function run(type, inputs) {
  const node = transformNodes.find((n) => n.type === type);
  if (!node) throw new Error(`node not found: ${type}`);
  return node.execute({}, inputs);
}

describe('transform category — registration', () => {
  it('registers every transform node in a fresh core registry', () => {
    const registry = createCoreNodeRegistry();
    const expected = [
      'Plane.ByOriginXAxisYAxis',
      'Geometry.Orient',
      'Geometry.ArrayLinear',
      'Geometry.ArrayPolar'
    ];
    for (const type of expected) {
      expect(registry.hasNode(type), `${type} should be registered`).toBe(true);
    }
  });

  it('ships exactly the four transform nodes under the Transform category', () => {
    const registry = createCoreNodeRegistry();
    const types = transformNodes.map((n) => n.type);
    expect(types).toEqual([
      'Plane.ByOriginXAxisYAxis',
      'Geometry.Orient',
      'Geometry.ArrayLinear',
      'Geometry.ArrayPolar'
    ]);
    for (const node of transformNodes) {
      expect(registry.getNode(node.type).category).toBe('transform');
    }
  });
});

describe('Plane.ByOriginXAxisYAxis', () => {
  it('returns a Geo Plane whose frame is orthonormal', () => {
    const { plane } = run('Plane.ByOriginXAxisYAxis', {
      origin: P(0, 0, 0),
      xAxis: V(1, 0, 0),
      // deliberately non-orthogonal Y hint — Gram-Schmidt should fix it
      yAxis: V(1, 1, 0)
    });
    expect(plane._type).toBe('Plane');
    // X stays (1,0,0); Y is orthogonalised to (0,1,0); normal is +Z.
    expect(plane.normal.x).toBeCloseTo(0, 6);
    expect(plane.normal.y).toBeCloseTo(0, 6);
    expect(plane.normal.z).toBeCloseTo(1, 6);
    expect(plane.xaxis.x).toBeCloseTo(1, 6);
    expect(plane.yaxis.y).toBeCloseTo(1, 6);
    expect(plane.yaxis.x).toBeCloseTo(0, 6);
  });
});

describe('Geometry.Orient (keystone)', () => {
  it('maps a point from World-XY to a tilted plane where expected', () => {
    // Source: World-XY at origin. Target: frame at (10,0,0) whose X axis is
    // world +Z and Y axis is world +Y → its normal is world -X.
    const fromPlane = planeFromOriginXY(P(0, 0, 0), V(1, 0, 0), V(0, 1, 0));
    const toPlane = planeFromOriginXY(P(10, 0, 0), V(0, 0, 1), V(0, 1, 0));

    // A point 2 along source-X, 3 along source-Y.
    const { result } = run('Geometry.Orient', {
      geometry: P(2, 3, 0),
      fromPlane,
      toPlane
    });

    expect(result._type).toBe('Point3');
    // local (a=2 along X→world+Z, b=3 along Y→world+Y, c=0) rebuilt at origin (10,0,0):
    //   x = 10, y = 3, z = 2
    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(3, 6);
    expect(result.z).toBeCloseTo(2, 6);
  });

  it('preserves length when orienting a line World-XY → tilted frame', () => {
    const fromPlane = planeFromOriginXY(P(0, 0, 0), V(1, 0, 0), V(0, 1, 0));
    const toPlane = planeFromOriginXY(P(5, 5, 5), V(0, 0, 1), V(0, 1, 0));
    const line = new Geo.Line3(P(0, 0, 0), P(3, 4, 0)); // length 5
    const { result } = run('Geometry.Orient', { geometry: line, fromPlane, toPlane });
    expect(result._type).toBe('Line3');
    expect(result.length()).toBeCloseTo(5, 6);
  });
});

describe('Geometry.ArrayLinear (count + per-step vector)', () => {
  it('produces Count copies offset by i × direction (copy 0 is the original)', () => {
    const { result } = run('Geometry.ArrayLinear', {
      geometry: P(0, 0, 0),
      direction: V(2, 0, 0),
      count: 4
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(4);
    expect(result[0].x).toBeCloseTo(0, 6);
    expect(result[1].x).toBeCloseTo(2, 6);
    expect(result[3].x).toBeCloseTo(6, 6);
  });
});

describe('Geometry.ArrayPolar (count + total-angle in degrees)', () => {
  it('count=4 over 360° yields 4 items at 90° steps', () => {
    const { result } = run('Geometry.ArrayPolar', {
      geometry: P(1, 0, 0),
      center: P(0, 0, 0),
      axis: V(0, 0, 1),
      count: 4,
      angle: 360
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(4);
    // 90° step: (1,0,0) → (0,1,0) → (-1,0,0) → (0,-1,0)
    expect(result[1].x).toBeCloseTo(0, 6);
    expect(result[1].y).toBeCloseTo(1, 6);
    expect(result[2].x).toBeCloseTo(-1, 6);
    expect(result[2].y).toBeCloseTo(0, 6);
  });

  it('defaults to a full 360° turn when angle is omitted', () => {
    const { result } = run('Geometry.ArrayPolar', {
      geometry: P(1, 0, 0),
      center: P(0, 0, 0),
      axis: V(0, 0, 1),
      count: 3
    });
    expect(result.length).toBe(3);
    // full-turn 3 copies → 120° step; copy 1 at 120°
    expect(result[1].x).toBeCloseTo(Math.cos(2 * Math.PI / 3), 6);
    expect(result[1].y).toBeCloseTo(Math.sin(2 * Math.PI / 3), 6);
  });
});
