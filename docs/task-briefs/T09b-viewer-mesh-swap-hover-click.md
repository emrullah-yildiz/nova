---
id: T09b
ticket: TICK-009
title: Viewer mesh swap + per-face hover/click
lane: ui
agent: switch (ui-engineer)
branch: feat/tick-009-per-face-selection
status: queued
created: 2026-06-07
depends-on: T09a (toSelectionMesh must exist — but T09b can be drafted against the contract without T09a merged if dispatched in parallel; final integration requires T09a on the branch)
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Goal

Update `geo-selector.js` and `selection-mode.js` so that:

1. When selection mode activates in 'faces' mode, each Mesh3-based scene item's visual mesh is swapped out for a `toSelectionMesh()` multi-group mesh.
2. Mousemove in selection mode raycasts against selection meshes, resolves `triangleToGroup[faceIndex]`, and updates material colors (blue for hover, green for selected, teal for others).
3. Click in selection mode with a hit toggles the group in the selected set.
4. Click in selection mode with no hit calls `clearSelection()` and resets all materials.
5. On deactivate (Approve or Cancel): restore the original scene mesh, dispose selection mesh materials.

## AC coverage

- AC-1 (box visually decomposes into hoverable teal faces on mode activate)
- AC-2 (hover turns face blue; moving off reverts to teal)
- AC-3 (click turns face green; counter = "1 face selected")
- AC-4 (multi-select — two faces green, counter = "2 faces selected")
- AC-5 (re-click selected face deselects; counter decrements)
- AC-6 (click empty → clearSelection, all teal, counter 0)
- AC-8 (Cancel restores normal mesh)
- AC-9 (normal mesh pixel-identical after Select/Cancel cycle)

## Owned paths

```
src/viewer/geo-selector.js
src/viewer/selection-mode.js
```

## Do NOT touch

```
src/geometry/geometry-lib.js
src/nodes/categories/geometry.js
src/ui/node-renderer.js
src/main.js
src/core/node-library.js
tests/geometry-selection.test.js
tests/e2e/geometry-selection.spec.js
docs/agent-workboard.md
```

## Implementation spec

### selection-mode.js changes

The current `_state.items` stores full scene-item objects. For per-face selection, extend the stored item format to include `{ groupIndex, meshRef }`. The selection key must encode the face group: `itemId + ':group:' + groupIndex`.

Key changes:

1. Add `_state.hoveredGroup = null` (tracking the currently hovered `{ item, groupIndex, meshRef }` to reset on next hover).
2. Change `_updateToolbarCount()` to count unique group selections and display "N face(s) selected" (plural-aware: "1 face selected", "2 faces selected").
3. Export a new `getSelectedFaces()` function:

```js
export function getSelectedFaces() {
  // Returns array of { itemId, groupIndex, mesh3Ref }
  // where mesh3Ref is the Geo.Mesh3 object on the scene item (if available)
  return _state.items.map(it => ({
    itemId: it.id,
    groupIndex: it.groupIndex,
    faceGroups: it.faceGroups,   // the faceGroups array from toSelectionMesh result
    mesh3: it.mesh3,             // the original Geo.Mesh3 for getFaceVertices
  }));
}
```

4. Expose `window.__geoSelectorHoveredFaceGroup` for E2E: set it inside `selectionModeHover` when a group is resolved. Set to `null` when nothing is hovered.

5. Update `_applySelectionHighlight()` to work with the new per-group selection model: instead of per-triangle materials from `_ensureFaceMaterials`, use the `materials[]` array from the `toSelectionMesh` result (stored on the scene item). For each group: if its groupIndex is in the selected set → green; else → teal.

6. Update `_updateToolbarCount()`:
```js
function _updateToolbarCount() {
  const el = document.getElementById('sel-mode-count');
  const n = _state.items.length;
  if (el) el.textContent = n === 1 ? '1 face selected' : n + ' faces selected';
}
```

### geo-selector.js changes

The changes are concentrated in the selection-mode lifecycle. Locate the existing `activateSelectionMode` call path and the mousemove/click handlers.

#### On selection mode activate (when mode === 'faces')

After calling `activateSelectionMode(...)`, for each entry in `Viewer3D._sceneItems`:
```js
item.group.traverse(obj => {
  if (obj.userData && obj.userData.isMeshBody && obj.isMesh) {
    // This is a Geo.Mesh3-based body mesh
    const mesh3 = sceneItem._mesh3;  // see note below about how to get it
    if (!mesh3 || typeof mesh3.groupFaces !== 'function') return;
    const faceGroups = mesh3.groupFaces();
    const result = mesh3.toSelectionMesh(faceGroups);
    // Store original mesh reference for restoration
    sceneItem._selectionOriginalMesh = obj;
    sceneItem._selectionMeshResult = result;  // { mesh, materials, faceGroups, triangleToGroup }
    sceneItem._selectionFaceGroups = faceGroups;
    // Swap: remove obj from group, add result.mesh
    const parent = obj.parent;
    parent.remove(obj);
    parent.add(result.mesh);
    sceneItem._selectionSwappedMesh = result.mesh;
  }
});
```

Note on getting `mesh3` from a scene item: check how `Viewer3D._sceneItems` entries are populated. Look for where geometry scene items are registered — the `Geo.Mesh3` may be accessible via `item.group.userData.mesh3` or similar. If it is not already stored, store it when the scene item is created (in `buildSceneItem` or equivalent). A safe fallback: store a `_mesh3` reference on the `sceneItem` object when geometry renders.

#### Mousemove in selection mode (faces)

Replace the current `selectionModeHover` call path with group-aware hover:

```js
// After raycasting against the scene (existing raycaster logic):
if (isSelectionModeActive() && getSelectionMode() === 'faces') {
  const hit = intersects[0];
  // Reset previously hovered group
  if (Viewer3D._hoveredFaceGroup) {
    const { item, groupIndex } = Viewer3D._hoveredFaceGroup;
    const result = item._selectionMeshResult;
    if (result && result.materials[groupIndex]) {
      const isSelected = /* check if groupIndex is in selected set */;
      result.materials[groupIndex].color.set(isSelected ? 0xa6e3a1 : 0x94e2d5);
      result.materials[groupIndex].needsUpdate = true;
    }
    Viewer3D._hoveredFaceGroup = null;
    window.__geoSelectorHoveredFaceGroup = null;
  }

  if (hit && hit.object && hit.object.userData.isSelectionMesh) {
    const triIndex = Math.floor(hit.faceIndex);
    const sceneItem = /* find sceneItem whose _selectionSwappedMesh === hit.object */;
    if (sceneItem && sceneItem._selectionMeshResult) {
      const groupIndex = sceneItem._selectionMeshResult.triangleToGroup[triIndex];
      if (groupIndex !== undefined) {
        const isSelected = /* check if this group is selected */;
        if (!isSelected) {
          sceneItem._selectionMeshResult.materials[groupIndex].color.set(0x89b4fa);
          sceneItem._selectionMeshResult.materials[groupIndex].needsUpdate = true;
        }
        Viewer3D._hoveredFaceGroup = { item: sceneItem, groupIndex };
        window.__geoSelectorHoveredFaceGroup = { itemId: sceneItem.id, groupIndex };
      }
    }
  }
}
```

#### Click in selection mode (faces) — hit

```js
// On click with hit.object.userData.isSelectionMesh:
const triIndex = Math.floor(hit.faceIndex);
const sceneItem = /* find owner */;
const result = sceneItem._selectionMeshResult;
const groupIndex = result.triangleToGroup[triIndex];

// Check if this group is already selected
const selKey = sceneItem.id + ':group:' + groupIndex;
const existingIdx = _state.items.findIndex(it => it.selectionKey === selKey);
if (existingIdx >= 0) {
  // Deselect
  _state.items.splice(existingIdx, 1);
  result.materials[groupIndex].color.set(0x94e2d5);
} else {
  // Select
  _state.items.push({
    id: sceneItem.id,
    selectionKey: selKey,
    groupIndex,
    faceGroups: sceneItem._selectionFaceGroups,
    mesh3: sceneItem._mesh3,
  });
  result.materials[groupIndex].color.set(0xa6e3a1);
}
result.materials[groupIndex].needsUpdate = true;
_updateToolbarCount();
```

Note: call the selection-mode module's internal state update, or promote the logic to selection-mode.js. Whichever keeps the code clean — just keep geo-selector.js as the raycasting coordinator and selection-mode.js as the state store. Do not duplicate state.

#### Click in selection mode (faces) — no hit (empty space)

```js
// On click with no mesh hit:
clearSelection();
// Also reset all selection mesh materials to teal
Viewer3D._sceneItems.forEach(item => {
  if (item._selectionMeshResult) {
    item._selectionMeshResult.materials.forEach(mat => {
      mat.color.set(0x94e2d5);
      mat.needsUpdate = true;
    });
  }
});
```

#### On deactivate (Approve or Cancel)

In the `deactivateSelectionMode` path (or in the onApprove/onCancel wrappers in geo-selector.js), after the state is cleared:

```js
Viewer3D._sceneItems.forEach(item => {
  if (item._selectionOriginalMesh && item._selectionSwappedMesh) {
    const parent = item._selectionSwappedMesh.parent;
    if (parent) {
      parent.remove(item._selectionSwappedMesh);
      parent.add(item._selectionOriginalMesh);
    }
    // Dispose selection mesh resources
    if (item._selectionMeshResult) {
      item._selectionMeshResult.mesh.geometry.dispose();
      item._selectionMeshResult.materials.forEach(m => m.dispose());
    }
    delete item._selectionOriginalMesh;
    delete item._selectionSwappedMesh;
    delete item._selectionMeshResult;
    delete item._selectionFaceGroups;
    delete item._mesh3;  // only delete if we stored it here temporarily
  }
});
Viewer3D._hoveredFaceGroup = null;
window.__geoSelectorHoveredFaceGroup = null;
```

## Interface consumed by T09d

T09d (node-renderer.js) will call `getSelectedFaces()` from selection-mode.js on Approve:

```js
import { getSelectedFaces } from './selection-mode.js';
// ...
const faces = getSelectedFaces();
// faces: [{ itemId, groupIndex, faceGroups, mesh3 }, ...]
```

## Testing gate

- Manual browser: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-9
- E2E (via T09d spec): AC-2 (hovered face group), AC-3 (click green + counter), AC-5, AC-6
- Lint: `npm run lint:all` — 0 errors

## Merge checklist

- [ ] AC-1: On selection mode activate, box renders with teal face tint (visual — confirm via dev server)
- [ ] AC-2: Hover turns face blue, moving away resets to teal; `window.__geoSelectorHoveredFaceGroup` is non-null during hover
- [ ] AC-3: Click face → green + "1 face selected" in toolbar
- [ ] AC-4: Second click on different face → "2 faces selected" both green
- [ ] AC-5: Re-click selected face → deselected, counter decrements
- [ ] AC-6: Click empty → all teal, "0 faces selected"
- [ ] AC-8: Cancel → original mesh restored, no artifacts
- [ ] AC-9: After Select/Cancel cycle, mesh is visually identical to before
- [ ] `npm run lint:all` 0 errors
- [ ] `npm run test` all existing tests pass

## Notes

- The current `_ensureFaceMaterials` approach in selection-mode.js (per raw triangle) is superseded by the group-based approach from `toSelectionMesh()`. The old `_ensureFaceMaterials` function and `_setMeshFaceColor` helper may be removed if they are no longer used — or left in place if other parts of the code depend on them. Check before deleting.
- `window.__geoSelectorHoveredFaceGroup` must be set to `null` (not `undefined`) when nothing is hovered, for predictable E2E assertions.
- The mesh swap must NOT affect `THREE.LineSegments` (edge lines) — they stay in the group throughout selection mode. Only the body `THREE.Mesh` (marked `userData.isMeshBody = true`) is swapped.
- If `_mesh3` (the `Geo.Mesh3` object) is not currently stored on scene items, find where geometry is rendered (likely in viewer3d.js or geo-selector.js `addGeoItem`/`buildSceneItem`) and store a reference: `sceneItem._mesh3 = geoValue` (or whatever the Geo.Mesh3 instance is called there). This is the minimal touch needed to the render path — no new files required.
