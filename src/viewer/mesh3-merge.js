// Nova — Mesh3 array merge for per-element face selection
//
// Surface.Panelize (and any node) can output an ARRAY of Geo.Mesh3 — one mesh
// per panel/element. The Select.Faces selection system (selection-mode.js) works
// off a single item._mesh3 plus a faceGroups array (one group per logical face,
// each becoming an independently hoverable/selectable unit via
// _Mesh3.toSelectionMesh()).
//
// To make EACH source mesh independently selectable — even when all panels are
// coplanar (a flat surface) and _Mesh3.groupFaces() would collapse them into one
// group — we merge the array into a single combined Mesh3 and precompute the
// face groups ourselves: exactly one group per SOURCE mesh, never coplanar-merged.
//
// This is a pure helper: no THREE, no DOM. Wired into geo-selector.js addTaggedGeo.
//
// Owned file: src/viewer/mesh3-merge.js (UI/Viewport)

/**
 * Returns true when value is a non-empty array whose every element is a Geo.Mesh3.
 * @param {*} value
 */
export function isMesh3Array(value) {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(function (m) { return m && m._type === 'Mesh3' && Array.isArray(m.vertices) && Array.isArray(m.faces); });
}

/**
 * Merge an array of Geo.Mesh3 into ONE combined Geo.Mesh3 plus a faceGroups
 * array where each group holds exactly one source mesh's triangle indices (in
 * the merged face list). This deliberately bypasses coplanar grouping so each
 * source panel stays an independent selectable unit even on a flat surface.
 *
 * Vertices are concatenated; each source mesh's face indices are offset by the
 * running vertex count so they reference the right rows in the merged mesh.
 *
 * @param {Array} meshes        Geo.Mesh3[] (validated by isMesh3Array)
 * @param {Function} Mesh3Ctor  Geo.Mesh3 constructor (vertices, faces, color)
 * @returns {{ mesh: object, faceGroups: Array<{triangleIndices:number[], normal:number[], d:number, sourceIndex:number}> }}
 */
export function mergeMesh3Array(meshes, Mesh3Ctor) {
  const vertices = [];
  const faces = [];
  const faceGroups = [];

  let vertexOffset = 0;
  let triCursor = 0; // running triangle (face) index into the merged `faces`

  for (let mi = 0; mi < meshes.length; mi++) {
    const src = meshes[mi];
    const srcVerts = src.vertices || [];
    const srcFaces = src.faces || [];

    for (let vi = 0; vi < srcVerts.length; vi++) vertices.push(srcVerts[vi]);

    const triangleIndices = [];
    for (let fi = 0; fi < srcFaces.length; fi++) {
      const f = srcFaces[fi];
      faces.push([f[0] + vertexOffset, f[1] + vertexOffset, f[2] + vertexOffset]);
      triangleIndices.push(triCursor);
      triCursor++;
    }

    // One group per source mesh — never coplanar-merged. normal/d are computed
    // from the first triangle for parity with _Mesh3.groupFaces() output shape;
    // toSelectionMesh() only reads triangleIndices, so they are informational.
    const normal = _firstTriangleNormal(srcVerts, srcFaces);
    faceGroups.push({
      triangleIndices: triangleIndices,
      normal: normal.n,
      d: normal.d,
      sourceIndex: mi,
    });

    vertexOffset += srcVerts.length;
  }

  const color = meshes[0] && meshes[0].color !== undefined ? meshes[0].color : undefined;
  const mesh = new Mesh3Ctor(vertices, faces, color);
  return { mesh: mesh, faceGroups: faceGroups };
}

/**
 * Unit normal + plane offset of a mesh's first triangle (raw Geo space).
 * Returns { n: [nx,ny,nz], d } — falls back to +Z / 0 for degenerate input.
 */
function _firstTriangleNormal(verts, faces) {
  if (!faces || faces.length === 0 || !verts || verts.length < 3) {
    return { n: [0, 0, 1], d: 0 };
  }
  const f = faces[0];
  const v0 = verts[f[0]], v1 = verts[f[1]], v2 = verts[f[2]];
  if (!v0 || !v1 || !v2) return { n: [0, 0, 1], d: 0 };
  const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
  const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  const d = nx * v0.x + ny * v0.y + nz * v0.z;
  return { n: [nx, ny, nz], d: d };
}
