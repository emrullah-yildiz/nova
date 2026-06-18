# T14b — Panelize viewport rendering + Playwright E2E (UI)

**Parent ticket:** [TICK-014](../tickets/TICK-014.md) — Surface paneling — Surface.Panelize + Input.PanelShapes
**Lane:** ui (switch)
**Branch:** `feat/tick-014-surface-paneling` (shared ticket branch — T14a lands the nodes first)
**Agent (subagent_type):** switch

## Goal

Make the new paneling nodes (built by T14a) work end-to-end in the browser and prove it with a
Playwright E2E spec. Two responsibilities:

1. **Viewport verification.** Confirm `Surface.Panelize`'s `panels` output renders as multiple
   visible panel surfaces in the 3D viewport, and that the `Input.PanelShapes` dropdown renders
   correctly in the node UI. T14a is reusing the existing mesh output shape, so **you should NOT
   need a new render path** — verify that, and only add a viewport hook if panels genuinely don't
   draw. If a new render path is needed, that is the surprise to flag, not to silently build big.
2. **Playwright E2E spec.** A new spec that drives the full workflow in a real browser and
   asserts the UI-gated ACs (AC-4 panels tile + visible, AC-6 Scale changes panel size, AC-7 the
   help example runs and shows panels in Watch).

## Owned paths (you may create/edit ONLY these)

- `tests/e2e/surface-paneling.spec.js` — NEW. The Playwright spec (see Merge checklist).
- `src/viewer/viewer3d.js` — ONLY if panels genuinely fail to render with the existing path.
  Smallest possible change; if you touch it, document why in your JSON `changed`. Prefer to NOT
  touch it (T14a reuses the `Surface.ByPatch` mesh shape, which already renders).
- `src/ui/mini-canvas.js` is OFF LIMITS (owned by an active TICK-007 claim) — do not touch it.

## Do NOT touch

- `src/geometry/**`, `src/nodes/categories/**` — those are T14a (mouse). You do not define nodes.
- `src/ui/mini-canvas.js`, `scripts/take-learning-shots.js`, `public/learning/**` — active TICK-006/007 claims.
- Hot files: `src/ui/node-renderer.js`, `src/core/node-library.js`, `src/main.js`,
  `src/app/app.js` — do not lock or edit. The dropdown widget already exists (Input.Boolean
  pattern); it renders through existing infra, so no node-renderer change should be needed.

## Interface contract (T14a ↔ T14b)

You consume T14a's nodes as black boxes through the graph:
- Node types: `Input.PanelShapes` (output `Shape`), `Surface.Panelize` (inputs Surface, Shape,
  U, V, Scale; outputs `Panels`, `Corners`, `Center`).
- `Panels` is an array of mesh objects identical in shape to `Surface.ByPatch` output, so the
  existing viewer renders them with no new path.
- Wait until T14a has committed the node files on the shared branch before writing assertions
  that depend on the exact port ids.

## STYLE / standards

- Any UI you assert on follows [STYLE.md](../STYLE.md) — but you are mostly verifying, not
  building new UI. The dropdown reuses the existing widget styling.
- E2E spec follows the existing `tests/e2e/*.spec.js` conventions (selectors, node-add helpers).

## Merge checklist (AC references)

- [ ] **AC-4** — E2E: add `Surface.ByPatch` + `Input.PanelShapes` (Square) → `Surface.Panelize`
      → `Output.Watch`; assert more than one panel mesh is present/visible in the viewport for a
      multi-cell surface.
- [ ] **AC-6** — E2E: change the `Scale` value; assert the rendered panel size / corner spread
      changes (smaller scale → smaller panels with gaps; larger → bigger). Assert observable diff.
- [ ] **AC-7** — E2E or manual-in-spec: open each node's help example, run it, assert the Watch
      output shows panels (not `[object Object]`/`undefined`/`NaN`).
- [ ] Viewport: panels render as multiple distinct surfaces (screenshot or DOM/scene assertion).

## Validation before any push (RULES.md §5)

```bash
npm run lint:all
npm run test
npm run build
npx playwright install chromium   # once
npm run test:e2e
```

Because your `files_changed` includes `tests/e2e/**` (and possibly `src/viewer/**`),
`playwright_tested` **MUST be `true`** and `playwright_result` must be a non-empty pass string in
your JSON (the SubagentStop hook enforces this).

## Sequencing

T14a must commit the node defs first (you can't drive nodes that don't exist). Since you share
the branch: pull/rebase after T14a commits, then write and run the spec. If you start before
T14a's nodes exist, scaffold the spec structure but do not finalize port-id assertions.

## Required output

Return the structured JSON from RULES.md §10 (ticket `TICK-014`, branch
`feat/tick-014-surface-paneling`, `playwright_tested: true`). Then append your run summary to
`## Run comments` in TICK-014.md (do not delete T14a's section).
