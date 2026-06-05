# T04a — Pattern on Surface: Geometry Kernel + Node Changes (updated 2026-06-05)

**Parent ticket:** [TICK-004](../tickets/TICK-004.md)
**Lane:** geometry (agent: mouse)
**Branch:** `feat/pattern-on-surface-geo`
**Status:** active — scope updated by PM 2026-06-05
**Dependency:** none — can start immediately (T04b runs in parallel against the pre-agreed interface contract; T04c handles registry-level changes in node-library.js)

---

## Goal

### Original goals (still in scope)

1. Extend `Geo.facadePanels` to accept a `Surface` object (from `Surface.ByPatch`) and project UV-grid points onto the actual curved surface so panel corners sit on the surface, not on a flat UV plane.
2. Change the output format of `Pattern.FacadePanels` and `Pattern.VoronoiMesh` from flat mesh list to panel-object list: each item is `{ points: Point[], frame: Plane }`.
3. Keep `Pattern.PanelPlane` (was `Pattern.PanelFrames`) backwards-compatible (read `panel.frame` if present, else fall back to centroid computation on raw mesh input).
4. Write a Vitest unit test asserting that `Geo.facadePanels` with a curved surface (four corners at different Z) returns panel objects whose `points[0].z` values are not all equal.
5. Write/update the Playwright E2E spec `tests/e2e/pattern-on-surface.spec.js` covering the updated graph.

### PM scope changes (2026-06-05)

6. **Remove `Panel.ByPoints` from `patterns.js`.** The node was creating Mesh from Mesh with no value. Delete the node definition from `patterns.js`. (Registry removal is handled by T04c in node-library.js.)

7. **Add `Panel.Points` to `patterns.js`.** New node that accepts a panel object (or list) and returns `panel.points` — the corner-point coordinate array. It does NOT create a mesh. Node definition:
   ```js
   {
     type: 'Panel.Points',
     category: 'Patterns',
     subGroup: 'Panels',
     inputs: [{ name: 'panel', type: 'any', description: 'Panel object or list of panel objects' }],
     outputs: [{ name: 'points', type: 'list', description: 'Corner points of the panel (or list of point-lists for a list input)' }],
     execute: (panel) => Array.isArray(panel) ? panel.map(p => p.points) : panel.points
   }
   ```
   Include a complete `help.example` graph: `Pattern.FacadePanels` → `Panel.Points` → `Output.Watch`.

8. **Rename `Pattern.PanelFrames` → `Pattern.PanelPlane` in `patterns.js`.** Change the `type` field from `'Pattern.PanelFrames'` to `'Pattern.PanelPlane'`. Update the description. Update all internal references. (Registry update is handled by T04c.)

9. **Fix `Pattern.VoronoiMesh` `help.example` sample graph.** The current sample returns an empty result. Inspect the `help.example` field in the `Pattern.VoronoiMesh` node definition and fix it so the sample graph runs end-to-end with non-empty output. The canonical sample is: `Pattern.Phyllotaxis` (count=20) → `Pattern.VoronoiMesh` → `Output.Watch`. Check that `Pattern.Phyllotaxis` output shape matches what `Pattern.VoronoiMesh` expects as input; fix the mismatch.

10. **Update E2E spec.** Change `pattern-on-surface.spec.js` to reference `Panel.Points` instead of `Panel.ByPoints`; assert that the output is a list of 16 point-lists (each with 4 points), not 16 meshes.

---

## Owned paths

```
src/geometry/geo-facade-panels.js          (modify — surface UV remapping)
src/geometry/geo-voronoi.js                (modify — voronoi output format, surface input optional)
src/nodes/categories/patterns.js           (modify — remove Panel.ByPoints, add Panel.Points, rename PanelFrames→PanelPlane, output format, VoronoiMesh sample fix)
tests/geometry/geo-facade-panels.test.js   (create/modify — Vitest unit test for AC-8; add Panel.Points + PanelPlane tests)
tests/e2e/pattern-on-surface.spec.js       (create/modify — Playwright E2E spec for AC-9, updated for Panel.Points)
```

If the kernel functions do not yet live in dedicated files, find them in `src/geometry/` and refactor into named files as a preparation step (same branch is fine).

**Do NOT touch:**
- `src/viewer/viewer3d.js` — owned by T04b
- `src/viewer/geo-selector.js` — owned by T04b
- `src/core/node-library.js` — owned by T04c (hot file: registry changes only in T04c)
- `src/ui/**` — owned by ui lane
- `src/app/**`, `src/core/**` (except via T04c), `worker/**`, `api/**`
- `src/nodes/categories/*.js` files other than `patterns.js`

---

## Interface / contract (pre-agreed — do not deviate)

### Panel object shape (unchanged)

```js
{
  points: Point[],   // corner/boundary points on the surface (4 for quads)
  frame: {
    origin: Point,   // centroid of the cell, on the surface
    xAxis:  Vector,
    yAxis:  Vector,
    normal: Vector   // equals surface normal at centroid
  }
}
```

### Panel.Points node (new)

```js
// Single panel input:
Panel.Points({ panel: { points: [P0, P1, P2, P3], frame: {...} } })
// returns: [P0, P1, P2, P3]

// List input (laced):
Panel.Points({ panel: [panelA, panelB, ...] })
// returns: [[P0a,P1a,P2a,P3a], [P0b,P1b,P2b,P3b], ...]
```

### Pattern.PanelPlane node (renamed from PanelFrames)

- Type string changes from `'Pattern.PanelFrames'` to `'Pattern.PanelPlane'`
- Input/output shape unchanged: accepts panel object list, returns list of Plane objects
- T04c will update node-library.js to register the new type string

### T04b interface (coordinate on this)

T04b exposes `window._novaSceneObjectCount` or a `data-panel-count` attribute. Confirm the exact name before finalising the E2E spec assertion for "16 distinct mesh objects in viewport".

---

## AC coverage (this task)

| AC | Type | What this task does |
|---|---|---|
| AC-1 | E2E | `Pattern.FacadePanels` + curved surface → 16 panel objects in Output.Watch |
| AC-2 | Manual | Each panel has `points` (4 corners on surface) + `frame` (centroid + normal) |
| AC-5 | E2E | `Panel.Points` node exists; 16 point-lists in Output.Watch (not meshes) |
| AC-6 | Manual | `Pattern.VoronoiMesh` output items have `points` + `frame` fields |
| AC-7 | Manual | `Pattern.PanelPlane` (renamed) works on new panel-object list (count = 16) |
| AC-8 | Unit  | Vitest: `Geo.facadePanels` curved surface → `points[0].z` not all equal |
| AC-9 | E2E   | `pattern-on-surface.spec.js`: graph builds with Panel.Points, watch shows 16 point-lists, viewport 16 meshes |
| AC-10 | Manual | `Pattern.VoronoiMesh` help.example sample produces non-empty output |

AC-3 (viewport 16 distinct quads) and AC-4 (hover highlight) are covered by T04b.

---

## Testing gate

- Vitest unit tests: AC-8 (facadePanels curved surface), Panel.Points node, PanelPlane node — all must pass before merge.
- Playwright E2E: AC-1, AC-5, AC-9 (via updated `pattern-on-surface.spec.js`) — must pass before merge.
- Manual browser: AC-2, AC-6, AC-7, AC-10 — record observation in TICK-004 with date.

---

## Merge checklist

- [ ] AC-1 verified: `npm run test:e2e` passes; 16 items in Output.Watch
- [ ] AC-2 verified: manual browser — each panel object shows `points` (4 items) and `frame.normal` in watch panel; recorded in TICK-004 with date
- [ ] AC-5 verified: `Panel.Points` node appears in Patterns category; Output.Watch shows 16 point-lists (each a list of 4 points); `Panel.ByPoints` no longer in library
- [ ] AC-6 verified: manual browser — VoronoiMesh output items have `points` and `frame`; recorded in TICK-004 with date
- [ ] AC-7 verified: manual browser — `Pattern.PanelPlane` (not PanelFrames) fed 16 panel objects returns 16 planes; List.Count = 16; recorded in TICK-004 with date
- [ ] AC-8 verified: `npm run test` passes; test name and file:line noted in TICK-004
- [ ] AC-9 verified: `npm run test:e2e` passes; spec uses Panel.Points and asserts 16 point-lists
- [ ] AC-10 verified: manual browser — VoronoiMesh help.example sample runs and shows non-empty output; recorded in TICK-004 with date
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass (including new Panel.Points + PanelPlane unit tests)
- [ ] `Panel.ByPoints` definition removed from `patterns.js`
- [ ] `Pattern.PanelFrames` type string removed from `patterns.js` (T04c handles node-library.js)
- [ ] No duplicate node types added; fit gate checked (NOVA.md §4)
- [ ] `Panel.Points` help.example is a complete producer → node → consumer graph that runs
- [ ] TICK-004 AC checkboxes updated where this task is responsible
- [ ] Workboard row released on merge

---

## Notes

- Before adding `Panel.Points`, enumerate all nodes in `patterns.js` and confirm no node already extracts panel corner points (NOVA.md §4 fit gate).
- `Pattern.VoronoiMesh` surface conformance is a stretch goal. For AC-6 and AC-10, the minimum is that the sample runs and output items have `points`+`frame` fields on flat input. Do not ship broken/empty Voronoi output.
- The Playwright E2E spec assertion for AC-9 ("16 distinct mesh objects in viewport") coordinates with T04b — use the `window._novaSceneObjectCount` accessor that T04b exposes.
- TICK-004 Notes section defines the output format contract — treat it as authoritative.
- T04c runs in parallel (core lane) to update node-library.js registrations. Do not touch node-library.js in this task.
