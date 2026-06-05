// ============================================
// NOVA — Geometry Kernel: Curve Evaluation (M2 / T4)
//
// Pure helpers that evaluate a point, a unit tangent, and an oriented FRAME at
// a NORMALIZED parameter t ∈ [0,1] on any kernel curve, plus a divideCurve that
// returns the GH-style sample list. These frames are the substrate paneling and
// adaptive-component placement consume: divide a curve → frame per sample →
// orient a family onto each frame (frames carry the SAME {xaxis,yaxis,normal}
// shape as M1's frames.frameAt / planeFromOriginXY, so Geometry.Orient can
// consume frameAtT output directly).
//
// Pure math only — no THREE.js, no DOM. Reuses the existing kernel evaluation
// routines (Curve3.pointAt / tangentAt, NurbsCurve.evaluate) rather than
// reimplementing them, and frames.frameAt to build the oriented planes.
// ============================================

import { Geo } from './geometry-lib.js';
import { frameAt } from './frames.js';

// NURBS curve evaluation clamps its valid domain just under 1 (knot vector ends
// at 1 exactly, where findSpan/basisFunctions degenerate). Mirror the clamp the
// kernel uses elsewhere (NurbsCurve.toPoints / tangentAt) so t=1 lands on the
// true curve end instead of returning (0,0,0).
const NURBS_MAX = 0.9999;

function clamp01(t) {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function asVector(v) {
  if (!v) return new Geo.Vector3(0, 0, 0);
  if (v instanceof Geo.Vector3) return v;
  return new Geo.Vector3(v.x || 0, v.y || 0, v.z || 0);
}

function asPoint(p) {
  if (!p) return new Geo.Point3(0, 0, 0);
  if (p instanceof Geo.Point3) return p;
  return new Geo.Point3(p.x || 0, p.y || 0, p.z || 0);
}

// Curves whose underlying evaluation is a NurbsCurve.evaluate(u) clamp at
// NURBS_MAX; everything else (Line3, Polyline3, Arc3, Circle3, Ellipse3) takes
// the full [0,1] domain.
function isNurbs(curve) {
  return !!curve && curve._type === 'NurbsCurve';
}

// Map a normalized t ∈ [0,1] onto the curve's native pointAt/evaluate domain.
function curveParam(curve, t) {
  const c = clamp01(t);
  return isNurbs(curve) ? Math.min(c, NURBS_MAX) : c;
}

/**
 * Point on a curve at a normalized parameter t ∈ [0,1].
 * Works for Line3, Polyline3, Arc3, Circle3, Ellipse3, and NurbsCurve / any
 * Curve3 subclass that implements pointAt/evaluate.
 *
 * @param {object} curve  a kernel curve (Curve3 subclass or NurbsCurve)
 * @param {number} t      normalized parameter in [0,1]
 * @returns {Geo.Point3}
 */
export function pointAtT(curve, t) {
  if (!curve) throw new Error('pointAtT: curve is required');
  const u = curveParam(curve, t);
  if (typeof curve.pointAt === 'function') return asPoint(curve.pointAt(u));
  if (typeof curve.evaluate === 'function') return asPoint(curve.evaluate(u));
  throw new Error(`pointAtT: unsupported curve type '${curve._type || typeof curve}'`);
}

/**
 * Point on a curve at an UNBOUNDED normalized parameter t.
 *
 * When t ∈ [0,1] behaves identically to pointAtT (no clamping, no overhead).
 * When t < 0 or t > 1 the result is a LINEAR EXTRAPOLATION beyond the curve
 * endpoint using the boundary tangent and the arc-speed near that boundary:
 *
 *   boundary speed = ‖p(t_inner) – p(t_boundary)‖ / Δt_inner   (finite diff)
 *   extrapolated = p(t_boundary) + tangent * speed * Δt_outer
 *
 * This lets `Curve.PointAtParameter` behave like a parametric ray — useful when
 * driving t from an expression that intentionally overshoots the [0,1] domain
 * (e.g. animated t or a domain that maps a larger range onto the curve axis).
 *
 * For a Line3 the extrapolation is exact (linear by definition). For curves the
 * tangent at the endpoint is used, so the extrapolated segment is always tangent-
 * continuous with the curve at the boundary.
 *
 * @param {object} curve  a kernel curve
 * @param {number} t      any real number
 * @returns {Geo.Point3}
 */
export function pointAtTExtrapolated(curve, t) {
  if (!curve) throw new Error('pointAtTExtrapolated: curve is required');
  if (t >= 0 && t <= 1) return pointAtT(curve, t);

  const DT = 1e-3; // finite-difference step for speed estimation

  if (t < 0) {
    // Extrapolate before the start (t=0).
    const p0 = pointAtT(curve, 0);
    const pInner = pointAtT(curve, DT); // a point just inside the start
    const dx = pInner.x - p0.x;
    const dy = pInner.y - p0.y;
    const dz = pInner.z - p0.z;
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / DT; // arc-length per unit t near t=0
    const tan = tangentAtT(curve, 0); // unit tangent at start, pointing forward
    // t is negative: moving backward from p0
    return new Geo.Point3(
      p0.x + tan.x * speed * t,
      p0.y + tan.y * speed * t,
      p0.z + tan.z * speed * t
    );
  }

  // t > 1: extrapolate beyond the end.
  const p1 = pointAtT(curve, 1);
  const pInner = pointAtT(curve, 1 - DT); // a point just inside the end
  const dx = p1.x - pInner.x;
  const dy = p1.y - pInner.y;
  const dz = p1.z - pInner.z;
  const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / DT; // arc-length per unit t near t=1
  const tan = tangentAtT(curve, 1); // unit tangent at end, pointing forward
  const excess = t - 1;
  return new Geo.Point3(
    p1.x + tan.x * speed * excess,
    p1.y + tan.y * speed * excess,
    p1.z + tan.z * speed * excess
  );
}

/**
 * Unit tangent of a curve at a normalized parameter t ∈ [0,1]. Uses the curve's
 * own tangentAt when present (Line3 returns its constant chord direction,
 * NurbsCurve does a clamped finite difference), otherwise falls back to the
 * Curve3 base-class chord approximation, and finally to a manual symmetric
 * finite difference. Always returns a unit-length vector.
 *
 * @param {object} curve
 * @param {number} t  normalized parameter in [0,1]
 * @returns {Geo.Vector3}
 */
export function tangentAtT(curve, t) {
  if (!curve) throw new Error('tangentAtT: curve is required');
  const c = clamp01(t);
  let tan = null;
  if (typeof curve.tangentAt === 'function') {
    tan = asVector(curve.tangentAt(curveParam(curve, c)));
  }
  if (!tan || tan.length() < 1e-9) {
    // Manual symmetric finite difference in the curve's native domain.
    const dt = 1e-3;
    const p0 = pointAtT(curve, Math.max(0, c - dt));
    const p1 = pointAtT(curve, Math.min(1, c + dt));
    tan = new Geo.Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  }
  if (tan.length() < 1e-9) return new Geo.Vector3(1, 0, 0);
  return tan.normalize();
}

/**
 * Oriented frame at a normalized parameter t ∈ [0,1].
 *
 * Convention: the frame's NORMAL is the curve's unit tangent (so the plane's
 * local Z runs ALONG the curve — what panel/family placement wants to align a
 * member's axis to), and the in-plane X/Y are chosen deterministically by
 * frames.frameAt. Using frames.frameAt's stable world-axis pick (rather than a
 * raw Frenet frame, which flips at inflection points) gives a continuous,
 * non-tumbling frame along the curve. Returns the SAME Geo.Plane shape M1
 * produces (origin + explicit {xaxis,yaxis,normal}), consumable by
 * Geometry.Orient.
 *
 * @param {object} curve
 * @param {number} t  normalized parameter in [0,1]
 * @returns {Geo.Plane}
 */
export function frameAtT(curve, t) {
  const origin = pointAtT(curve, t);
  const tangent = tangentAtT(curve, t);
  return frameAt(origin, tangent);
}

/**
 * Divide a curve into evenly-spaced (by NORMALIZED parameter) samples and build
 * a frame at each.
 *
 * Count convention (Grasshopper "Divide Curve"): `count` is the number of
 * SEGMENTS, so an OPEN curve yields `count + 1` points (both endpoints
 * included), at t = i/count for i = 0..count. A CLOSED curve (closed === true,
 * e.g. Circle3 / closed Polyline3) yields exactly `count` points — the final
 * sample would coincide with the first, so it is dropped — at t = i/count for
 * i = 0..count-1.
 *
 * @param {object} curve
 * @param {number} count  number of segments (>= 1)
 * @returns {{points: Geo.Point3[], frames: Geo.Plane[]}}
 */
export function divideCurve(curve, count) {
  if (!curve) throw new Error('divideCurve: curve is required');
  const segs = Math.max(1, Math.floor(count || 1));
  const closed = !!(curve.closed || curve._type === 'Circle3');
  const samples = closed ? segs : segs + 1;
  const points = [];
  const frames = [];
  for (let i = 0; i < samples; i++) {
    const t = i / segs;
    points.push(pointAtT(curve, t));
    frames.push(frameAtT(curve, t));
  }
  return { points, frames };
}
