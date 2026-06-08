---
id: TICK-009
title: Select.Faces — per-face hover, selection, and planar face output
status: done
priority: high
type: feature
sprint: 2026-06-07
created: 2026-06-07
lanes: geometry, ui
branch: merged to develop
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
- [x] AC-7  Clicking Approve exits selection mode, restores the normal unified mesh display, and the `Select.Faces` output port carries the selected face(s) as separate `Mesh3` surface patches. `Output.Watch` downstream shows readable mesh data (not `[object Object]` or a bare string). — implementation: `onApprove` node-renderer.js + `Select.Faces.execute()` geometry.js; unit test: tests/geometry-selection.test.js "Select.Faces returns Mesh3 patches from _selectedFaces JSON"
- [x] AC-8  Clicking Cancel exits selection mode, restores the normal unified mesh display, and the output port is unchanged (empty or previous value). — implementation: `cancelSelection()` selection-mode.js:677, cancel callback is no-op (does not set _selectedFaces) (pending manual browser: PM sign-off)
- [x] AC-9  The normal unified mesh display is pixel-identical before and after a Select/Cancel cycle — no leftover group materials, no z-fighting, no color artifacts. — implementation: `_restoreFaceMeshes()` disposes selection mesh geometry + materials and restores original; `polygonOffset` on selection materials prevents z-fighting (pending manual browser: PM sign-off)
- [x] AC-10  The feature works on all solid primitive types: `Box.ByCenterWidthDepthHeight`, `Sphere.ByCenterRadius`, `Prism.ByOutlineHeight` (and any other `Geo.Mesh3`-producing node). — implementation: `groupFaces()` and `toSelectionMesh()` are mesh-agnostic (operate on `this.faces` + `this.vertices`, not box-specific); unit test: tests/geometry-selection.test.js groups 12 box triangles (pending manual browser: PM sign-off for Sphere + Prism)
- [x] AC-11  A Playwright E2E spec `tests/e2e/geometry-selection.spec.js` covers: activate selection → hover → face turns blue (via `page.evaluate`) → click → face turns green + counter = "1 face selected" → click again → deselect + counter = "0 faces selected" → click empty → counter = "0 faces selected" → Approve → watch output contains `Mesh3` surface patch data. — spec: tests/e2e/geometry-selection.spec.js "AC-11: per-face hover, click, deselect, empty click, Approve"

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
11. Select one face, click **Approve**. **AC-7:** Wire `Output.Watch` to `Select.Faces.faces` — confirm the watch shows a `Mesh3` surface patch that can feed mesh-input nodes such as `Surface.Isolines`.
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

- [x] All AC above are checked `[x]`
- [x] `npm run lint:all` / pre-commit lint passed on changed files
- [x] `npm run test` focused gates pass, including face-grouping and Mesh3 output compatibility
- [x] `npm run test:e2e` focused geometry-selection spec passes
- [x] PM has reviewed and issued APPROVE verdict
- [x] Merged to `develop`, local task branches deleted
- [x] INDEX.md updated to done

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
- Build a standalone `Mesh3` surface patch for the selected face group
- Preserve legacy `_selectedFaces` descriptor compatibility by converting descriptors to `Mesh3` patches

### Owned files

```
src/geometry/geometry-lib.js       — add toSelectionMesh() to Geo.Mesh3 + face-grouping algorithm
src/viewer/geo-selector.js         — mesh swap on selection activate/deactivate; per-face hover/click
src/viewer/selection-mode.js       — store selected face indices (group index) not whole items
src/nodes/categories/geometry.js   — Select.Faces execute returns Mesh3 surface patches
tests/geometry-selection.test.js   — unit test for face-grouping algorithm
tests/e2e/geometry-selection.spec.js — E2E for AC-11
```

## Task briefs

Task briefs T09a/T09b/T09c/T09d/T09g/T09h/T09i were deleted on closeout after TICK-009 moved to `docs/tickets/done/`.

## Final closeout (2026-06-08)

Status: done — PM approved.

Final shipped behavior:
- Select.Faces hover uses per-face material color updates: blue on hover, green on selected faces.
- Select.Faces output is a list of separate `Mesh3` surface patches, not `_type: 'Face'` descriptors.
- Legacy `_selectedFaces` descriptors are converted to `Mesh3` patches for saved/older workspace compatibility.
- The output can feed mesh-input nodes such as `Surface.Isolines`.

Final merge commits:
- `e1b1798` — Merge Select.Faces mesh surface fix
- `c462f31` — Merge legacy Select.Faces compatibility fix

Final verification:
- `npm test -- --run tests/geometry-selection.test.js tests/node-contracts.test.js tests/format-value.test.js`
- `npx playwright test tests/e2e/geometry-selection.spec.js`

## Run comments

Morpheus run 2026-06-08:

- Status: archived cleanup complete.
- Released the stale TICK-009 active workboard claim.
- Deleted T09 task briefs after the ticket moved to `docs/tickets/done/`.
- Preserved final closeout above as the source of shipped behavior and verification.
