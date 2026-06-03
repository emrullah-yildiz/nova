import { Geo } from '../../src/geometry/index.js';
import { frameAt, WorldXY } from '../../src/geometry/frames.js';
import { orient, rotate, mirror, arrayLinear, arrayPolar } from '../../src/geometry/transforms.js';

function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

describe('transforms', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  describe('orient', () => {
    it('round-trips a point from world XY to a tilted plane and back', () => {
      const world = WorldXY();
      // Arbitrary tilted target frame.
      const tilted = frameAt(
        new Geo.Point3(10, -3, 4),
        new Geo.Vector3(1, 2, 3),
        new Geo.Vector3(0, 1, 0)
      );

      const p = new Geo.Point3(2, 5, 0); // a point in the world XY plane
      const moved = orient(p, world, tilted);
      const back = orient(moved, tilted, world);

      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
      expect(back.z).toBeCloseTo(p.z);
      // It actually moved on the way out.
      expect(moved.distanceTo(p)).toBeGreaterThan(0.5);
    });

    it("maps a frame's origin to the target origin", () => {
      const from = frameAt(new Geo.Point3(1, 1, 1), new Geo.Vector3(0, 0, 1));
      const to = frameAt(new Geo.Point3(7, 8, 9), new Geo.Vector3(0, 1, 0));
      const atOrigin = orient(from.origin, from, to);
      expect(atOrigin.x).toBeCloseTo(7);
      expect(atOrigin.y).toBeCloseTo(8);
      expect(atOrigin.z).toBeCloseTo(9);
    });

    it('preserves geometry _type across every supported kind', () => {
      const a = WorldXY();
      const b = frameAt(new Geo.Point3(5, 5, 5), new Geo.Vector3(0, 1, 1));

      const samples = [
        new Geo.Point3(1, 0, 0),
        new Geo.Line3(new Geo.Point3(0, 0, 0), new Geo.Point3(1, 1, 0)),
        new Geo.Polyline3([new Geo.Point3(0, 0, 0), new Geo.Point3(1, 0, 0), new Geo.Point3(1, 1, 0)], true),
        new Geo.Circle3(new Geo.Point3(0, 0, 0), 2, new Geo.Vector3(0, 0, 1)),
        new Geo.Arc3(new Geo.Point3(0, 0, 0), 2, 0, Math.PI, new Geo.Vector3(0, 0, 1)),
        new Geo.Ellipse3(new Geo.Point3(0, 0, 0), 4, 2, new Geo.Vector3(0, 0, 1)),
        Geo.createBox(new Geo.Point3(0, 0, 0), 2, 2, 2)
      ];

      for (const g of samples) {
        const out = orient(g, a, b);
        expect(out._type).toBe(g._type);
      }
    });

    it('preserves a circle radius (rigid motion, no scale)', () => {
      const a = WorldXY();
      const b = frameAt(new Geo.Point3(3, 3, 3), new Geo.Vector3(1, 1, 0));
      const c = new Geo.Circle3(new Geo.Point3(0, 0, 0), 2.5, new Geo.Vector3(0, 0, 1));
      const out = orient(c, a, b);
      expect(out.radius).toBeCloseTo(2.5);
      expect(len(out.normal)).toBeCloseTo(1);
    });
  });

  describe('rotate', () => {
    it('rotates a point 90deg about world Z and preserves _type', () => {
      const p = new Geo.Point3(1, 0, 0);
      const r = rotate(p, new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1), Math.PI / 2);
      expect(r._type).toBe('Point3');
      expect(r.x).toBeCloseTo(0);
      expect(r.y).toBeCloseTo(1);
      expect(r.z).toBeCloseTo(0);
    });
  });

  describe('mirror', () => {
    it('mirrors a point across the world YZ plane (normal +X)', () => {
      const plane = frameAt(new Geo.Point3(0, 0, 0), new Geo.Vector3(1, 0, 0));
      const p = new Geo.Point3(3, 2, 1);
      const m = mirror(p, plane);
      expect(m._type).toBe('Point3');
      expect(m.x).toBeCloseTo(-3);
      expect(m.y).toBeCloseTo(2);
      expect(m.z).toBeCloseTo(1);
    });
  });

  describe('arrayLinear', () => {
    it('produces count copies stepped by vector, first copy unmoved', () => {
      const p = new Geo.Point3(0, 0, 0);
      const items = arrayLinear(p, new Geo.Vector3(2, 0, 0), 4);
      expect(items.length).toBe(4);
      expect(items[0].x).toBeCloseTo(0);
      expect(items[1].x).toBeCloseTo(2);
      expect(items[3].x).toBeCloseTo(6);
      items.forEach(it => expect(it._type).toBe('Point3'));
    });

    it('returns [] for count < 1', () => {
      expect(arrayLinear(new Geo.Point3(0, 0, 0), new Geo.Vector3(1, 0, 0), 0)).toEqual([]);
    });
  });

  describe('arrayPolar', () => {
    it('count=4 over 2*PI yields 4 items at 90deg steps', () => {
      const p = new Geo.Point3(1, 0, 0);
      const items = arrayPolar(p, new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1), 4, Math.PI * 2);
      expect(items.length).toBe(4);
      // 0deg, 90deg, 180deg, 270deg around the origin.
      expect(items[0].x).toBeCloseTo(1);
      expect(items[0].y).toBeCloseTo(0);
      expect(items[1].x).toBeCloseTo(0);
      expect(items[1].y).toBeCloseTo(1);
      expect(items[2].x).toBeCloseTo(-1);
      expect(items[3].y).toBeCloseTo(-1);
      items.forEach(it => expect(it._type).toBe('Point3'));
    });

    it('partial sweep places endpoints inclusively (count-1 steps)', () => {
      const p = new Geo.Point3(1, 0, 0);
      // 3 copies over 180deg → 0, 90, 180.
      const items = arrayPolar(p, new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1), 3, Math.PI);
      expect(items.length).toBe(3);
      expect(items[0].x).toBeCloseTo(1);
      expect(items[1].y).toBeCloseTo(1);
      expect(items[2].x).toBeCloseTo(-1);
    });

    it('defaults to a full turn when totalAngle is omitted', () => {
      const p = new Geo.Point3(1, 0, 0);
      const items = arrayPolar(p, new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1), 4);
      expect(items.length).toBe(4);
      expect(items[2].x).toBeCloseTo(-1);
    });
  });
});
