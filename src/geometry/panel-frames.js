// ============================================
// NOVA — Geometry Kernel: Panel Frames (M5)
//
// Closes the facade-rationalization loop. The paneling nodes (Pattern.Facade-
// Panels and friends) emit bare quad meshes and DISCARD the per-panel
// centroid/normal frame. These pure helpers recover that frame so panels feed
// straight into Geometry.Orient (M1) and the Revit placement nodes (M4):
//
//   panels (Mesh3[])  →  panelFrames  →  Geo.Plane[]   →  Geometry.Orient
//                     →  panelPlanarity → number[]      →  color-by-metric / QA
//
// A frame is built with the SAME frames.frameAt path M1/M2 use, so every result
// is an identical Geo.Plane {origin, normal, xaxis, yaxis} that Geometry.Orient
// consumes directly. The planarity metric is the max corner deviation from the
// panel's best-fit plane (0 = perfectly planar; larger = more warp).
//
// Pure math only — no THREE.js, no DOM.
// ============================================

import { Geo } from './geometry-lib.js';
import { frameAt } from './frames.js';

function asPoint(p) {
  if (!p) return new Geo.Point3(0, 0, 0);
  if (p instanceof Geo.Point3) return p;
  return new Geo.Point3(p.x || 0, p.y || 0, p.z || 0);
}

// The unique vertices of a panel, deduplicated and in a stable boundary-ish
// order. Mesh3 panels are fan/quad triangulations that re-list shared corners
// across faces; for centroid/normal/warp we want each physical corner once.
function panelVertices(panel) {
  if (!panel) return [];
  // Prefer the explicit vertex list (Mesh3); fall back to a points array.
  const raw = Array.isArray(panel.vertices)
    ? panel.vertices
    : (Array.isArray(panel) ? panel : []);
  const out = [];
  const seen = [];
  for (const v of raw) {
    const p = asPoint(v);
    // Dedupe coincident corners so a quad reports 4 corners, not 6 (2 tris).
    const dup = seen.some((q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9 && Math.abs(q.z - p.z) < 1e-9);
    if (!dup) { out.push(p); seen.push(p); }
  }
  return out;
}

// Area-weighted (Newell's method) normal of a closed corner loop. Robust for
// non-planar polygons — each edge contributes to the pseudo-normal so the
// result is the best area-weighted plane normal, not a single-triangle normal.
function newellNormal(verts) {
  let nx = 0, ny = 0, nz = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const cur = verts[i];
    const nxt = verts[(i + 1) % n];
    nx += (cur.y - nxt.y) * (cur.z + nxt.z);
    ny += (cur.z - nxt.z) * (cur.x + nxt.x);
    nz += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  const v = new Geo.Vector3(nx, ny, nz);
  if (v.length() < 1e-12) return new Geo.Vector3(0, 0, 1);
  return v.normalize();
}

function centroidOf(verts) {
  let cx = 0, cy = 0, cz = 0;
  for (const p of verts) { cx += p.x; cy += p.y; cz += p.z; }
  const n = verts.length || 1;
  return new Geo.Point3(cx / n, cy / n, cz / n);
}

/**
 * Per-panel oriented frame. For each panel: origin = vertex centroid, normal =
 * area-weighted (Newell) normal, in-plane X follows the centroid→first-corner
 * direction (projected onto the plane by frames.frameAt), Y = normal × X.
 *
 * Returns the SAME Geo.Plane {origin, normal, xaxis, yaxis} shape M1 (frameAt /
 * planeFromOriginXY) and M2 (frameAtUV) produce, so each frame drops straight
 * into Geometry.Orient as a target plane.
 *
 * @param {object[]} panelMeshList  list of Mesh3 panels (or vertex-array panels)
 * @returns {Geo.Plane[]}           one frame per panel (degenerate panels → null)
 */
export function panelFrames(panelMeshList) {
  const panels = Array.isArray(panelMeshList) ? panelMeshList : [];
  return panels.map((panel) => {
    const verts = panelVertices(panel);
    if (verts.length < 3) return null;
    const origin = centroidOf(verts);
    const normal = newellNormal(verts);
    // X hint: centroid → first corner, projected onto the tangent plane by
    // frameAt so the panel's local X runs toward a real corner (stable, and
    // identical in spirit to how frameAtUV seeds X from dU).
    const xHint = new Geo.Vector3(verts[0].x - origin.x, verts[0].y - origin.y, verts[0].z - origin.z);
    return frameAt(origin, normal, xHint);
  });
}

/**
 * Per-panel planarity / warp metric: the maximum perpendicular distance of any
 * panel corner from that panel's best-fit plane (centroid + Newell normal).
 * 0 = perfectly planar (a flat quad); larger = more warped. Degenerate panels
 * (< 3 corners) report 0.
 *
 * Useful for rationalization: color-by-metric, flag panels that exceed a glass
 * cold-bend tolerance, or count flat-vs-warped panels.
 *
 * @param {object[]} panelMeshList  list of Mesh3 panels (or vertex-array panels)
 * @returns {number[]}              one warp value per panel
 */
export function panelPlanarity(panelMeshList) {
  const panels = Array.isArray(panelMeshList) ? panelMeshList : [];
  return panels.map((panel) => {
    const verts = panelVertices(panel);
    if (verts.length < 3) return 0;
    const origin = centroidOf(verts);
    const normal = newellNormal(verts);
    let maxDev = 0;
    for (const p of verts) {
      // Signed distance of the corner to the best-fit plane = (p - origin)·n.
      const d = Math.abs((p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y + (p.z - origin.z) * normal.z);
      if (d > maxDev) maxDev = d;
    }
    return maxDev;
  });
}
