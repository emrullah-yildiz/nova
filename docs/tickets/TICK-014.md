---
id: TICK-014
title: Surface paneling — Surface.Panelize + Input.PanelShapes
status: in-progress
priority: high
type: feature
sprint: A3
created: 2026-06-18
lanes: geometry, ui
branch: feat/tick-014-surface-paneling
---

## Summary

Sprint A3 asks for surface paneling: a `Surface.Panelize` node that tiles a surface with a repeating panel shape, plus a supporting `Input.PanelShapes` node that supplies a premade shape (diagonal, rectangle, square, hexagon, circle, etc.) from a dropdown. Together they let a user clad any surface with a parametric panel grid and read back the panel surfaces, their corner points, and their centre points for downstream work (facades, panelised roofs, attractor studies). The node should include a property to scale up or down for each panel. The inputs in total should be Surface, Panel Shape,  U, V, Scale. The scale input should be also included in Properties. 

## Problem definition

Nova can create surfaces (`Surface.ByPatch`, `Surface.ByPointGrid`, etc.) but has no way to subdivide a surface into a field of repeating panels. Users building facades or panelised roofs currently have no node that maps a unit shape across a surface's UV domain and returns per-panel geometry. There is also no library of standard panel shapes to feed such a node. This ticket adds both: the paneling operation and the shape-source node.

Per the node naming standard: creation/paneling node is `Surface.Panelize` (ParentName.NodeName), shape source is `Input.PanelShapes`. The dropdown widget pattern already exists in `src/nodes/categories/input.js` (`{ id, type: 'dropdown', options: [...], default, label }`). The dropdown shape source mirrors existing `Input.*` nodes.

## Acceptance criteria

Each item is binary (pass/fail) and observable in a running browser or test output.

- [x] AC-1  An `Input.PanelShapes` node appears in the Input category of the node library. It exposes a dropdown widget whose options include at least: Diagonal, Rectangle, Square, Hexagon, Circle. It has a single output `Shape` (a closed curve / polygon) representing the selected premade shape. — verified via node registry: category=Input, name=`Input.PanelShapes`, dropdown options contain those 5 entries, one `Shape` output. (T14a, panel-shapes.test.js:76-99)
- [x] AC-2  Selecting a different option in the `Input.PanelShapes` dropdown changes the output `Shape` to the corresponding geometry (e.g. choosing "Hexagon" outputs a 6-sided closed polygon; choosing "Circle" outputs a closed circular curve). — unit test asserts vertex/segment count differs per option (square=4 corners, hexagon=6, etc.). (T14a, panel-shapes.test.js:22-101)
- [x] AC-3  A `Surface.Panelize` node appears in the Surfaces category with inputs `Surface` (the surface to clad), `Shape` (a polygon or closed curve, e.g. from `Input.PanelShapes`), and a `Scale` number property/input that scales the shape onto the surface. It has three outputs: `Panels` (the panel surfaces), `Corners` (corner points of each panel), and `Center` (centre point of each panel). — verified via node registry: category=Surfaces, name=`Surface.Panelize`, inputs include Surface+Shape+U+V+Scale, outputs are exactly Panels, Corners, Center. (T14a, surface-panelize.test.js:51-78)
- [ ] AC-4  Wiring a `Surface.ByPatch` (or `Surface.ByPointGrid`) into `Surface.Panelize` with a `Square` shape from `Input.PanelShapes` produces multiple panel surfaces tiled across the surface, all visible in the 3D viewport (more than one panel for a surface larger than one panel cell). — unit test asserts `Panels` length > 1 (16 for a 4×4; surface-panelize.test.js:85-99). **Viewport/E2E assertion deferred**: T14b's spec covers this but currently `test.skip`s because T14a's nodes were on a separate isolated worktree. Flips green after dozer merges T14a + T14b onto the shared branch and re-runs `npm run test:e2e`.
- [x] AC-5  The `Corners` output returns the corner points for each panel (one group of corner points per panel), and the `Center` output returns one centre point per panel; the number of centre points equals the number of panels, and each centre lies inside its panel's corner bounds. — unit test asserts `Center` length == `Panels` length and `Corners` is grouped per panel. (T14a, surface-panelize.test.js:101-133)
- [ ] AC-6  Changing the `Scale` value re-scales each panel shape on the surface (smaller Scale → smaller panels with gaps; larger Scale → larger panels), observable as a change in panel size in the viewport and a change in the corner-point spread in the output. — unit test asserts corner spread scales with Scale (surface-panelize.test.js:135-159). **Viewport/E2E assertion deferred** to the combined-branch re-run (T14b spec, currently skipped).
- [ ] AC-7  `Surface.Panelize` and `Input.PanelShapes` each have a `help.example` sample graph that is a complete workflow: `Input.PanelShapes` → `Surface.Panelize` ← `Surface.ByPatch` → `Output.Watch`, and running it produces visible panels in the Watch output (not `[object Object]`, `undefined`, or `NaN`). — example wired + executed in unit test producing real non-NaN meshes (surface-panelize.test.js:178-200). **Browser/Watch confirmation deferred** to the combined-branch E2E re-run (T14b spec, currently skipped).
- [x] AC-8  Vitest unit tests cover AC-2, AC-4, AC-5, AC-6 (shape selection, panel count, centre/corner counts, scale effect). `npm run test` passes with no regression in pre-existing tests. — test output: 1940 pass / 1 pre-existing skip. (T14a)

## Testing gate

- Unit test (Vitest): AC-2, AC-4, AC-5, AC-6, AC-8
- Manual browser (3D viewport): AC-4, AC-6, AC-7
- Node registry assertion: AC-1, AC-3
- E2E (Playwright): not required — geometry kernel nodes + dropdown widget reusing existing widget infra; no new UI component. (Re-evaluate at decomposition if the dropdown needs a bespoke renderer.)

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/tick-014-surface-panelize`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. **AC-1/AC-2:** Add `Input.PanelShapes`. Confirm dropdown lists Diagonal/Rectangle/Square/Hexagon/Circle. Switch options and confirm the Shape output changes.
4. **AC-3/AC-4:** Add `Surface.ByPatch` (a square patch) and `Surface.Panelize`. Wire Surface + Shape (Square) → Panelize → `Output.Watch`. Confirm multiple panels tile the surface in the viewport.
5. **AC-5:** Inspect `Corners` and `Center` outputs — one centre per panel; corner groups per panel.
6. **AC-6:** Change `Scale` — confirm panel size changes in the viewport.
7. **AC-7:** Open each node's help panel — confirm the example runs and shows panels in Watch.

### Automated tests

```bash
npm run lint:all
npm run test
npm run build
```

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers UI-gated ACs (or documented as N/A)
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, branch deleted, workboard row released, INDEX.md updated

## Task briefs

- [T14a](../task-briefs/T14a-surface-panelize-kernel.md) — geometry (mouse): Input.PanelShapes shape source + Surface.Panelize kernel + node registration + unit tests.
- [T14b](../task-briefs/T14b-panelize-viewport-e2e.md) — ui (switch): viewport rendering verification + Playwright E2E spec for AC-4/AC-6/AC-7.

## Run comments

<!-- Agents write here. REPLACED every run — old content deleted, not appended. -->
<!-- This section feeds directly into the Coordinator Response in docs/PM.md.   -->

**Run 2026-06-18 — PM approved (updated ticket); decomposed + dispatched in parallel.**

_T14a (geometry / mouse) — commit `7fef110` on `worktree-agent-a66a3a089c3a1e195`:_
- Issue: null — new work.
- Changed: added `src/geometry/nodes/Input.PanelShapes.js` (dropdown shape source, icon ⬡), `src/geometry/nodes/Surface.Panelize.js` (UV tiling kernel + `panelizeSurface()`, icon ▦), `src/geometry/panel-shapes.js` (unit-shape builders), one-line registration in `src/nodes/categories/input.js` + `surfaces.js`, and unit tests `tests/geometry/panel-shapes.test.js` + `surface-panelize.test.js`. Panels emit the same Mesh3 shape as `Surface.ByPatch` (no new render path). Scale wired as both control property and input; full input set Surface/Shape/U/V/Scale.
- AC: AC-1, AC-2, AC-3, AC-5, AC-8 verified by passing unit tests. AC-4/AC-6/AC-7 covered by unit tests at the kernel level; browser/viewport confirmation handled by T14b.
- Validation: lint:all 0 errors; `npm run test` 1940 pass / 1 pre-existing skip; build green.
- Playwright: n/a (geometry-only).
- Follow-up gap: codegen templates reference `Geo.panelShape` / `Geo.panelize`, not yet exported in `src/geometry/index.js` (outside T14a's owned globs). In-app execute works; only AI Python/C# codegen would need the two one-line exports. Recommend a kernel-owner follow-up.

_T14b (ui / switch) — commit `36991ee` on `worktree-agent-a578288b1269a925c`:_
- Issue: null — new work.
- Changed: added `tests/e2e/surface-paneling.spec.js` (full workflow: Surface.ByPatch + Input.PanelShapes Square → Surface.Panelize → Output.Watch; AC-4 panel count/visible, AC-6 Scale spread, AC-7 help examples run). Verified the existing `Geo.addToScene` path renders an array of panel Mesh3 as multiple meshes — `src/viewer/viewer3d.js` deliberately NOT modified (no new render path needed).
- Validation: lint 0 errors; tests 1915 pass / 1 skip; build green; e2e 36 pass, 4 skipped, 0 fail.
- Playwright: true — 36 pass, 0 fail (4 skipped = AC-4/AC-6/AC-7, deferred until T14a's nodes are on the same branch).

**Status: 🔴 BLOCKED (dozer, 2026-06-18).** T14a (`7fef110`) + T14b (`36991ee`) were cherry-picked onto develop in dependency order (after the `accb60e` ByPatch UV prerequisite). lint:all (0), the full unit suite (1966 pass / 0 fail incl. surface-panelize.test.js 12/12), and build are all GREEN. **However, once both nodes share the develop branch the previously-skipped E2E AC tests now RUN for real and 2 FAIL** — this is the bug the isolated-worktree skip was masking:

- `tests/e2e/surface-paneling.spec.js:101` **AC-4** — expected >1 panel, got **1**. The kernel unit test (`surface-panelize.test.js`) builds 16 panels correctly via `panelizeSurface()`, but the full node-graph path (`computeNodeValue(pan,'panels')` → render) returns a single non-array value, so `panelCount===1`. The multi-output (`{panels,corners,center}`) is not being unwrapped to the `panels` array on the engine/node path.
- `tests/e2e/surface-paneling.spec.js:196` **AC-6** — `result.small.count===0`: the `Corners` output reads back 0 corner points through the same node-graph path.

**Root cause is in product/test code I (the integrator) may not edit** — fixing the Surface.Panelize multi-output unwrap is T14a (mouse) feature work; adjusting the E2E's output-reading is T14b (switch) test work. **Bounced to owners.** AC-4 / AC-6 / AC-7 remain UNCHECKED. AC-7's help-example E2E (`:299`) did pass, but AC-4/AC-6 gate the ticket.

The commits are physically on local develop (interleaved with the green TICK-015 commits); **develop is therefore RED on E2E and must NOT be pushed** until the panelize multi-output bug is fixed. dozer did NOT push and did NOT touch main.

**Action for owners (mouse + switch):** branch off the current develop, fix `Surface.Panelize.execute`/`panelizeSurface` so the node-graph `Panels`/`Corners` outputs resolve to the per-panel arrays (the kernel function is already correct — the gap is in how the node returns/exposes the multi-output through `computeNodeValue`), confirm `npm run test:e2e tests/e2e/surface-paneling.spec.js` goes green, then re-request integration.
