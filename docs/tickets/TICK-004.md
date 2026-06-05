---
id: TICK-004
title: Pattern nodes on surface — panels and Voronoi cells conform to the surface shape
status: draft
priority: high
type: feature
sprint: 2026-06-05
created: 2026-06-05
lanes: geometry, ui
branch: feat/pattern-on-surface
---

## User story

As a designer, I can wire a curved surface (from `Surface.ByPatch` or similar) into a Pattern node and see every panel / Voronoi cell individually displayed in the 3D viewport — each cell showing its own shape, points, and surface area — so I can study and rationalize the paneling layout on any freeform geometry.

## Context

Current Pattern nodes (`Pattern.FacadePanels`, `Pattern.VoronoiMesh`, `Pattern.VoronoiOutlines`) generate panels/cells by tessellating a flat mesh in UV space. When a curved surface (non-planar `Surface.ByPatch`) is fed in, the panels are computed on the flat UV mesh and are not projected/remapped onto the surface, so the output does not conform to the actual surface shape. The PM observes that "every panel, voronoi cell individually with their points and surface" should be visible — meaning the viewer must show each cell as an independently selectable/inspectable object rather than one merged mesh.

Two gaps need closing:
1. **Geometry gap:** `Geo.facadePanels` and `Geo.voronoiMesh` must map/project cells onto the actual surface shape (UV parametric remapping or closest-point projection) so the resulting meshes sit on the surface.
2. **Viewer gap:** The viewer must render each cell as a visually distinct object so the user can see individual panels. Currently a list of meshes from a Pattern node may be merged or rendered as one.

## Acceptance criteria

- [ ] AC-1  A graph containing `Surface.ByPatch` (curved boundary — four non-coplanar corner points) → `Pattern.FacadePanels` (4 U, 4 V) → `Output.Watch` shows exactly 16 panel meshes in the watch output, each as a separate list item (not one merged mesh).
- [ ] AC-2  In the 3D viewport the 16 panels from AC-1 each render as a visually distinct, filled quad that conforms to the curved surface — no panel lies flat on the XY plane when the surface is curved.
- [ ] AC-3  Hovering or clicking a single panel in the 3D viewport highlights only that panel (not the whole grid), confirming each cell is an independent scene object.
- [ ] AC-4  A graph containing `Pattern.Phyllotaxis` (sites) → `Pattern.VoronoiMesh` → `Output.Watch` shows a list of individual Voronoi cell meshes in the watch output, and each cell is rendered as a distinct filled region in the 3D viewport.
- [ ] AC-5  When a curved `Surface.ByPatch` is supplied as the boundary to `Pattern.VoronoiMesh` (via the future surface-boundary input or by UV projection), the Voronoi cells conform to the surface — no cell is flat when the surface is curved.
- [ ] AC-6  `Pattern.PanelFrames` fed with the panels from AC-1 returns one orientation frame per panel (16 frames), with each frame's normal pointing in the direction of the local surface normal at that panel's centroid — verified by wiring `List.Count` on the frames output and confirming count = 16 in `Output.Watch`.
- [ ] AC-7  A Vitest unit test asserts that `Geo.facadePanels` given a curved surface (e.g. four corners at different Z heights) returns 16 meshes whose centroids are not all at the same Z coordinate (i.e. they follow the surface shape).
- [ ] AC-8  A Playwright E2E spec in `tests/e2e/pattern-on-surface.spec.js` builds the AC-1 graph programmatically and verifies that the watch output contains 16 items and the viewport contains 16 distinct mesh objects.

## Testing gate

- Unit test (Vitest): AC-7
- E2E (Playwright): AC-1, AC-4, AC-8
- Manual browser verification: AC-2, AC-3, AC-5, AC-6

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

## Notes

- The geometry kernel change (AC-1, AC-2, AC-7) lives in `src/geometry/` and is owned by the geometry lane.
- The viewer rendering of individual cells as separate scene objects (AC-2, AC-3) is a viewer-lane concern in `src/viewer/viewer3d.js` and `src/viewer/geo-selector.js`.
- The node definition changes (adding a `surface` boundary input to VoronoiMesh if needed for AC-5) live in `src/nodes/categories/patterns.js` — geometry lane.
- AC-5 is the hardest item; if UV remapping of Voronoi cells onto a curved surface is not feasible in this sprint, AC-5 may be deferred to next sprint and noted here. The other AC remain mandatory.
- Do not add a parallel Patterns category or duplicate existing nodes. All changes fold into the existing `patterns.js` and `src/geometry/` files.
