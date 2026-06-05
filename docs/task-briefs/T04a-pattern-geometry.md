# T04a — Pattern on Surface: Geometry Kernel + Node Changes

**Parent ticket:** [TICK-004](../tickets/TICK-004.md)
**Lane:** geometry (agent: mouse)
**Branch:** `feat/pattern-on-surface-geo`
**Status:** queued
**Dependency:** none — can start immediately (T04b runs in parallel against the pre-agreed interface contract)

---

## Goal

1. Extend `Geo.facadePanels` to accept a `Surface` object (from `Surface.ByPatch`)
   and project UV-grid points onto the actual curved surface so panel corners sit
   on the surface, not on a flat UV plane.
2. Change the output format of `Pattern.FacadePanels` and `Pattern.VoronoiMesh`
   from flat mesh list to panel-object list: each item is `{ points: Point[], frame: Plane }`.
3. Add a new node `Panel.ByPoints` in `src/nodes/categories/patterns.js`.
4. Keep `Pattern.PanelFrames` backwards-compatible (read `panel.frame` if present,
   else fall back to centroid computation on raw mesh input).
5. Write a Vitest unit test asserting that `Geo.facadePanels` with a curved surface
   (four corners at different Z) returns panel objects whose `points[0].z` values
   are not all equal.
6. Write the Playwright E2E spec `tests/e2e/pattern-on-surface.spec.js` covering
   the full graph: `Surface.ByPatch` (curved) → `Pattern.FacadePanels` (4×4) →
   `Panel.ByPoints` → `Output.Watch` → asserts 16 items + viewport shows 16 mesh
   objects.

---

## Owned paths

```
src/geometry/geo-facade-panels.js          (modify — surface UV remapping)
src/geometry/geo-voronoi.js                (modify — voronoi output format, surface input optional)
src/nodes/categories/patterns.js           (modify — Panel.ByPoints, output format, PanelFrames compat)
tests/geometry/geo-facade-panels.test.js   (create — Vitest unit test for AC-8)
tests/e2e/pattern-on-surface.spec.js       (create — Playwright E2E spec for AC-9)
```

If the kernel functions do not yet live in dedicated files, find them in
`src/geometry/` and refactor into named files as a preparation step (same branch
is fine — it is directly in scope of this task).

**Do NOT touch:**
- `src/viewer/viewer3d.js` — owned by T04b
- `src/viewer/geo-selector.js` — owned by T04b
- `src/ui/**` — owned by ui lane
- `src/app/**`, `src/core/**`, `worker/**`, `api/**`
- `src/nodes/categories/*.js` files other than `patterns.js`

---

## Interface / contract (pre-agreed — do not deviate)

### Panel object shape

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

Use the same `Plane` type that `Surface.PointAtParameter` / `Pattern.PanelFrames`
already returns. Do NOT invent a parallel type.

### Panel.ByPoints node

```js
{
  type: 'Panel.ByPoints',
  category: 'Patterns',
  inputs: [
    { name: 'panels', type: 'list', description: 'List of panel objects (points + frame)' }
  ],
  outputs: [
    { name: 'meshes', type: 'list', description: 'One placed quad mesh per input panel' }
  ]
}
```

Each output mesh corners snap to `panel.points`; mesh orientation follows
`panel.frame`.

---

## AC coverage (this task)

| AC | Type | What this task does |
|---|---|---|
| AC-1 | E2E | `Pattern.FacadePanels` + curved surface → 16 panel objects in Output.Watch |
| AC-2 | Manual | Each panel has `points` (4 corners on surface) + `frame` (centroid + normal) |
| AC-5 | E2E | `Panel.ByPoints` node exists; 16 meshes in Output.Watch |
| AC-6 | Manual | `Pattern.VoronoiMesh` output items have `points` + `frame` fields |
| AC-7 | Manual | `Pattern.PanelFrames` still works on new panel-object list (count = 16) |
| AC-8 | Unit  | Vitest: `Geo.facadePanels` curved surface → `points[0].z` not all equal |
| AC-9 | E2E   | `pattern-on-surface.spec.js`: graph builds, watch shows 16 items, viewport 16 meshes |

AC-3 (viewport renders 16 distinct quads) and AC-4 (hover highlight) are covered by T04b.

---

## Testing gate

- Vitest unit test: AC-8 — must pass before merge.
- Playwright E2E: AC-1, AC-5, AC-9 (via `pattern-on-surface.spec.js`) — must pass before merge.
- Manual browser: AC-2, AC-6, AC-7 — record observation in TICK-004 with date.

---

## Merge checklist

- [ ] AC-1 verified: `npm run test:e2e` passes for pattern-on-surface.spec.js; 16 items in Output.Watch
- [ ] AC-2 verified: manual browser — each panel object shows `points` (4 items) and `frame.normal` in watch panel; recorded in TICK-004 with date
- [ ] AC-5 verified: `Panel.ByPoints` node appears in Patterns category; 16 mesh outputs in watch
- [ ] AC-6 verified: manual browser — VoronoiMesh output items have `points` and `frame`; recorded in TICK-004 with date
- [ ] AC-7 verified: manual browser — `Pattern.PanelFrames` fed 16 panel objects returns 16 frames; List.Count = 16; recorded in TICK-004 with date
- [ ] AC-8 verified: `npm run test` passes; test name and file:line noted in TICK-004
- [ ] AC-9 verified: `npm run test:e2e` passes; geometry-selection and pattern-on-surface both green
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass
- [ ] No duplicate node types added; fit gate checked (NOVA.md §4)
- [ ] `Panel.ByPoints` help.example is a complete producer → node → consumer graph that runs
- [ ] TICK-004 AC checkboxes updated where this task is responsible
- [ ] Workboard row released on merge

---

## Notes

- Before writing `Panel.ByPoints`, enumerate all nodes in `patterns.js` and
  confirm no node already does the same job (NOVA.md §4 fit gate).
- `Pattern.VoronoiMesh` surface conformance is a stretch goal for this sprint.
  For AC-6, the minimum is that the output items have `points` + `frame` fields on
  a flat input (the surface input can be optional). Do not ship broken Voronoi output.
- The Playwright E2E spec is authored here (geometry lane) because it exercises
  the kernel output, not viewer internals. T04b is a viewer-only task.
- For the E2E spec, the viewport assertion for "16 distinct mesh objects" can
  check for 16 DOM canvas objects or count scene objects via a window-level
  accessor if one exists — coordinate with T04b agent on the specific testid/hook
  that T04b will add to the viewer.
- TICK-004 Notes section defines the output format contract — treat it as the
  authoritative spec.
