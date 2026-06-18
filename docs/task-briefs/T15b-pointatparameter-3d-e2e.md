# T15b — Surface.PointAtParameter renders a visible point in the 3D viewport (E2E)

**Parent ticket:** [TICK-015](../tickets/TICK-015.md) — Surface.PointAtParameter (rename).
**Lane / owner:** ui — **switch**.
**Branch:** `feat/tick-015-surface-pointatparameter` (same ticket branch; your work is an isolated
worktree on it).
**Covers AC:** AC-5 (and AC-6 e2e for your slice).

## Goal

Add a Playwright E2E spec proving the PM's explicit requirement: wiring
`Surface.ByPatch` → `Surface.PointAtParameter` produces a **real point visible in the 3D
environment** — a genuine `Geo.Point3` added to the scene, not `[object Object]`/`NaN`/`undefined`.

## Context

- The node is being renamed by T15a (mouse): canonical `type: 'Surface.PointAtParameter'`, inputs
  `surface` + `u` + `v`, output port `point` → a `Geo.Point3`. Build your spec against that exact
  type id and output port id.
- The viewport adds geometry to the scene via `Geo.addToScene`. A `Geo.Point3` should render as a
  visible point object.
- Follow the existing E2E patterns in `tests/e2e/polyline-flat-render.spec.js` (drives the same
  `toMesh`/`addToScene` render path used by the viewer and classifies the returned scene object)
  and `tests/e2e/geometry-selection.spec.js`. Use `page.waitForFunction(() => window.app &&
  window.app.initialized && window.Geo)`.

## What to do

1. Add `tests/e2e/surface-pointatparameter.spec.js`.
2. In the spec: build a `Surface.ByPatch` surface, evaluate the node's output point at (u=0.5,
   v=0.5) — either by driving the node's `execute` through the registry/engine, or by directly
   calling `Geo.pointAtUV` on a ByPatch surface (whichever matches how the other specs drive
   geometry) — then run the result through the viewer's add-to-scene/`toMesh` path.
3. Assert the rendered object is a **real, visible point on the surface**:
   - the output is a `Geo.Point3` with finite x/y/z (NOT `[object Object]`, `NaN`, `undefined`);
   - `Geo.addToScene` (or the point's `toMesh`) yields a scene object that is actually visible
     (a Points/Mesh/sprite with non-empty geometry), not an empty group;
   - the point lies on the surface (its coordinates are within the surface's bounds — a sanity
     check that it is a point ON the patch, matching the accb60e UV-spread fix).
4. Verify MEANINGFUL results — assert the expected readable coordinates, not merely that "a value
   exists".

## Owned paths

- `tests/e2e/surface-pointatparameter.spec.js` (new)

## Do NOT touch

- `src/**` (no product code — T15a owns the node; the viewer is not to be modified).
- `src/nodes/categories/surfaces.js`, `src/viewer/**`, `src/ui/**`.
- `tests/geometry/**`, other e2e specs.

## Interface contract (depends on T15a)

- Node `type` = `Surface.PointAtParameter`; output port id = `point`; output value = `Geo.Point3`.
- If you run the spec in your isolated worktree before T15a's rename merges, the node type may not
  yet exist in your checkout. If so, gate the type-dependent assertions with `test.skip` and clearly
  report in your JSON that the spec flips to active once T15a's rename lands on the shared branch
  (same situation as TICK-014's T14b). Prefer driving the kernel (`Geo.pointAtUV` on a ByPatch
  surface + `Geo.addToScene`) so the render assertion runs regardless, and add the node-graph-level
  assertion as the part that may skip.

## Merge checklist

- [ ] AC-5 verified: E2E asserts a visible point renders on the surface in the 3D viewport (real
      Point3 in the scene, not `[object Object]`/`NaN`).
- [ ] `npm run test:e2e` → the new spec passes (or documents the skip-until-T15a-merge state with a
      clear reason).
- [ ] `npm run lint:all` → 0 errors; `npm run build` → green.
- [ ] Return the structured JSON from RULES.md §10.

## Conflict warning

Same ticket branch as T15a, isolated worktree. The viewer (`src/viewer/**`) is NOT to be touched;
if the render path is broken, report it — do not patch the viewer here.
