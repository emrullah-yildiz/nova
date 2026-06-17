/**
 * Surface.Trim — geometry kernel node
 *
 * Cuts a surface mesh with an intersecting geometry mesh and returns the
 * portion of the surface that lies OUTSIDE the cutting body.
 *
 * Algorithm (triangle-level filtering):
 *   1. For each triangle in the Surface mesh, compute its centroid.
 *   2. Test whether that centroid lies inside the cutting Geometry.
 *      - If the cutting mesh carries _solidType === 'Sphere' metadata,
 *        use an exact distance test against the sphere centre and radius.
 *      - Otherwise, compute the axis-aligned bounding box (AABB) of the
 *        cutting mesh and use a point-in-AABB test as a conservative
 *        approximation.
 *   3. Keep triangles whose centroid is OUTSIDE the cutting body.
 *   4. Rebuild the mesh with only the surviving triangles, compacting
 *      the vertex list so no orphaned vertices remain.
 *
 * Edge cases:
 *   - No intersection (AC-3): all centroids outside → return a copy of the
 *     original mesh (same vertex/face arrays, new object).
 *   - Full enclosure (AC-4): all centroids inside → return an empty mesh
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
 * Build a "containment tester" function for the given cutting mesh.
 *
 * Returns a function (px, py, pz) → boolean: true if the point is
 * considered "inside" the cutting body.
 *
 * Priority:
 *  1. Sphere metadata (_solidType + _params) → exact radius test.
 *  2. General mesh → AABB containment.
 */
function buildContainmentTest(cuttingMesh) {
  if (!cuttingMesh) return () => false;

  // Exact sphere test using metadata written by Geo.createSphere
  if (
    cuttingMesh._solidType === 'Sphere' &&
    cuttingMesh._params &&
    cuttingMesh._params.center != null &&
    cuttingMesh._params.radius != null
  ) {
    const { center, radius } = cuttingMesh._params;
    const cx = center.x || 0;
    const cy = center.y || 0;
    const cz = center.z || 0;
    const r2 = radius * radius;
    return (px, py, pz) => {
      const dx = px - cx;
      const dy = py - cy;
      const dz = pz - cz;
      return dx * dx + dy * dy + dz * dz <= r2;
    };
  }

  // General mesh — AABB approximation
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

  const verts = surfaceMesh.vertices;
  const faces = surfaceMesh.faces;
  const isInside = buildContainmentTest(cuttingMesh);

  // Filter faces: keep those whose centroid lies OUTSIDE the cutting body
  const survivingFaces = [];
  for (const face of faces) {
    const [i0, i1, i2] = face;
    const v0 = verts[i0];
    const v1 = verts[i1];
    const v2 = verts[i2];
    // Skip degenerate face references
    if (!v0 || !v1 || !v2) continue;
    const cx = (v0.x + v1.x + v2.x) / 3;
    const cy = (v0.y + v1.y + v2.y) / 3;
    const cz = (v0.z + v1.z + v2.z) / 3;
    if (!isInside(cx, cy, cz)) {
      survivingFaces.push(face);
    }
  }

  // AC-3: no triangles removed — return a copy of the original mesh
  if (survivingFaces.length === faces.length) {
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
  description: 'Cuts a surface mesh with an intersecting geometry and returns the portion that lies outside the cutting body. Triangles whose centroid falls inside the cutting geometry are removed. Non-intersecting cutters return the original surface unchanged; a fully-enclosing cutter returns an empty mesh.',
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
