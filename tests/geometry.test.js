import { Geo } from '../src/geometry/index.js';

describe('Geo geometry kernel', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') {
      globalThis.window = globalThis;
    }
  });

  it('calculates Point3 distance correctly', () => {
    const a = new Geo.Point3(1, 2, 3);
    const b = new Geo.Point3(4, 5, 6);
    expect(a.distanceTo(b)).toBeCloseTo(Math.sqrt(27));
  });

  it('supports Point3 arithmetic and lerp', () => {
    const a = new Geo.Point3(0, 0, 0);
    const b = new Geo.Point3(10, 0, 0);
    const mid = a.lerp(b, 0.5);
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(0);
    expect(mid.z).toBe(0);
  });

  it('computes Vector3 cross and dot products', () => {
    const x = new Geo.Vector3(1, 0, 0);
    const y = new Geo.Vector3(0, 1, 0);
    expect(x.dot(y)).toBe(0);
    const cross = x.cross(y);
    expect(cross.z).toBe(1);
    expect(cross.length()).toBeCloseTo(1);
  });

  it('loads advanced geometry helpers into the moduleized kernel', () => {
    const line = new Geo.Line3(new Geo.Point3(0, 0, 0), new Geo.Point3(0, 0, 5));
    const pipe = Geo.pipe(line, 0.5, 4, 8);

    expect(pipe._type).toBe('Mesh3');
    expect(pipe._solidType).toBe('Sweep');
    expect(pipe.vertices.length).toBeGreaterThan(0);
  });

  it('loads NURBS helpers into the moduleized kernel', () => {
    const curve = Geo.createNurbsCurve([
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(5, 5, 0),
      new Geo.Point3(10, 0, 0)
    ], 2);

    const point = curve.evaluate(0.5);

    expect(curve._type).toBe('NurbsCurve');
    expect(point).toBeInstanceOf(Geo.Point3);
    expect(point.x).toBeGreaterThan(0);
  });
});
