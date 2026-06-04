import { describe, it, expect, beforeAll } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import {
  pointAtT,
  tangentAtT,
  frameAtT,
  divideCurve
} from '../../src/geometry/curve-eval.js';
import { planeBasis } from '../../src/geometry/frames.js';

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

describe('curve-eval', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  const makeLine = () => new Geo.Line3(new Geo.Point3(0, 0, 0), new Geo.Point3(10, 0, 0));

  it('pointAtT on a Line3 hits start / mid / end at t = 0 / 0.5 / 1', () => {
    const line = makeLine();
    const p0 = pointAtT(line, 0);
    const pm = pointAtT(line, 0.5);
    const p1 = pointAtT(line, 1);
    expect([p0.x, p0.y, p0.z]).toEqual([0, 0, 0]);
    expect([pm.x, pm.y, pm.z]).toEqual([5, 0, 0]);
    expect([p1.x, p1.y, p1.z]).toEqual([10, 0, 0]);
  });

  it('tangentAtT is unit-length and points along the line', () => {
    const line = makeLine();
    const tan = tangentAtT(line, 0.5);
    expect(len(tan)).toBeCloseTo(1, 9);
    expect(tan.x).toBeCloseTo(1, 9);
    expect(tan.y).toBeCloseTo(0, 9);
    expect(tan.z).toBeCloseTo(0, 9);
  });

  it('frameAtT origin lies on the curve and its normal is the (perpendicular) tangent', () => {
    const line = makeLine();
    const t = 0.3;
    const frame = frameAtT(line, t);
    const onCurve = pointAtT(line, t);
    const tan = tangentAtT(line, t);

    // Origin on the curve.
    expect(frame.origin.distanceTo(onCurve)).toBeCloseTo(0, 9);

    const b = planeBasis(frame);
    // Frame normal IS the unit tangent (curve runs along local Z).
    expect(b.normal.x).toBeCloseTo(tan.x, 9);
    expect(b.normal.y).toBeCloseTo(tan.y, 9);
    expect(b.normal.z).toBeCloseTo(tan.z, 9);

    // In-plane X / Y are perpendicular to the tangent and unit-length.
    expect(dot(b.xAxis, tan)).toBeCloseTo(0, 9);
    expect(dot(b.yAxis, tan)).toBeCloseTo(0, 9);
    expect(len(b.xAxis)).toBeCloseTo(1, 9);
    expect(len(b.yAxis)).toBeCloseTo(1, 9);
    // Orthonormal basis.
    expect(dot(b.xAxis, b.yAxis)).toBeCloseTo(0, 9);
  });

  it('divideCurve on an OPEN curve returns count+1 points (GH segment convention)', () => {
    const line = makeLine();
    const { points, frames } = divideCurve(line, 4);
    expect(points.length).toBe(5);
    expect(frames.length).toBe(5);
    // Evenly spaced by parameter: endpoints + interior.
    expect(points[0].x).toBeCloseTo(0, 9);
    expect(points[4].x).toBeCloseTo(10, 9);
    expect(points[2].x).toBeCloseTo(5, 9);
    // Every frame is a real Geo.Plane carrying an explicit frame.
    for (const f of frames) {
      expect(f).toBeInstanceOf(Geo.Plane);
      expect(f.xaxis).toBeTruthy();
      expect(f.yaxis).toBeTruthy();
    }
  });

  it('divideCurve on a CLOSED curve returns exactly count points (drops the duplicate end)', () => {
    const circle = new Geo.Circle3(new Geo.Point3(0, 0, 0), 5, new Geo.Vector3(0, 0, 1));
    const { points } = divideCurve(circle, 6);
    expect(points.length).toBe(6);
    // All on the circle (radius 5 in the XY plane).
    for (const p of points) {
      expect(Math.sqrt(p.x * p.x + p.y * p.y)).toBeCloseTo(5, 6);
    }
  });

  it('evaluates a Polyline3, an Arc3, and a NurbsCurve without throwing and stays on-curve', () => {
    const poly = new Geo.Polyline3([
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(0, 4, 0),
      new Geo.Point3(3, 4, 0)
    ], false);
    expect(pointAtT(poly, 0).distanceTo(new Geo.Point3(0, 0, 0))).toBeCloseTo(0, 9);
    expect(pointAtT(poly, 1).distanceTo(new Geo.Point3(3, 4, 0))).toBeCloseTo(0, 6);
    expect(len(tangentAtT(poly, 0.5))).toBeCloseTo(1, 9);

    const arc = new Geo.Arc3(new Geo.Point3(0, 0, 0), 2, 0, Math.PI / 2, new Geo.Vector3(0, 0, 1));
    expect(len(tangentAtT(arc, 0.5))).toBeCloseTo(1, 9);
    const ap = pointAtT(arc, 0.5);
    expect(Math.sqrt(ap.x * ap.x + ap.y * ap.y)).toBeCloseTo(2, 6);

    const nurbs = new Geo.NurbsCurve([
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(1, 3, 0),
      new Geo.Point3(4, 3, 0),
      new Geo.Point3(5, 0, 0)
    ], 3);
    // t=1 must not collapse to (0,0,0): clamps to the NURBS domain end.
    const nEnd = pointAtT(nurbs, 1);
    expect(nEnd.distanceTo(new Geo.Point3(0, 0, 0))).toBeGreaterThan(1);
    expect(len(tangentAtT(nurbs, 0.5))).toBeCloseTo(1, 6);
    const nf = frameAtT(nurbs, 0.5);
    expect(nf).toBeInstanceOf(Geo.Plane);
  });
});
