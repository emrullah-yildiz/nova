/**
 * Surface.Trim — geometry kernel node
 *
 * Cuts a surface mesh with an intersecting geometry mesh and returns the
 * portion of the surface that lies OUTSIDE the cutting body.
 *
 * Algorithm (triangle-level filtering):
 *   1. For each triangle in the Surface mesh, test whether it intersects
 *      the cutting body:
 *      - Sphere cutter: exact test — remove the triangle if the minimum
 *        distance from the sphere centre to the triangle is ≤ radius.
 *        This correctly handles fan-triangulated surfaces (e.g. Surface.ByPatch)
 *        where the centroid-only test would miss triangles whose vertex lies
 *        inside the sphere.
 *      - General mesh cutter: centroid-in-AABB test as a conservative
 *        approximation (works well for convex, axis-aligned cutters).
 *   2. Keep triangles that do NOT intersect the cutting body.
 *   3. Rebuild the mesh with only the surviving triangles, compacting
 *      the vertex list so no orphaned vertices remain.
 *
 * Edge cases:
 *   - No intersection (AC-3): no triangles removed → return a copy of the
 *     original mesh (same vertex/face arrays, new object).
 *   - Full enclosure (AC-4): all triangles removed → return an empty mesh
 *     with empty arrays — never null/undefined/throw.
 *
 * Owned file: src/geometry/nodes/Surface.Trim.js
 * Owner: geometry-engineer (mouse) — TICK-013 / T13a
 */

import { Geo } from '../index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the axis-aligned bounding box of a mesh.
 * Returns { minX, minY, minZ, maxX, maxY, maxZ } or null for empty meshes.
 */
function meshAABB(mesh) {
  const verts = mesh && mesh.vertices;
  if (!verts || verts.length === 0) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Squared minimum distance from point P to triangle (A, B, C).
 * Uses the Ericson "Real-Time Collision Detection" closest-point algorithm.
 */
function pointTriDistSq(
  px, py, pz,
  ax, ay, az,
  bx, by, bz,
  cx, cy, cz
) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    return apx * apx + apy * apy + apz * apz; // closest = A
  }

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    return bpx * bpx + bpy * bpy + bpz * bpz; // closest = B
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    return cpx * cpx + cpy * cpy + cpz * cpz; // closest = C
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { // closest on edge AB
    const v = d1 / (d1 - d3);
    const qx = ax + v * abx, qy = ay + v * aby, qz = az + v * abz;
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { // closest on edge AC
    const w = d2 / (d2 - d6);
    const qx = ax + w * acx, qy = ay + w * acy, qz = az + w * acz;
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { // closest on edge BC
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const qx = bx + w * (cx - bx), qy = by + w * (cy - by), qz = bz + w * (cz - bz);
    const dx = px - qx, dy = py - qy, dz = pz - qz;
    return dx * dx + dy * dy + dz * dz;
  }

  // Closest point is inside the triangle (project onto plane)
  const denom = 1 / (va + vb + vc);
  const v2 = vb * denom, w2 = vc * denom;
  const qx = ax + v2 * abx + w2 * acx;
  const qy = ay + v2 * aby + w2 * acy;
  const qz = az + v2 * abz + w2 * acz;
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Build a per-face "should this triangle be removed?" function.
 *
 * Returns a function (v0, v1, v2) → boolean: true means REMOVE this face.
 *
 * Priority:
 *  1. Sphere metadata (_solidType + _params) → exact triangle-sphere intersection.
 *     A triangle is removed if the sphere's centre is within `radius` of any
 *     point on the triangle (not just the centroid), so fan-triangulated meshes
 *     (Surface.ByPatch) trim correctly even with small cutting spheres.
 *  2. General mesh → centroid-in-AABB test (conservative approximation for
 *     convex, axis-aligned cutters).
 */
function buildFaceTest(cuttingMesh) {
  if (!cuttingMesh) return () => false;

  // Exact sphere test using metadata written by Geo.createSphere
  if (
    cuttingMesh._solidType === 'Sphere' &&
    cuttingMesh._params &&
    cuttingMesh._params.center != null &&
    cuttingMesh._params.radius != null
  ) {
    const { center, radius } = cuttingMesh._params;
    const scx = center.x ?? 0;
    const scy = center.y ?? 0;
    const scz = center.z ?? 0;
    const r2 = radius * radius;
    return (v0, v1, v2) =>
      pointTriDistSq(
        scx, scy, scz,
        v0.x, v0.y, v0.z,
        v1.x, v1.y, v1.z,
        v2.x, v2.y, v2.z
      ) <= r2;
  }

  // General mesh — centroid-in-AABB approximation
  const aabb = meshAABB(cuttingMesh);
  if (!aabb) return () => false;
  return (v0, v1, v2) => {
    const cx = (v0.x + v1.x + v2.x) / 3;
    const cy = (v0.y + v1.y + v2.y) / 3;
    const cz = (v0.z + v1.z + v2.z) / 3;
    return (
      cx >= aabb.minX && cx <= aabb.maxX &&
      cy >= aabb.minY && cy <= aabb.maxY &&
      cz >= aabb.minZ && cz <= aabb.maxZ
    );
  };
}

/**
 * Core trim function — exported so unit tests can call it without a node
 * runtime context.
 *
 * @param {object} surfaceMesh  - Mesh3 (vertices + faces)
 * @param {object} cuttingMesh  - Mesh3 used as cutting body
 * @returns {object}  New Mesh3 with surviving triangles only
 */
export function trimSurface(surfaceMesh, cuttingMesh) {
  // Guard: invalid surface — return empty mesh (never throw)
  if (!surfaceMesh || !surfaceMesh.vertices || !surfaceMesh.faces) {
    return new Geo.Mesh3([], [], 0x94e2d5);
  }

  // No valid cutting geometry — return a copy of the original (AC-3 path)
  if (!cuttingMesh || !cuttingMesh.vertices || cuttingMesh.vertices.length === 0) {
    return new Geo.Mesh3(
      surfaceMesh.vertices.slice(),
      surfaceMesh.faces.map(f => f.slice()),
      0x94e2d5
    );
  }

  const verts = surfaceMesh.vertices;
  const faces = surfaceMesh.faces;
  const shouldRemove = buildFaceTest(cuttingMesh);

  // Filter faces: keep those that do NOT intersect the cutting body.
  // Track whether the cutter actually removed anything so the AC-3 path
  // fires correctly even when some degenerate faces were skipped.
  let cutterRemovedAny = false;
  const survivingFaces = [];
  for (const face of faces) {
    const [i0, i1, i2] = face;
    const v0 = verts[i0];
    const v1 = verts[i1];
    const v2 = verts[i2];
    if (!v0 || !v1 || !v2) continue; // skip degenerate face references
    if (shouldRemove(v0, v1, v2)) {
      cutterRemovedAny = true;
    } else {
      survivingFaces.push(face);
    }
  }

  // AC-3: cutter did not overlap any triangle — return a copy of the original mesh
  if (!cutterRemovedAny) {
    return new Geo.Mesh3(
      verts.slice(),
      faces.map(f => f.slice()),
      0x94e2d5
    );
  }

  // AC-4: all triangles removed — return empty mesh
  if (survivingFaces.length === 0) {
    return new Geo.Mesh3([], [], 0x94e2d5);
  }

  // General case: compact vertex list — only include vertices referenced by
  // surviving faces; rebuild face indices into the compacted list.
  const oldToNew = new Map();
  const newVerts = [];
  const newFaces = [];

  for (const face of survivingFaces) {
    const remapped = [];
    for (const idx of face) {
      if (!oldToNew.has(idx)) {
        oldToNew.set(idx, newVerts.length);
        newVerts.push(verts[idx]);
      }
      remapped.push(oldToNew.get(idx));
    }
    newFaces.push(remapped);
  }

  return new Geo.Mesh3(newVerts, newFaces, 0x94e2d5);
}

// ── Node definition ───────────────────────────────────────────────────────────

export const surfaceTrimNode = {
  type: 'Surface.Trim',
  name: 'Surface.Trim',
  category: 'surfaces',
  subGroup: 'Operations',
  icon: '✂',
  aliases: ['surf-trim', 'surface-cut'],
  description: 'Cuts a surface mesh with an intersecting geometry and returns the portion that lies outside the cutting body. For sphere cutters, uses exact triangle-sphere intersection. For other cutters, uses a centroid-in-AABB approximation (works well for convex, axis-aligned shapes). Non-intersecting cutters return the original surface unchanged; a fully-enclosing cutter returns an empty mesh.',
  inputs: [
    { id: 'surface', name: 'Surface', type: 'mesh', description: 'Surface mesh to trim' },
    { id: 'geometry', name: 'Geometry', type: 'mesh', description: 'Cutting geometry — the region it encloses is removed from the surface' }
  ],
  outputs: [
    { id: 'result', name: 'Result', type: 'mesh', description: 'Trimmed surface mesh with the intersecting region removed' }
  ],
  controls: [],
  execute(_context, inputs) {
    const surface = inputs.surface;
    const geometry = inputs.geometry;

    // Null surface → empty mesh (never throw)
    if (surface == null) {
      return { result: new Geo.Mesh3([], [], 0x94e2d5) };
    }

    return { result: trimSurface(surface, geometry) };
  },
  codegen: {
    python: '{{result}} = Geo.trimSurface({{surface}}, {{geometry}})',
    csharp: 'var {{result}} = Geo.trimSurface({{surface}}, {{geometry}});'
  },
  help: {
    summary: 'Cuts a surface mesh with an intersecting geometry and returns the remaining portion.',
    inputs: [
      { name: 'Surface', description: 'Surface mesh to trim (e.g. from Surface.ByPatch)' },
      { name: 'Geometry', description: 'Cutting geometry mesh — the enclosed region is removed' }
    ],
    outputs: [{ name: 'Result', description: 'Trimmed surface mesh' }],
    example: {
      title: 'Trim a circle patch with an overlapping sphere — sphere-intersection region removed',
      nodes: [
        { type: 'Point.Origin', x: 0, y: 0 },
        { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
        { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
        { type: 'Surface.ByPatch', x: 460, y: 30 },
        { type: 'Input.Number', x: 0, y: 160, controls: { val: 0.4 } },
        { type: 'Sphere.ByCenterRadius', x: 240, y: 150 },
        { type: 'Surface.Trim', x: 680, y: 90 },
        { type: 'Output.Watch', x: 900, y: 90 }
      ],
      wires: [
        [0, 'point', 2, 'center'],
        [1, 'value', 2, 'radius'],
        [2, 'circle', 3, 'boundary'],
        [3, 'surface', 6, 'surface'],
        [0, 'point', 5, 'center'],
        [4, 'value', 5, 'radius'],
        [5, 'solid', 6, 'geometry'],
        [6, 'result', 7, 'value']
      ]
    },
    sampleCode: '{{result}} = Geo.trimSurface({{surface}}, {{geometry}})'
  }
};
