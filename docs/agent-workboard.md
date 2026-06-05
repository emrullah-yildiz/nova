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
| fix/selection-mode-e2e | ui-engineer (switch) | T02a — TICK-002: Playwright E2E spec for Select.Faces/Edges/Points + bug fixes | `tests/e2e/geometry-selection.spec.js`, `src/viewer/selection-mode.js` (fix-only), `src/viewer/geo-selector.js` (fix-only), `src/nodes/categories/geometry.js` (fix-only), `src/viewer/viewer3d.js` (fix-only) | — | 2026-06-05 | queued |
| chore/e2e-infra | platform-engineer (link) | T03a — TICK-003: playwright.config.js + CI e2e job + pre-push hook + README Testing section | `playwright.config.js`, `.github/workflows/ci.yml`, `.husky/pre-push`, `README.md`, `package.json` | `.github/workflows/ci.yml`, `README.md`, `package.json` | 2026-06-05 | **merged** |
| chore/e2e-spec-audit | platform-engineer (link) | T03b — TICK-003: Audit all 5 E2E specs; fix failing specs; record AC-4 pass | `tests/e2e/nova-workflows.spec.js`, `tests/e2e/nova-learning.spec.js`, `tests/e2e/codeblock-node.spec.js`, `tests/e2e/run-modes.spec.js`, `tests/e2e/geometry-selection.spec.js` (read-only unless fixing) | — | 2026-06-05 | queued — BLOCKED (needs TICK-002 + T03a merged) |
| feat/pattern-on-surface-geo | geometry-engineer (mouse) | T04a — TICK-004: Kernel UV remapping, output format, Panel.ByPoints node, PanelFrames compat, Vitest + E2E specs | `src/geometry/geo-facade-panels.js`, `src/geometry/geo-voronoi.js`, `src/nodes/categories/patterns.js`, `tests/geometry/geo-facade-panels.test.js`, `tests/e2e/pattern-on-surface.spec.js` | — | 2026-06-05 | **active** |
| feat/pattern-on-surface-viewer | ui-engineer (switch) | T04b — TICK-004: Viewer renders panel-object list as per-item scene objects + hover highlight | `src/viewer/viewer3d.js`, `src/viewer/geo-selector.js` | — | 2026-06-05 | active |
| fix/codeblock-series | core-engineer | Fix CodeBlock DSL series shorthand bug + test | `src/runtime/codeblock-eval.js`, `src/runtime/codeblock-syntax.js`, `tests/codeblock-series.test.js` | — | 2026-06-05 | **merged** |
| fix/curve-point-extrapolate | geometry-engineer | Curve.PointAtParameter extrapolation beyond [0,1] + test | `src/nodes/categories/curves.js`, `src/geometry/curve-eval.js`, `tests/curves-node-results.test.js` | — | 2026-06-05 | **merged** |
| feat/geometry-selection | ui-engineer | Add Select.Faces/Edges/Points nodes with 3D selection mode + Approve/Cancel toolbar | `src/nodes/categories/geometry.js`, `src/viewer/geo-selector.js`, `src/viewer/selection-mode.js` (new), `src/viewer/viewer3d.js`, `src/ui/node-renderer.js`, `src/ui/node-library.js`, `tests/geometry-selection.test.js` | `src/ui/node-renderer.js` | 2026-06-05 | **merged** |
| feat/learning-examples | ui-engineer | Add simple+advanced examples with SVG illustrations to all 10 learning-page chapters | `src/ui/learning-page.js`, `tests/learning-page.test.js` | — | 2026-06-05 | **merged** |
| fix/learning-examples-style | ui-engineer (orchestrator) | Fix style mismatch: replace SVG diagrams with screenshot slots, align examples to design language | `src/ui/learning-page.js`, `style.css`, `tests/learning-page.test.js` | `style.css` | 2026-06-05 | **merged** |

<!--
Example row (copy, fill in, remove this comment block's example when claiming):
| feat/attractor-falloff | geometry-engineer | new falloff helper | src/geometry/** | — | 2026-06-03 | active |
| fix/proxy-rate-limit    | platform-engineer | KV bucket fix       | worker/**, api/** | worker/index.mjs | 2026-06-03 | active |
-->
