# Agent Handoff Log

> ↑ Big picture: [`NOVA.md`](NOVA.md). Live ownership: [`agent-workboard.md`](agent-workboard.md).

Use this file for short-lived task handoffs between agents. Permanent
architecture choices belong in `docs/architecture/decisions.md`.

Add a new entry at the top when a task leaves context the next agent needs.
Keep entries compact and delete or archive stale entries when they are no
longer useful.

> Note: entries dated before 2026-06-03 reference the old doc paths
> (`docs/architecture-decisions.md`, `docs/deployment-guide.md`, etc.). Those docs
> now live under `docs/architecture/` — see [`NOVA.md`](NOVA.md) §7 for the map.

## 2026-06-04 - FIX: Transform-node codegen now resolves on the global Geo (BLOCKING)

**Agent/branch:** Geometry/Kernel Engineer — `feat/nodes-transform` (fix in place).

**Bug (reviewer-verified):** The four T2 transform nodes execute() against the T1
ES-module kernel, but their `codegen.python`/`codegen.csharp` emitted
`Geo.orient` / `Geo.planeFromOriginXY` (which did **not** exist on the global
`Geo`) and `Geo.arrayLinear` / `Geo.arrayPolar` (which exist on global `Geo` but
as the LEGACY spacing/full-turn implementations with different semantics). The
code-validator allow-list is derived from `codegen.python`, so static validation
falsely passed; generated Python/C# would throw or silently produce different
geometry than the preview.

**Fix:**
- `src/geometry/index.js` (the global-Geo assembly point): import frames.js /
  transforms.js and attach `Geo.orient = transforms.orient`,
  `Geo.planeFromOriginXY = frames.planeFromOriginXY`,
  `Geo.arrayLinearByVector = transforms.arrayLinear` (count + per-step vector),
  `Geo.arrayPolarByAngle = transforms.arrayPolar` (count + total-angle, radians).
  The legacy `Geo.arrayLinear`/`Geo.arrayPolar` globals are left untouched so the
  legacy `Geometry.LinearArray`/`Geometry.PolarArray` nodes keep working.
- `src/nodes/categories/transform.js` codegen (python + csharp + help.sampleCode):
  `Geometry.ArrayLinear` → `Geo.arrayLinearByVector({{geometry}}, {{direction}},
  {{count}})`; `Geometry.ArrayPolar` → `Geo.arrayPolarByAngle({{geometry}},
  {{center}}, {{axis}}, {{count}}, math.radians({{angle}}))` (csharp uses
  `{{angle}} * Math.PI / 180`). `Plane.ByOriginXAxisYAxis` and `Geometry.Orient`
  codegen were already `Geo.planeFromOriginXY` / `Geo.orient`, now resolving.
- NEW `tests/transform-codegen.test.js`: per-node guard asserting every
  `Geo.<name>` token in codegen.python AND codegen.csharp resolves to a function
  on the assembled global `Geo`, plus a check that the new globals match each
  node's execute() output. Scoped to the transform category on purpose.
- `docs/architecture/decisions.md`: recorded the two-convention coexistence.

**Library-wide scan (no fixes applied, follow-up only):** A full scan of every
node's `codegen.python` against the assembled global `Geo` found **zero**
unresolved `Geo.<name>` tokens — no pre-existing offenders elsewhere in the
library.

**Validation:** see "Validation" line in the entry below — re-run after this fix:
`npm.cmd run lint:all`, `npm.cmd test`, `npm.cmd run build` (results in PR/commit).

## 2026-06-04 - T2: Transform & Frame node category

**Agent/branch:** `feat/nodes-transform` (off `develop` @ 8f38965)

**Goal:** Expose the T1 kernel backbone (`src/geometry/frames.js`, `transforms.js`) as
modern Nova nodes in a new category.

**Claimed/changed files:** NEW `src/nodes/categories/transform.js` (owned), NEW
`tests/transform.test.js` (owned), EDITED `src/nodes/coreNodes.js` (one import + two
list pushes — the registry wire; inside owned `src/nodes/**`, not a hot file). No edits
to `src/geometry/**` (READ-only) or any other category file.

**Registry wire (for the integrator/reviewer):** the task referenced
`src/core/node-library.js`, which does not exist. The real category registration is
`src/nodes/coreNodes.js`, exactly mirroring how `plane`/`vector` are wired:
`import { transformCategory, transformNodes } from './categories/transform.js';`, add
`transformCategory` to `modernCategories` and `...transformNodes` to `coreNodes`. Done
on this branch.

**Nodes shipped (all four wired to T1 `transforms.*` / `frames.*` module exports, NOT
the legacy `Geo.array*` globals):**
- `Plane.ByOriginXAxisYAxis` (subGroup Plane) — `origin:point, xAxis:vector,
  yAxis:vector → plane` — `frames.planeFromOriginXY`.
- `Geometry.Orient` (keystone) — `geometry:any, fromPlane:plane, toPlane:plane →
  result:any` — `transforms.orient`. Verified World-XY → tilted-plane end to end.
- `Geometry.ArrayLinear` — `geometry:any, direction:vector, count:number → result:list`
  — `transforms.arrayLinear` (count + per-step vector convention).
- `Geometry.ArrayPolar` — `geometry:any, center:point, axis:vector, count:number,
  angle:number(deg, default 360) → result:list` — `transforms.arrayPolar` (count +
  total-angle, deg→rad).

**Decision / deviation (needs reviewer awareness):** the task also listed
`Geometry.Rotate` and `Geometry.Mirror`. Both **already exist** as canonical node types
in `src/nodes/categories/geometry.js`, and the node registry throws on duplicate `type`
(global key, `registry.js` `registerNode`). I do **not** own that file and must not edit
it, so I did not register colliding duplicates. The existing `Geometry.Rotate` already
takes degrees and calls `Geo.rotate`, and `Geometry.Mirror` calls `Geo.mirror` — the
exact helpers `transforms.rotate`/`transforms.mirror` compose, so T1's rotate/mirror
behavior is already exposed. Open follow-up if the desired convergence is to make
`geometry.js` delegate to `transforms.*` and/or convert its `LinearArray`/`PolarArray`
to the T1 count-based convention (that edit belongs to the geometry-category owner).

**Codegen note:** Python codegen uses `Geo.orient`, `Geo.planeFromOriginXY`,
`Geo.arrayLinear`, `Geo.arrayPolar`. These names are how the registry-driven parser
(`src/runtime/parser.js`) maps a call back to its node, and how `code-validator.js`
derives its known-method allow-list — both are derived from `codegen.python`, so they
stay in sync automatically (no `capability-ledger`/golden-example file exists in this
repo; node-catalog is built live from the registry and its byte-budget test still
passes).

**Validation:** `npm.cmd run lint:all` → exit 0 (clean). `npm.cmd test` (full vitest)
→ 1369 passed, 1 skipped (116 files). `npm.cmd run build` (vite) → built OK. No
`test:geometry` script exists; full suite covers it.

**Known gaps:** Rotate/Mirror convergence above; live 3D viewport rendering of the new
nodes' list outputs was not exercised headlessly (executes verified in JS).

**Merge status:** Open branch `feat/nodes-transform` — committed, not merged.

## 2026-06-04 - T1: Frame & Transform kernel backbone

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

**Merge status:** merged to `develop` (T1/M1).

## 2026-06-03 - Documentation Restructure + Multi-Agent Operating Model

**Agent/branch:** `docs/restructure-source-of-truth`

**Goal:** Make one living source of truth + one coding-rules file, de-duplicate the
docs, and stand up a multi-agent (worktree + ownership) operating model.

**Changed files:** NEW `docs/NOVA.md`, `docs/ENGINEERING.md`, `docs/agent-workboard.md`,
`scripts/agent-worktree.ps1`, `.claude/agents/*.md` (8 roles); MOVED
`architecture-decisions.md`→`architecture/decisions.md`, `deployment-guide.md`→
`architecture/deployment.md`, `accounts-collaboration.md`→`architecture/`,
`revit-plugin-architecture.md`→`architecture/revit-connect.md`; DELETED `AGENTS.md`,
`ai-agent-token-guide.md`, `agent-merge-checklist.md` (folded into ENGINEERING.md);
EDITED `docs/README.md`, root `README.md`, `.github/workflows/ci.yml`,
`wrangler.toml` (doc-path refs); `git rm --cached` of tracked
`integrations/revit-addin/{obj,bin}` build artifacts.

**Decisions made:** See `2026-06-03 - Two-Tier, Source-Of-Truth Documentation +
Multi-Agent Operating Model` in `docs/architecture/decisions.md` (supersedes the
2026-06-01 documentation decision).

**Content review:** Verified every moved doc against the code — deployment
table/bindings vs `wrangler.toml` + `ci.yml`, `migrate:neon -- up` arg form,
accounts-collab file refs, Revit 2027, and the decision/design code paths all still
exist and match. No stale content found beyond doc-name cross-links (fixed).

**Validation:** stale-reference `rg` sweep, `git diff --check`, `npm.cmd run lint:all`.
Docs + one CI/wrangler string + artifact untracking only — no runtime code changed.

**Known gaps / heads-up:**
- A **stray uncommitted revert** of `docs/accounts-collaboration.md` (back to
  Vercel/Pages language + deleted doc names) was found in the working tree and
  discarded — it contradicted the committed Worker-only decision. Flag if it
  reappears.
- `.claude/scheduled_tasks.lock` is tracked in git — likely shouldn't be; left as-is
  (out of scope).
- Starter worktrees (`../nova-ai`, `../nova-geometry`, `../nova-platform`) are
  created after this branch merges, off the updated `develop`.

**Merge status:** merged to `develop`.

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

**Decisions made:** Link to `docs/architecture/decisions.md` entries or summarize.

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
