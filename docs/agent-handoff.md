# Agent Handoff Log

Use this file for short-lived task handoffs between agents. Permanent
architecture choices belong in `docs/architecture-decisions.md`.

Add a new entry at the top when a task leaves context the next agent needs.
Keep entries compact and delete or archive stale entries when they are no
longer useful.

## 2026-06-04 - T1: Frame & Transform kernel backbone (in progress)

**Agent/branch:** `feat/geo-frames-orient`

**Goal:** Add pure kernel frame/orient/transform functions (Milestone M1), no nodes/UI.

**Claimed files (NEW, owned):** `src/geometry/frames.js`, `src/geometry/transforms.js`,
`tests/geometry/frames.test.js`, `tests/geometry/transforms.test.js`. READ-only on
`geometry-lib.js`, `geo-advanced.js`, `index.js`. No edits outside owned globs.

**Decisions made:** Stock `Geo.Plane` derives `xAxis()/yAxis()` from its normal and
cannot carry an arbitrary frame; existing consumers call those as *methods*
(`src/nodes/categories/plane.js`). To keep a full orthonormal frame on a Plane
without shadowing the methods, `frames.js` attaches explicit `plane.xaxis`/`plane.yaxis`
(lowercase) own-properties; `orient()` reads those when present and falls back to the
derived axes otherwise. New module exports (`orient`, `rotate`, `mirror`, `arrayLinear`,
`arrayPolar`) carry the T1-contract signatures and compose the existing `Geo.rotate`/
`Geo.mirror` global helpers rather than reimplementing or mutating them.

**Validation:** see Merge status.

**Known gaps:** Node/UI wiring is T2's job.

**Merge status:** Open branch (do not merge per task).

## 2026-06-02 - Python Node Redesign, AI Codegen Fixes, 3D Preview, CI Deploy

**Agent/branch:** many one-task branches off `develop`, all merged `--no-ff` and
deleted — `fix/ai-prompt-geo-signatures`, `fix/ai-type-mismatch-triggers-fix`,
`fix/parser-arith-fallback-diagnostics`, `fix/parser-multiline-literals`,
`feat/python-node-live-ports`, `fix/parser-inline-list-args`,
`feat/python-node-render-redesign`, `feat/python-node-rename-ports`,
`feat/python-node-code-driven-ports`, `feat/python-node-terminal-tabs`,
`fix/code-editor-remove-play`, `feat/preview-terminal-geometry`,
`fix/ci-deploy-skip-without-secrets`, `fix/ci-sanitize-deploy-secrets`.

**Goal:** From three session logs, fix AI geometry-generation failures, redesign the
Custom.Python node + code terminal, fix the loft "coil," and unblock CI deploy.

**Decisions made:** See the four `2026-06-02` entries in
`docs/architecture-decisions.md`.

**Changed files (main):** `src/ai/gpt-client.js`, `src/ai/gpt-integration.js`,
`src/ai/type-validator.js`, `src/runtime/parser.js`, `src/runtime/python-port-decl.js`,
`src/runtime/pyrunner.js`, `src/ui/node-renderer.js`, `src/app/app.js`,
`src/core/engine.js`, `.github/workflows/ci.yml`, `docs/deployment-guide.md`; tests in
`tests/python-node-overhaul.test.js`, `tests/parser-python-output-ports.test.js`.

**Validation:** Full `vitest` suite green (1143 passed, 1 skipped); pure parser/port
logic is unit-tested; the node-renderer, code-terminal, and 3D-preview changes were
verified in-app with Playwright (real DOM + a WebGL 3D render).

**Known gaps / follow-ups:**
- CI deploy still needs a valid `CF_API_TOKEN` with *Workers Scripts: Edit* +
  *Workers KV Storage: Edit* on the `ey.myacc@gmail.com` account, and a matching
  `CF_ACCOUNT_ID`. The two existing dashboard tokens are not suitable as-is.
- The loft "coil" was an intermediate-preview issue, not a loft bug — `Geo.loft` is
  correct.
- Headless tests can't exercise live DOM rendering of `List.Create` item ports beyond
  the default two; the common cases were checked in-app.
- Durable next step (not done): have the AI emit a structured node+wire list instead of
  raw Python, which would retire the parser's free-form-Python fragility class.

**Merge status:** All merged to `develop` (in sync with `origin/develop`).

## 2026-06-01 - Agent Documentation Cleanup

**Agent/branch:** `docs/agent-collaboration-cleanup`

**Goal:** Reduce stale documentation and create a multi-agent collaboration doc
set with token guidance, architecture decisions, handoff notes, and merge checks.

**Changed files:** `README.md`, `docs/README.md`, `docs/AGENTS.md`,
`docs/ai-agent-token-guide.md`, `docs/architecture-decisions.md`,
`docs/agent-handoff.md`, `docs/agent-merge-checklist.md`,
`docs/enterprise-api.env.example`, `docs/accounts-collaboration.md`,
`src/ai/gpt-client.js`.

**Decisions made:** See `2026-06-01 - Documentation Is Decision-Oriented And
Agent-Friendly` in `docs/architecture-decisions.md`.

**Validation:** Stale-reference search, `git diff --check`, and
`npm run lint:all` passed. No runtime tests were run because this branch changes
docs and one code comment only.

**Known gaps:** Consider adding a machine-readable task manifest later if agents
need automated handoff discovery.

**Merge status:** Merged to `develop`.

## Entry Template

```markdown
## YYYY-MM-DD - Task Title

**Agent/branch:** `<branch-name>`

**Goal:** One sentence.

**Changed files:** `path`, `path`

**Decisions made:** Link to `docs/architecture-decisions.md` entries or summarize.

**Validation:** Commands run and result.

**Known gaps:** Follow-ups, unrun checks, or external setup needed.

**Merge status:** Open branch | merged to `develop` | blocked.
```

## 2026-06-01 - Cloudflare Worker-Only Deployment Cleanup

**Agent/branch:** `chore/cloudflare-worker-only-cleanup`

**Goal:** Remove Vercel/Cloudflare Pages deployment assumptions and make Worker
deployment the only path.

**Changed files:** `.github/workflows/ci.yml`, `wrangler.toml`,
`worker/index.mjs`, `docs/deployment-guide.md`, `docs/accounts-collaboration.md`,
`api/feedback/refusals.mjs`, `api/proxy/chat.mjs`, `vite.config.js`,
`src/ai/gpt-integration.js`, `tests/feedback-pipeline.test.js`.

**Decisions made:** See `2026-06-01 - Cloudflare Worker Is The Only Deployment
Target`, `Keep AI Provider Helpers Shared`, and `Feedback Refusal Endpoint Runs
Through Worker` in `docs/architecture-decisions.md`.

**Validation:** Targeted proxy/feedback tests, `npm run lint:all`,
`npm run build`, and Worker dry-runs for prod/dev passed.

**Known gaps:** Dev currently reuses production KV namespace IDs until separate
dev KV namespaces are created.

**Merge status:** Merged to `develop`.
