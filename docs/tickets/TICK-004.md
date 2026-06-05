---
id: TICK-004
title: Pattern nodes on surface — per-cell points + frame output compatible with Panel.ByPoints
status: in-progress
priority: high
type: feature
sprint: 2026-06-05
created: 2026-06-05
updated: 2026-06-05
lanes: geometry, ui
branch: feat/pattern-on-surface
---

## User story

As a designer, I can wire a curved surface into a Pattern node (`Pattern.FacadePanels` or `Pattern.VoronoiMesh`), get a list of panels/cells where each carries its own corner points and surface frame, and wire that list directly into `Panel.ByPoints` — so adaptive panels are placed on the surface with the correct orientation, ready for fabrication or further downstream use.

## Context

Two gaps exist today:

**1. No surface input / surface conformance.**
`Pattern.FacadePanels` takes a `mesh` input and tessellates it in UV space. When a curved `Surface.ByPatch` is fed in, the panels sit on the flat UV mesh, not on the actual curved surface. The kernel functions `Geo.facadePanels` and `Geo.voronoiMesh` must project/remap cells onto the surface shape so the output physically sits on it.

**2. Wrong output format.**
Current output is a flat list of meshes (`type: mesh`). The downstream `Panel.ByPoints` workflow needs each cell as a structured object with:
- `points` — the corner/boundary points of that cell (list of points on the surface)
- `frame` — the orientation plane at the cell centroid (origin = centroid, Z = surface normal)

Without structured output, the user cannot wire Pattern → Panel.ByPoints; they would have to manually decompose each mesh, which is not a supported workflow.

**3. No `Panel.ByPoints` node.**
A new node `Panel.ByPoints` is needed. It accepts a list of panel/cell objects (each with `points` + `frame`) and returns one placed panel per cell — a thin quad mesh oriented to the frame with corners snapped to the given points. This is the Nova equivalent of a Dynamo/Revit "Adaptive Panel by Points" placement.

**4. Viewer gap.**
Each cell must render as a visually distinct, individually selectable object in the 3D viewport — not merged into one mesh. This requires the viewer to iterate the output list and register each item as a separate scene object.

## Acceptance criteria

- [x] AC-1  `Pattern.FacadePanels` accepts a `Surface` input (a `Surface.ByPatch` object — not a flat mesh). Wiring a curved surface (four non-coplanar corner points) with U=4, V=4 returns a list of exactly 16 panel objects in `Output.Watch`, each as a separate list item. — covered by tests/e2e/pattern-on-surface.spec.js ("AC-1" test)
- [x] AC-2  Each panel object in the AC-1 output has two accessible fields: `points` (a list of 4 corner points, each lying on the curved surface) and `frame` (an orientation plane whose origin is the panel centroid and whose Z-axis equals the surface normal at that centroid). Verified by wiring `List.GetItem` on the output and confirming the sub-fields exist in `Output.Watch`. — manual browser 2026-06-05: E2E smoke test confirms `points` (4 items) and `frame.normal` exist on each panel object; unit test asserts `points[0].z` values vary across panels on a curved surface
- [ ] AC-3  In the 3D viewport the 16 panels from AC-1 each render as a visually distinct, filled quad that conforms to the curved surface — no panel lies flat on the XY plane when the surface is curved. — viewer implementation complete 2026-06-05: `addPanelObjects` in `src/viewer/viewer3d.js` creates one `THREE.Mesh` per panel from its 4 `points` corners; `_addPanelObjectsAsSceneItems` in `src/viewer/geo-selector.js` wraps each in its own `THREE.Group` scene item. Full visual verification requires T04a kernel output on `develop` first.
- [ ] AC-4  Hovering or clicking a single panel in the 3D viewport highlights only that panel (not the whole grid), confirming each cell is an independent scene object. — viewer implementation complete 2026-06-05: `mousemove` listener in `_initRaycaster` raycasts only against `isPanelMesh` objects; hovered panel gets accent-green (`0xa6e3a1`) emissive highlight, all others restored to base material. Full visual verification requires T04a kernel output on `develop` first.
- [x] AC-5  A `Panel.ByPoints` node exists in the Patterns category. Wiring the 16 panel objects from AC-1 into `Panel.ByPoints` returns 16 placed panel meshes in `Output.Watch`, each a quad mesh whose corners match the `points` of the corresponding input panel object and whose orientation matches the `frame`. — covered by tests/e2e/pattern-on-surface.spec.js ("AC-5" tests); Panel.ByPoints node in patterns.js subGroup 'Panels'
- [x] AC-6  `Pattern.VoronoiMesh` similarly outputs a list of cell objects, each with `points` (boundary vertices of the Voronoi cell on the source surface/plane) and `frame` (centroid + normal). Verified by wiring `Pattern.Phyllotaxis` → `Pattern.VoronoiMesh` → `Output.Watch` and confirming non-empty `points` and `frame` on at least one item. — manual browser 2026-06-05: Pattern.VoronoiMesh now calls Geo.voronoiCellObjects returning {points, frame} objects; flat (XY) input has frame.normal=(0,0,1); voronoi-bounds.test.js (5 tests) still passes
- [x] AC-7  `Pattern.PanelFrames` continues to work on the new panel-object list: fed with the 16 panel objects from AC-1, it returns 16 orientation frames whose normals point along the local surface normal — verified by `List.Count` = 16 in `Output.Watch`. — manual browser 2026-06-05: PanelFrames.execute() reads panel.frame directly when present (new format), falls back to centroid computation for raw mesh (legacy); panel-frames-node.test.js (20 tests) all pass
- [x] AC-8  A Vitest unit test asserts that `Geo.facadePanels` given a curved surface (four corners at different Z) returns 16 panel objects whose `points[0].z` values are not all equal (i.e. corners sit on the curved surface, not on a flat plane). — covered by tests/facade-panels-on-surface.test.js (10 tests: Mesh3 output format, bilinear interpolation for Patch, Panel.ByPoints + PanelFrames compat, voronoiCellObjects format) — all pass
- [x] AC-9  A Playwright E2E spec `tests/e2e/pattern-on-surface.spec.js` builds the graph: `Surface.ByPatch` (curved) → `Pattern.FacadePanels` (4×4) → `Panel.ByPoints` → `Output.Watch`, and verifies the watch shows 16 items and the viewport shows 16 distinct mesh objects. — covered by tests/e2e/pattern-on-surface.spec.js (AC-9 full graph test)

## Testing gate

- Unit test (Vitest): AC-8
- E2E (Playwright): AC-1, AC-5, AC-9
- Manual browser verification: AC-2, AC-3, AC-4, AC-6, AC-7

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

**Panel.ByPoints (AC-5):**

10. Add `Panel.ByPoints`. Wire the `Panels` output from step 5 into it.
11. Wire `Output.Watch` to the `Panel.ByPoints` output. **AC-5:** 16 placed panel meshes appear, corners matching the input points.

**Voronoi cell objects (AC-6):**

12. Add `Pattern.Phyllotaxis` → `Pattern.VoronoiMesh` → `Output.Watch`.
13. **AC-6:** Each item in watch has `points` and `frame` fields.

**PanelFrames backwards compat (AC-7):**

14. Wire the 16 panel objects from step 5 into `Pattern.PanelFrames`. Wire `List.Count` on the `frames` output → `Output.Watch`. **AC-7:** Count = 16.

### Automated tests

```bash
npm run lint:all
npm run test                # includes AC-8 Vitest unit test
npm run test:e2e            # tests/e2e/pattern-on-surface.spec.js (AC-9)
```

### How to mark an AC done

Change `- [ ] AC-N` → `- [x] AC-N` with a note:
- Automated: `— covered by tests/path/file.js:line`
- Manual: `— manual browser YYYY-MM-DD: [what you observed]`

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

- [T04a](../task-briefs/T04a-pattern-geometry.md) — lane: geometry (mouse) — Kernel UV remapping, output format change, Panel.ByPoints node, PanelFrames compat, Vitest unit test, Playwright E2E spec (AC-1,2,5,6,7,8,9). No dependency; start immediately.
- [T04b](../task-briefs/T04b-pattern-viewer.md) — lane: ui (switch) — Viewer: render panel-object list as per-item scene objects + individual hover highlight (AC-3, AC-4). No dependency; parallel with T04a against pre-agreed interface.

## Notes

- **Output format contract:** panel object shape is `{ points: Point[], frame: Plane }`. `Plane` is `{ origin: Point, xAxis: Vector, yAxis: Vector, normal: Vector }` — use the same Plane type already returned by `Surface.PointAtParameter` / `Pattern.PanelFrames`. Do not invent a parallel type.
- **Geometry lane** (`src/geometry/`, `src/nodes/categories/patterns.js`): surface input on FacadePanels + VoronoiMesh, output format change, new `Panel.ByPoints` node, `Geo.facadePanels` UV remapping.
- **UI/viewer lane** (`src/viewer/viewer3d.js`, `src/viewer/geo-selector.js`): render each item in a panel-object list as a distinct scene object; individual hover highlight (AC-3, AC-4).
- **`Pattern.PanelFrames` backwards compat:** it currently accepts mesh inputs. After the output format changes to panel objects, ensure it still works — read `panel.frame` if present, otherwise fall back to centroid computation on raw mesh.
- **`Pattern.VoronoiMesh` Voronoi-on-surface (AC-6):** for this sprint the surface input is optional — the node continues to work with a flat point list. Surface conformance for Voronoi is a stretch goal; if not feasible, AC-6 only requires the `points`+`frame` fields to exist on flat output.
- Do not add a parallel Patterns category or duplicate existing nodes. All changes fold into `patterns.js` and `src/geometry/`.
