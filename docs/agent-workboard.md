# Agent Work Board — live concurrency claims

> **Claim before you code.** This is the live record of who owns what *right now*,
> so multiple agents never touch the same files. It is short-lived state — not a
> history log (that's [`agent-handoff.md`](agent-handoff.md)). Rules live in
> [`ENGINEERING.md`](ENGINEERING.md) §3.

## How to use it

1. Before your first edit, **add a row** to *Active claims* with your branch, the
   path globs you own, and any hot files you need to lock.
2. Your owned globs **must be disjoint** from every other active row. If they
   overlap, coordinate or pick different work.
3. To edit a **hot file** (list below), put it in your "Hot locks" cell. Only one
   active row may lock a given hot file at a time — if it's taken, wait or ask.
4. On merge, **delete your row** (release the claim).

## Hot files (one agent at a time)

`src/app/app.js` · `src/main.js` · `src/ui/node-renderer.js` ·
`src/core/node-library.js` · `worker/index.mjs` · `wrangler.toml` ·
root `README.md` · `docs/NOVA.md` · `.github/workflows/ci.yml`

## Active claims

| Branch | Agent | Task | Owned paths (globs) | Hot locks | Started | Status |
|---|---|---|---|---|---|---|
| chore/git-hooks | platform-engineer | Install Husky + lint-staged; pre-commit ESLint, pre-push vitest | `package.json`, `.husky/**`, `tests/` (only unclaimed test files), `src/app/**`, `src/ai/**`, `src/enterprise/**`, `src/integrations/**` (lint fixes only — never src/nodes/**, src/geometry/**, src/runtime/**, src/ui/**, src/viewer/** which are owned by other T branches) | — | 2026-06-05 | **merged** |
| fix/selection-mode-e2e | ui-engineer (switch) | T02a — TICK-002: Playwright E2E spec for Select.Faces/Edges/Points + bug fixes (AC-8 through AC-11 added 2026-06-05) | `tests/e2e/geometry-selection.spec.js`, `src/viewer/selection-mode.js` (fix-only), `src/viewer/geo-selector.js` (fix-only), `src/nodes/categories/geometry.js` (fix-only), `src/viewer/viewer3d.js` (fix-only) | — | 2026-06-05 | **active** |
| fix/selection-mode-e2e | ui-engineer (switch) | T02b — TICK-002: Fix AC-8 (per-face blue hover in geo-selector.js) + AC-9 (structured geometry output from approveSelection/node-renderer/geometry.js). Lint 0 errors, 1913 unit tests pass, build green. | `src/viewer/geo-selector.js`, `src/viewer/selection-mode.js`, `src/ui/node-renderer.js`, `src/nodes/categories/geometry.js`, `tests/geometry-selection.test.js` | `src/ui/node-renderer.js` | 2026-06-06 | **done** |
| chore/e2e-testing-gate | oracle (review) | TICK-003 oracle review — adversarial diff + AC check before merge verdict | read-only: all files on chore/e2e-testing-gate | — | 2026-06-05 | **active** |
| chore/e2e-infra | platform-engineer (link) | T03a — TICK-003: playwright.config.js + CI e2e job + pre-push hook + README Testing section | `playwright.config.js`, `.github/workflows/ci.yml`, `.husky/pre-push`, `README.md`, `package.json` | `.github/workflows/ci.yml`, `README.md`, `package.json` | 2026-06-05 | **merged** |
| chore/e2e-spec-audit | platform-engineer (link) | T03b — TICK-003: Audit all 5 E2E specs; fix failing specs; record AC-4 pass | `tests/e2e/nova-workflows.spec.js`, `tests/e2e/nova-learning.spec.js`, `tests/e2e/codeblock-node.spec.js`, `tests/e2e/run-modes.spec.js`, `tests/e2e/geometry-selection.spec.js` (read-only unless fixing) | — | 2026-06-05 | **merged** |
| feat/pattern-on-surface-geo | geometry-engineer (mouse) | T04a — TICK-004: CANCELLED — TICK-004 superseded by TICK-005; branch dead, row released | `src/geometry/geo-facade-panels.js`, `src/geometry/geo-voronoi.js`, `src/nodes/categories/patterns.js`, `tests/geometry/geo-facade-panels.test.js`, `tests/e2e/pattern-on-surface.spec.js` | — | 2026-06-05 | **released (TICK-004 cancelled)** |
| feat/pattern-on-surface-registry | core-engineer (neo) | T04c — TICK-004: CANCELLED — TICK-004 superseded by TICK-005; branch dead, row released | `src/core/node-library.js` | `src/core/node-library.js` | 2026-06-05 | **released (TICK-004 cancelled)** |
| feat/pattern-on-surface-viewer | ui-engineer (switch) | T04b — TICK-004: Viewer renders panel-object list as per-item scene objects + hover highlight | `src/viewer/viewer3d.js`, `src/viewer/geo-selector.js` | — | 2026-06-05 | **merged** |
| fix/codeblock-series | core-engineer | Fix CodeBlock DSL series shorthand bug + test | `src/runtime/codeblock-eval.js`, `src/runtime/codeblock-syntax.js`, `tests/codeblock-series.test.js` | — | 2026-06-05 | **merged** |
| fix/curve-point-extrapolate | geometry-engineer | Curve.PointAtParameter extrapolation beyond [0,1] + test | `src/nodes/categories/curves.js`, `src/geometry/curve-eval.js`, `tests/curves-node-results.test.js` | — | 2026-06-05 | **merged** |
| feat/geometry-selection | ui-engineer | Add Select.Faces/Edges/Points nodes with 3D selection mode + Approve/Cancel toolbar | `src/nodes/categories/geometry.js`, `src/viewer/geo-selector.js`, `src/viewer/selection-mode.js` (new), `src/viewer/viewer3d.js`, `src/ui/node-renderer.js`, `src/ui/node-library.js`, `tests/geometry-selection.test.js` | `src/ui/node-renderer.js` | 2026-06-05 | **merged** |
| feat/learning-examples | ui-engineer | Add simple+advanced examples with SVG illustrations to all 10 learning-page chapters | `src/ui/learning-page.js`, `tests/learning-page.test.js` | — | 2026-06-05 | **merged** |
| fix/learning-examples-style | ui-engineer (orchestrator) | Fix style mismatch: replace SVG diagrams with screenshot slots, align examples to design language | `src/ui/learning-page.js`, `style.css`, `tests/learning-page.test.js` | `style.css` | 2026-06-05 | **merged** |

| chore/remove-pattern-nodes | geometry-engineer (mouse) | T05a — TICK-005: Delete src/geometry/geo-facade-panels.js, geo-voronoi.js, src/nodes/categories/patterns.js; remove Pattern imports from node-library.js; delete T04a/T04b/T04c briefs; grep confirms zero Pattern.* refs | `src/geometry/geo-facade-panels.js`, `src/geometry/geo-voronoi.js`, `src/nodes/categories/patterns.js`, `src/core/node-library.js`, `docs/task-briefs/T04a-pattern-geometry.md`, `docs/task-briefs/T04b-pattern-viewer.md`, `docs/task-briefs/T04c-pattern-registry.md` | `src/core/node-library.js` | 2026-06-05 | **queued** |
| chore/remove-pattern-nodes | core-engineer (neo) | T05b — TICK-005: Delete tests/voronoi-bounds.test.js, tests/facade-panels-on-surface.test.js, tests/panel-frames-node.test.js, tests/geometry/geo-facade-panels.test.js, tests/e2e/pattern-on-surface.spec.js; confirm npm run test + test:e2e pass | `tests/voronoi-bounds.test.js`, `tests/facade-panels-on-surface.test.js`, `tests/panel-frames-node.test.js`, `tests/geometry/geo-facade-panels.test.js`, `tests/e2e/pattern-on-surface.spec.js` | — | 2026-06-05 | **queued** |
| feat/learning-screenshots | ui-engineer (switch) | T06a — TICK-006: SUPERSEDED by T06b | — | — | 2026-06-05 | **superseded** |
| feat/learning-screenshots | ui-engineer (switch) | T06b — TICK-006: Write scripts/take-learning-shots.js — Playwright script that programmatically builds all 20 learning example graphs, screenshots the canvas area for each, saves to public/learning/<slot-id>.png ≤400 KB; add `screenshots:learning` npm script | `scripts/take-learning-shots.js`, `public/learning/*.png`, `package.json` | — | 2026-06-06 | **active** |
| feat/learning-exercises | core-engineer (neo) | T07a — TICK-007: Create src/ui/learning-exercises.js with 10 exercise definitions (node list, pre-drawn wires, expected output, acceptance function); write Vitest unit tests (≥20 cases) in tests/learning-exercises.test.js | `src/ui/learning-exercises.js`, `tests/learning-exercises.test.js` | — | 2026-06-05 | **queued** |
| feat/learning-exercises | ui-engineer (switch) | T07b — TICK-007: Build src/ui/mini-canvas.js (self-contained mini-canvas component; wire drawing; submit with pass/fail feedback); integrate into src/ui/learning-page.js; add mini-canvas styles to style.css. Depends on T07a merge. | `src/ui/mini-canvas.js`, `src/ui/learning-page.js`, `style.css` | — | 2026-06-05 | **blocked (awaits T07a merge)** |
| feat/learning-exercises | ui-engineer (switch) | T07c — TICK-007: Write tests/e2e/learning-interactive.spec.js — open overlay → ch01 → draw wire → Submit → assert green success + Next enabled. Depends on T07a + T07b merge. | `tests/e2e/learning-interactive.spec.js` | — | 2026-06-05 | **blocked (awaits T07a + T07b merge)** |

| fix/tick-002-face-mesh-hover | ui-engineer (switch) | T02d — TICK-002: Fix Select.Faces (1) per-face blue hover highlight in geo-selector.js mousemove; (2) Approve output returns real THREE.Mesh geometry data (vertexCount + vertices array), not FaceSelection descriptor. Update unit tests + E2E spec assertions. | `src/viewer/geo-selector.js`, `src/viewer/selection-mode.js`, `src/ui/node-renderer.js`, `src/nodes/categories/geometry.js`, `tests/geometry-selection.test.js`, `tests/e2e/geometry-selection.spec.js` | `src/ui/node-renderer.js` | 2026-06-07 | **queued** |
| fix/tick-006-screenshot-math-inputs | ui-engineer (switch) | T06c — TICK-006: Fix buildMathSimple + buildMathAdvanced in scripts/take-learning-shots.js so Math chapter examples show all input nodes wired and Output.Watch displays a computed result. Sweep all 20 slots for same CodeBlock timing bug. Regenerate affected PNGs. | `scripts/take-learning-shots.js`, `public/learning/math-simple.png`, `public/learning/math-advanced.png` | — | 2026-06-07 | **queued** |
| fix/tick-007-mini-canvas-real-nodes | ui-engineer (switch) | T07d — TICK-007: Fix mini-canvas (1) node visuals match real Nova canvas (--node-color CSS var, dark background, accent border-top); (2) pending wire tracks cursor correctly using SVG-relative coordinates. Update E2E spec if needed. | `src/ui/mini-canvas.js`, `style.css`, `tests/e2e/learning-interactive.spec.js` | — | 2026-06-07 | **merged 2026-06-07** |
| fix/tick-002-selection-interaction | ui-engineer (switch) | T02e — TICK-002: Fix full selection interaction model: (1) hover→face turns blue (#89b4fa) with material.needsUpdate; (2) click face→count+1; (3) multi-click increments per face; (4) click empty viewport→clearSelectionModeItems() resets to 0; (5) re-click selected face→deselect count-1. Add clearSelectionModeItems export to selection-mode.js. | `src/viewer/geo-selector.js`, `src/viewer/selection-mode.js`, `tests/e2e/geometry-selection.spec.js` | — | 2026-06-07 | **queued** |
| fix/tick-006-screenshot-viewport | ui-engineer (switch) | T06d — TICK-006: (A) VIEWPORT→1280×720, app.fitAll() before screenshot; (B) fixed code-terminal-advanced (disconnected→connected pipeline result=53), data-types-advanced (op '>'→'>='), interface-advanced (added step=10). Lint 0 errors, 1911 tests, 28 e2e pass. | `scripts/take-learning-shots.js` | — | 2026-06-07 | **merged 2026-06-07** |
| fix/tick-007-number-nodes | ui-engineer (switch) | T07e — TICK-007: Add Input.Number value display to mini-canvas node body (number spinner + range slider matching real Nova canvas). Read node.value from exercise definition. Assert in E2E spec. | `src/ui/mini-canvas.js`, `tests/e2e/learning-interactive.spec.js` | — | 2026-06-07 | **merged 2026-06-07** |

<!--
Example row (copy, fill in, remove this comment block's example when claiming):
| feat/attractor-falloff | geometry-engineer | new falloff helper | src/geometry/** | — | 2026-06-03 | active |
| fix/proxy-rate-limit    | platform-engineer | KV bucket fix       | worker/**, api/** | worker/index.mjs | 2026-06-03 | active |
-->
