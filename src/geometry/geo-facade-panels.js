// ============================================
// NOVA — Geometry Kernel: Facade Panels (T04a)
//
// Extends the core facadePanels tessellation with:
//  1. Surface-aware UV remapping: when a Surface object (Surface.ByPatch or
//     any surface supported by surface-eval.js) is provided, panel corners are
//     projected onto the actual curved surface via pointAtUV / frameAtUV — so
//     panels physically sit on the surface rather than on a flat UV mesh.
//  2. Structured panel-object output: each panel is a Geo.Mesh3 quad with
//     panel.points (Point3[4]) and panel.frame (Plane) as extra properties.
//     Mesh3 gives the data inspector a _type to render; .points/.frame carry
//     the TICK-004 contract consumed by Panel.ByPoints, PanelFrames, and T04b.
//
// When no surface is supplied the function falls back to the existing
// Geo.evaluateSurface (bilinear mesh sampling) behaviour, so all existing callers
// continue to work without a surface argument.
//
// Pure math only — no THREE.js, no DOM.
// ============================================

import { Geo } from './geometry-lib.js';
import { pointAtUV, frameAtUV } from './surface-eval.js';

/**
 * Build the UV-corner sampler.
 *
 * When `surface` is a proper Surface/NurbsSurface/Mesh3 supported by
 * surface-eval, we use pointAtUV/frameAtUV so corners are projected onto the
 * actual curved geometry. Otherwise we fall back to Geo.evaluateSurface (the
 * legacy bilinear mesh sampler already used by the original facadePanels).
 *
 * @param {object|null} surface  Surface object or null/undefined for flat fallback
 * @param {object|null} mesh     Legacy mesh fallback (Mesh3)
 * @returns {{ samplePoint(u,v):Point3, sampleFrame(u,v):Plane }}
 */
function buildSampler(surface, mesh) {
  // Special case: Surface.ByPatch produces a fan-triangulated Mesh3 where
  // vertices[0] is the centroid and vertices[1..n] are the boundary corners.
  // Geo.evaluateSurface assumes a square grid layout, which is wrong for fan
  // meshes. For the 4-corner case we bilinearly interpolate the boundary corners
  // directly, which is exact and avoids the grid assumption.
  if (
    surface && surface._type === 'Mesh3' && surface._solidType === 'Patch' &&
    surface.vertices && surface.vertices.length === 5
  ) {
    const v1 = surface.vertices[1]; // u=0, v=0
    const v2 = surface.vertices[2]; // u=1, v=0
    const v3 = surface.vertices[3]; // u=1, v=1
    const v4 = surface.vertices[4]; // u=0, v=1
    const bilerp = (u, v) => new Geo.Point3(
      (1-u)*(1-v)*v1.x + u*(1-v)*v2.x + u*v*v3.x + (1-u)*v*v4.x,
      (1-u)*(1-v)*v1.y + u*(1-v)*v2.y + u*v*v3.y + (1-u)*v*v4.y,
      (1-u)*(1-v)*v1.z + u*(1-v)*v2.z + u*v*v3.z + (1-u)*v*v4.z
    );
    const bilerp3 = (u, v) => {
      const eps = 1e-4;
      const dx = bilerp(Math.min(u + eps, 1), v);
      const dy = bilerp(u, Math.min(v + eps, 1));
      const p  = bilerp(u, v);
      const dxLen = Math.sqrt((dx.x-p.x)**2 + (dx.y-p.y)**2 + (dx.z-p.z)**2) || 1;
      const dyLen = Math.sqrt((dy.x-p.x)**2 + (dy.y-p.y)**2 + (dy.z-p.z)**2) || 1;
      const xa = new Geo.Vector3((dx.x-p.x)/dxLen, (dx.y-p.y)/dxLen, (dx.z-p.z)/dxLen);
      const ya = new Geo.Vector3((dy.x-p.x)/dyLen, (dy.y-p.y)/dyLen, (dy.z-p.z)/dyLen);
      const n  = new Geo.Vector3(
        xa.y*ya.z - xa.z*ya.y,
        xa.z*ya.x - xa.x*ya.z,
        xa.x*ya.y - xa.y*ya.x
      );
      return { origin: p, xAxis: xa, yAxis: ya, normal: n };
    };
    return { samplePoint: bilerp, sampleFrame: bilerp3 };
  }

  // Prefer the proper surface-eval path when a Surface object is provided.
  // Mesh3 is also a valid surface-eval target (bilinear grid evaluation), so we
  // route everything that resolveSurface supports through the same path.
  if (surface && (
    surface._type === 'Surface' ||
    surface._type === 'NurbsSurface' ||
    surface._type === 'Mesh3'
  )) {
    return {
      samplePoint: (u, v) => pointAtUV(surface, u, v),
      sampleFrame: (u, v) => frameAtUV(surface, u, v)
    };
  }

  // Fallback: legacy bilinear mesh sampling (Geo.evaluateSurface).
  const target = mesh || surface;
  if (target && target._type === 'Mesh3' && typeof Geo.evaluateSurface === 'function') {
    return {
      samplePoint: (u, v) => {
        const p = Geo.evaluateSurface(target, u, v);
        return p instanceof Geo.Point3 ? p : new Geo.Point3(p.x || 0, p.y || 0, p.z || 0);
      },
      sampleFrame: (u, v) => frameAtUV(target, u, v)
    };
  }

  // Flat XY plane fallback when nothing useful is available.
  return {
    samplePoint: (u, v) => new Geo.Point3(u, v, 0),
    sampleFrame: (u, v) => ({
      origin: new Geo.Point3(u, v, 0),
      xAxis: new Geo.Vector3(1, 0, 0),
      yAxis: new Geo.Vector3(0, 1, 0),
      normal: new Geo.Vector3(0, 0, 1)
    })
  };
}

/**
 * Build an oriented frame from a centroid point and the four corner points.
 *
 * When the sampler can supply an exact surface frame at the centroid UV we prefer
 * that (it uses the analytic/finite-difference surface normal). When we only have
 * corner points we compute a Newell normal from the 4 corners and build the frame
 * via the kernel's frameAt helper.
 *
 * @param {Geo.Point3} centroid
 * @param {Geo.Point3[]} corners
 * @param {function(u,v):Plane} sampleFrame
 * @param {number} cu  centroid U parameter
 * @param {number} cv  centroid V parameter
 * @returns {Plane}  { origin, xAxis, yAxis, normal }
 */
function buildFrame(centroid, corners, sampleFrame, cu, cv) {
  // Try to get the frame from the surface evaluator at the centroid UV.
  try {
    const f = sampleFrame(cu, cv);
    if (f && f.normal) {
      return {
        origin: centroid,
        xAxis: f.xAxis || f.xaxis || new Geo.Vector3(1, 0, 0),
        yAxis: f.yAxis || f.yaxis || new Geo.Vector3(0, 1, 0),
        normal: f.normal
      };
    }
  } catch (_) {
    // Fall through to corner-based normal.
  }

  // Fallback: Newell normal from the 4 corners.
  let nx = 0, ny = 0, nz = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const cur = corners[i];
    const nxt = corners[(i + 1) % n];
    nx += (cur.y - nxt.y) * (cur.z + nxt.z);
    ny += (cur.z - nxt.z) * (cur.x + nxt.x);
    nz += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  const normal = len > 1e-12
    ? new Geo.Vector3(nx / len, ny / len, nz / len)
    : new Geo.Vector3(0, 0, 1);

  // Build orthonormal tangent frame from the normal and the first-edge direction.
  const edge = new Geo.Vector3(
    corners[1].x - corners[0].x,
    corners[1].y - corners[0].y,
    corners[1].z - corners[0].z
  );
  const edgeLen = edge.length ? edge.length() : Math.sqrt(edge.x * edge.x + edge.y * edge.y + edge.z * edge.z);
  const xAxis = edgeLen > 1e-12
    ? new Geo.Vector3(edge.x / edgeLen, edge.y / edgeLen, edge.z / edgeLen)
    : new Geo.Vector3(1, 0, 0);

  // yAxis = normal x xAxis
  const yAxis = new Geo.Vector3(
    normal.y * xAxis.z - normal.z * xAxis.y,
    normal.z * xAxis.x - normal.x * xAxis.z,
    normal.x * xAxis.y - normal.y * xAxis.x
  );

  return { origin: centroid, xAxis, yAxis, normal };
}

/**
 * Divide a surface (or fallback mesh) into a uPanels×vPanels grid of panel objects.
 *
 * Each panel is a Geo.Mesh3 quad (2 triangles) with two extra properties:
 *   panel.points — Point3[4] corner points IN ORDER (p00, p10, p11, p01) on the surface
 *   panel.frame  — { origin, xAxis, yAxis, normal } oriented frame at the centroid
 *
 * Returning Mesh3 (instead of a plain object) makes the data inspector display
 * panel geometry correctly.  Panel.ByPoints, Pattern.PanelFrames, and the T04b
 * viewer all read .points / .frame so the contract is preserved.
 *
 * @param {object|null} surface   A Surface/NurbsSurface/Mesh3 object, or null
 * @param {number}      uPanels   Number of panels along U (>= 1)
 * @param {number}      vPanels   Number of panels along V (>= 1)
 * @param {object|null} [mesh]    Legacy mesh fallback (only used when surface is null)
 * @returns {Geo.Mesh3[]}
 */
export function facadePanelsOnSurface(surface, uPanels, vPanels, mesh) {
  const U = Math.max(1, Math.floor(uPanels || 4));
  const V = Math.max(1, Math.floor(vPanels || 4));

  const sampler = buildSampler(surface, mesh);
  const panels = [];

  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const u0 = i / U;
      const u1 = (i + 1) / U;
      const v0 = j / V;
      const v1 = (j + 1) / V;

      const p00 = sampler.samplePoint(u0, v0);
      const p10 = sampler.samplePoint(u1, v0);
      const p11 = sampler.samplePoint(u1, v1);
      const p01 = sampler.samplePoint(u0, v1);

      const cx = (p00.x + p10.x + p11.x + p01.x) / 4;
      const cy = (p00.y + p10.y + p11.y + p01.y) / 4;
      const cz = (p00.z + p10.z + p11.z + p01.z) / 4;
      const centroid = new Geo.Point3(cx, cy, cz);

      const corners = [p00, p10, p11, p01];
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;

      const frame = buildFrame(centroid, corners, sampler.sampleFrame, cu, cv);

      // Return a Mesh3 so the data inspector can render it (plain objects have no
      // _type and show as List(0)). Extra .points and .frame carry the contract
      // properties Panel.ByPoints, Pattern.PanelFrames, and the T04b viewer all
      // consume. Faces split the quad into two CCW triangles.
      const panel = new Geo.Mesh3(corners, [[0, 1, 2], [0, 2, 3]], 0xfab387);
      panel._solidType = 'Panel';
      panel.points = corners;
      panel.frame = frame;
      panels.push(panel);
    }
  }

  return panels;
}
