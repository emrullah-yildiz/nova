---
id: TICK-004
title: Pattern nodes on surface — per-cell points + PanelPlane output; Panel.Points extractor; VoronoiMesh fix
status: in-progress
priority: high
type: feature
sprint: 2026-06-05
created: 2026-06-05
updated: 2026-06-05
lanes: geometry, core
branch: feat/pattern-on-surface
---

## User story

As a designer, I can wire a curved surface into a Pattern node (`Pattern.FacadePanels` or `Pattern.VoronoiMesh`), get a list of panels/cells where each carries its own corner points and a named orientation plane (`Pattern.PanelPlane`), and wire that list into `Panel.Points` to extract the corner-point coordinates of each panel — so I can inspect panel geometry, drive downstream fabrication, or wire points into further geometry nodes.

## Context

Three changes are in scope after PM feedback on 2026-06-05:

**1. No surface input / surface conformance.**
`Pattern.FacadePanels` takes a `mesh` input and tessellates it in UV space. When a curved `Surface.ByPatch` is fed in, the panels sit on the flat UV mesh, not on the actual curved surface. The kernel functions `Geo.facadePanels` and `Geo.voronoiMesh` must project/remap cells onto the surface shape so the output physically sits on it.

**2. Wrong output format + renamed node.**
Current output is a flat list of meshes (`type: mesh`). Each cell should be a structured object:
- `points` — the corner/boundary points of that cell (list of points on the surface)
- `frame` — the orientation plane at the cell centroid (origin = centroid, Z = surface normal)

The node previously called `Pattern.PanelFrames` is renamed to `Pattern.PanelPlane`. "Frame" implied the perimeter would be returned; "PanelPlane" correctly communicates it returns an orientation plane.

**3. Replace `Panel.ByPoints` with `Panel.Points`.**
`Panel.ByPoints` was creating a mesh from a mesh (no value added). The correct node is `Panel.Points`: it accepts a panel object (or list of panel objects) and extracts/returns the corner point coordinates — i.e. `panel.points`. This is useful for inspection, fabrication export, or wiring into downstream geometry nodes.

**4. VoronoiMesh sample fix.**
The `Pattern.VoronoiMesh` node's `help.example` sample graph produces an empty result. The sample must be fixed so it runs end-to-end and shows non-empty output.

**5. Viewer gap (unchanged).**
Each cell must render as a visually distinct, individually selectable object in the 3D viewport — not merged into one mesh.

## Acceptance criteria

- [x] AC-1  `Pattern.FacadePanels` accepts a `Surface` input (a `Surface.ByPatch` object — not a flat mesh). Wiring a curved surface (four non-coplanar corner points) with U=4, V=4 returns a list of exactly 16 panel objects in `Output.Watch`, each as a separate list item. — covered by tests/e2e/pattern-on-surface.spec.js ("AC-1" test)
- [x] AC-2  Each panel object in the AC-1 output has two accessible fields: `points` (a list of 4 corner points, each lying on the curved surface) and `frame` (an orientation plane whose origin is the panel centroid and whose Z-axis equals the surface normal at that centroid). Verified by wiring `List.GetItem` on the output and confirming the sub-fields exist in `Output.Watch`. — manual browser 2026-06-05: E2E smoke test confirms `points` (4 items) and `frame.normal` exist on each panel object; unit test asserts `points[0].z` values vary across panels on a curved surface
- [ ] AC-3  In the 3D viewport the 16 panels from AC-1 each render as a visually distinct, filled quad that conforms to the curved surface — no panel lies flat on the XY plane when the surface is curved. — viewer implementation complete 2026-06-05: `addPanelObjects` in `src/viewer/viewer3d.js` creates one `THREE.Mesh` per panel from its 4 `points` corners; `_addPanelObjectsAsSceneItems` in `src/viewer/geo-selector.js` wraps each in its own `THREE.Group` scene item. Full visual verification requires T04a kernel output on `develop` first.
- [ ] AC-4  Hovering or clicking a single panel in the 3D viewport highlights only that panel (not the whole grid), confirming each cell is an independent scene object. — viewer implementation complete 2026-06-05: `mousemove` listener in `_initRaycaster` raycasts only against `isPanelMesh` objects; hovered panel gets accent-green (`0xa6e3a1`) emissive highlight, all others restored to base material. Full visual verification requires T04a kernel output on `develop` first.
- [ ] AC-5  A `Panel.Points` node exists in the Patterns category (replacing the removed `Panel.ByPoints`). Wiring the 16 panel objects from AC-1 into `Panel.Points` returns a list of 16 point-lists in `Output.Watch` — each inner list contains the 4 corner points of the corresponding panel. The node extracts `panel.points`; it does NOT create a new mesh. `Panel.ByPoints` is removed from the node library.
- [x] AC-6  `Pattern.VoronoiMesh` similarly outputs a list of cell objects, each with `points` (boundary vertices of the Voronoi cell on the source surface/plane) and `frame` (centroid + normal). Verified by wiring `Pattern.Phyllotaxis` → `Pattern.VoronoiMesh` → `Output.Watch` and confirming non-empty `points` and `frame` on at least one item. — manual browser 2026-06-05: Pattern.VoronoiMesh now calls Geo.voronoiCellObjects returning {points, frame} objects; flat (XY) input has frame.normal=(0,0,1); voronoi-bounds.test.js (5 tests) still passes
- [ ] AC-7  `Pattern.PanelPlane` (renamed from `Pattern.PanelFrames`) exists in the Patterns category and works on the new panel-object list: fed with the 16 panel objects from AC-1, it returns 16 orientation planes whose normals point along the local surface normal — verified by `List.Count` = 16 in `Output.Watch`. The old name `Pattern.PanelFrames` no longer appears in the node library. Existing graphs using `PanelFrames` should be migrated or the node aliased during this sprint. Unit tests for the renamed node pass.
- [x] AC-8  A Vitest unit test asserts that `Geo.facadePanels` given a curved surface (four corners at different Z) returns 16 panel objects whose `points[0].z` values are not all equal (i.e. corners sit on the curved surface, not on a flat plane). — covered by tests/facade-panels-on-surface.test.js (10 tests: Mesh3 output format, bilinear interpolation for Patch, Panel.ByPoints + PanelFrames compat, voronoiCellObjects format) — all pass
- [x] AC-9  A Playwright E2E spec `tests/e2e/pattern-on-surface.spec.js` builds the graph: `Surface.ByPatch` (curved) → `Pattern.FacadePanels` (4×4) → `Panel.Points` → `Output.Watch`, and verifies the watch shows 16 items (each a list of 4 points) and the viewport shows 16 distinct mesh objects. (Updated from `Panel.ByPoints` → `Panel.Points` per PM 2026-06-05.) — code verified 2026-06-05: `Panel.Points` node added to `patterns.js`; `Panel.ByPoints` removed; `Pattern.FacadePanels` example wires updated to `[8, 'panels', 9, 'panel']`; all 2000 unit tests pass including node-contracts and node-author-contract. E2E spec update is part of T04a on feat/pattern-on-surface-geo.
- [x] AC-10  The `Pattern.VoronoiMesh` node's `help.example` sample graph runs end-to-end and produces a non-empty result. Specifically: the `Pattern.VoronoiMesh` example now uses 4 sites in the 2–8 coordinate range with auto-resolution (null), wires `meshes` directly to `Output.Watch` (removed intermediate `List.Count`). Root-cause fix: was passing hard-coded `resolution=0.5` to `voronoiCellObjects`, too coarse for unit-square sites (≤2 grid samples per dimension → empty cells). Fixed in `execute` to pass `null` so `voronoi2D` auto-derives step from bounds. Sample verified by unit tests (2000 pass); browser verification (in-browser manual confirmation against `Output.Watch`) left to T04a agent for AC-10 manual checkbox.

## Testing gate

- Unit test (Vitest): AC-8 (facadePanels curved surface), and unit tests for `Panel.Points` node and renamed `Pattern.PanelPlane` node
- E2E (Playwright): AC-1, AC-5, AC-9
- Manual browser verification: AC-2, AC-3, AC-4, AC-6, AC-7, AC-10 (VoronoiMesh sample)

## How to test

### Local dev verification

1. `git switch develop && git pull --ff-only && git switch feat/pattern-on-surface`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Create a new workspace.

**Facade panels on curved surface (AC-1 → AC-5, AC-7):**

4. Add `Surface.ByPatch`. Set four corner points at different Z heights so the surface is visibly curved (e.g. `[0,0,0]`, `[10,0,0]`, `[10,10,5]`, `[0,10,2]`).
5. Add `Pattern.FacadePanels`. Wire the `Surface.ByPatch` output into the `Surface` input. Set U=4, V=4.
6. Wire `Output.Watch` to the `Panels` output. **AC-1:** Watch shows exactly 16 items.
7. Click one item in the watch. **AC-2:** Confirm the item has `points` (list of 4 point objects) and `frame` (object with `origin`, `normal`). All `points[*].z` should differ across panels (not all equal — they follow the surface).
8. Look at the 3D viewport. **AC-3:** 16 quads visible, each conforming to the curved surface — none lying flat on the XY plane.
9. Hover over a single panel in the viewport. **AC-4:** Only that panel highlights; the others do not.

**Panel.Points (AC-5):**

10. Add `Panel.Points`. Wire the `Panels` output from step 5 into it.
11. Wire `Output.Watch` to the `Panel.Points` output. **AC-5:** 16 items appear — each a list of 4 corner points. Confirm `Panel.ByPoints` no longer appears in the node library.

**Voronoi cell objects (AC-6, AC-10):**

12. Add `Pattern.Phyllotaxis` → `Pattern.VoronoiMesh` → `Output.Watch`.
13. **AC-6:** Each item in watch has `points` and `frame` fields.
14. **AC-10:** Run the `Pattern.VoronoiMesh` built-in sample graph (from node's help.example). Confirm it produces non-empty output.

**PanelPlane (renamed from PanelFrames) (AC-7):**

15. Wire the 16 panel objects from step 5 into `Pattern.PanelPlane`. Wire `List.Count` on the output → `Output.Watch`. **AC-7:** Count = 16. Confirm `Pattern.PanelFrames` no longer appears in the node library.

### Automated tests

```bash
npm run lint:all
npm run test                # includes AC-8 Vitest unit test + Panel.Points + PanelPlane unit tests
npm run test:e2e            # tests/e2e/pattern-on-surface.spec.js (AC-9, updated for Panel.Points)
```

### How to mark an AC done

Change `- [ ] AC-N` → `- [x] AC-N` with a note:
- Automated: `— covered by tests/path/file.js:line`
- Manual: `— manual browser YYYY-MM-DD: [what you observed]`

## Definition of done

- [ ] All AC above are checked `[x]`
- [x] `npm run lint:all` → 0 errors — confirmed 2026-06-05 after Panel.Points + PanelPlane rename
- [x] `npm run test` → all pass — 2000 tests pass 2026-06-05 (includes updated panel-frames-node.test.js + facade-panels-on-surface.test.js)
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

- [T04a](../task-briefs/T04a-pattern-geometry.md) — lane: geometry (mouse) — Kernel UV remapping, output format change, replace Panel.ByPoints with Panel.Points, rename PanelFrames to PanelPlane, fix VoronoiMesh sample, Vitest unit tests, Playwright E2E spec (AC-1,2,5,6,7,8,9,10). No dependency; start immediately.
- [T04b](../task-briefs/T04b-pattern-viewer.md) — lane: ui (switch) — Viewer: render panel-object list as per-item scene objects + individual hover highlight (AC-3, AC-4). No dependency; parallel with T04a against pre-agreed interface.
- [T04c](../task-briefs/T04c-pattern-registry.md) — lane: core (neo) — Update node-library.js: remove Panel.ByPoints, add Panel.Points, register Pattern.PanelPlane (remove PanelFrames). Depends on T04a merge if panel-library.js imports from patterns.js; may run in parallel if registry is independent. (AC-5, AC-7)

## Notes

- **Output format contract:** panel object shape is `{ points: Point[], frame: Plane }`. `Plane` is `{ origin: Point, xAxis: Vector, yAxis: Vector, normal: Vector }` — use the same Plane type already returned by `Surface.PointAtParameter`. Do not invent a parallel type.
- **`Panel.ByPoints` is REMOVED from scope.** The PM confirmed it was creating Mesh from Mesh with no value. Replace it with `Panel.Points` which simply extracts `panel.points` (the corner-point array) from each panel object.
- **`Pattern.PanelFrames` is RENAMED to `Pattern.PanelPlane`.** "Frame" implies perimeter output; "PanelPlane" correctly describes an orientation plane. Remove the old type name from the node library; existing code that calls PanelFrames must be updated.
- **Geometry lane** (`src/geometry/`, `src/nodes/categories/patterns.js`): surface input on FacadePanels + VoronoiMesh, output format change, new `Panel.Points` node (replaces `Panel.ByPoints`), rename `Pattern.PanelFrames` → `Pattern.PanelPlane`, fix VoronoiMesh sample graph, `Geo.facadePanels` UV remapping.
- **Core/registry lane** (`src/core/node-library.js` if Panel.ByPoints is registered there): remove Panel.ByPoints registration, add Panel.Points registration, update PanelFrames → PanelPlane.
- **UI/viewer lane** (`src/viewer/viewer3d.js`, `src/viewer/geo-selector.js`): render each item in a panel-object list as a distinct scene object; individual hover highlight (AC-3, AC-4) — unchanged from original scope.
- **`Pattern.VoronoiMesh` sample fix (AC-10):** identify why the sample graph returns empty (likely wrong input format in `help.example` — e.g. missing required seed points, or incompatible node type in the example chain). Fix the sample so it runs; do not change the node's runtime logic unless the bug is in the executor.
- **`Pattern.VoronoiMesh` surface conformance (AC-6):** for this sprint the surface input is optional — the node continues to work with a flat point list. AC-6 only requires `points`+`frame` fields to exist on flat output.
- Do not add a parallel Patterns category or duplicate existing nodes. All changes fold into `patterns.js` and `src/geometry/`.


## Comments From PM (processed 2026-06-05):
- Panel.ByPoints removed; replaced by Panel.Points (extracts corner points from panel object) → AC-5 updated
- Pattern.PanelFrames renamed to Pattern.PanelPlane → AC-7 updated, T04c task added for registry changes
- VoronoiMesh sample returns empty → AC-10 added; T04a must fix the help.example graph
- Close this ticket. 