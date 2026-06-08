---
id: T09i-diagnostic-hover-faces
parent: TICK-009
title: Diagnose and fix hover highlight + face decomposition bugs using browser logs
lane: ui (switch)
branch: fix/tick-009h-hover-orbit-fix
status: ready
created: 2026-06-08
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Context

The PM reports two bugs are STILL reproducible after the T09h fixes were applied:

1. **Hovering on the mesh surface does not highlight the mesh surface.**
2. **The Select.Faces node does not show mesh surfaces separately (faces not decomposed).**

The PM explicitly says: **"Use logs to detect the problem instead of guessing."**

This task is a live-diagnostic and fix. You must:
1. Add targeted `console.log` / `console.warn` statements at every decision point in the face-swap and hover paths.
2. Run `npm run dev`, open a browser, reproduce the bugs, read the console output.
3. Diagnose the root cause from what the logs show — not from assumptions.
4. Fix the code based on what the logs reveal.
5. Remove diagnostic logs (or convert key ones to `console.debug`) before committing.
6. Re-run browser to confirm both bugs are visually resolved.

---

## Known state of the code (as of 2026-06-08)

Branch `fix/tick-009h-hover-orbit-fix` contains:
- `triangleToGroup` parallel-push fix (correct — maps buffer position → group index)
- `transparent: true, opacity: 0.85` on MeshBasicMaterial in `toSelectionMesh()`
- pointer-event guard (pointerdown/pointermove/pointerup) for orbit drag

Despite these fixes, the PM still sees the bugs. The automated tests pass (32/32 E2E, 1914 unit tests) but the bugs are visible in the running browser.

---

## Diagnostic instrumentation required

Add logs at these exact points. Read and interpret each log output before proceeding to the fix.

### Point 1 — _swapToFaceMeshes entry (selection-mode.js)

At the start of `_swapToFaceMeshes()`:

```js
console.log('[Nova diag] _swapToFaceMeshes called. sceneItems count:', viewer._sceneItems && viewer._sceneItems.length);
viewer._sceneItems.forEach(function(item) {
  console.log('[Nova diag] item', item.id, 'has _mesh3?', !!item._mesh3, 'has groupFaces?', !!(item._mesh3 && typeof item._mesh3.groupFaces === 'function'));
});
```

**If output shows 0 items or no _mesh3:** the scene was rebuilt AFTER activateSelectionMode or the _mesh3 was never stored on the item. Check `addTaggedGeo` Mesh3 detection logic.

**If output shows items but groupFaces is false:** `_Mesh3.groupFaces` is not accessible from the item. Check that `item._mesh3` is the actual `_Mesh3` instance and not a plain object.

### Point 2 — bodyMesh search result (selection-mode.js)

Inside the `_swapToFaceMeshes` forEach loop, after the `traverse` block:

```js
console.log('[Nova diag] item', item.id, 'bodyMesh found?', !!bodyMesh, bodyMesh ? bodyMesh.uuid : 'none');
if (!bodyMesh) {
  // Log what IS in the group to understand the structure
  item.group.traverse(function(obj) {
    console.log('[Nova diag] group child:', obj.type, 'isMesh?', obj.isMesh, 'userData:', JSON.stringify(obj.userData));
  });
}
```

**If bodyMesh is null:** The body mesh does not have `userData.isMeshBody = true`. Either the mesh is created via a path that doesn't set it, or the structure is nested differently (e.g., the tagged group contains a sub-group from `toMesh()` which contains the body mesh — traverse should reach it, but log to confirm).

### Point 3 — toSelectionMesh result (selection-mode.js)

After `const result = mesh3.toSelectionMesh(faceGroups)`:

```js
console.log('[Nova diag] toSelectionMesh result:', result ? 'ok' : 'null/undefined',
  'mesh?', !!(result && result.mesh),
  'materials count?', result && result.materials && result.materials.length,
  'faceGroups count?', result && result.faceGroups && result.faceGroups.length,
  'triangleToGroup length?', result && result.triangleToGroup && result.triangleToGroup.length);
if (result && result.mesh) {
  console.log('[Nova diag] selection mesh geometry groups:', result.mesh.geometry.groups.length,
    'isSelectionMesh?', result.mesh.userData.isSelectionMesh);
}
```

**If faceGroups count is 0 or 1:** groupFaces() is not detecting multiple coplanar face groups correctly. The box should have 6 groups.

**If triangleToGroup length is wrong:** The parallel-push fix may not have been applied to the branch (verify by counting).

### Point 4 — Swap success (selection-mode.js)

After `parent.remove(bodyMesh)` and `parent.add(result.mesh)`:

```js
console.log('[Nova diag] mesh swapped. Parent children count:', parent.children.length,
  'Original mesh removed?', !parent.children.includes(bodyMesh),
  'Selection mesh added?', parent.children.includes(result.mesh));
```

**If original mesh is still in parent:** The remove call failed or the wrong parent was used.

### Point 5 — anySelMesh check (geo-selector.js)

At the top of the `pointermove` handler, inside the `if (isSelectionModeActive())` block:

```js
var anySelMesh = self._sceneItems && self._sceneItems.some(function(it) { return !!it._selectionSwappedMesh; });
console.log('[Nova diag] hover: isSelectionModeActive?', isSelectionModeActive(), 'anySelMesh?', anySelMesh,
  'sceneItems count:', self._sceneItems && self._sceneItems.length);
```

**If anySelMesh is false:** The swap did not complete — `_selectionSwappedMesh` was never set on any item. This points to a bug in the swap path (Points 1–4 above).

### Point 6 — Raycast result (geo-selector.js)

After `var intersects = self._raycaster.intersectObjects(candidateMeshes, false)`:

```js
console.log('[Nova diag] hover raycast: candidateMeshes count:', candidateMeshes.length,
  'intersects count:', intersects.length,
  'hit?', intersects.length > 0 ? intersects[0].object.userData : 'none');
```

**If candidateMeshes is 0:** The traverseVisible loop found no isSelectionMesh objects. Either the mesh was not added to the scene (swap failed) or isSelectionMesh flag is missing.

**If intersects is 0 but candidateMeshes > 0:** The cursor is not over the mesh, or the geometry is wrong.

### Point 7 — selectionMeshHover entry (selection-mode.js)

At the start of `selectionMeshHover`:

```js
console.log('[Nova diag] selectionMeshHover called. hit:', hit ? 'yes' : 'null', 'sceneItem:', sceneItem ? sceneItem.id : 'null');
if (hit && sceneItem) {
  console.log('[Nova diag] hit.faceIndex:', hit.faceIndex,
    'triangleToGroup length:', sceneItem._selectionMeshResult && sceneItem._selectionMeshResult.triangleToGroup && sceneItem._selectionMeshResult.triangleToGroup.length,
    'groupIndex:', sceneItem._selectionMeshResult && sceneItem._selectionMeshResult.triangleToGroup && sceneItem._selectionMeshResult.triangleToGroup[Math.floor(hit.faceIndex || 0)]);
}
```

**If groupIndex is undefined:** triangleToGroup is wrong (length mismatch or index out of bounds).

---

## Procedure

### Step 1 — Ensure you are on the correct branch

```powershell
git status
# Must be on: fix/tick-009h-hover-orbit-fix
```

Do NOT create a new branch. Continue on `fix/tick-009h-hover-orbit-fix`.

### Step 2 — Add diagnostic logs

Add all 7 diagnostic log blocks listed above. Keep them clearly marked with `[Nova diag]` prefix so they are easy to find and remove later.

### Step 3 — Run browser and reproduce bugs

```powershell
npm run dev
```

Open `http://localhost:5173`. Open the browser developer console (F12).

1. Create a `Box.ByCenterWidthDepthHeight` node.
2. Run the graph — box should appear in 3D view.
3. Add a `Select.Faces` node.
4. Click the **Select** button on `Select.Faces`.
5. Observe the console. Read all `[Nova diag]` lines.
6. Move the mouse over the box mesh. Observe console.

Record what each log shows. This is the most important step — do not skip it.

### Step 4 — Diagnose from logs

Based on the logs:
- Identify the first log that shows an unexpected value (null, 0, undefined, false where true is expected).
- That is the root cause location.
- Read the surrounding code carefully. Do not guess — the log tells you exactly where the failure is.

### Step 5 — Fix

Apply the minimum change needed to fix the root cause identified in Step 4. Common fixes:

**If `_mesh3` is not on scene items** → Fix `addTaggedGeo` in `geo-selector.js` to correctly detect and store the Mesh3 instance.

**If `bodyMesh` is null** → The body mesh may be nested inside a sub-group from `toMesh()`. The `traverse` call should reach it, but if not, check whether `group.children[0]` is another Group. If the structure is `taggedGroup → toMesh()-Group → bodyMesh`, then `traverse` should still find it since it is recursive. Alternatively, add a second traverse that does NOT check `isMeshBody` to log all children and understand the actual structure.

**If `faceGroups` count is wrong** → Fix `groupFaces()` normal-tolerance or coplanarity check.

**If `triangleToGroup` is wrong** → The parallel-push fix was not committed to this branch, or a merge introduced the old code. Re-apply the fix.

**If `anySelMesh` is false but swap appeared to work** → `_selectionSwappedMesh` is set on a different object than what `_sceneItems` references. Verify the same item object is being mutated.

**If candidateMeshes is 0 but anySelMesh is true** → The selection mesh is not visible, or `traverseVisible` is skipping it because a parent group is invisible.

### Step 6 — Remove diagnostic logs

After confirming the fix works in the browser, remove all `[Nova diag]` log blocks. Keep any existing `console.warn` statements that are part of the normal error handling (e.g., the `_swapToFaceMeshes: skipping item` warning).

### Step 7 — Run automated gates

```powershell
npm run lint:all
npm run test
npm run build
npm run test:e2e
```

All must pass with 0 errors.

### Step 8 — Manual browser verification (MANDATORY)

In the running browser, confirm ALL of the following:

1. **Face decomposition visible:** After clicking Select on Select.Faces, the box shows as semi-transparent teal faces (NOT a solid opaque grey box). Each face is visually distinct.
2. **Hover highlight:** Moving the mouse over a face turns it blue immediately. Moving to another face: first returns to teal, new turns blue.
3. **Click to select:** Clicking a face turns it green, toolbar shows "1 face selected".
4. **Deselect:** Clicking the green face again returns it to teal, counter decrements.
5. **Empty space clear:** Clicking empty viewport space resets counter to "0 faces selected".
6. **Orbit guard:** Orbit-dragging does not change selection.

All six must pass before committing.

### Step 9 — Commit and report

Stage only the files you changed:

```powershell
git add <files you changed>
git commit -m "fix(TICK-009): diagnostic logs reveal <root-cause> — fixed <what was fixed>"
git push
```

Then write your structured JSON output (RULES.md §10).

---

## Owned paths

```
src/geometry/geometry-lib.js          — groupFaces / toSelectionMesh if diagnosis points here
src/viewer/geo-selector.js            — addTaggedGeo / hover path if diagnosis points here
src/viewer/selection-mode.js          — _swapToFaceMeshes / selectionMeshHover if diagnosis points here
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

## Acceptance criteria (this task)

- [ ] AC-T09i-1: Diagnostic logs are added and read in a running browser. Root cause is identified from log output (not guessed). Log output is included in the agent's structured JSON `issue` field.
- [ ] AC-T09i-2: After the fix, clicking Select on Select.Faces shows the box as semi-transparent teal faces — mesh surfaces ARE shown separately. Confirmed visually in browser.
- [ ] AC-T09i-3: Moving the mouse over a face turns it blue. Confirmed visually in browser.
- [ ] AC-T09i-4: Clicking a face turns it green, counter increments. Clicking again deselects. Confirmed in browser.
- [ ] AC-T09i-5: Diagnostic `[Nova diag]` logs are removed from committed code.
- [ ] AC-T09i-6: `npm run lint:all && npm run test && npm run build && npm run test:e2e` all pass with 0 errors.

## Merge checklist

- [ ] AC-T09i-1: Root cause identified from logs, stated in JSON `issue` field
- [ ] AC-T09i-2: Face decomposition confirmed visually (teal semi-transparent faces)
- [ ] AC-T09i-3: Hover blue confirmed visually
- [ ] AC-T09i-4: Click/deselect confirmed visually
- [ ] AC-T09i-5: No `[Nova diag]` logs in committed code
- [ ] AC-T09i-6: All automated gates pass
- [ ] TICK-009.md `## Run comments` updated with findings
- [ ] agent-workboard.md row released after merge
