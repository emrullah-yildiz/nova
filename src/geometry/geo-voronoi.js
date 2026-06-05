// ============================================
// NOVA — Geometry Kernel: Voronoi Cell Objects (T04a)
//
// Wraps the existing Geo.voronoiMesh tessellation and converts its output to the
// TICK-004 panel-object format:
//   { points: Point3[], frame: { origin, xAxis, yAxis, normal } }
//
// - points: boundary vertices of each Voronoi cell (the outline polygon corners)
// - frame:  centroid of the boundary as origin; surface normal as Z.
//           For flat (XY) input the normal is (0,0,1).
//           Surface-conformance (projecting the Voronoi outline onto a curved
//           surface) is a stretch goal for this sprint — not included here.
//
// The voronoiCellObjects function is a PURE transformer over the existing
// Geo.voronoiOutlines result; it does not reimplement Voronoi math.
//
// Pure math only — no THREE.js, no DOM.
// ============================================

import { Geo } from './geometry-lib.js';

/**
 * Compute a Newell normal from a polygon vertex list.
 * Returns (0,0,1) for degenerate/flat polygons.
 */
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
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-12) return new Geo.Vector3(0, 0, 1);
  return new Geo.Vector3(nx / len, ny / len, nz / len);
}

/**
 * Build an oriented frame from a centroid and a normal vector.
 * xAxis follows the direction from centroid to the first boundary vertex
 * (projected onto the tangent plane); yAxis = normal × xAxis.
 */
function buildFrame(centroid, normal, firstVertex) {
  // Candidate xAxis: centroid → firstVertex direction.
  const raw = new Geo.Vector3(
    firstVertex.x - centroid.x,
    firstVertex.y - centroid.y,
    firstVertex.z - centroid.z
  );
  const rawLen = raw.length ? raw.length() : Math.sqrt(raw.x * raw.x + raw.y * raw.y + raw.z * raw.z);

  let xAxis;
  if (rawLen > 1e-12) {
    // Project onto the tangent plane: xProj = raw - (raw·n)n
    const dot = raw.x * normal.x + raw.y * normal.y + raw.z * normal.z;
    const px = raw.x - dot * normal.x;
    const py = raw.y - dot * normal.y;
    const pz = raw.z - dot * normal.z;
    const pLen = Math.sqrt(px * px + py * py + pz * pz);
    xAxis = pLen > 1e-12
      ? new Geo.Vector3(px / pLen, py / pLen, pz / pLen)
      : new Geo.Vector3(1, 0, 0);
  } else {
    xAxis = new Geo.Vector3(1, 0, 0);
  }

  // yAxis = normal × xAxis
  const yAxis = new Geo.Vector3(
    normal.y * xAxis.z - normal.z * xAxis.y,
    normal.z * xAxis.x - normal.x * xAxis.z,
    normal.x * xAxis.y - normal.y * xAxis.x
  );

  return { origin: centroid, xAxis, yAxis, normal };
}

/**
 * Convert Voronoi site list to a list of panel cell objects.
 *
 * Each cell object matches the TICK-004 panel-object contract:
 *   { points: Point3[], frame: { origin, xAxis, yAxis, normal } }
 *
 * - points: boundary vertices of the Voronoi cell polygon
 * - frame:  centroid origin + Newell normal (Z). For flat XY input the normal
 *           is always (0,0,1).
 *
 * @param {object[]} sites   List of Point3 seed points for Voronoi
 * @param {object|null} bounds  Optional bounding box (passed through to voronoiOutlines)
 * @param {number} resolution  Resolution hint for voronoiOutlines
 * @returns {Array<{points:Geo.Point3[], frame:object}>}
 */
export function voronoiCellObjects(sites, bounds, resolution) {
  if (!Array.isArray(sites) || sites.length === 0) return [];

  // Re-use the existing voronoiOutlines from the kernel — it returns
  // Geo.Polyline3 objects with a `.points` array.
  let outlines;
  try {
    outlines = Geo.voronoiOutlines(sites, bounds, resolution);
  } catch (_) {
    return [];
  }

  if (!Array.isArray(outlines)) return [];

  return outlines.map((outline) => {
    // Extract boundary vertex array from the Polyline3.
    const verts = Array.isArray(outline.points) ? outline.points : [];
    if (verts.length < 3) return null;

    // Centroid of the boundary polygon.
    let cx = 0, cy = 0, cz = 0;
    for (const p of verts) { cx += p.x; cy += p.y; cz += p.z; }
    const centroid = new Geo.Point3(cx / verts.length, cy / verts.length, cz / verts.length);

    const normal = newellNormal(verts);
    const frame = buildFrame(centroid, normal, verts[0]);

    return { points: verts, frame };
  }).filter(Boolean);
}
