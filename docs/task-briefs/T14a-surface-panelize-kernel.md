# T14a — Surface.Panelize kernel + Input.PanelShapes (geometry)

**Parent ticket:** [TICK-014](../tickets/TICK-014.md) — Surface paneling — Surface.Panelize + Input.PanelShapes
**Lane:** geometry (mouse)
**Branch:** `feat/tick-014-surface-paneling` (shared ticket branch — coordinate commits with T14b; you own different files)
**Agent (subagent_type):** mouse

## Goal

Add the two new nodes that make up the paneling feature:

1. **`Input.PanelShapes`** — a shape-source node in the **Input** category with a dropdown
   widget. Options (at minimum): `Diagonal`, `Rectangle`, `Square`, `Hexagon`, `Circle`.
   Single output `Shape` = a closed polygon / curve (unit-sized, centred on origin) for the
   selected option.
2. **`Surface.Panelize`** — a paneling node in the **Surfaces** category that tiles a surface
   with the unit shape across its UV domain and returns the per-panel geometry.

### Inputs / outputs (reconcile the ticket — read carefully)

The TICK-014 **Summary** says the full input set is **Surface, Panel Shape, U, V, Scale**, and
that **Scale is also a Property**. The AC list (the binding contract) names Surface/Shape/Scale
and outputs Panels/Corners/Center. Honor BOTH: implement the full input set.

`Surface.Panelize` inputs:
- `surface` (mesh) — the surface to clad. Real producers: `Surface.ByPatch`, `Surface.ByPointGrid`.
- `shape` (curve/polygon) — the unit panel shape. Real producer: `Input.PanelShapes` (and any closed curve).
- `u` (number, default e.g. 4) — number of panel cells along the U direction.
- `v` (number, default e.g. 4) — number of panel cells along the V direction.
- `scale` (number property + input, default 1.0) — scales each panel shape within its cell
  (1.0 ≈ fills the cell; <1 leaves gaps; >1 overlaps). Expose `scale` as BOTH a `controls`
  property (so it shows in the inspector) and a wireable input.

`Surface.Panelize` outputs (exactly these three, in this order):
- `panels` (mesh[]) — one panel surface per cell.
- `corners` (point[][]) — corner points grouped per panel (one group per panel).
- `center` (point[]) — one centre point per panel; `center.length === panels.length`.

## Owned paths (you may create/edit ONLY these)

- `src/geometry/nodes/Surface.Panelize.js` — NEW. The Panelize node def + pure paneling logic.
  Mirror the structure of the existing `src/geometry/nodes/Surface.Trim.js` (a node object
  exported and spread into `surfacesNodes`).
- `src/geometry/nodes/Input.PanelShapes.js` — NEW. The shape-source node def + unit-shape geometry.
- `src/geometry/panel-shapes.js` — NEW (optional). Pure helpers that build each unit shape
  (square, hexagon, circle, diagonal, rectangle) as a closed point loop, if you want the shape
  math separate from the node def. Reuse `Geo.*` (Point3, Vector3) and existing
  `src/geometry/surface-eval.js` (`pointAtUV`, `frameAtUV`, `divideSurface`) — do NOT
  reimplement surface evaluation.
- `src/nodes/categories/surfaces.js` — ONE-LINE-class touch only: add the
  `import { surfacePanelizeNode } from '../../geometry/nodes/Surface.Panelize.js';` and add
  `surfacePanelizeNode` to the `surfacesNodes` array (next to `surfaceTrimNode` at line ~1281).
  Do not refactor anything else in this file.
- `src/nodes/categories/input.js` — add `Input.PanelShapes` to the Input category. If you keep
  the shape def in `Input.PanelShapes.js`, import + push it; otherwise inline it following the
  `Input.Boolean` dropdown pattern (`{ id, type: 'dropdown', options: [...], default, label }`).
- `tests/geometry/surface-panelize.test.js` — NEW. Vitest unit tests (see Merge checklist).
- `tests/geometry/panel-shapes.test.js` — NEW (or fold into the above). Shape-selection tests.

## Do NOT touch

- `src/viewer/**`, `src/ui/**` — that is T14b (switch). You do not render anything.
- `tests/e2e/**` — Playwright is T14b.
- Any other node category file, `src/core/**`, `src/main.js`, `src/app/**`.
- The hot files list (you are NOT touching `node-library.js` or `node-renderer.js`).

## Interface contract (T14a ↔ T14b)

T14b (viewport/E2E) consumes your nodes as black boxes via the graph. The contract it relies on:

- Node types are exactly `Input.PanelShapes` and `Surface.Panelize`.
- `Surface.Panelize.execute(context, inputs)` returns `{ panels, corners, center }` where
  `panels` is an array of mesh objects the existing viewer already knows how to render
  (same mesh shape `Surface.ByPatch` emits — so the viewport needs NO new render path).
- `Input.PanelShapes.execute(...)` returns `{ shape }` — a closed curve/polygon object of the
  same kind existing curve nodes emit (so it can be watched and wired).
- `panels.length > 1` for a multi-cell surface (u>1 or v>1).

If you cannot reuse the existing mesh/curve output shape and a new render path is genuinely
needed, STOP and flag it in your JSON `gaps` — do not silently invent a shape T14b can't draw.

## Node standards (enforced — ARCHITECTURE.md §4)

- Naming: `Input.PanelShapes`, `Surface.Panelize` (ParentName.NodeName). Panelize is an
  operation, not a `By*` creation node — `Surface.Panelize` is correct.
- Fold into EXISTING categories (Input, Surfaces). No new/parallel categories.
- Icons are Unicode glyphs/symbols — NOT text. Suggested: `Input.PanelShapes` ⬡ (or ▦),
  `Surface.Panelize` ▦ (grid). Never a text abbreviation.
- `help.example` for EACH node must be a complete, RUNNING workflow:
  `Input.PanelShapes` → `Surface.Panelize` ← `Surface.ByPatch` → `Output.Watch`, producing
  visible panels — never `[object Object]`, `undefined`, or `NaN`. Verify by running, don't assume.
- No duplicate nodes: confirmed there is no existing paneling node in the modern library
  (legacy `Pattern.FacadePanels` was removed in TICK-005; do not resurrect it). `panel-frames.js`
  already has `panelFrames`/`panelPlanarity` helpers — reuse them for the centre/normal of a
  panel if useful rather than re-deriving.

## Merge checklist (AC references)

- [ ] **AC-1** — `Input.PanelShapes` in Input category; dropdown options include Diagonal,
      Rectangle, Square, Hexagon, Circle; single `Shape` output. (registry assertion / unit test)
- [ ] **AC-2** — Changing the dropdown changes the `Shape` (square=4 corners, hexagon=6, circle
      closed, etc.). Covered by `panel-shapes.test.js` (assert corner/segment count per option).
- [ ] **AC-3** — `Surface.Panelize` in Surfaces category; inputs include Surface, Shape, Scale
      (plus U, V per Summary); outputs exactly Panels, Corners, Center. (registry assertion)
- [ ] **AC-4** — `Surface.ByPatch` + Square shape → Panelize yields `panels.length > 1` for a
      multi-cell surface. Unit test asserts panel count > 1.
- [ ] **AC-5** — `center.length === panels.length`; `corners` grouped per panel; each centre
      lies inside its panel corner bounds. Unit test.
- [ ] **AC-6** — Changing `scale` re-scales panels: corner spread scales with the Scale param.
      Unit test asserts a larger scale → larger corner spread (and gaps at small scale).
- [ ] **AC-7** — Each node's `help.example` is a complete producer→focal→consumer graph that
      runs and produces a non-`[object Object]`/`NaN` result. Verify by executing the example.
- [ ] **AC-8** — `npm run test` passes with no regressions; new tests cover AC-2/4/5/6.

## Validation before any push (RULES.md §5)

```bash
npm run lint:all
npm run test
npm run build
```

You are geometry-only (no `src/ui` / `src/viewer` in your files), so `playwright_tested` may be
`false` in your JSON — but T14b owns the Playwright spec for the UI-gated ACs (AC-4/AC-6/AC-7).
Coordinate: your kernel must be merged/visible to T14b's E2E. Since you share the branch, commit
your node files first so T14b's spec can drive them.

## Required output

Return the structured JSON from RULES.md §10 (ticket `TICK-014`, branch
`feat/tick-014-surface-paneling`). Then overwrite `## Run comments` in TICK-014.md with your
human-readable summary (T14b will append its own; do not delete T14b's section if it ran first).
