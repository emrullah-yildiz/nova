import fs from 'fs';
import path from 'path';

let Geo = null;

describe('Geo geometry kernel', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') {
      globalThis.window = globalThis;
    }
    const libPath = path.resolve(process.cwd(), 'geometry-lib.js');
    const code = fs.readFileSync(libPath, 'utf8');
    eval(code);
    Geo = globalThis.Geo || Geo;
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
});
