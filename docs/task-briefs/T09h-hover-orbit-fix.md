---
id: T09h-hover-orbit-fix
parent: TICK-009
title: Fix face hover highlight and orbit-drag selection bug
lane: ui (switch)
branch: fix/tick-009h-hover-orbit-fix
status: ready
created: 2026-06-07
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Goal

Two regressions remain in the Select.Faces feature after multiple fix attempts.
Both must be fixed in this branch, verified visually in a running browser, and all
automated gates must pass before the coordinator response is written.

---

## Bug 1 — Hover highlight not visible (face does not turn blue)

### Root cause

`toSelectionMesh()` in `src/geometry/geometry-lib.js` builds the selection mesh
geometry by reordering triangles — all group-0 triangles first, then group-1, etc. —
so BufferGeometry groups are contiguous (a THREE.js requirement).

However, `triangleToGroup` is indexed by the **original** face index from `this.faces[]`:

```js
// WRONG — keyed by original face index, not by buffer position
const triangleToGroup = new Array(this.faces.length);
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup[tris[k]] = gi;   // tris[k] is the original face index
  }
}
```

THREE.js `hit.faceIndex` reports the triangle's **position in the reordered geometry
buffer** (0, 1, 2, ... in the order triangles appear in `geometry.setIndex()`), NOT
the original `this.faces[i]` index.

Result: `result.triangleToGroup[hit.faceIndex]` almost always returns `undefined`.
Both `selectionMeshHover` and `selectionMeshClick` bail out immediately at:

```js
const groupIndex = result.triangleToGroup[triIndex];
if (groupIndex === undefined || groupIndex === null) return;  // always hits this
```

No material color is ever set. No render is requested. The hover and click are
silently no-ops.

### Fix

Replace the `triangleToGroup` build loop in `toSelectionMesh()` in
`src/geometry/geometry-lib.js`:

```js
// CORRECT — keyed by position in the reordered geometry buffer
const triangleToGroup = [];
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup.push(gi);   // push in the order triangles are written to indexArr
  }
}
```

Because `indexArr` is built by iterating `faceGroups` in order (gi=0, 1, 2, ...),
`triangleToGroup[n]` will correctly return the group for the n-th triangle in the buffer.
This matches `hit.faceIndex` exactly.

---

## Bug 2 — Orbit drag adds or removes from the selection

### Root cause

OrbitControls uses `pointerdown` events internally. The drag guard in
`src/viewer/geo-selector.js` uses `mousedown` / `mousemove` / `click` events.
In some browser/OS configurations the `click` event's `clientX/Y` matches the
`mousedown` position exactly (delta = 0), so `_isDragging` is never set to true.
On pointer-up the handler thinks every orbit drag was a genuine click and
fires the select/deselect logic.

### Fix

Change the drag guard in `src/viewer/geo-selector.js` from
`mousedown` / `mousemove` / `click` to `pointerdown` / `pointermove` / `pointerup`
so it uses the same event type as OrbitControls.

Concretely:
1. Rename `mousedown` listener to `pointerdown`. Inside: reset `_isDragging = false`,
   record `_dragStartX = e.clientX`, `_dragStartY = e.clientY`.
2. Rename `mousemove` listener to `pointermove`. Inside: if displacement from
   `_dragStart` exceeds 3px, set `_isDragging = true`.
3. Replace the `click` listener with a `pointerup` listener. Inside: if
   `_isDragging === true`, do nothing (it was a drag, not a click). Otherwise run
   the existing click/select logic.

The guard must also reset `_isDragging = false` at the top of the `pointerup` handler
after the check, so the next gesture starts clean.

---

## Bug 3 — Remove T09f debug instrumentation

The branch `fix/tick-009f-hover-debug-logging` added `window.__novaHoverDebug`
instrumentation. This must be removed before pushing.

Files to clean:
- `src/viewer/selection-mode.js` — remove the `window.__novaHoverDebug` init block
  (lines ~44–59) and all `.swapAttempted`, `.swapSucceeded`, `.swapError`,
  `.swapItemCount`, `.itemWasHidden`, `.itemGroupWasHidden` writes inside
  `_swapToFaceMeshes`, and the `lastHoverTrace.*` writes inside `selectionMeshHover`.
- `src/viewer/geo-selector.js` — remove all `window.__novaHoverDebug.lastHoverTrace.*`
  writes in the `mousemove`/`pointermove` handler.

Keep `window.__geoSelectorHoveredFaceMesh` and `window.__geoSelectorHoveredFaceGroup`
— the E2E spec uses these for AC-11 assertions.

---

## Owned paths

```
src/geometry/geometry-lib.js          — Bug 1 fix: triangleToGroup push loop
src/viewer/geo-selector.js            — Bug 2 fix: pointer events; Bug 3: remove debug
src/viewer/selection-mode.js          — Bug 3: remove window.__novaHoverDebug
src/viewer/viewer3d.js                — verify isMeshBody userData tag (add if missing)
tests/e2e/geometry-selection.spec.js  — update E2E if pointer-event change affects selectors
```

## Do NOT touch

```
src/nodes/categories/geometry.js
src/ui/node-renderer.js
src/core/**
worker/**
api/**
docs/ARCHITECTURE.md
docs/tickets/**          (coordinator updates these)
docs/agent-workboard.md  (coordinator updates this)
```

---

## Step-by-step implementation

### Step 1 — Branch setup

```bash
git switch develop
git pull --ff-only
git switch -c fix/tick-009h-hover-orbit-fix
```

### Step 2 — Fix Bug 1: triangleToGroup in geometry-lib.js

Open `src/geometry/geometry-lib.js`. Find `toSelectionMesh()`.
Locate the `triangleToGroup` build block (search for `triangleToGroup`).

Replace:
```js
const triangleToGroup = new Array(this.faces.length);
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup[tris[k]] = gi;
  }
}
```

With:
```js
const triangleToGroup = [];
for (let gi = 0; gi < faceGroups.length; gi++) {
  const tris = faceGroups[gi].triangleIndices;
  for (let k = 0; k < tris.length; k++) {
    triangleToGroup.push(gi);
  }
}
```

### Step 3 — Verify isMeshBody flag in viewer3d.js

Search for `isMeshBody` in `src/viewer/viewer3d.js`.
The body mesh that gets swapped in selection mode must have:
```js
mesh.userData.isMeshBody = true;
```
If missing, add it where the body mesh is created. Without this flag,
`_swapToFaceMeshes()` silently skips the swap and no selection mesh appears.

### Step 4 — Fix Bug 2: pointer events in geo-selector.js

In `src/viewer/geo-selector.js`, find the drag guard logic.

Replace `mousedown` listener registration → `pointerdown`.
Replace `mousemove` listener registration → `pointermove`.
Replace `click` listener registration → `pointerup`.

In the `pointerup` handler:
```js
canvas.addEventListener('pointerup', function(e) {
  if (self._isDragging) {
    self._isDragging = false;
    return;   // orbit/pan drag — do not fire select logic
  }
  self._isDragging = false;
  // ... existing click/select logic ...
});
```

### Step 5 — Remove T09f debug instrumentation (Bug 3)

In `src/viewer/selection-mode.js`:
- Remove the `window.__novaHoverDebug = { ... }` init block.
- Remove all `window.__novaHoverDebug.*` write statements.

In `src/viewer/geo-selector.js`:
- Remove all `window.__novaHoverDebug.lastHoverTrace.*` write statements.

### Step 6 — Run automated gates

```bash
npm run lint:all
npm run test
npm run build
npm run test:e2e
```

All must pass with 0 errors. Fix any failures before proceeding.

### Step 7 — Manual browser test (MANDATORY — do not skip)

```bash
npm run dev
```

Open `http://localhost:5173` in a browser.

Test each scenario and record the result:

1. **Hover highlight:** Create a Box node → wire to Select.Faces → Run → click "Select Faces".
   Move mouse slowly over each face of the box.
   EXPECTED: the face under the cursor turns blue immediately. Moving to another face:
   previous returns to teal, new turns blue. ✅ or ❌

2. **Click to select:** Click one face.
   EXPECTED: face turns green, toolbar shows "1 face selected". ✅ or ❌

3. **Click again to deselect:** Click the same green face again.
   EXPECTED: face returns to teal, toolbar shows "0 faces selected". ✅ or ❌

4. **Orbit does not change selection:** Select a face (green). Then orbit-rotate the view
   by dragging the mouse. Release. Do NOT click — just orbit.
   EXPECTED: the green face stays green after orbiting. Counter stays at "1 face selected". ✅ or ❌

5. **Click empty space clears:** With one face selected (green), click an empty area of
   the 3D viewport (not on the box).
   EXPECTED: all faces return to teal, counter resets to "0 faces selected". ✅ or ❌

**All five must be ✅ before writing the coordinator response.**
If any is ❌, diagnose and fix before proceeding.

### Step 8 — Push and report

```bash
git add src/geometry/geometry-lib.js src/viewer/geo-selector.js src/viewer/selection-mode.js src/viewer/viewer3d.js tests/e2e/geometry-selection.spec.js
git commit -m "fix(TICK-009): triangleToGroup buffer-position fix + pointer-event orbit guard + remove debug"
git push -u origin fix/tick-009h-hover-orbit-fix
```

Write the coordinator response to `docs/PM.md` `### Coordinator Response` block
only after all five manual browser tests pass.

---

## Acceptance criteria (this task)

- [ ] AC-T09h-1: Moving the mouse over a face in Select.Faces mode turns that face blue immediately. Moving to another face: first returns to teal, new turns blue. Confirmed visually in a running browser.
- [ ] AC-T09h-2: Clicking a face turns it green and the toolbar counter increments. Clicking the same face again deselects it and the counter decrements. Confirmed in browser.
- [ ] AC-T09h-3: Orbit-dragging the view does not change the face selection or the counter. Confirmed in browser by orbiting after selecting one face.
- [ ] AC-T09h-4: Clicking empty viewport space clears all selections and resets the counter to "0 faces selected". Confirmed in browser.
- [ ] AC-T09h-5: `window.__novaHoverDebug` is fully removed from production code (no references remain in selection-mode.js or geo-selector.js).
- [ ] AC-T09h-6: `npm run lint:all && npm run test && npm run build && npm run test:e2e` all pass with 0 errors.

## Merge checklist

- [ ] AC-T09h-1 verified: hover blue confirmed visually in browser
- [ ] AC-T09h-2 verified: click green + counter correct; deselect works
- [ ] AC-T09h-3 verified: orbit drag does not change selection
- [ ] AC-T09h-4 verified: empty space click clears selection
- [ ] AC-T09h-5: no `window.__novaHoverDebug` in committed code
- [ ] AC-T09h-6: lint + test + build + e2e all pass
- [ ] TICK-009.md updated with T09h notes
- [ ] agent-workboard.md row released after merge
