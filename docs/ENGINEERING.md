# ENGINEERING — How We Work

> The single rulebook for writing code in Nova, as a human or an AI agent. It
> replaces the former `AGENTS.md`, `ai-agent-token-guide.md`, and
> `agent-merge-checklist.md`. Companion: [`NOVA.md`](NOVA.md) — *what & why*; this
> file is *how*.
>
> A junior developer should be able to take one task from start to merge using
> only this file. If something here is unclear, that is a bug in this file — fix it.

---

## 0. Prime directive

**Every change must serve the big picture in [`NOVA.md`](NOVA.md).** Before you
code, confirm the change fits the architecture, patterns, and roadmap there. If it
doesn't, either (a) update NOVA.md in the *same* branch with a matching decision in
[`architecture/decisions.md`](architecture/decisions.md), or (b) stop and
reconsider. Code that contradicts NOVA.md is wrong by definition.

---

## 1. Operating principles — efficient, low-risk, no place to miss

Treat every change like it ships to production tonight. Discipline over heroics.

- **One mission per branch.** A branch does exactly one thing. If you discover a
  second thing, write it down (handoff/decision) and do it on its own branch.
- **Smallest viable change.** Small, reversible diffs. No drive-by refactors, no
  reformatting unrelated lines, no "while I'm here." A small diff is easy to review,
  easy to test, and easy to revert.
- **Readable by a junior dev.** Clear names, match the style of the nearby code,
  comment the *why* (not the *what*). If a teammate can't understand it in one pass,
  simplify it.
- **Reuse before you write.** Search for an existing helper/pattern first
  (NOVA.md §4 lists the house patterns). Prefer referencing existing code over
  copying blocks.
- **Assume nothing is safe.** User- and AI-provided content is untrusted. API
  changes enforce auth, authorization, and tenant scoping. The server is the
  authority for permissions.
- **Never commit** secrets, API keys, tokens, private URLs, generated bundles,
  logs, local exports, screenshots, or build artifacts.
- **Preserve backwards compatibility** while legacy browser globals (`window.*`
  bridges) still have consumers.
- **When uncertain, make the conservative choice and write it down** in the handoff
  or a decision entry. Silent guesses are how mistakes hide.
- **Prove it before you call it done** (§4). "It should work" is not done.
- **Reuse the existing abstraction; don't build a parallel one.** Nova's data model
  is values + (nested) lists with lacing — branching/grouping/nesting is a
  *list of lists*, handled by the `List.*` category (`Chunk`, `Transpose`, `Flatten`,
  `GroupBy`, `Sort`). There is **no** tree/`DataTree` type and must not be one. Before
  adding a node or a core type, check whether `List.*` (or an existing category)
  already expresses it; new nodes fold into their existing home category, they don't
  spawn a parallel one. (A `DataTree` object + `Tree` category were built, found to
  duplicate `List.*`, and removed — 2026-06-04 decision.)

---

## 2. Branching (the unit of work)

The house rule: **one branch = one task, always off `develop`, merged back and
deleted.** Never commit straight to `develop` or `main`.

```powershell
# 1. Start clean, from an up-to-date develop
git switch develop
git pull --ff-only origin develop

# 2. One branch for one task
git switch -c type/short-task-name      # feat/ fix/ chore/ docs/ refactor/

# 3. …work in small chunks, commit with focused messages…

# 4. Merge back (no-ff keeps the task grouped), delete local + remote, push
git switch develop
git merge --no-ff type/short-task-name -m "merge: short task summary"
git branch -d type/short-task-name
git push origin --delete type/short-task-name
git push origin develop
```

Keep branches short-lived — merge within hours, not days. Conflict risk grows with
`branch lifetime × file overlap`; small + fast shrinks both.

**After every merge, also check for orphaned `worktree-agent-*` branches** (left by
agent worktree runs) and delete them:

```powershell
git branch | Select-String "worktree-agent-" | ForEach-Object { git branch -D $_.ToString().Trim() }
```

---

## 3. Working in parallel (multi-agent)

Several agents/devs can work the same repo at once **without ever touching the same
bytes**, if you follow these rules. The live state lives in
[`agent-workboard.md`](agent-workboard.md).

**Recommended team (don't over-staff):** 1 Orchestrator/Tech-Lead +
2–3 Implementers (only the modules the work touches) + 1 Reviewer/QA. Coordination
cost grows with headcount; 3–4 *active* agents is the efficient sweet spot. Roles
are defined as custom subagents in `.claude/agents/*.md`.

**Start with the `tech-lead` agent.** You state the goal; it decomposes the work
into disjoint, module-aligned tasks, sequences dependencies, updates the work
board, and emits a ready-to-paste prompt per lane — so you don't have to do the
partitioning by hand. It plans and distributes; it does not write feature code.
The `integrator` agent (or you) then lands the finished branches.

**The rules:**

1. **Partition by module ownership.** Each agent owns a *disjoint* set of path
   globs from the map in [`NOVA.md`](NOVA.md) §3 (e.g. A→`src/geometry/**`,
   B→`src/ai/**`, C→`worker/**`+`api/**`). Two agents must never own overlapping
   paths. A task that can't be cleanly partitioned is *one* agent's job.
2. **New file over shared edit.** Land new behavior in a *new file you own*, wired
   in with a one-line touch to a shared file (Nova already favors small pure
   helpers — see NOVA.md §4). New files never conflict.
3. **Claim before coding.** Add your row to [`agent-workboard.md`](agent-workboard.md)
   (branch, owned globs, hot-file locks) *before* the first edit. Reading the board
   is step 1 of the Start checklist.
4. **Serialize hot files.** These are touched by almost every task — only **one
   agent at a time**, via a lock row on the board:
   `src/app/app.js`, `src/main.js`, `src/ui/node-renderer.js`,
   `src/core/node-library.js`, `worker/index.mjs`, `wrangler.toml`, root
   `README.md`, `docs/NOVA.md`, `.github/workflows/ci.yml`.
5. **Sequence dependencies; parallelize only true independents.** If task B needs
   task A's output, run A → merge → start B from the updated `develop`. Don't run
   dependent tasks concurrently.
6. **Integrate often, one integrator.** Other agents `git pull --ff-only develop`
   frequently. Don't let N agents race `git push` to `develop` — a designated
   integrator (or you) merges green branches in dependency order.

**Isolation mechanic (recommended): git worktrees.** One folder + branch per agent
so uncommitted work can't collide. Use the helper:

```powershell
scripts\agent-worktree.ps1 add ai          # creates ..\nova-ai on branch lane/ai
scripts\agent-worktree.ps1 list
scripts\agent-worktree.ps1 remove ai
```

Open each worktree as its own VS Code window and run `claude` there with the
matching agent. Inside a lane you still branch per task (`git switch -c feat/x
develop`); the `lane/*` branch is just the holder so `develop` isn't checked out in
two places at once.

---

## 4. Prove it works (the testing ladder)

Run the **smallest relevant check first**, then widen as runtime risk rises. Use
`npm.cmd`/`npx.cmd` on Windows to avoid PowerShell execution-policy issues.

| Risk of the change | Run (cumulative) |
|---|---|
| Docs only | `rg` stale-ref check + `git diff --check` |
| One module's logic | `npm.cmd test <path/to/file.test.js>` |
| Any runtime/frontend code | `npm.cmd run lint:all` → `npm.cmd test` → `npm.cmd run build` |
| Browser workflow / UI | `npx.cmd playwright install chromium` (once) → `npm.cmd run test:e2e` |
| Worker / deployment | `npm.cmd run build` → `npx.cmd wrangler deploy --dry-run --env dev` and `--env=""` |
| Dependencies changed | `npm.cmd audit --audit-level=moderate` |

Rules:
- **A risky behavior change with no test is a merge blocker.** Add or extend a test.
- Pure logic goes in a pure module so it's unit-testable (NOVA.md §4).
- Verify DOM/3D/render behavior in-app (Playwright / `/verify`) — headless unit
  tests can't see it.
- Report what you ran *and what you skipped and why*. Don't claim green you didn't run.

---

## 5. Token efficiency (for AI agents)

Keep context small and leave breadcrumbs:

- Read [`NOVA.md`](NOVA.md) + this file first; then only the few Tier-2 docs the
  task needs. Don't load or scan the whole repo unless explicitly asked.
- Use targeted `rg "term" path` over opening broad folders; prefer partial/section
  reads over whole-file reads.
- Don't paste full logs, bundles, screenshots, or session JSON into context — keep
  error lines, filenames, and the few relevant fields.
- Reuse findings already in the thread instead of re-deriving them.
- Report only: **files changed · decisions made · validation run · known gaps ·
  branch/merge status.** Don't repeat unchanged code or dump full diffs.

---

## 6. Documentation duties (update docs *while* working)

In the **same branch** as the code:

- **[`NOVA.md`](NOVA.md)** — update when you change architecture, a design pattern,
  the module map, current status, or the roadmap.
- **[`architecture/decisions.md`](architecture/decisions.md)** — append a dated
  entry (newest first, template at the file's end) for any durable decision about
  deployment, auth/session, data model/persistence, AI routing/codegen, realtime,
  or Connect/Revit safety. Mark superseded entries; don't delete history.
- **[`agent-handoff.md`](agent-handoff.md)** — add an entry when the task leaves
  context the next agent needs (template in that file).
- **[`agent-workboard.md`](agent-workboard.md)** — release your claim on merge.
- Root `README.md` — only for setup/script/deployment/product-behavior changes.
- After any rename/delete, search for stale references:
  ```powershell
  rg -n "old-name|old-term|TODO|FIXME" README.md docs src worker api server .github
  ```

---

## 7. Start → merge checklist

The canonical end-to-end gate for every task. Tick it.

### Before you start — ticket gate
Every non-trivial task originates from a ticket in [`tickets/INDEX.md`](tickets/INDEX.md).

- [ ] Locate the parent ticket (`docs/tickets/TICK-NNN.md`) from your task brief.
- [ ] Read its **Acceptance Criteria** section — these are what "done" means.
- [ ] Read its **Testing gate** — know which AC require E2E, unit tests, or manual verification.
- [ ] Ticket status must be 🔵 ready (PM confirmed AC). If it's ⬜ draft, stop — wait for PM confirmation.

### Start
- [ ] Read [`NOVA.md`](NOVA.md) and confirm the task fits the big picture.
- [ ] Read [`agent-workboard.md`](agent-workboard.md); confirm your owned paths
      don't overlap an active claim. **Claim your row.**
- [ ] Read the relevant Tier-2 doc(s) only.
- [ ] `git status --short --branch` is clean (or you've identified unrelated user
      changes — do **not** revert them).
- [ ] `git switch develop; git pull --ff-only origin develop`.
- [ ] `git switch -c type/short-task-name` — one task, name matches the task.

### Work
- [ ] Targeted `rg` before reading large files; inspect only involved files.
- [ ] Small diff, no unrelated refactors, prefer a new owned file.
- [ ] No generated files, logs, exports, screenshots, artifacts, secrets, or
      private URLs staged.
- [ ] Unclear requirement → conservative assumption, recorded.

### Branch review
- [ ] Branch started from `develop`; `git diff --stat` scope is expected.
- [ ] No unrelated user work reverted or mixed in; deleted files are intentional.

### Docs
- [ ] NOVA.md / decisions.md / handoff updated as required by §6.
- [ ] Stale references searched after renames/deletions.

### Code & security
- [ ] **UI/CSS work:** all colors, fonts, spacing, and icons follow [`docs/STYLE.md`](STYLE.md). No raw hex values that duplicate an existing token; no new icon text-abbreviations.
- [ ] Secrets/keys/tokens/private URLs absent; deps necessary and reviewed.
- [ ] User/AI input treated as untrusted; API changes enforce auth + tenant scope.
- [ ] Revit/Connect write paths require explicit approval + audit.
- [ ] **Security run on every PR (mandatory).** The reviewer performs a security
      pass on the diff; for changes touching auth/authz, input parsing, file
      uploads, external integrations, or personal-data handling it runs
      `/security-review` and files any new gaps as `docs/security/tickets/SEC-*`.
      CI's `security` job (`npm audit` + Snyk) is the automated per-PR baseline.
      Open security tickets are triaged by the **tech-lead** → fixed by the
      **security-engineer** (or the owning lane) → gated by the **reviewer**.

### Validation
- [ ] Ran the testing ladder (§4) appropriate to the risk; recorded results and
      anything skipped.

### Acceptance criteria sign-off
For each AC in the parent ticket:
- [ ] Check it off (`- [x]`) in `docs/tickets/TICK-NNN.md` with a note: test file + line, or "manual browser: YYYY-MM-DD".
- [ ] The Stop hook will block finishing if any `- [ ]` remains in the ticket file.
- [ ] UI changes: confirm at least one `tests/e2e/*.spec.js` covers the E2E-gated ACs.

### Commit & end
- [ ] Stage only intended files; commit with `type: short task summary`.
- [ ] `git switch develop` → `git merge --no-ff …` → `git branch -d <branch>` →
      `git push origin --delete <branch>` → `git push origin develop`.
- [ ] Delete any orphaned `worktree-agent-*` branches left by agent runs.
- [ ] Release your work-board claim.
- [ ] Update `docs/tickets/INDEX.md` status (🟡 in-progress → ✅ done when all AC checked).
- [ ] Final report: files changed, validation run, AC verified, known gaps, branch/merge status.

### Merge blockers — do **not** merge if
- Required checks fail (lint, tests, build).
- The parent ticket has unchecked `- [ ]` AC items — the Stop hook enforces this.
- UI changes have no Playwright E2E spec covering the E2E-gated ACs.
- Oracle has not issued `VERDICT: APPROVE`.
- The PR did not get its mandatory security pass, or introduced an unresolved `critical`/`high` SEC ticket.
- Docs contradict implemented behavior (or NOVA.md is now stale).
- A risky behavior change has no test or explicit reason.
- Secrets or generated artifacts are present.
- Deployment config points production domains at dev environments.
- The branch contains unexplained unrelated changes.
