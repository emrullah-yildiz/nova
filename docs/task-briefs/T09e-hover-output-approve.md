---
id: T09e-hover-output-approve
parent: TICK-009
title: Fix hover highlight, per-face mesh output, and approve-to-2D-view
lane: ui (switch)
branch: fix/tick-009c-hover-output-approve
---

## Context

Three PM-reported issues after testing TICK-009 on develop:

### Bug C — Hover does not highlight faces

The PM reports that hovering over a face in Select.Faces mode does not turn the face blue. This may be a regression from the orbit/raycaster fix, or the fix didn't reach all hover paths.
Files to investigate: `src/viewer/geo-selector.js` (selectionMeshHover / mousemove handler), `src/viewer/selection-mode.js`.

### Bug D — Approve returns single mesh; must return one Geo.Mesh3 per selected face

Current: `Select.Faces.execute()` returns Face descriptor objects `{ _type: 'Face', vertices, normal, area }`.
Required: Output must be an array of `Geo.Mesh3` objects — one per selected face — so downstream nodes (and future Select.Faces/Edges passes) can consume them as real geometry.
The product constraint states: "Nodes return meshes whose surface/edges can be picked by Select.Faces and Select.Edges nodes."
Files to change: `src/nodes/categories/geometry.js` (Select.Faces execute), `src/geometry/geometry-lib.js` (getFaceVertices / toGeoMesh3 helper needed), `tests/geometry-selection.test.js`, `tests/e2e/geometry-selection.spec.js`.

### Bug E — Approve does not return to 2D node view

Current: After clicking Approve, the viewport stays in 3D view.
Required: Approve should exit selection mode AND switch the viewport back to the 2D node editor canvas.
Files to change: `src/viewer/selection-mode.js` (onApprove callback) or `src/ui/node-renderer.js` (approveSelection handler) — wherever the 3D→2D view switch is triggered.

## Owned paths

```
src/viewer/geo-selector.js
src/viewer/selection-mode.js
src/nodes/categories/geometry.js
src/geometry/geometry-lib.js
tests/geometry-selection.test.js
tests/e2e/geometry-selection.spec.js
src/ui/node-renderer.js
```

## Do NOT touch

```
src/core/node-library.js
src/app/app.js
src/main.js
worker/**
api/**
docs/tickets/INDEX.md  (morpheus owns this)
```

## Acceptance criteria

- [ ] Bug-C: Hovering over any face in Select.Faces mode turns that face blue. Moving to another face: previous returns to teal, new turns blue.
- [ ] Bug-D: After Approve with N faces selected, the Select.Faces output port carries N `Geo.Mesh3` objects (one per face). Output.Watch shows each as a readable mesh object. A single-face selection yields a 1-item array; two-face selection yields a 2-item array.
- [ ] Bug-E: Clicking Approve exits selection mode and the UI returns to the 2D node editor view (canvas, not 3D viewport).

## Testing gate

- E2E (Playwright): Bug-C (hover color), Bug-D (output count + type), Bug-E (view switches to 2D after approve)
- Unit test: `tests/geometry-selection.test.js` — update assertions from `_type: 'Face'` to `Geo.Mesh3` output shape

## Instructions

1. Branch from develop:
   ```powershell
   git switch develop
   git pull --ff-only
   git switch -c fix/tick-009c-hover-output-approve
   ```

2. **Bug C — Investigate hover path:**
   - Open `src/viewer/geo-selector.js`. Find the `mousemove` handler.
   - Confirm it calls `selectionMeshHover()` when selection meshes are active.
   - The `_isDragging` guard from Bug A fix must NOT suppress mousemove hover (only click). Verify the guard is on the click path only.
   - Confirm `renderer.render()` or equivalent is called after material color change so the scene re-draws.

3. **Bug D — Per-face Geo.Mesh3 output:**
   - In `src/geometry/geometry-lib.js`, add a helper `faceGroupToMesh3(faceGroup, allVertices)` that:
     - Takes a face group (list of triangle indices + the full vertex array from the `Geo.Mesh3`).
     - Returns a new `Geo.Mesh3` with only the vertices and faces belonging to that group.
   - In `src/nodes/categories/geometry.js`, update `Select.Faces.execute()`:
     - For each entry in `_selectedFaces`, call `faceGroupToMesh3` to produce a `Geo.Mesh3`.
     - Return the array of `Geo.Mesh3` objects (not face descriptor objects).
   - Update `tests/geometry-selection.test.js`: change assertions from `_type: 'Face'` shape to `Geo.Mesh3` shape (has `.vertices`, `.faces`, no `_type: 'Face'`).
   - Update `tests/e2e/geometry-selection.spec.js`: change the AC-11 Approve assertion to check for `Geo.Mesh3` output (not `_type: 'Face'`).

4. **Bug E — Return to 2D after Approve:**
   - Find where `approveSelection()` (or the Approve button click handler) is wired in `src/ui/node-renderer.js` or `src/viewer/selection-mode.js`.
   - After approval logic completes, call the same mechanism the app uses to switch from 3D back to 2D canvas view (search for `setViewMode`, `showCanvas`, `switchTo2D`, or equivalent in the codebase).
   - If no such mechanism exists, dispatch a custom event `nova:view-switch` with `{ mode: 'canvas' }` and handle it at the app level — document this as a decision entry.

5. Run validation:
   ```powershell
   npm.cmd run lint:all
   npm.cmd run test
   npm.cmd run test:e2e
   npm.cmd run build
   ```

6. Update `## Run comments` in `docs/tickets/TICK-009.md` (replace, do not accumulate).

7. Return structured JSON output per RULES.md §10. Include `playwright_tested: true` and a non-empty `playwright_result` (files changed include `src/viewer/` and `src/ui/`).

## Merge checklist

- [ ] Bug-C verified: hover turns face blue, E2E spec passes
- [ ] Bug-D verified: N selected faces → N `Geo.Mesh3` objects in output, unit test + E2E pass
- [ ] Bug-E verified: Approve returns to 2D node editor view, E2E confirms canvas is visible
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass
- [ ] `npm run test:e2e` — all pass
- [ ] `npm run build` — green
- [ ] `docs/tickets/TICK-009.md` Run comments updated
- [ ] Workboard claim released on merge
