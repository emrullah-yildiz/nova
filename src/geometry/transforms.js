// ============================================
// NOVA — Geometry Kernel: Transforms
// The frame/orient transform backbone. orient() is the keystone op (map
// geometry from a source frame to a target frame); rotate/mirror/array round
// out the rigid-motion toolkit that paneling and adaptive placement build on.
//
// Pure math only — no THREE.js, no DOM. Every op returns a Geo object of the
// SAME _type as its input (or an array of them), never a plain dict, matching
// the move()/scaleGeo()/rotate()/mirror() per-_type switch convention.
// ============================================

import { Geo } from './geometry-lib.js';
// Side-effect import: registers Geo.rotate / Geo.mirror (and the Rodrigues +
// reflection helpers) onto the shared Geo object. We compose these rather than
// reimplement them.
import './geo-advanced.js';
import { planeBasis } from './frames.js';

function asVector(v) {
  if (!v) return null;
  if (v instanceof Geo.Vector3) return v;
  return new Geo.Vector3(v.x || 0, v.y || 0, v.z || 0);
}

// Apply a point/direction remap across every geometry type, mirroring the
// move()/scaleGeo() switch. `mapPoint` moves positions (with translation);
// `mapDir` rotates free directions (normals, axes — no translation).
function applyPointMap(geometry, mapPoint, mapDir, reverseWinding) {
  if (!geometry) return geometry;

  if (geometry._type === 'Point3') return mapPoint(geometry);

  if (geometry._type === 'Line3') {
    return new Geo.Line3(mapPoint(geometry.start), mapPoint(geometry.end));
  }
  if (geometry._type === 'Polyline3') {
    return new Geo.Polyline3(geometry.points.map(mapPoint), geometry.closed);
  }
  if (geometry._type === 'Circle3') {
    return new Geo.Circle3(mapPoint(geometry.center), geometry.radius, mapDir(geometry.normal));
  }
  if (geometry._type === 'Arc3') {
    return new Geo.Arc3(
      mapPoint(geometry.center),
      geometry.radius,
      geometry.startAngle,
      geometry.endAngle,
      mapDir(geometry.normal)
    );
  }
  if (geometry._type === 'Ellipse3') {
    return new Geo.Ellipse3(
      mapPoint(geometry.center),
      geometry.width,
      geometry.depth,
      mapDir(geometry.normal),
      mapDir(geometry.xAxis)
    );
  }
  if (geometry._type === 'Mesh3') {
    const faces = reverseWinding
      ? geometry.faces.map(f => [f[0], f[2], f[1]])
      : geometry.faces.slice();
    const m = new Geo.Mesh3(geometry.vertices.map(mapPoint), faces, geometry.color);
    m._solidType = geometry._solidType;
    return m;
  }
  return geometry;
}

/**
 * THE keystone op. Maps geometry rigidly from a source frame to a target
 * frame: express each point in fromPlane's orthonormal coordinates, then
 * rebuild it in toPlane. Free directions (normals/axes) are rotated by the
 * basis change only (no translation). Both frames are right-handed so winding
 * is preserved.
 *
 * @param {object}    geometry  any Geo geometry (Point3/Line3/Polyline3/Circle3/Arc3/Ellipse3/Mesh3)
 * @param {Geo.Plane} fromPlane source frame
 * @param {Geo.Plane} toPlane   target frame
 * @returns same _type as input
 */
export function orient(geometry, fromPlane, toPlane) {
  if (!geometry || !fromPlane || !toPlane) return geometry;
  const F = planeBasis(fromPlane);
  const T = planeBasis(toPlane);

  // Local coordinates of a world point in the source frame.
  const toLocal = (p) => {
    const dx = p.x - F.origin.x, dy = p.y - F.origin.y, dz = p.z - F.origin.z;
    return {
      a: dx * F.xAxis.x + dy * F.xAxis.y + dz * F.xAxis.z,
      b: dx * F.yAxis.x + dy * F.yAxis.y + dz * F.yAxis.z,
      c: dx * F.normal.x + dy * F.normal.y + dz * F.normal.z
    };
  };

  const mapPoint = (p) => {
    const { a, b, c } = toLocal(p);
    return new Geo.Point3(
      T.origin.x + a * T.xAxis.x + b * T.yAxis.x + c * T.normal.x,
      T.origin.y + a * T.xAxis.y + b * T.yAxis.y + c * T.normal.y,
      T.origin.z + a * T.xAxis.z + b * T.yAxis.z + c * T.normal.z
    );
  };

  // Directions ignore translation: decompose in the source basis, recompose.
  const mapDir = (vec) => {
    const v = asVector(vec) || new Geo.Vector3(0, 0, 1);
    const a = v.dot(F.xAxis), b = v.dot(F.yAxis), c = v.dot(F.normal);
    return new Geo.Vector3(
      a * T.xAxis.x + b * T.yAxis.x + c * T.normal.x,
      a * T.xAxis.y + b * T.yAxis.y + c * T.normal.y,
      a * T.xAxis.z + b * T.yAxis.z + c * T.normal.z
    ).normalize();
  };

  return applyPointMap(geometry, mapPoint, mapDir, false);
}

/**
 * Rotate geometry about an arbitrary axis (Rodrigues). Composes the existing
 * Geo.rotate helper so the per-_type dispatch stays in one place.
 *
 * @param {object}      geometry
 * @param {Geo.Point3}  axisOrigin
 * @param {Geo.Vector3} axisDir
 * @param {number}      angleRad
 * @returns same _type as input
 */
export function rotate(geometry, axisOrigin, axisDir, angleRad) {
  if (!geometry) return geometry;
  return Geo.rotate(
    geometry,
    axisOrigin || new Geo.Point3(0, 0, 0),
    asVector(axisDir) || new Geo.Vector3(0, 0, 1),
    angleRad || 0
  );
}

/**
 * Mirror geometry across a plane. Takes a Geo.Plane and composes the existing
 * Geo.mirror helper (which is parameterized by origin + normal).
 *
 * @param {object}    geometry
 * @param {Geo.Plane} plane
 * @returns same _type as input
 */
export function mirror(geometry, plane) {
  if (!geometry || !plane) return geometry;
  const origin = plane.origin || new Geo.Point3(0, 0, 0);
  const normal = plane.normal || new Geo.Vector3(0, 0, 1);
  return Geo.mirror(geometry, origin, normal);
}

/**
 * Linear array: `count` copies of geometry, each offset by an additional
 * `vector` (copy i is translated by i*vector; copy 0 is the original).
 *
 * @param {object}      geometry
 * @param {Geo.Vector3} vector per-step translation
 * @param {number}      count  number of copies (>= 0)
 * @returns {Array} copies, same _type as input
 */
export function arrayLinear(geometry, vector, count) {
  if (!geometry || !count || count < 1) return [];
  const v = asVector(vector) || new Geo.Vector3(1, 0, 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(Geo.move(geometry, v.scale(i)));
  }
  return out;
}

/**
 * Polar array: `count` copies of geometry rotated about an axis, spread evenly
 * over `totalAngleRad`. The angular step is totalAngleRad/count for a full
 * turn (2π) so copies don't overlap, and totalAngleRad/(count-1) for a partial
 * sweep so the first and last copies land on the sweep's endpoints.
 *
 * @param {object}      geometry
 * @param {Geo.Point3}  center
 * @param {Geo.Vector3} axis
 * @param {number}      count
 * @param {number}      totalAngleRad total sweep (defaults to a full turn)
 * @returns {Array} copies, same _type as input
 */
export function arrayPolar(geometry, center, axis, count, totalAngleRad) {
  if (!geometry || !count || count < 1) return [];
  const c = center || new Geo.Point3(0, 0, 0);
  const ax = asVector(axis) || new Geo.Vector3(0, 0, 1);
  const total = (totalAngleRad === undefined || totalAngleRad === null)
    ? Math.PI * 2
    : totalAngleRad;

  const TWO_PI = Math.PI * 2;
  const isFullTurn = Math.abs(Math.abs(total) - TWO_PI) < 1e-9;
  // Full turn: divide by count (avoid a duplicate at 0 and 2π). Partial sweep
  // with >1 copy: divide by count-1 so endpoints are included.
  const denom = isFullTurn ? count : (count > 1 ? count - 1 : 1);
  const step = total / denom;

  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(Geo.rotate(geometry, c, ax, step * i));
  }
  return out;
}
