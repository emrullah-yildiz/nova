---
id: T09c
ticket: TICK-009
title: Select.Faces execute — face polygon output
lane: ui
agent: switch (ui-engineer)
branch: feat/tick-009-per-face-selection
status: blocked (awaits T09a merge — needs getFaceVertices on Geo.Mesh3)
created: 2026-06-07
depends-on: T09a merged
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Goal

Update `Select.Faces` execute in `src/nodes/categories/geometry.js` to:

1. Read `controlValues._selectedFaces` (a JSON string set by the onApprove handler in node-renderer.js via T09d).
2. Parse and return `{ faces: [...] }` where each face is `{ _type: 'Face', vertices: [[x,y,z],...], normal: [nx,ny,nz], area: number }`.
3. Make `Output.Watch` display the face data readably (not `[object Object]`).

## AC coverage

- AC-7 (output port carries face polygons; Output.Watch shows readable data)
- AC-10 (output works for any Geo.Mesh3 primitive)

## Owned paths

```
src/nodes/categories/geometry.js
```

## Do NOT touch

```
src/geometry/geometry-lib.js
src/viewer/geo-selector.js
src/viewer/selection-mode.js
src/ui/node-renderer.js
src/main.js
src/core/node-library.js
tests/geometry-selection.test.js
tests/e2e/geometry-selection.spec.js
docs/agent-workboard.md
```

## Sequencing constraint

T09c MUST NOT start until T09a is merged to the branch. The execute function calls `getFaceVertices()` — that method must exist on `Geo.Mesh3` before this code can be written and tested.

## Implementation spec

Locate the `Select.Faces` node definition in `geometry.js`. Its execute function currently reads something like `controlValues._selectedGeo` or similar.

### New execute logic

```js
execute({ controlValues }) {
  const raw = controlValues._selectedFaces;
  if (!raw) return { faces: [] };
  let faces;
  try {
    faces = JSON.parse(raw);
  } catch {
    return { faces: [] };
  }
  // faces is already the structured array — T09d stores it pre-serialized.
  // Validate shape: each element must have _type === 'Face'.
  const valid = Array.isArray(faces)
    ? faces.filter(f => f && f._type === 'Face')
    : [];
  return { faces: valid };
},
```

The actual face objects (`{ _type: 'Face', vertices, normal, area }`) are constructed by T09d in node-renderer.js (the onApprove handler), not here. This execute function just parses and validates.

### Output.Watch compatibility

`Output.Watch` renders its input value. Confirm that when `faces` is an array of `{ _type, vertices, normal, area }` objects, the watch node shows something human-readable (not `[object Object]`). If the current watch renderer uses `JSON.stringify` already, no changes are needed. If not, check and fix the watch node's display logic within geometry.js (or wherever it lives) — but only if it is within the owned path.

### Select.Edges and Select.Points

Check whether `Select.Edges` and `Select.Edges` share the same execute path as `Select.Faces`. If they do, ensure the `_selectedFaces` key is namespaced correctly (e.g., `_selectedFaces` for faces, `_selectedEdges` for edges, `_selectedPoints` for points) so they don't collide. No behavioral change is required for edges/points in this ticket — only make sure the `Select.Faces` change doesn't break them.

## Interface consumed by this task

T09d (node-renderer.js) sets `nd.controlValues._selectedFaces = JSON.stringify(faceArray)` before triggering recompute. The `faceArray` shape:

```js
[
  {
    _type: 'Face',
    vertices: [[x,y,z], [x,y,z], [x,y,z], [x,y,z]],  // from getFaceVertices()
    normal: [nx, ny, nz],                              // from faceGroups[i].normal
    area: number,                                       // computed from vertices
  },
  ...
]
```

## Testing gate

- Manual browser: AC-7 (wire Select.Faces → Output.Watch, see face data)
- E2E (T09d spec): AC-7 (`watch output contains "_type" and "Face" and "vertices"`)
- Lint: `npm run lint:all` — 0 errors

## Merge checklist

- [ ] AC-7: `Select.Faces` output port contains `[{ _type: 'Face', vertices: [...], normal: [...], area: number }]`
- [ ] AC-7: `Output.Watch` downstream shows readable face data (not `[object Object]`)
- [ ] `Select.Edges` and `Select.Points` execute functions are unchanged and still work
- [ ] `npm run lint:all` 0 errors
- [ ] `npm run test` all existing tests pass

## Notes

- Do not change the node's inputs/outputs declaration or its library registration — only the execute function body.
- If `controlValues._selectedFaces` is absent (node not yet approved), return `{ faces: [] }`.
- Area computation: given a quad face with 4 vertices, split into 2 triangles and sum. For a triangle: `0.5 * |cross(v1-v0, v2-v0)|`. For the generic case, use the polygon area formula. T09d can pre-compute this — T09c just passes it through.
