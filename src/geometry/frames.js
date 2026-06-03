// ============================================
// NOVA — Geometry Kernel: Frames
// Pure helpers that build full orthonormal frames (planes that carry an
// explicit X/Y/normal basis). The foundation the orient/transform backbone
// (transforms.js) and downstream paneling / adaptive placement build on.
//
// Pure math only — no THREE.js, no DOM. Returns Geo.Plane objects so the rest
// of the kernel (move/scaleGeo/rotate/mirror) keeps treating them as planes.
// ============================================

import { Geo } from './geometry-lib.js';

// Coerce a point-like / vector-like value to a Geo.Vector3 so it always has
// normalize/cross/dot. Mirrors the asVector() helper inside geometry-lib.js.
function asVector(v) {
  if (!v) return null;
  if (v instanceof Geo.Vector3) return v;
  return new Geo.Vector3(v.x || 0, v.y || 0, v.z || 0);
}

// Geo.Vector3 has add()/scale() but no sub(); this subtracts two vectors.
function vsub(a, b) {
  return new Geo.Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function asPoint(p) {
  if (!p) return null;
  if (p instanceof Geo.Point3) return p;
  return new Geo.Point3(p.x || 0, p.y || 0, p.z || 0);
}

// Build a Geo.Plane that carries an explicit orthonormal frame.
//
// Stock Geo.Plane only stores origin + normal and *derives* xAxis()/yAxis()
// from the normal — so it cannot hold an arbitrary in-plane orientation, and
// existing consumers call xAxis()/yAxis() as methods (src/nodes/categories/
// plane.js). To keep a full frame without shadowing those methods we attach
// the explicit basis as lowercase own-properties (xaxis/yaxis); orient() reads
// them when present and falls back to the derived axes otherwise.
export function frameFromAxes(origin, xAxis, yAxis, normal) {
  const o = asPoint(origin) || new Geo.Point3(0, 0, 0);
  const plane = new Geo.Plane(o, normal);
  plane.xaxis = xAxis;
  plane.yaxis = yAxis;
  return plane;
}

/**
 * Build a full orthonormalized frame from an origin and two (possibly
 * non-perpendicular, non-unit) in-plane axis hints. Gram-Schmidt: X is the
 * normalized xAxis, Y is the component of yAxis orthogonal to X, normal = X×Y.
 *
 * @param {Geo.Point3}  origin
 * @param {Geo.Vector3} xAxis  desired X direction (normalized)
 * @param {Geo.Vector3} yAxis  in-plane hint; orthogonalized against X
 * @returns {Geo.Plane}  plane carrying origin + orthonormal {xaxis,yaxis,normal}
 */
export function planeFromOriginXY(origin, xAxis, yAxis) {
  const o = asPoint(origin) || new Geo.Point3(0, 0, 0);
  let x = asVector(xAxis) || new Geo.Vector3(1, 0, 0);
  let yHint = asVector(yAxis) || new Geo.Vector3(0, 1, 0);

  // Degenerate X → fall back to world X.
  if (x.length() < 1e-9) x = new Geo.Vector3(1, 0, 0);
  x = x.normalize();

  // Gram-Schmidt: strip the X component out of the Y hint.
  let y = vsub(yHint, x.scale(x.dot(yHint)));
  if (y.length() < 1e-9) {
    // X and Y were parallel — pick any axis not parallel to X.
    const ref = Math.abs(x.z) < 0.9 ? new Geo.Vector3(0, 0, 1) : new Geo.Vector3(1, 0, 0);
    y = vsub(ref, x.scale(x.dot(ref)));
  }
  y = y.normalize();

  const normal = x.cross(y).normalize();
  return frameFromAxes(o, x, y, normal);
}

/**
 * Stable orthonormal frame from a point and a normal. The in-plane X axis is
 * chosen deterministically (from refXAxis when given, else a world-axis pick
 * that avoids degeneracy) and projected onto the plane.
 *
 * @param {Geo.Point3}  origin
 * @param {Geo.Vector3} normal
 * @param {Geo.Vector3} [refXAxis] optional preferred in-plane X direction
 * @returns {Geo.Plane}  plane carrying origin + orthonormal {xaxis,yaxis,normal}
 */
export function frameAt(origin, normal, refXAxis) {
  const o = asPoint(origin) || new Geo.Point3(0, 0, 0);
  let n = asVector(normal) || new Geo.Vector3(0, 0, 1);
  if (n.length() < 1e-9) n = new Geo.Vector3(0, 0, 1);
  n = n.normalize();

  // Reference direction for X: caller's hint, else a world axis not parallel
  // to the normal (the same z<0.9 trick the kernel uses elsewhere).
  let ref = asVector(refXAxis);
  if (!ref || ref.length() < 1e-9) {
    ref = Math.abs(n.z) < 0.9 ? new Geo.Vector3(0, 0, 1) : new Geo.Vector3(1, 0, 0);
  }

  // Project ref onto the plane to get X; if it was parallel to n, pick another.
  let x = vsub(ref, n.scale(n.dot(ref)));
  if (x.length() < 1e-9) {
    const alt = Math.abs(n.x) < 0.9 ? new Geo.Vector3(1, 0, 0) : new Geo.Vector3(0, 1, 0);
    x = vsub(alt, n.scale(n.dot(alt)));
  }
  x = x.normalize();

  const y = n.cross(x).normalize();
  return frameFromAxes(o, x, y, n);
}

/**
 * Resolve the orthonormal basis of a plane. Prefers the explicit frame stored
 * by frameFromAxes/planeFromOriginXY/frameAt; falls back to the plane's
 * derived xAxis()/yAxis() methods for stock Geo.Plane instances.
 *
 * @param {Geo.Plane} plane
 * @returns {{origin: Geo.Point3, xAxis: Geo.Vector3, yAxis: Geo.Vector3, normal: Geo.Vector3}}
 */
export function planeBasis(plane) {
  const origin = plane && plane.origin ? plane.origin : new Geo.Point3(0, 0, 0);
  const normal = plane && plane.normal ? plane.normal.normalize() : new Geo.Vector3(0, 0, 1);
  let xAxis = plane && plane.xaxis ? asVector(plane.xaxis).normalize() : null;
  let yAxis = plane && plane.yaxis ? asVector(plane.yaxis).normalize() : null;
  if (!xAxis) xAxis = typeof plane.xAxis === 'function' ? plane.xAxis() : new Geo.Vector3(1, 0, 0);
  if (!yAxis) yAxis = typeof plane.yAxis === 'function' ? plane.yAxis() : normal.cross(xAxis).normalize();
  return { origin, xAxis, yAxis, normal };
}

export const WorldXY = () => frameFromAxes(
  new Geo.Point3(0, 0, 0),
  new Geo.Vector3(1, 0, 0),
  new Geo.Vector3(0, 1, 0),
  new Geo.Vector3(0, 0, 1)
);
