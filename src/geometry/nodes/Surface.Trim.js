/**
 * Surface.Trim — geometry kernel node
 *
 * Cuts a surface mesh with an intersecting geometry mesh and returns the
 * portion of the surface that lies OUTSIDE the cutting body.
 *
 * Algorithm:
 *   1. Subdivide the surface mesh once (each triangle → 4) so that inner
 *      and outer regions have small enough triangles for centroid testing.
 *      Without subdivision, fan-triangulated surfaces (Surface.ByPatch) have
 *      every centroid at ~2/3 of the patch radius — outside any small sphere.
 *   2. For each sub-triangle, test whether its centroid lies inside the
 *      cutting body:
 *      - Sphere cutter (_solidType==='Sphere'): exact squared-distance test.
 *      - General mesh cutter: centroid-in-AABB approximation (works well for
 *        convex, axis-aligned cutters).
 *   3. Keep sub-triangles whose centroid is OUTSIDE the cutting body.
 *   4. Rebuild the mesh with only the surviving sub-triangles, compacting
 *      the vertex list so no orphaned vertices remain.
 *
 * Edge cases:
 *   - No intersection (AC-3): no sub-triangles removed → return a copy of
 *     the ORIGINAL (non-subdivided) mesh.
 *   - Full enclosure (AC-4): all sub-triangles removed → return an empty mesh
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
 * Subdivide each triangle of `mesh` into 4 by inserting edge midpoints.
 * Returns a new Mesh3 with 4× the face count and shared midpoint vertices.
 * Original vertex indices are preserved; midpoints are appended after them.
 */
function subdivideOnce(mesh) {
  const verts = mesh.vertices.slice(); // extend with midpoints below
  const faces = [];
  const edgeMap = new Map();

  const getMid = (a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeMap.has(key)) return edgeMap.get(key);
    const va = verts[a], vb = verts[b];
    const idx = verts.length;
    verts.push(new Geo.Point3(
      (va.x + vb.x) / 2,
      (va.y + vb.y) / 2,
      (va.z + vb.z) / 2
    ));
    edgeMap.set(key, idx);
    return idx;
  };

  for (const face of mesh.faces) {
    const [i0, i1, i2] = face;
    if (!verts[i0] || !verts[i1] || !verts[i2]) continue;
    const m01 = getMid(i0, i1);
    const m12 = getMid(i1, i2);
    const m02 = getMid(i0, i2);
    faces.push([i0, m01, m02]);
    faces.push([m01, i1, m12]);
    faces.push([m02, m12, i2]);
    faces.push([m01, m12, m02]);
  }

  return new Geo.Mesh3(verts, faces, mesh.color);
}

/**
 * Build a centroid-based "inside the cutting body?" tester.
 *
 * Returns a function (px, py, pz) → boolean: true means the centroid is
 * inside the cutting body and the triangle should be removed.
 *
 * Priority:
 *  1. Sphere metadata (_solidType + _params) → exact squared-distance test.
 *  2. General mesh → centroid-in-AABB approximation.
 */
function buildContainmentTest(cuttingMesh) {
  if (!cuttingMesh) return () => false;

  if (
    cuttingMesh._solidType === 'Sphere' &&
    cuttingMesh._params &&
    cuttingMesh._params.center != null &&
    cuttingMesh._params.radius != null
  ) {
    const { center, radius } = cuttingMesh._params;
    const cx = center.x ?? 0;
    const cy = center.y ?? 0;
    const cz = center.z ?? 0;
    const r2 = radius * radius;
    return (px, py, pz) => {
      const dx = px - cx, dy = py - cy, dz = pz - cz;
      return dx * dx + dy * dy + dz * dz <= r2;
    };
  }

  const aabb = meshAABB(cuttingMesh);
  if (!aabb) return () => false;
  return (px, py, pz) =>
    px >= aabb.minX && px <= aabb.maxX &&
    py >= aabb.minY && py <= aabb.maxY &&
    pz >= aabb.minZ && pz <= aabb.maxZ;
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

  // Subdivide the surface once so inner sub-triangles have small enough
  // centroids for the sphere/AABB test to distinguish inside from outside.
  const fine = subdivideOnce(surfaceMesh);
  const verts = fine.vertices;
  const faces = fine.faces;
  const isInside = buildContainmentTest(cuttingMesh);

  // Filter sub-faces: keep those whose centroid is OUTSIDE the cutting body.
  // Track whether the cutter actually removed anything (for the AC-3 path).
  let cutterRemovedAny = false;
  const survivingFaces = [];
  for (const face of faces) {
    const [i0, i1, i2] = face;
    const v0 = verts[i0], v1 = verts[i1], v2 = verts[i2];
    if (!v0 || !v1 || !v2) continue;
    const cx = (v0.x + v1.x + v2.x) / 3;
    const cy = (v0.y + v1.y + v2.y) / 3;
    const cz = (v0.z + v1.z + v2.z) / 3;
    if (isInside(cx, cy, cz)) {
      cutterRemovedAny = true;
    } else {
      survivingFaces.push(face);
    }
  }

  // AC-3: cutter did not overlap any sub-triangle — return a copy of the
  // original (non-subdivided) mesh so the output geometry is unchanged.
  if (!cutterRemovedAny) {
    return new Geo.Mesh3(
      surfaceMesh.vertices.slice(),
      surfaceMesh.faces.map(f => f.slice()),
      0x94e2d5
    );
  }

  // AC-4: all sub-triangles removed — return empty mesh
  if (survivingFaces.length === 0) {
    return new Geo.Mesh3([], [], 0x94e2d5);
  }

  // General case: compact vertex list — only include vertices referenced by
  // surviving sub-faces; rebuild face indices into the compacted list.
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
  description: 'Cuts a surface mesh with an intersecting geometry and returns the portion that lies outside the cutting body. The surface is subdivided once before testing so that coarse fan-triangulated meshes (e.g. from Surface.ByPatch) trim correctly. Sphere cutters use an exact distance test; other cutters use a centroid-in-AABB approximation. Non-intersecting cutters return the original surface unchanged; a fully-enclosing cutter returns an empty mesh.',
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
