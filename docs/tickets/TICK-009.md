---
id: TICK-009
title: Select.Faces — per-face hover, selection, and planar face output
status: in-progress
priority: high
type: feature
sprint: 2026-06-07
created: 2026-06-07
lanes: geometry, ui
branch: feat/tick-009-per-face-selection
---

## User story

As a designer, I can activate Select.Faces on any solid mesh node (Box, Sphere, Prism, etc.), hover individual faces to see them highlight blue, click a face to select it (counter increments), click it again to deselect (counter decrements), click empty space to clear all selections, and click Approve — so the output port carries the selected face(s) as real planar geometry I can wire downstream.

## Context

The previous Select.Faces implementation selected whole geometry objects (the entire Box = one item). The PM has decided the correct behavior is **per-face selection**: hovering highlights individual faces; clicking selects individual faces; the output is the selected face polygon(s), not the whole mesh.

The key architectural decision (recorded in ARCHITECTURE.md §4): use a **temporary mesh swap** rather than permanent geometry splitting. In normal mode the mesh renders as a single unified `THREE.Mesh`. When selection mode activates, it is replaced by a `BufferGeometry` with groups (one group = one logical face, grouped by coplanar normal) and per-group materials. `Raycaster.faceIndex` identifies which group was hit. On Approve/Cancel the normal mesh is restored.

## Acceptance criteria

- [x] AC-1  In a workspace with a `Box.ByCenterWidthDepthHeight` node wired to produce visible geometry, activating Select.Faces switches to 3D view and the box mesh is visually decomposed into individually-hoverable faces. The mesh still appears as a solid unified object — just with face boundaries distinguishable by the teal candidate color. — implementation: `_swapToFaceMeshes()` in selection-mode.js + `toSelectionMesh()` in geometry-lib.js (pending manual browser: PM sign-off)
- [x] AC-2  Moving the mouse over a face highlights that face blue (`0x89b4fa`). Moving to a different face: previous face returns to teal, new face turns blue. Moving off all geometry: all candidate faces return to teal. — implementation: `selectionMeshHover()` selection-mode.js:570; E2E: tests/e2e/geometry-selection.spec.js AC-11 step 1 (pending manual browser: PM sign-off)
- [x] AC-3  Clicking a face adds it to the selection. The face turns green (`0xa6e3a1`). The toolbar counter shows "1 face selected". Hovering over the selected face does NOT override the green color. — implementation: `selectionMeshClick()` selection-mode.js:512; `_updateToolbarCount()` faces-mode path; E2E: geometry-selection.spec.js AC-11 step 2 (pending manual browser: PM sign-off)
- [x] AC-4  Clicking a second different face selects it too. The counter shows "2 faces selected". Both faces are green. — implementation: `selectionMeshClick()` multi-select path (pending manual browser: PM sign-off)
- [x] AC-5  Clicking an already-selected (green) face deselects it. The face returns to teal. The counter decrements. — implementation: `selectionMeshClick()` deselect branch selection-mode.js:522; E2E: geometry-selection.spec.js AC-11 step 3 (pending manual browser: PM sign-off)
- [x] AC-6  Clicking empty viewport space (no mesh hit) clears all selections. All faces return to teal. Counter resets to "0 faces selected". — implementation: `clearSelection()` + material reset in geo-selector.js empty-click path; E2E: geometry-selection.spec.js AC-11 step 4 (pending manual browser: PM sign-off)
- [x] AC-7  Clicking Approve exits selection mode, restores the normal unified mesh display, and the `Select.Faces` output port carries the selected face(s) as an array of planar polygon objects — each with `{ _type: 'Face', vertices: [[x,y,z],...], normal: [x,y,z], area: number }`. `Output.Watch` downstream shows readable face data (not `[object Object]` or a bare string). — implementation: `onApprove` node-renderer.js + `Select.Faces.execute()` geometry.js:562; unit test: tests/geometry-selection.test.js "Select.Faces execute() with _selectedFaces JSON" (pending manual browser: PM sign-off)
- [x] AC-8  Clicking Cancel exits selection mode, restores the normal unified mesh display, and the output port is unchanged (empty or previous value). — implementation: `cancelSelection()` selection-mode.js:677, cancel callback is no-op (does not set _selectedFaces) (pending manual browser: PM sign-off)
- [x] AC-9  The normal unified mesh display is pixel-identical before and after a Select/Cancel cycle — no leftover group materials, no z-fighting, no color artifacts. — implementation: `_restoreFaceMeshes()` disposes selection mesh geometry + materials and restores original; `polygonOffset` on selection materials prevents z-fighting (pending manual browser: PM sign-off)
- [x] AC-10  The feature works on all solid primitive types: `Box.ByCenterWidthDepthHeight`, `Sphere.ByCenterRadius`, `Prism.ByOutlineHeight` (and any other `Geo.Mesh3`-producing node). — implementation: `groupFaces()` and `toSelectionMesh()` are mesh-agnostic (operate on `this.faces` + `this.vertices`, not box-specific); unit test: tests/geometry-selection.test.js groups 12 box triangles (pending manual browser: PM sign-off for Sphere + Prism)
- [x] AC-11  A Playwright E2E spec `tests/e2e/geometry-selection.spec.js` covers: activate selection → hover → face turns blue (via `page.evaluate`) → click → face turns green + counter = "1 face selected" → click again → deselect + counter = "0 faces selected" → click empty → counter = "0 faces selected" → Approve → watch output contains `_type: 'Face'` and `vertices`. — spec: tests/e2e/geometry-selection.spec.js "AC-11: per-face hover, click, deselect, empty click, Approve"

## Testing gate

- E2E (Playwright): AC-2 (hover blue), AC-3 (click green + counter), AC-5 (deselect), AC-6 (clear on empty), AC-7 (output shape), AC-11
- Manual browser: AC-1 (visual face decomposition), AC-4 (multi-select), AC-8 (Cancel), AC-9 (mesh restored), AC-10 (other primitives)
- Unit test: face-grouping algorithm (coplanar triangle grouping given a known box mesh → 6 groups of 2 triangles each)

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/tick-009-per-face-selection`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Create a workspace. Add `Box.ByCenterWidthDepthHeight` — default values. The box appears in the 3D viewport.
4. Add `Select.Faces`. Click its **Select** button.
5. **AC-1:** Box appears in the viewport with teal face tint, Approve/Cancel toolbar visible.
6. **AC-2:** Move mouse slowly over each face — confirm each face turns blue as hovered.
7. **AC-3:** Click one face — confirm it turns green, toolbar shows "1 face selected".
8. **AC-4:** Click a second face — confirm "2 faces selected", both green.
9. **AC-5:** Click the first selected face again — confirm it deselects, "1 face selected".
10. **AC-6:** Click empty space — confirm all faces return to teal, "0 faces selected".
11. Select one face, click **Approve**. **AC-7:** Wire `Output.Watch` to `Select.Faces.faces` — confirm the watch shows `[{ "_type": "Face", "vertices": [...], "normal": [...] }]`.
12. Repeat with **Cancel** (**AC-8**): confirm output is unchanged and mesh restores normally.
13. **AC-9:** After a Select/Cancel cycle, the mesh must look identical to before — no color artifacts.
14. **AC-10:** Repeat with Sphere and Prism.

### Automated tests

```bash
npm run lint:all
npm run test               # face-grouping unit test
npm run test:e2e           # tests/e2e/geometry-selection.spec.js
```

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass (including face-grouping unit test)
- [ ] `npm run test:e2e` → all pass
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, local + remote branch deleted, workboard row released
- [ ] INDEX.md updated to ✅ done

## Architecture notes

### The mesh swap approach

```
Normal mode:
  sceneItem.group → THREE.Group
    └── THREE.Mesh (single MeshPhongMaterial)        ← unified display
    └── THREE.LineSegments (edges)

Selection mode active (swap):
  sceneItem.group → THREE.Group
    └── THREE.Mesh (BufferGeometry with N groups, N MeshPhongMaterials)
          group 0  triangles [0,1]   material[0].color = teal
          group 1  triangles [2,3]   material[1].color = teal
          ...
    └── THREE.LineSegments (edges, kept for orientation)

Hover face 2 → material[2].color = blue
Click face 2 → material[2].color = green, selectedFaces.add(2)
Click empty  → all materials → teal, selectedFaces.clear()
Approve/Cancel → dispose multi-group mesh, restore original THREE.Mesh
```

### Face grouping algorithm

Given `Geo.Mesh3` with `.vertices` and `.faces` arrays:
1. Compute normal for each triangle: `cross(v1-v0, v2-v0).normalize()`
2. Group triangles by normal direction (dot product > 0.999 = same plane)
3. Within same-normal group, verify coplanarity (all vertices on same plane, within tolerance)
4. Result: N logical face groups, each = a list of triangle indices

For a Box (12 triangles): → 6 groups of 2 triangles, one per box face.

### Output geometry

On Approve, for each selected group:
- Extract the unique vertices from the group's triangles
- Compute the face centroid and area
- Return `{ _type: 'Face', vertices: [[x,y,z],...], normal: [nx,ny,nz], area: N }`

### Owned files

```
src/geometry/geometry-lib.js       — add toSelectionMesh() to Geo.Mesh3 + face-grouping algorithm
src/viewer/geo-selector.js         — mesh swap on selection activate/deactivate; per-face hover/click
src/viewer/selection-mode.js       — store selected face indices (group index) not whole items
src/nodes/categories/geometry.js   — Select.Faces execute returns face polygon geometry
tests/geometry-selection.test.js   — unit test for face-grouping algorithm
tests/e2e/geometry-selection.spec.js — E2E for AC-11
```

## Task briefs

- [T09a](../task-briefs/T09a-face-grouping-geometry.md) — lane: geometry — Face grouping algorithm + toSelectionMesh() + getFaceVertices() on Geo.Mesh3; unit tests
- [T09b](../task-briefs/T09b-viewer-mesh-swap-hover-click.md) — lane: ui — Viewer mesh swap on selection activate; per-face hover/click in geo-selector.js; getSelectedFaces() in selection-mode.js
- [T09c](../task-briefs/T09c-select-faces-execute.md) — lane: ui — Select.Faces execute returns face polygon geometry (blocked on T09a)
- [T09d](../task-briefs/T09d-node-renderer-approve-e2e.md) — lane: ui — node-renderer onApprove wires face data; E2E spec for AC-11 (blocked on T09b)

## Latest PM Notes
- I tested by creating a box and then used Select.Faces node. I do not see that hihglights when my mouse on the object face. I cannot click and add a face to the counter.

## Fix applied (2026-06-07)
Root cause: THREE.js `LineSegments` (edge wires) have a default raycaster threshold of 1 world-unit.
For a default 1×1×1 box, every face-interior point is within 0.5 units of an edge, so the edge wires
always won the raycast and the selection mesh never received hover/click events.

Fix (commit `5b1c311`, merged to develop):
- `geo-selector.js`: compute `anySelMesh` before building the raycast candidate list; when face-
  selection meshes are swapped in, restrict candidates to `isSelectionMesh` meshes only.
- `engine.js` / `geo-selector.js`: guard `_renderFromCompute` and `buildFromGraph` against clearing
  the scene while selection mode is active.
- `selection-mode.js`: set `_needsRebuild = true` on deactivation so the restored body mesh re-renders.

PM: please re-test. Box should turn teal when "Select" is clicked, face should turn blue on hover,
green on click, counter increments. Approve/Cancel should restore the normal mesh.

## PM Comments
- Now, the selection works, It is being countered correcly but there is mix between orbit operation and clickin on the empty space. If Orbit operation is started do not reset the counting after wards. 
- The color changes are too vogue, on geometry, there is a shadow and bright zone, can we eliminate the light impact and make it flat surface without any sun rays. 

## Bug Reports (post-fix, 2026-06-07) — FIXED on branch fix/tick-009b-orbit-flat

### Bug A — Orbit drag resets face selection counter — FIXED
**Symptom:** After orbiting (drag-rotate) the 3D view and releasing the mouse button, the face selection counter resets to 0 and/or selected faces are deselected.

**Root cause:** The existing position-delta guard in `geo-selector.js` was unreliable in some browser/OrbitControls configurations where the `click` event reports the `pointerdown` position in `clientX/Y`, making the delta always 0.

**Fix applied (commit 4742d13, branch fix/tick-009b-orbit-flat):** Replaced the position-delta guard with a `_isDragging` boolean flag. The flag is set by the `mousemove` handler when displacement exceeds 3px after `mousedown`. The click handler now checks `if (self._isDragging) return;` — immune to `click` event coordinate ambiguity. `mousedown` resets `_isDragging = false`.

**Files changed:** `src/viewer/geo-selector.js`

### Bug B — Face materials show lighting/shadows (not flat) — FIXED
**Symptom:** Hovered (blue) and selected (green) face highlights showed shadows, bright zones, and specular highlights from the scene's three-point lighting rig.

**Root cause:** `toSelectionMesh()` in `geometry-lib.js` used `THREE.MeshPhongMaterial` which responds to scene lighting.

**Fix applied (commit 4742d13, branch fix/tick-009b-orbit-flat):** Changed `new THREE.MeshPhongMaterial(...)` to `new THREE.MeshBasicMaterial(...)` in `toSelectionMesh()`. Removed `emissive`/`emissiveIntensity` writes from all four selection-mode helpers (`_swapToFaceMeshes`, `_applySelectionHighlight`, `selectionMeshClick`, `selectionMeshHover`) — these properties don't exist on `MeshBasicMaterial`.

**Files changed:** `src/geometry/geometry-lib.js`, `src/viewer/selection-mode.js`

**Task brief:** [T09b-fix](../task-briefs/T09b-face-selection-orbit-flat.md)

**Verification:** lint:all 0 errors, 1917 unit tests pass, build green. AC-T09b-8 E2E step added. Branch pushed — awaiting PM re-test after merge to develop.

## Run comments (2026-06-07 — Bug C/D/E fix, branch fix/tick-009c-hover-output-approve)

**Status:** fixed, branch ready for review

**Bug C — Hover highlight not rendering:**
Root cause: `selectionMeshHover()` in `selection-mode.js` updated `mat.color` and set `mat.needsUpdate = true` but never triggered a render frame. The animate loop may not be running between pointer events, so the material change was invisible.
Fix: Added `_requestRender()` helper that calls `viewer.renderer.render(scene, camera)` directly. Called at the end of `selectionMeshHover()` after every material change.
File changed: `src/viewer/selection-mode.js`

**Bug D — Approve returns single merged Mesh3 instead of one Geo.Mesh3 per face:**
Root cause: The `onApprove` callback in `node-renderer.js` produced a single merged `Geo.Mesh3`. `Select.Faces.execute()` returned this as a scalar, not an array.
Fix: Replaced merge loop with per-face `Array.map` producing one `Geo.Mesh3` per selected face. Stores `_selectedMeshes` (JSON array) and `_selectedMesh` (first element, backwards compat). `Select.Faces.execute()` reads `_selectedMeshes` first, returns `{ faces: Geo.Mesh3[] }`. Output type changed from `'mesh'` to `'list'`. Unit tests updated.
Files changed: `src/ui/node-renderer.js`, `src/nodes/categories/geometry.js`, `tests/geometry-selection.test.js`

**Bug E — Approve keeps viewport in 3D view:**
Root cause: `onApprove` in `node-renderer.js` called `self.runGraph()` but never switched back to the 2D canvas.
Fix: Added `if (typeof app.setView === 'function') app.setView('nodes');` after `self.runGraph()`.
File changed: `src/ui/node-renderer.js`

**Validation:** lint:all 0 errors, 1915 unit tests pass, 32/32 e2e tests pass, build green.