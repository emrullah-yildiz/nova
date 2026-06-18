# Nova — PM

> **This is the only file you edit.** Never touch ticket files, ARCHITECTURE.md, RULES.md, or any other doc directly.
>
> **How to use:**
> - Edit the **Sprint** section when goals change.
> - Before saying `run` in chat: write what you want this run in `### Planning` (replace the old text).
> - To approve a completed ticket: write `APPROVE TICK-NNN` in Planning.
> - Morpheus reads this file, acts, and writes the result into `### Coordinator Response`.

---

## Sprint A3

1. Create Surface paneling nodes. Surface.Panelize -> Inputs: Surface and Panel shape. This node can divide surface into multiple panels based on the given shape. The shape can be any polygon or closed curve. The properties of this node should include scale parameter to scale the shape onto surface. there should be a supportive node with premade shapes likes diagonal, rectangle, square, hexagon, circle etc. The node should be called Input.PanelShapes. It should include a dropdown with different premade panel shapes. The output of the node should give surfaces of panels, corner points of each panel and centre point of panels. 
2. Create Surface.PointAtParameter node to create points on the surface. The inputs are Surface, U and V values. 
   

## Backlog

- TICK-006 — Learning page screenshots (content-aligned, all 20 slots match chapter text).
- TICK-007 — Learning page interactive exercises (pan/zoom mini-canvas, drag-wire UX, real nodes).
- Accounts & collaboration Phase 0 — platform port (Node → workerd, Neon crypto).
- R2 storage for large mesh artifacts.
- Mobile layout — out of scope until collab ships.
- Select Edges can select mesh edges with similar behaviour of Select Faces node.

---

## Product constraints

- No features that require Rhino to test — host and Rhino nodes stay legacy.
- Every design follows STYLE.md.
- Nova geometry only for Select nodes — no Revit/Rhino element picking.
- Every UI change ships with a Playwright spec.
- Agents never merge to `main` without explicit PM instruction.

---

## Run Session

### Planning
- Tck 12-13 is completed. Move them to the done.
- Create tickets for the new sprint A3 requirements.


### Coordinator Response

```json
{
  "run": "2026-06-18",
  "tickets_actioned": [
    {
      "id": "TICK-015",
      "title": "Surface.PointAtParameter — rename of Surface.PointAtUV (points on a surface at U,V)",
      "status": "in-progress",
      "issue": "Prior draft flagged Surface.PointAtUV as a functional duplicate. PM resolved it: this is a RENAME, not a new node.",
      "changed": [
        "Ticket rewritten — draft 'duplication flag' ACs replaced with FINAL approved ACs: rename Surface.PointAtUV -> Surface.PointAtParameter (single canonical node, no duplicate), backward-compat alias + migrateTo stub for old saved graphs, and the explicit 3D-viewport visibility requirement. Status draft -> in-progress; branch feat/tick-015-surface-pointatparameter.",
        "Decomposed into 2 disjoint briefs: T15a (mouse, node rename + alias + migration + unit tests) and T15b (switch, Playwright E2E that the output point renders visibly in 3D). Dispatched in parallel on isolated worktrees.",
        "T15a (mouse, commit f4304a2): in src/nodes/categories/surfaces.js renamed the canonical def to type/name Surface.PointAtParameter (icon •, kernel pointAtUV unchanged); added aliases ['surface-pointatuv','surface-pointat','Surface.PointAtUV','surface-pointatparameter'] so old ids + search resolve; added a deprecated stub type Surface.PointAtUV with metadata.deprecated + metadata.migrateTo {type:Surface.PointAtParameter, portMap:{surface,u,v,point}} so the GENERIC load-time hook in save-load.js migrates old instances (same pattern as Custom.Formula -> Custom.CodeBlock). help.example is now a full Point.Origin -> Circle.ByCenterRadius -> Surface.ByPatch -> Surface.PointAtParameter -> Output.Watch workflow. New tests/geometry/surface-pointatparameter.test.js (AC-1/2/3/4) + updated library-type refs in tests/library-reorg.test.js. lint 0, build green. Verified via direct node script: execute() returns a real Geo.Point3 with finite coords (NOT [object Object]/NaN), aliases resolve, migrateNodeType preserves u/v + remaps ports.",
        "T15b (switch, commit f2ce9ab): added tests/e2e/surface-pointatparameter.spec.js. Section A (kernel) builds Geo.surfaceByPatch -> Geo.pointAtUV -> Geo.addToScene and asserts the scene object is a real SphereGeometry mesh with non-zero vertex count (a VISIBLE point), the Point3 has finite x/y/z, and the point sits on the patch (UV spread active). e2e 5 pass / 1 skipped / 0 fail; lint 0, build green. viewer NOT touched.",
        "AC status: AC-1/AC-2/AC-3/AC-4 implemented + asserted by T15a (logic verified, but see blocker — the repo-wide vitest runner is currently broken so the unit suite could not be confirmed green by `npm run test`). AC-5 (3D visibility) verified GREEN by T15b's E2E (the point renders as a visible mesh). AC-6 partially: lint 0 + build green on both; e2e green; `npm run test` BLOCKED by the pre-existing runner issue.",
        "Not merged — dozer owns merges. Both contributions are on separate isolated worktrees and must be merged onto feat/tick-015-surface-pointatparameter."
      ],
      "how_to_test": [
        "After dozer merges T15a + T15b onto develop: git switch develop && git pull --ff-only",
        "npm run dev -> search the node library for 'PointAtParameter' AND for 'PointAtUV' — both find the ONE node Surface.PointAtParameter.",
        "Wire Point.Origin -> Circle.ByCenterRadius (r=5) -> Surface.ByPatch -> Surface.PointAtParameter (u=0.5,v=0.5) -> Output.Watch; confirm a readable Point3 (real coords, not [object Object]/NaN) and a visible point sitting ON the surface in the 3D viewport.",
        "Load a graph saved with the OLD Surface.PointAtUV node -> confirm it opens and migrates to Surface.PointAtParameter, u/v + wires preserved.",
        "npm run lint:all (0) && npm run build (green) && npm run test:e2e (surface-pointatparameter spec passes; its node-graph subtest flips from skip to active once the rename is on the shared branch). NOTE: npm run test is currently blocked repo-wide — see blockers."
      ]
    }
  ],
  "new_tickets": [],
  "agents_dispatched": [
    { "agent": "mouse", "brief": "T15a", "branch": "feat/tick-015-surface-pointatparameter", "result": "committed f4304a2 (worktree-agent-ab099060c9bbfa81b) — lint 0, build green; AC-1/2/3/4 written + verified via direct node script (real Geo.Point3, aliases resolve, migration preserves u/v); npm run test could NOT confirm green due to a pre-existing repo-wide vitest runner failure (not a TICK-015 regression — confirmed by morpheus: the untouched suite fails identically). Not merged." },
    { "agent": "switch", "brief": "T15b", "branch": "feat/tick-015-surface-pointatparameter", "result": "success — committed f2ce9ab (worktree-agent-a3708c8441009b723); lint 0, build green, e2e 5 pass/1 skip/0 fail. The output point RENDERS as a visible SphereGeometry mesh (non-zero vertices) on the surface — AC-5 satisfied. The 1 skipped test resolves the Surface.PointAtParameter node type and flips to active once T15a's rename merges. Not merged." }
  ],
  "planning_notes": [
    "BACKWARD COMPATIBILITY for old 'Surface.PointAtUV' graphs IS in place (T15a): old node-ids/search resolve via aliases on the canonical def, and old SAVED instances migrate to Surface.PointAtParameter via the deprecated stub's metadata.migrateTo + the existing generic load-time hook — the proven Custom.Formula -> Custom.CodeBlock pattern, no new mechanism added.",
    "EXACTLY ONE node ships (no functional duplicate): the single canonical Surface.PointAtParameter plus a hidden deprecated migration stub (not a selectable library entry).",
    "TICK-014 (Surface paneling) carried forward: still in-progress, both branches committed (T14a @7fef110, T14b @36991ee) and AWAITING DOZER MERGE. Its 4 E2E AC tests test.skip until both worktrees share the branch. Unchanged this run.",
    "TICK-011 (Cosign code signing) remains DRAFT, untouched — awaits APPROVE TICK-011 if the PM wants it built.",
    "MERGE-ORDER / CONFLICT for dozer: both TICK-014 and TICK-015 edit src/nodes/categories/surfaces.js on separate branches. dozer must reconcile surfaces.js at merge time — keep BOTH TICK-014's paneling additions AND TICK-015's renamed Surface.PointAtParameter def + deprecated stub."
  ],
  "blockers": [
    "REPO-WIDE TEST RUNNER BROKEN (pre-existing, NOT caused by TICK-015): `npm run test` (vitest run) currently fails to load 92 of 147 test files with 'Cannot read properties of undefined (reading config)' / 0 tests — only 499 tests in 55 files actually execute. morpheus confirmed the UNTOUCHED tests/geometry/surface-eval.test.js fails identically on the current checkout, so this is an environment/vitest-config regression independent of TICK-015 (the prior run's '1940 pass' no longer reproduces here). Consequence: T15a's unit tests are written and logic-verified by a direct node script but NOT confirmed green by the CI test gate. This needs a separate fix (likely a vitest/vite version or config issue) before any ticket's unit gate can be trusted — recommend a core/platform investigation ticket.",
    "TICK-015 not yet mergeable as-is: T15b's node-graph E2E subtest test.skips until T15a's rename is on the shared branch. dozer must merge BOTH worktrees (f4304a2 + f2ce9ab) onto feat/tick-015-surface-pointatparameter, reconcile surfaces.js against TICK-014, then re-run test:e2e so the skipped subtest flips to pass before Oracle review.",
    "TICK-014 still awaiting dozer merge (unchanged) — its 4 skipped paneling E2E tests must pass post-merge.",
    "TICK-011 still draft — awaiting APPROVE TICK-011 if desired."
  ]
}
```
