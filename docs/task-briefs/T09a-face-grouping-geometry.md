---
id: T09a
ticket: TICK-009
title: Face grouping algorithm + toSelectionMesh() + getFaceVertices()
lane: geometry
agent: mouse (geometry-engineer)
branch: feat/tick-009-per-face-selection
status: queued
created: 2026-06-07
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Goal

Add three new methods to `Geo.Mesh3` (`_Mesh3` class) in `geometry-lib.js`:

1. `groupFaces()` — coplanar-normal triangle grouping algorithm.
2. `toSelectionMesh(faceGroups)` — builds a THREE.js mesh with BufferGeometry groups + per-group materials for selection mode.
3. `getFaceVertices(faceGroupIndex)` — extracts unique vertex positions from a group.

Write a unit test that verifies the grouping on a Box mesh.

## AC coverage

- AC-1 (foundation: face decomposition exists) — partial (viewer wires it, but algorithm lives here)
- AC-7 (output geometry shape — `getFaceVertices` supplies vertex data)
- AC-10 (works on all primitives — algorithm is mesh-agnostic)
- Unit test: 6 groups from Box (12 triangles) — see Testing gate

## Owned paths

```
src/geometry/geometry-lib.js
tests/geometry-selection.test.js
```

## Do NOT touch

```
src/viewer/geo-selector.js
src/viewer/selection-mode.js
src/viewer/viewer3d.js
src/nodes/categories/geometry.js
src/ui/node-renderer.js
src/main.js
src/core/node-library.js
docs/agent-workboard.md   (morpheus owns this during dispatch)
```

## Implementation spec

### 1. `groupFaces()` — method on `_Mesh3`

```js
groupFaces() {
  // Returns: Array<{ triangleIndices: number[], normal: [nx,ny,nz] }>
  // Algorithm:
  //   For each triangle in this.faces:
  //     1. Get vertex positions v0, v1, v2 (remember toThreeGeometry swaps Y/Z)
  //        Use raw geometry coords as stored: v.x, v.y, v.z.
  //     2. Compute edge vectors e1 = v1-v0, e2 = v2-v0.
  //     3. Cross product n = normalize(e1 × e2).
  //     4. Try to merge into an existing group where |dot(n, group.normal)| > 0.999.
  //     5. If no match, create a new group with this triangle.
  //   Return array of groups.
}
```

Note: use Math.abs(dot) > 0.999 so that opposite-facing normals (e.g. inside vs outside of a box) are still treated as coplanar — they are part of the same logical flat face. If the dot product check distinguishes them (> 0.999 without abs), a box would produce 12 groups instead of 6. Use whichever makes the Box → 6 groups unit test pass. Prefer abs.

### 2. `toSelectionMesh(faceGroups)` — method on `_Mesh3`

```js
toSelectionMesh(faceGroups) {
  // faceGroups: output of groupFaces() (optional — calls groupFaces() if omitted)
  // Returns: { mesh: THREE.Mesh, materials: THREE.MeshPhongMaterial[], faceGroups, triangleToGroup: number[] }
  //
  // Steps:
  //   1. Build flat position array (same Y/Z swap as toThreeGeometry).
  //   2. Create BufferGeometry with those positions.
  //   3. Build index array ordered by group: group 0 first, then group 1, etc.
  //      Track the start offset and count for each group.
  //   4. For each group i: geometry.addGroup(startOffset, count, i).
  //   5. Create one MeshPhongMaterial per group (color: 0x94e2d5, side: THREE.DoubleSide,
  //      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1).
  //      Clone each so they are independent.
  //   6. Compute vertex normals (geometry.computeVertexNormals()).
  //   7. Create THREE.Mesh(geometry, materials[]).
  //   8. mesh.userData.isSelectionMesh = true.
  //   9. Build triangleToGroup: for each original triangle index → group index.
  //  10. Return { mesh, materials, faceGroups, triangleToGroup }.
}
```

### 3. `getFaceVertices(faceGroupIndex, faceGroups)` — method on `_Mesh3`

```js
getFaceVertices(faceGroupIndex, faceGroups) {
  // faceGroups: output of groupFaces() — must be pre-computed and passed in.
  // Returns: [[x,y,z], ...] — unique vertex positions for that group.
  //   1. Collect all vertex indices from the group's triangles.
  //   2. Deduplicate by stringified coordinate (within 1e-6 tolerance or exact).
  //   3. Return as array of [x, y, z] tuples (raw Geo coordinates, no Y/Z swap).
}
```

### 4. Unit test — `tests/geometry-selection.test.js`

Extend (or create) the file. Add a `describe('Geo.Mesh3 face grouping')` block:

```js
it('groups 12 box triangles into 6 coplanar face groups', () => {
  const box = Geo.Box.ByCenterWidthDepthHeight(new Geo.Point3(0,0,0), 2, 2, 2);
  const groups = box.groupFaces();
  expect(groups.length).toBe(6);
  groups.forEach(g => {
    expect(g.triangleIndices.length).toBe(2);
    // Normal is unit length
    const [nx, ny, nz] = g.normal;
    expect(Math.abs(nx*nx + ny*ny + nz*nz - 1)).toBeLessThan(1e-5);
  });
});

it('getFaceVertices returns 4 unique vertices for group 0', () => {
  const box = Geo.Box.ByCenterWidthDepthHeight(new Geo.Point3(0,0,0), 2, 2, 2);
  const groups = box.groupFaces();
  const verts = box.getFaceVertices(0, groups);
  expect(verts.length).toBe(4);
  verts.forEach(v => expect(v.length).toBe(3));
});

it('toSelectionMesh returns mesh with N groups matching faceGroups', () => {
  const box = Geo.Box.ByCenterWidthDepthHeight(new Geo.Point3(0,0,0), 2, 2, 2);
  const groups = box.groupFaces();
  const { mesh, materials, triangleToGroup } = box.toSelectionMesh(groups);
  expect(mesh).toBeTruthy();
  expect(materials.length).toBe(groups.length);
  expect(triangleToGroup.length).toBe(12); // 12 triangles in a box
  expect(mesh.geometry.groups.length).toBe(groups.length);
});
```

Import path for `Geo` in the test: check existing test files in `tests/` to find the correct import (likely `import { Geo } from '../src/geometry/index.js'` or equivalent).

## Interface / contract (consumed by T09b and T09c)

T09b (geo-selector.js) will call:
```js
const faceGroups = mesh3.groupFaces();
const { mesh, materials, faceGroups: fg, triangleToGroup } = mesh3.toSelectionMesh(faceGroups);
```

T09c (geometry.js) will call:
```js
const vertices = mesh3.getFaceVertices(groupIndex, faceGroups);
```

These are the only public surface. Do not change any other existing `_Mesh3` methods.

## Testing gate

- Unit: `npm run test` — `tests/geometry-selection.test.js` — 3 new assertions pass.
- Lint: `npm run lint:all` — 0 errors.

## Merge checklist

- [ ] AC-unit: `groupFaces()` on Box → 6 groups of 2 triangles, unit normals — covered by test
- [ ] AC-unit: `getFaceVertices(0, groups)` → 4 vertices, each `[x,y,z]` — covered by test
- [ ] AC-unit: `toSelectionMesh()` returns `{ mesh, materials, triangleToGroup }` with correct lengths — covered by test
- [ ] `npm run lint:all` 0 errors
- [ ] `npm run test` all pass

## Notes

- geometry-lib.js does not import anything from the viewer layer. Keep it that way — no THREE references in `groupFaces()` or `getFaceVertices()`. THREE is used only inside `toSelectionMesh()` (since it must build a THREE.Mesh). THREE is already in scope in geometry-lib.js (it is loaded globally).
- Do not modify `toThreeGeometry()` or `toMesh()` — those are used by normal render paths.
- If `tests/geometry-selection.test.js` already exists with prior content, append the new `describe` block — do not delete existing tests.
