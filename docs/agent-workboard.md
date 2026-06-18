# Agent Work Board — live concurrency claims

> **Claim before you code.** This is the live record of who owns what *right now*,
> so multiple agents never touch the same files. It is short-lived state — not a
> history log. Rules live in [`RULES.md`](RULES.md).

<!-- Cleaned 2026-06-07 — stale merged/done/released rows removed. -->

## How to use it

1. Before your first edit, **add a row** to *Active claims* with your branch, the
   path globs you own, and any hot files you need to lock.
2. Your owned globs **must be disjoint** from every other active row.
3. To edit a **hot file**, put it in your "Hot locks" cell. Only one active row may
   lock a given hot file at a time — if it's taken, wait or ask.
4. On merge, **delete your row** (release the claim).

## Hot files (one agent at a time)

`src/app/app.js` · `src/main.js` · `src/ui/node-renderer.js` ·
`src/core/node-library.js` · `worker/index.mjs` · `wrangler.toml` ·
root `README.md` · `docs/ARCHITECTURE.md` · `.github/workflows/ci.yml`

## Active claims

| Branch | Agent | Task | Owned paths (globs) | Hot locks | Started | Status |
|---|---|---|---|---|---|---|
| fix/tick-006-content-aligned-screenshots | switch | T06f: content-aligned screenshots (supersedes T06e) | scripts/take-learning-shots.js, public/learning/*.png | — | 2026-06-08 | queued |
| fix/tick-007-real-canvas-embed | switch | T07h: pan/zoom + node schema + drag wire (supersedes T07f + T07g) | src/ui/mini-canvas.js, tests/e2e/learning-interactive.spec.js | — | 2026-06-08 | queued |
| feat/tick-014-surface-paneling | mouse + switch | T14a/T14b: fix Surface.Panelize multi-output (Panels/Corners arrays not unwrapped on the node-graph path) + un-skipped E2E | src/geometry/nodes/Surface.Panelize.js, tests/e2e/surface-paneling.spec.js | — | 2026-06-18 | blocked (dozer bounce: cherry-picked onto develop, lint/unit/build green, but E2E AC-4/AC-6 FAIL once un-skipped — node-graph path yields 1 panel / 0 corners; kernel unit test is correct. develop must NOT be pushed until fixed) |

<!--
Example row (copy, fill in, remove this comment block when claiming):
| feat/attractor-falloff | geometry-engineer | new falloff helper | src/geometry/** | — | 2026-06-07 | active |
| fix/proxy-rate-limit    | platform-engineer | KV bucket fix       | worker/**, api/** | worker/index.mjs | 2026-06-07 | active |
-->
