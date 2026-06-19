---
id: TICK-015
title: Surface.PointAtParameter — rename of Surface.PointAtUV (points on a surface at U,V)
status: done
priority: medium
type: feature
sprint: A3
created: 2026-06-18
completed: 2026-06-19
lanes: geometry, ui
branch: feat/tick-015-surface-pointatparameter
---

## Summary

Sprint A3 item 2. **PM DECISION (2026-06-18, authoritative):** *"Rename the Surface.PointAtUV
to Surface.PointAtParameter. Make sure the Surface.PointAtParameter returns points on the surface
visible with 3D environment."*

So this is a **rename**, not a new node. Nova already ships `Surface.PointAtUV`
(`src/nodes/categories/surfaces.js`, Surfaces → Evaluate, inputs `Surface` + `u` + `v` →
output `Point`, backed by `Geo.pointAtUV`). We rename it to `Surface.PointAtParameter` — the
single canonical node — preserve backward compatibility for graphs saved against the old
`Surface.PointAtUV` type, and verify the output point renders as real visible geometry in the 3D
viewport.

This mirrors the curve world, which already has one `Curve.PointAtParameter` and no
`Curve.PointAtUV`.

## Problem definition

- The node is currently named `Surface.PointAtUV`; the PM wants the canonical name
  `Surface.PointAtParameter` for consistency with `Curve.PointAtParameter`.
- A bare rename of the `type` string would break every saved graph that references
  `Surface.PointAtUV` (its node-id and its persisted instances).
- The PM explicitly wants the result to be a **real point visible in the 3D viewport**, not an
  opaque/`[object Object]`/`NaN`/`undefined` value.

The backward-compat path is already established in this repo (the `Custom.Formula` →
`Custom.CodeBlock` rename, `src/nodes/categories/custom.js`): the new canonical def carries the
old ids in `aliases`, and a deprecated stub of the old `type` carries `metadata.deprecated: true`
+ `metadata.migrateTo` so the generic load-time hook in `src/app/save-load.js` rewrites old saved
instances to the new type. **Follow that exact pattern** — no new migration mechanism is needed.

## Acceptance criteria

> Final, PM-approved (2026-06-18). Supersedes the earlier draft "duplication flag" ACs.
>
> **Verification status (run 2026-06-18, re-verified by orchestrator):** all ACs are verified by
> green tests on commit `f4304a2`/`f2ce9ab`. The earlier "repo-wide vitest runner failure" was a
> **misdiagnosis** — the `Not implemented: HTMLCanvasElement.getContext()` lines are benign jsdom
> stderr noise, not test failures. Confirmed: `npm run test` on the base = 1915 pass / 1 skip / 0
> fail; the two TICK-015 unit files = **65 pass**; `npm run lint:all` = 0 errors; `npm run build` =
> green; E2E AC-5 = 5 pass / 1 skip / 0 fail. Commits still live on the isolated worktree branch and
> are **not yet merged** — dozer must consolidate onto `feat/tick-015-…`, reconcile `surfaces.js`
> against TICK-014, and Oracle must review before the ticket archives.

- [x] AC-1  The node library shows exactly **one** surface point-at-parameter node, named
      `Surface.PointAtParameter` (inputs Surface + u + v → output Point). No `Surface.PointAtUV`
      node appears as a separate, selectable library entry. — node-registry assertion.
      _Verified: surface-pointatparameter.test.js + library-reorg.test.js (65 pass on f4304a2)._
- [x] AC-2  Searching the node library for **"PointAtUV"** still finds the node (the old id
      resolves via alias), and searching **"PointAtParameter"** finds it — verified in
      node-library search. No duplicate node is introduced.
      _Verified: alias resolution asserted in surface-pointatparameter.test.js (green)._
- [x] AC-3  A graph **saved with the old `Surface.PointAtUV` type** loads without error and the
      instance resolves/migrates to `Surface.PointAtParameter`, preserving its u/v values and its
      wires (Surface in, Point out). — unit test on the load-time migration/alias path.
      _Verified: deprecated stub + metadata.migrateTo; load-time migration test green (no
      runner failure — that blocker was a misdiagnosis of jsdom canvas stderr noise)._
- [x] AC-4  `Surface.PointAtParameter` takes Surface + u + v and outputs the point on the surface
      at (u, v) as a real `Geo.Point3` — `Output.Watch` shows readable coordinates, never
      `[object Object]`, `NaN`, or `undefined`. Its `help.example` is a complete
      `Surface.ByPatch` (or Dini) → `Surface.PointAtParameter` → `Output.Watch` workflow that runs
      and produces a defined, readable point.
      _Verified: real Geo.Point3 with finite coords asserted in unit tests (green) + E2E AC-5._
- [x] AC-5  Wiring `Surface.ByPatch` → `Surface.PointAtParameter` → the viewport renders a
      **visible point on the surface** in the 3D environment (a real Point3 added to the scene),
      asserted by a Playwright E2E spec.
      _Verified: tests/e2e/surface-pointatparameter.spec.js (T15b, commit f2ce9ab) — the point
      renders as a visible SphereGeometry mesh with non-zero vertex count on the surface; e2e
      5 pass / 1 skip / 0 fail._
- [x] AC-6  `npm run lint:all` → 0 errors, `npm run test` → all pass (no regression), `npm run
      build` → green, and `npm run test:e2e` → the new spec passes.
      _Verified on f4304a2: lint:all 0 errors; npm run test green (1915 base + 65 ticket, 0 fail);
      build ✓; test:e2e 5 pass/1 skip/0 fail. No runner failure existed._

## Testing gate

- Node registry assertion: AC-1, AC-2
- Unit test (Vitest): AC-2 (alias resolve), AC-3 (saved-graph migration), AC-4 (point is a real Point3)
- E2E (Playwright): AC-5 (point renders visibly in the 3D viewport)
- Build/lint/test gate: AC-6
- Manual browser: AC-1 (one node), AC-2 (search both names), AC-4 (example runs)

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/tick-015-surface-pointatparameter`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Search the node library for "PointAtParameter" and for "PointAtUV" — both find the one node.
4. Wire `Surface.ByPatch` → `Surface.PointAtParameter` (u=0.5, v=0.5) → `Output.Watch` → confirm a
   readable Point3 (real coordinates).
5. Add the node to the viewport and confirm a visible point sits on the surface.
6. Load a graph saved with the old `Surface.PointAtUV` node → confirm it opens and computes.
7. `npm run lint:all && npm run test && npm run build && npm run test:e2e`.

## Definition of done

- [x] All AC above are checked `[x]`
- [x] `npm run lint:all` → 0 errors
- [x] `npm run test` → all pass
- [x] `npm run build` → green
- [x] E2E spec covers AC-5 (point renders in 3D)
- [x] Backward compatibility for old `Surface.PointAtUV` saved graphs verified (alias + migrate)
- [x] No functional duplicate node shipped (exactly one node)
- [x] Oracle has reviewed and issued APPROVE verdict (after F-015-1 alias + F-015-2 search-alias fixes, commit 1e0a6be)
- [x] dozer has reconciled `src/nodes/categories/surfaces.js` between TICK-014 and TICK-015 at merge (2026-06-18 — clean 3-way auto-merge, both the panelize import+append and the PointAtParameter rename+stub preserved)
- [x] Merged to `develop` (cherry-picked f4304a2+1e0a6be+f2ce9ab → develop, local), workboard row released, INDEX.md updated. Branch deletion + push held pending PM confirmation (no push this run).

## Task briefs

- [T15a](../task-briefs/T15a-surface-pointatparameter-rename.md) — geometry (mouse): rename node
  + alias + migrateTo stub + help.example + unit/migration tests.
- [T15b](../task-briefs/T15b-pointatparameter-3d-e2e.md) — ui (switch): Playwright E2E that the
  output point renders visibly in the 3D viewport.

## Run comments

<!-- Agents write here. REPLACED every run — old content deleted, not appended. -->

**Run 2026-06-19 — ARCHIVED. PM approved ("Tck 14-15 is completed. Move them to done.").**

- Status: ✅ done. All 6 ACs `[x]`, merged to develop, Oracle APPROVE. Moved to `docs/tickets/done/`.
- Issue: null — rename delivered as the PM specified.
- Changed (truthful summary of what shipped on develop):
  - Renamed `Surface.PointAtUV` → canonical `Surface.PointAtParameter` (Surfaces → Evaluate; inputs Surface + u + v → output Point; kernel `pointAtUV` unchanged). Exactly one selectable node ships.
  - Backward compatibility via the proven `Custom.Formula → Custom.CodeBlock` pattern: aliases on the canonical def so old node-ids and search resolve, plus a hidden deprecated `Surface.PointAtUV` stub with `metadata.deprecated` + `metadata.migrateTo` so old saved graphs migrate at load (u/v + wires preserved).
  - Oracle fixes folded in (F-015-1 alias completeness, F-015-2 search-alias so searching "PointAtUV" still surfaces the node).
  - Viewer fixes from live PM verification (not separately ticketed) that make the output point reliably visible: show all geometry on Run (dropped intermediate auto-hide), `buildFromGraph` renders multi-output nodes (split-mode Run refresh), camera auto-fits once instead of on every re-render, and points render as small flat dots rather than 3D spheres.
- Validation (full gate, green on develop tip ~8300cbb): `npm run lint:all` 0 errors; `npm run test` ~1975 pass / 0 fail; `npm run build` green; `npm run test:e2e` ~53 pass / 0 fail (`surface-pointatparameter.spec.js` asserts the point renders visibly on the surface in 3D — AC-5).
- Correction to prior run notes: the earlier "repo-wide vitest runner broken" blocker was a **misdiagnosis** — the `HTMLCanvasElement.getContext()` lines were benign jsdom stderr noise, not failures. The suite runs clean. That narrative is void.
- Note: changes live on develop locally; push/main per PM cadence (not part of this archive run).
