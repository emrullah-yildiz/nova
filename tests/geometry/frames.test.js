import { Geo } from '../../src/geometry/index.js';
import { planeFromOriginXY, frameAt, planeBasis } from '../../src/geometry/frames.js';

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

describe('frames', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  it('planeFromOriginXY orthonormalizes non-perpendicular input axes', () => {
    const origin = new Geo.Point3(1, 2, 3);
    // X and Y are NOT perpendicular (Y leans into X).
    const x = new Geo.Vector3(2, 0, 0);          // not unit length
    const y = new Geo.Vector3(1, 1, 0);          // 45° to X
    const plane = planeFromOriginXY(origin, x, y);
    const b = planeBasis(plane);

    // Unit length.
    expect(len(b.xAxis)).toBeCloseTo(1);
    expect(len(b.yAxis)).toBeCloseTo(1);
    expect(len(b.normal)).toBeCloseTo(1);
    // Mutually orthogonal.
    expect(dot(b.xAxis, b.yAxis)).toBeCloseTo(0);
    expect(dot(b.xAxis, b.normal)).toBeCloseTo(0);
    expect(dot(b.yAxis, b.normal)).toBeCloseTo(0);
    // X kept its direction (along world +X), normal points +Z, right-handed.
    expect(b.xAxis.x).toBeCloseTo(1);
    expect(b.normal.z).toBeCloseTo(1);
    // Origin carried through.
    expect(plane.origin.x).toBeCloseTo(1);
    expect(plane.origin.z).toBeCloseTo(3);
  });

  it('planeFromOriginXY handles parallel X/Y hints without producing NaN', () => {
    const plane = planeFromOriginXY(
      new Geo.Point3(0, 0, 0),
      new Geo.Vector3(1, 0, 0),
      new Geo.Vector3(2, 0, 0) // parallel to X
    );
    const b = planeBasis(plane);
    expect(len(b.yAxis)).toBeCloseTo(1);
    expect(dot(b.xAxis, b.yAxis)).toBeCloseTo(0);
    expect(Number.isNaN(b.normal.x)).toBe(false);
  });

  it('frameAt builds a stable orthonormal basis from a point + normal', () => {
    const n = new Geo.Vector3(0, 0, 5); // non-unit Z
    const plane = frameAt(new Geo.Point3(4, 5, 6), n);
    const b = planeBasis(plane);

    expect(b.normal.z).toBeCloseTo(1);
    expect(len(b.xAxis)).toBeCloseTo(1);
    expect(len(b.yAxis)).toBeCloseTo(1);
    expect(dot(b.xAxis, b.normal)).toBeCloseTo(0);
    expect(dot(b.yAxis, b.normal)).toBeCloseTo(0);
    expect(dot(b.xAxis, b.yAxis)).toBeCloseTo(0);
    // Right-handed: xAxis × yAxis === normal.
    const cx = b.xAxis.cross(b.yAxis);
    expect(cx.x).toBeCloseTo(b.normal.x);
    expect(cx.y).toBeCloseTo(b.normal.y);
    expect(cx.z).toBeCloseTo(b.normal.z);
  });

  it('frameAt honors a reference X axis, projected onto the plane', () => {
    // Tilted normal; ask for X near world +X.
    const plane = frameAt(
      new Geo.Point3(0, 0, 0),
      new Geo.Vector3(0, 0, 1),
      new Geo.Vector3(1, 0, 0)
    );
    const b = planeBasis(plane);
    expect(b.xAxis.x).toBeCloseTo(1);
    expect(b.xAxis.y).toBeCloseTo(0);
    expect(b.xAxis.z).toBeCloseTo(0);
  });

  it('returns a Geo.Plane (_type preserved) so the kernel still treats it as a plane', () => {
    const plane = frameAt(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 1, 0));
    expect(plane._type).toBe('Plane');
    // Derived methods still callable (not shadowed by stored frame).
    expect(typeof plane.xAxis).toBe('function');
    expect(typeof plane.yAxis).toBe('function');
  });
});
