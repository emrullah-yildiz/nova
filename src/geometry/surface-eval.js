// ============================================
// NOVA — Geometry Kernel: Surface Evaluation (M2 / T4)
//
// Pure helpers that evaluate a point, a unit normal, and an oriented FRAME at a
// NORMALIZED parameter pair (u, v) ∈ [0,1]² on any kernel surface, plus a
// divideSurface that returns the UV grid of frames — the panelization
// substrate: divide a surface → frame per cell → orient a panel/family onto it.
//
// Frames carry the SAME Geo.Plane {xaxis,yaxis,normal} shape M1's
// frames.frameAt / planeFromOriginXY produce, so Geometry.Orient (M1) consumes
// frameAtUV output directly.
//
// Pure math only — no THREE.js, no DOM. Reuses the existing kernel evaluation
// routines (NurbsSurface.evaluate/normalAt, Surface.evaluate/normalAt,
// Geo.evaluateSurface for grid/mesh surfaces) rather than reimplementing them.
// ============================================

import { Geo } from './geometry-lib.js';
import { frameAt } from './frames.js';

// NurbsSurface (like NurbsCurve) clamps its valid UV domain just under 1.
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

function vsub(a, b) {
  return new Geo.Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Classify the surface and resolve the native evaluator + parameter mapping.
// Returns { eval(u,v) -> Point3, uMax, vMax } where uMax/vMax are the largest
// native parameters reachable (1 or NURBS_MAX), so finite differences can step
// inward at the far edge. NORMALIZED (u,v) ∈ [0,1]² is mapped onto each
// surface's native domain here so callers always speak [0,1].
function resolveSurface(surface) {
  if (!surface) throw new Error('surface is required');
  const type = surface._type;

  // Parametric Surface (geo-advanced.js): native domain is uDomain/vDomain,
  // not necessarily [0,1] — map the normalized parameter onto it.
  if (type === 'Surface' && typeof surface.evaluate === 'function') {
    const ud = surface.uDomain || [0, 1];
    const vd = surface.vDomain || [0, 1];
    const mapU = (u) => ud[0] + (ud[1] - ud[0]) * clamp01(u);
    const mapV = (v) => vd[0] + (vd[1] - vd[0]) * clamp01(v);
    return {
      eval: (u, v) => asPoint(surface.evaluate(mapU(u), mapV(v))),
      uMax: 1,
      vMax: 1
    };
  }

  // NurbsSurface (nurbs-math.js): native domain is [0,1], clamp at NURBS_MAX.
  if (type === 'NurbsSurface' && typeof surface.evaluate === 'function') {
    return {
      eval: (u, v) => asPoint(surface.evaluate(Math.min(clamp01(u), NURBS_MAX), Math.min(clamp01(v), NURBS_MAX))),
      uMax: NURBS_MAX,
      vMax: NURBS_MAX
    };
  }

  // Patch mesh (Geo.surfaceByPatch): a fan/centroid mesh with no square vertex
  // grid. The generic grid sampler would cluster points onto its centroid+ring.
  // Use the patch's PLANAR bilinear map (evaluatePlanar): a uniform (u,v) grid
  // fills the patch's 2D bounding box like a Cartesian grid — (0.5,0.5) lands at
  // the interior centroid, (0,0)/(1,1) at opposite bbox corners. (The patch's
  // older polar `evaluate` produced radial spokes — the "cross not a grid" bug.)
  if (type === 'Mesh3' && surface._isPatch && typeof surface.evaluatePlanar === 'function') {
    return {
      eval: (u, v) => asPoint(surface.evaluatePlanar(clamp01(u), clamp01(v))),
      uMax: 1,
      vMax: 1
    };
  }
  // Backward-compat: an older patch object exposing only the polar evaluate.
  if (type === 'Mesh3' && surface._isPatch && typeof surface.evaluate === 'function') {
    return {
      eval: (u, v) => asPoint(surface.evaluate(clamp01(u), clamp01(v))),
      uMax: 1,
      vMax: 1
    };
  }

  // Grid / mesh surface (Geo.Mesh3): bilinear sampling over the square vertex
  // grid via Geo.evaluateSurface, native domain [0,1].
  if (type === 'Mesh3' && typeof Geo.evaluateSurface === 'function') {
    return {
      eval: (u, v) => asPoint(Geo.evaluateSurface(surface, clamp01(u), clamp01(v))),
      uMax: 1,
      vMax: 1
    };
  }

  // Last resort: anything that exposes evaluate(u,v) is treated as a [0,1]²
  // surface; otherwise we cannot evaluate it — fail loudly rather than return
  // garbage.
  if (typeof surface.evaluate === 'function') {
    return {
      eval: (u, v) => asPoint(surface.evaluate(clamp01(u), clamp01(v))),
      uMax: 1,
      vMax: 1
    };
  }

  throw new Error(`surface-eval: unsupported surface type '${type || typeof surface}'`);
}

/**
 * Point on a surface at a normalized parameter pair (u, v) ∈ [0,1]².
 * Handles parametric Surface, NurbsSurface, and grid/mesh (Mesh3) surfaces.
 *
 * @param {object} surface
 * @param {number} u  normalized U parameter in [0,1]
 * @param {number} v  normalized V parameter in [0,1]
 * @returns {Geo.Point3}
 */
export function pointAtUV(surface, u, v) {
  return resolveSurface(surface).eval(u, v);
}

// Surface partial derivatives at (u,v) via one-sided finite differences,
// stepping inward when at the far edge so we never sample past the domain.
function partials(s, u, v) {
  const eps = 1e-3;
  const cu = clamp01(u);
  const cv = clamp01(v);
  const p = s.eval(cu, cv);

  let du;
  if (cu + eps <= 1) du = vsub(s.eval(cu + eps, cv), p);
  else du = vsub(p, s.eval(cu - eps, cv));

  let dv;
  if (cv + eps <= 1) dv = vsub(s.eval(cu, cv + eps), p);
  else dv = vsub(p, s.eval(cu, cv - eps));

  return { p, du: asVector(du), dv: asVector(dv) };
}

/**
 * Unit surface normal at a normalized parameter pair (u, v) ∈ [0,1]². Prefers
 * the surface's own normalAt when present (NurbsSurface / parametric Surface),
 * otherwise computes dU × dV from finite differences (grid/mesh surfaces).
 *
 * @param {object} surface
 * @param {number} u
 * @param {number} v
 * @returns {Geo.Vector3}
 */
export function normalAtUV(surface, u, v) {
  const type = surface && surface._type;
  // Native normalAt is exact for analytic surfaces — but the parametric Surface
  // expects parameters in its OWN domain, so only short-circuit for the [0,1]²
  // NurbsSurface; route Surface through resolveSurface's domain mapping.
  if (type === 'NurbsSurface' && typeof surface.normalAt === 'function') {
    const n = asVector(surface.normalAt(Math.min(clamp01(u), NURBS_MAX), Math.min(clamp01(v), NURBS_MAX)));
    if (n.length() > 1e-9) return n.normalize();
  }
  const s = resolveSurface(surface);
  const { du, dv } = partials(s, u, v);
  const n = du.cross(dv);
  if (n.length() < 1e-9) return new Geo.Vector3(0, 0, 1);
  return n.normalize();
}

/**
 * Oriented frame at a normalized parameter pair (u, v) ∈ [0,1]².
 *
 * Convention: origin = surface point; the frame's NORMAL is the surface normal;
 * the in-plane X axis follows the surface's dU direction (projected onto the
 * tangent plane by frames.frameAt), Y = normal × X. Returns the SAME Geo.Plane
 * shape M1 produces (origin + explicit {xaxis,yaxis,normal}), so a panel/family
 * orients flat onto the surface with its local X running along U.
 *
 * @param {object} surface
 * @param {number} u
 * @param {number} v
 * @returns {Geo.Plane}
 */
export function frameAtUV(surface, u, v) {
  const s = resolveSurface(surface);
  const { p, du } = partials(s, u, v);
  const normal = normalAtUV(surface, u, v);
  // frameAt projects the dU hint onto the tangent plane defined by `normal`,
  // guaranteeing the plane's normal is exactly the surface normal and X aligns
  // with U as closely as the surface allows.
  return frameAt(p, normal, du);
}

/**
 * Divide a surface into a UV grid of evenly-spaced (by NORMALIZED parameter)
 * samples and build a frame at each — the panelization substrate.
 *
 * Count convention (Grasshopper "Divide Surface" / isotrim grid): `uCount` and
 * `vCount` are SEGMENT counts, so the grid has `(uCount + 1) × (vCount + 1)`
 * samples, at u = i/uCount (i = 0..uCount), v = j/vCount (j = 0..vCount), i.e.
 * both edges of the parameter square are included. Points/frames are returned
 * in row-major order (outer loop u, inner loop v).
 *
 * @param {object} surface
 * @param {number} uCount  U segment count (>= 1)
 * @param {number} vCount  V segment count (>= 1)
 * @returns {{points: Geo.Point3[], frames: Geo.Plane[]}}
 */
export function divideSurface(surface, uCount, vCount) {
  const s = resolveSurface(surface);
  const uSegs = Math.max(1, Math.floor(uCount || 1));
  const vSegs = Math.max(1, Math.floor(vCount || 1));
  const points = [];
  const frames = [];
  for (let i = 0; i <= uSegs; i++) {
    const u = i / uSegs;
    for (let j = 0; j <= vSegs; j++) {
      const v = j / vSegs;
      points.push(s.eval(u, v));
      frames.push(frameAtUV(surface, u, v));
    }
  }
  return { points, frames };
}
