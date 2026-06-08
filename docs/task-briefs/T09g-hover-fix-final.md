---
id: T09g-hover-fix-final
parent: TICK-009
title: Fix face hover and color — triangleToGroup index mismatch
lane: ui (switch)
branch: fix/tick-009g-hover-fix
status: ready
created: 2026-06-07
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Goal

Fix the per-face hover highlight (blue on mouseover) and per-face click color (green on click).
The PM reports that face colors still do not change on hover or click.
The root cause is a mismatch between how `triangleToGroup` is indexed and what THREE.js `hit.faceIndex` reports.

## Root cause — confirmed from source code analysis

`toSelectionMesh()` in `src/geometry/geometry-lib.js` builds the selection mesh geometry by
reordering triangles: all triangles belonging to group 0 are written first, then group 1, etc.
This reordering makes BufferGeometry groups contiguous, which is required by THREE.js.

However, the `triangleToGroup` lookup array is built using the **original** face indices from
`this.faces[]`:

```js
// WRONG — keyed by original face index, not by position in the reordered geometry buffer
const triangleToGroup = new Array(this.faces.length);
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup[tris[k]] = gi;   // tris[k] is an original face index
  }
}
```

When the THREE.js raycaster fires, `hit.faceIndex` is the triangle's **position in the reordered
index buffer** — i.e., 0 for the first triangle in the geometry's `setIndex()` output, regardless
of which group it belongs to. It is NOT the original `this.faces[i]` index.

Result: `result.triangleToGroup[hit.faceIndex]` almost always returns `undefined`, causing both
`selectionMeshHover` and `selectionMeshClick` to bail out at:

```js
const groupIndex = result.triangleToGroup[triIndex];
if (groupIndex === undefined || groupIndex === null) return;  // always returns here
```

No material color is ever set. No render is ever requested. Hover and click silently do nothing.

## Why the session log showed zero hover trace events

The T09f debug instrumentation writes to `window.__novaHoverDebug.lastHoverTrace` inside
`selectionMeshHover()`. If `selectionMeshHover` returns before reaching the trace write (because
`groupIndex` is undefined), no trace fields are set. The PM's log showed only 3 `3d-render`
entries and no hover traces — consistent with this early-return path being hit every single time.

## Fix — reindex triangleToGroup by buffer position, not original face index

The fix is in `toSelectionMesh()` in `src/geometry/geometry-lib.js`.

Replace the `triangleToGroup` build loop so it tracks the triangle's position in the output buffer
(i.e., the position of each triangle as it is written into `indexArr`):

```js
// CORRECT — keyed by position in the reordered geometry buffer (matches hit.faceIndex)
const triangleToGroup = [];
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup.push(gi);   // push one entry per triangle, in the order they are written
  }
}
```

Because `indexArr` is built by iterating `faceGroups` in order (gi = 0, 1, 2, ...),
and `geometry.setIndex(indexArr)` writes them in that same order, `triangleToGroup[n]` will
correctly return the group index for the n-th triangle in the buffer — which is exactly what
`hit.faceIndex` reports.

This single change fixes both hover and click: `selectionMeshHover` and `selectionMeshClick`
both use `result.triangleToGroup[Math.floor(hit.faceIndex)]` to look up the group.

## Secondary check — confirm isMeshBody tag on Box geometry

`_swapToFaceMeshes()` in `src/viewer/selection-mode.js` traverses `item.group` and searches
for a mesh with `obj.userData.isMeshBody === true`. If the Box body mesh does not carry this
flag, `bodyMesh` stays null and the swap is silently skipped — resulting in `swapSucceeded = 0`
and no selection mesh being added, so `anySelMesh` is false and the entire hover branch falls
through to the non-selection-mode path.

**Verify:** in `src/viewer/viewer3d.js` (or wherever Box geometry is rendered into THREE.Mesh),
confirm that `mesh.userData.isMeshBody = true` is set. If it is missing, add it.

If `swapSucceeded = 0` is what the PM's session log reveals (read `window.__novaHoverDebug`),
this is the fix needed instead of (or in addition to) the triangleToGroup fix.

## Owned paths

```
src/geometry/geometry-lib.js          — fix triangleToGroup build loop
src/viewer/viewer3d.js                — verify/add isMeshBody userData tag (if missing)
src/viewer/selection-mode.js          — remove T09f debug instrumentation after fix confirmed
src/viewer/geo-selector.js            — remove T09f debug instrumentation after fix confirmed
tests/e2e/geometry-selection.spec.js  — update/add E2E hover assertion if needed
```

## Do NOT touch

```
src/nodes/categories/geometry.js
src/ui/node-renderer.js
src/core/**
worker/**
api/**
docs/ARCHITECTURE.md
docs/tickets/**   (coordinator updates these)
docs/agent-workboard.md   (coordinator updates this)
```

## Step-by-step implementation

### Step 1 — Check isMeshBody in viewer3d.js

Search for `isMeshBody` in `src/viewer/viewer3d.js`. If the body mesh is created without this
tag, add `mesh.userData.isMeshBody = true;` where the body mesh is instantiated.

Also check the branch `fix/tick-009f-hover-debug-logging` (current branch) for any trace output
from `window.__novaHoverDebug.swapSucceeded` — if it is 0, the isMeshBody tag is the blocker.

### Step 2 — Fix triangleToGroup in geometry-lib.js

Replace lines ~686-692 in `toSelectionMesh()`:

```js
// OLD (wrong — keyed by original face index):
const triangleToGroup = new Array(this.faces.length);
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup[tris[k]] = gi;
  }
}

// NEW (correct — keyed by position in the reordered geometry buffer):
const triangleToGroup = [];
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup.push(gi);
  }
}
```

### Step 3 — Test in browser (mandatory)

1. `npm run dev` — open `http://localhost:5173`
2. Create a Box node. Wire to Select.Faces. Run. Click "Select Faces".
3. Open DevTools console. Move mouse over the box.
4. `JSON.stringify(window.__novaHoverDebug, null, 2)` — expect:
   - `swapSucceeded >= 1`
   - `lastHoverTrace.anySelMesh: true`
   - `lastHoverTrace.candidateCount >= 1`
   - `lastHoverTrace.hitFound: true`
   - `lastHoverTrace.hitOnSelMesh: true`
   - `lastHoverTrace.groupIndex: <0–5 for a box>`
   - `lastHoverTrace.materialSet: true`
5. Visually confirm: face under cursor turns blue. Click — turns green, counter increments.
6. Orbit — counter stays. Click empty space — counter resets to 0.
7. Approve — mesh restores normally.

### Step 4 — Remove T09f debug instrumentation

Once hover works visually in-browser, remove the debug code:
- `window.__novaHoverDebug` init block in `selection-mode.js` (lines 44–59)
- All `window.__novaHoverDebug.lastHoverTrace.*` writes in `geo-selector.js` mousemove handler
- All `window.__novaHoverDebug.swapAttempted`, `.swapSucceeded`, etc. writes in `_swapToFaceMeshes`

Keep `window.__geoSelectorHoveredFaceMesh` and `window.__geoSelectorHoveredFaceGroup` — these
are used by the E2E spec for AC-11 assertions.

### Step 5 — Run gates

```bash
npm run lint:all
npm run test
npm run build
npm run test:e2e
```

All must pass with 0 errors.

### Step 6 — Push

Push `fix/tick-009g-hover-fix`. Notify coordinator.

## Acceptance criteria (this task)

- [ ] AC-T09g-1: Moving the mouse over a face of a Box in Select.Faces mode turns that face blue immediately. Moving to another face: first returns to teal, second turns blue.
- [ ] AC-T09g-2: Clicking a face turns it green. The toolbar shows "1 face selected".
- [ ] AC-T09g-3: `window.__novaHoverDebug` (if still present) shows `swapSucceeded >= 1`, `lastHoverTrace.materialSet: true`, `lastHoverTrace.renderRequested: true`.
- [ ] AC-T09g-4: All previously passing lint, unit tests, build, and E2E pass unchanged.
- [ ] AC-T09g-5: Debug instrumentation (`window.__novaHoverDebug`) is removed before commit.

## Merge checklist

- [ ] AC-T09g-1 verified: hover blue confirmed visually in browser
- [ ] AC-T09g-2 verified: click green + counter increments
- [ ] AC-T09g-3 verified: debug trace confirms pipeline completes end-to-end
- [ ] AC-T09g-4: `npm run lint:all && npm run test && npm run build && npm run test:e2e` all pass
- [ ] AC-T09g-5: `window.__novaHoverDebug` block removed before push
- [ ] TICK-009.md updated with T09g fix notes
- [ ] agent-workboard.md row released
