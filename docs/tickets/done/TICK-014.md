---
id: TICK-014
title: Surface paneling — Surface.Panelize + Input.PanelShapes
status: done
priority: high
type: feature
sprint: A3
created: 2026-06-18
completed: 2026-06-19
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
- [x] AC-4  Wiring a `Surface.ByPatch` (or `Surface.ByPointGrid`) into `Surface.Panelize` with a `Square` shape from `Input.PanelShapes` produces multiple panel surfaces tiled across the surface, all visible in the 3D viewport (more than one panel for a surface larger than one panel cell). — verified: E2E `surface-paneling.spec.js:101` asserts >1 panel mesh rendered (now green on develop). The earlier "got 1 panel" failure was a TEST bug (it read `pan._outputs`; the engine stores multi-output in `pan._portValues[outputId]`, which is exactly how a wired port resolves — see engine.js getInput). Fixed the spec to read `_portValues`; kernel + real wired path were always correct.
- [x] AC-5  The `Corners` output returns the corner points for each panel (one group of corner points per panel), and the `Center` output returns one centre point per panel; the number of centre points equals the number of panels, and each centre lies inside its panel's corner bounds. — unit test asserts `Center` length == `Panels` length and `Corners` is grouped per panel. (T14a, surface-panelize.test.js:101-133)
- [x] AC-6  Changing the `Scale` value re-scales each panel shape on the surface (smaller Scale → smaller panels with gaps; larger Scale → larger panels), observable as a change in panel size in the viewport and a change in the corner-point spread in the output. — verified: E2E `surface-paneling.spec.js:196` asserts larger Scale yields a larger corner spread (now green; same `_portValues` test-read fix as AC-4).
- [x] AC-7  `Surface.Panelize` and `Input.PanelShapes` each have a `help.example` sample graph that is a complete workflow: `Input.PanelShapes` → `Surface.Panelize` ← `Surface.ByPatch` → `Output.Watch`, and running it produces visible panels in the Watch output (not `[object Object]`, `undefined`, or `NaN`). — verified: E2E help-example test (`surface-paneling.spec.js:299`) runs each node's example through `Output.Watch` and asserts a real value (green on develop).
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

- [x] All AC above are checked `[x]`
- [x] `npm run lint:all` → 0 errors
- [x] `npm run test` → all pass (1966 pass / 1 skip / 0 fail)
- [x] E2E spec covers UI-gated ACs (surface-paneling.spec.js: AC-4/AC-6/AC-7 — 5 pass / 0 fail)
- [x] Oracle has reviewed and issued APPROVE verdict (TICK-014, 2026-06-18)
- [ ] Merged to `develop` (cherry-picked onto local develop, green) — branch deletion + push held pending PM confirmation; workboard row released; INDEX.md updated

## Task briefs

- [T14a](../task-briefs/T14a-surface-panelize-kernel.md) — geometry (mouse): Input.PanelShapes shape source + Surface.Panelize kernel + node registration + unit tests.
- [T14b](../task-briefs/T14b-panelize-viewport-e2e.md) — ui (switch): viewport rendering verification + Playwright E2E spec for AC-4/AC-6/AC-7.

## Run comments

<!-- Agents write here. REPLACED every run — old content deleted, not appended. -->
<!-- This section feeds directly into the Coordinator Response in docs/PM.md.   -->

**Run 2026-06-19 — ARCHIVED. PM approved ("Tck 14-15 is completed. Move them to done.").**

- Status: ✅ done. All 8 ACs `[x]`, merged to develop, Oracle APPROVE. Moved to `docs/tickets/done/`.
- Issue: null — feature delivered as specified.
- Changed (truthful summary of what shipped on develop):
  - New `Input.PanelShapes` node (Input category, dropdown shape source) with options Diagonal / Rectangle / Square / Hexagon / Circle, single `Shape` output (closed polygon/curve per selection).
  - New `Surface.Panelize` node (Surfaces category) — inputs Surface / Shape / U / V / Scale (Scale also a control property); outputs `Panels` (panel surfaces), `Corners` (per-panel corner points), `Center` (one centre per panel). Tiles a unit shape across the surface UV domain; panels render through the existing `Geo.addToScene` mesh path (no new render path).
  - Post-merge improvements from live PM verification (not separately ticketed): the `Surface.ByPatch` bilinear-bbox UV parametrization so a uniform u×v grid fills the patch interior instead of polar spokes (improves how panels distribute), and gap-free tessellations — hexagon honeycomb and diamond — so panels tile without gaps/overlap.
- Validation (full gate, green on develop tip ~8300cbb): `npm run lint:all` 0 errors; `npm run test` ~1975 pass / 0 fail; `npm run build` green; `npm run test:e2e` ~53 pass / 0 fail (`surface-paneling.spec.js` covers AC-4 panel count visible, AC-6 Scale spread, AC-7 help examples run).
- Correction to prior run notes: the earlier "repo-wide vitest runner broken" blocker was a **misdiagnosis** — the `HTMLCanvasElement.getContext()` lines were benign jsdom stderr noise, not failures. The suite runs clean. That narrative is void.
- Note: changes live on develop locally; push/main per PM cadence (not part of this archive run).
