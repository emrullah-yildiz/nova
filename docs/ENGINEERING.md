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

## 2. Ticket lifecycle

Every piece of work is tracked through a ticket. The ticket is the contract between the PM and the agents — it defines what "done" means and records whether the PM agrees.

```
⬜ draft      PM has not confirmed AC yet — agents may not start work
🔵 ready      PM confirmed AC — morpheus decomposes into task briefs, agents branch
🟡 in-progress At least one task branch is active
🔴 blocked    Waiting on a dependency or external input
✅ done        All AC checked [x], merged to develop, PM comment is positive → archived
```

**One branch per ticket.** Name it `type/tick-NNN-short-description`. Never put two tickets' work on the same branch.

**PM comment loop.** After merging to develop:
1. PM tests the feature on develop and writes a comment in the `## PM Notes` section of the ticket file.
2. On the next "run", morpheus reads every PM comment:
   - **Positive** (confirms AC): mark ✅ done, `git mv docs/tickets/TICK-NNN.md docs/tickets/archive/TICK-NNN.md` (move, not copy — original must not remain in docs/tickets/), move row to Done table in INDEX.md.
   - **Negative** (bug / missing behavior): reopen ticket (back to 🔵 ready), create a new task brief, dispatch agent on a new branch.
3. A ticket is **never archived without a positive PM comment** — merged ≠ done.
4. When all tickets are archived, morpheus reports "all tickets closed" and asks the PM for the next sprint green light.

---

## 4. Branching (the unit of work)

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

## 5. Working in parallel (multi-agent)

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

## 6. Prove it works (the testing ladder)

Run the **smallest relevant check first**, then widen as runtime risk rises. Use
`npm.cmd`/`npx.cmd` on Windows to avoid PowerShell execution-policy issues.

| Risk of the change | Run (cumulative) |
|---|---|
| Docs only | `rg` stale-ref check + `git diff --check` |
| One module's logic | `npm.cmd test <path/to/file.test.js>` |
| Any runtime/frontend code | `npm.cmd run lint:all` → `npm.cmd test` → `npm.cmd run build` |
| Browser workflow / UI | `npm.cmd run lint:all` → `npm.cmd test` → `npm.cmd run build` → **`npm.cmd run test:e2e`** |
| Worker / deployment | `npm.cmd run build` → `npx.cmd wrangler deploy --dry-run --env dev` and `--env=""` |
| Dependencies changed | `npm.cmd audit --audit-level=moderate` |

**Critical rule — Playwright must pass locally before every push that touches UI:**
Unit tests mock THREE.js and the DOM — they cannot catch render-loop bugs, pointer-event
bugs, or material-color update bugs. These ONLY show in the real browser. Run
`npm run test:e2e` locally. Do not let CI be the first to catch E2E failures.

Rules:
- **A behavior change with no test is a merge blocker.** Add or extend a test.
- Pure logic goes in a pure module so it's unit-testable (NOVA.md §4).
- Verify DOM/3D/render behavior in-app (Playwright) — headless unit tests cannot see it.
- Report what you ran *and what you skipped and why*. Don't claim green you didn't run.

---

## 7. Debugging protocol — no guesswork

When something is broken, follow these steps in order. Do not skip to a fix without completing diagnosis.

### Step 1 — State the exact symptom
Write one sentence: *"When I do X, I expect Y, but I get Z."*
Example: *"When I hover a face in selection mode, I expect it to turn blue, but the color does not change."*

### Step 2 — Find the execution path
Trace the code path that should produce Y:
- Which function is the entry point? (event handler, node execute, etc.)
- Which function should produce the expected result?
- Read the actual current file contents — do not assume they match what you wrote earlier.

### Step 3 — Find where the path breaks
Add temporary `console.log` or read each step in the path and ask:
- Does this function even run? (add a log at the entry)
- If it runs, does it receive the right inputs?
- If inputs are right, is the output correct?
- If output is correct, is it being used correctly downstream?

Stop at the first step where behavior diverges from expectation. That is the bug.

### Step 4 — Identify root cause before writing any fix
State the root cause as: *"Function X receives Y but produces Z because of [specific line/condition]."*
Do not write a fix until you can state this. A fix without a known root cause is a guess.

### Step 5 — Write the minimal fix
Change only what's needed to fix the root cause. No refactoring nearby code. No "while I'm here" changes.

### Step 6 — Verify the fix addresses the root cause
Re-read the changed code and confirm the root cause is gone.
Run the full testing ladder appropriate to the change.
Run Playwright E2E if the change touches UI/viewer/selection.

### Common root causes in this codebase

| Symptom | Check first |
|---|---|
| Material color not updating in 3D viewport | Is `renderer.render()` being called after `mat.color.set()`? Is the scene set to `needsRender`? |
| Click handler fires on orbit drag release | Are you listening on `mousedown` (may be suppressed by OrbitControls' `pointerdown`) or `pointerdown`? |
| Raycaster never hits the right object | What objects are in the candidate list? Are LineSegments included with their default 1-unit threshold? |
| Unit tests pass but browser breaks | The test mocks THREE.js — the real browser renders differently. Run Playwright. |
| `execute()` returns null unexpectedly | Which control value key is it reading? Is it `_selectedMesh` or `_selectedFaces`? Read the actual current code. |
| CI fails after local green | Did you run `test:e2e` locally? Unit tests mock the browser; E2E runs the real one. |

---

## 8. Structured agent response format

Every agent completing a task **must** write a structured response to `docs/pm/PM.md`
under the relevant ticket's "Awaiting Your Review" section before reporting done.
No response to the PM in chat — only in PM.md.

### Required format

```markdown
#### What was built
[2–4 sentences. What the user can now do that they couldn't before.]

#### How to test
[Numbered steps. Start from `npm run dev`. Written for the PM, not the engineer.]

#### What agents tested
- ✅/❌ Unit tests: [N passing / failing]
- ✅/❌ Playwright E2E: [which specs, pass/fail]
- ✅/❌ Lint: [0 errors / N errors]
- ✅/❌ Build: [green / error]
- ✅/❌ Tested in browser: [yes/no — describe what was observed]
- ✅/❌ Style check: [colors, fonts, spacing follow STYLE.md]
- ✅/❌ Architecture check: [no contradictions with NOVA.md]

#### Output data type
[What type does the output port produce? E.g. "Mesh3 — compatible with Transform, Boolean, Surface nodes"]

#### Next steps enabled
[List 2–3 things the PM can do next with this output. Makes sprint planning easier.]
```

### Pre-response quality gate (run before writing to PM.md)

An agent must confirm ALL of these before writing to PM.md:

- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run build` → green
- [ ] `npm run test:e2e` → all pass (mandatory for any UI/viewer change)
- [ ] Every AC in the ticket is checked `[x]`
- [ ] Tested like a real user: followed the "How to test" steps in the ticket, observed actual behavior
- [ ] Output data type makes sense for downstream nodes (confirmed by checking port types in NOVA.md §4)
- [ ] No contradiction with NOVA.md architecture (read the relevant pattern before shipping)
- [ ] STYLE.md rules followed for any UI change (colors, fonts, spacing, icons)
- [ ] NOVA.md updated if architecture or patterns changed in this branch

If any gate fails, fix it before writing the response. Do not ask the PM to test something that hasn't passed all gates.

---

## 9. Token efficiency (for AI agents)

Keep context small and leave breadcrumbs:

- Read `docs/pm/PM.md` and this file first; then only the few Tier-2 docs the task needs.
- Use targeted `rg "term" path` over opening broad folders; prefer partial/section reads over whole-file reads.
- Don't paste full logs, bundles, screenshots, or session JSON into context.
- Reuse findings already in the thread instead of re-deriving them.
- Report only: **files changed · decisions made · validation run · known gaps · branch/merge status.**

---

## 10. Documentation duties (update docs while working)

In the **same branch** as the code:

- **`docs/pm/PM.md`** — write the structured agent response under the ticket section after completing work.
- **[`NOVA.md`](NOVA.md)** — update when you change architecture, a design pattern, the module map, current status, or the roadmap.
- **[`architecture/decisions.md`](architecture/decisions.md)** — append a dated entry for any durable decision.
- **[`agent-workboard.md`](agent-workboard.md)** — claim on start, release on merge. Keep only active rows.
- Root `README.md` — only for setup/script/deployment/product-behavior changes.
- After any rename/delete, search for stale references:
  ```powershell
  rg -n "old-name|old-term" README.md docs src worker api server .github
  ```

---

## 11. Start → merge checklist

The canonical end-to-end gate for every task.

### Before you start — ticket gate
Every non-trivial task originates from a ticket in [`tickets/INDEX.md`](tickets/INDEX.md).

- [ ] Locate the parent ticket (`docs/tickets/TICK-NNN.md`) from your task brief.
- [ ] Read its **Acceptance Criteria** — these define "done".
- [ ] Read its **Testing gate** — know which AC require E2E, unit tests, or manual verification.
- [ ] Ticket status must be 🔵 ready. If ⬜ draft, stop — wait for PM confirmation.

### Start
- [ ] Read [`NOVA.md`](NOVA.md) — confirm the task fits the big picture and doesn't contradict a pattern.
- [ ] Read [`agent-workboard.md`](agent-workboard.md) — claim your row before first edit.
- [ ] `git switch develop; git pull --ff-only origin develop`
- [ ] `git switch -c type/tick-NNN-short-name`

### Work
- [ ] Follow the debugging protocol (§7) when anything doesn't behave as expected.
- [ ] Small diff, no unrelated refactors, prefer a new owned file.
- [ ] No generated files, logs, exports, screenshots, artifacts, or secrets staged.

### Pre-response gate (§8) — mandatory before writing to PM.md
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run build` → green
- [ ] `npm run test:e2e` → all pass (UI/viewer changes: non-negotiable)
- [ ] All ticket AC checked `[x]`
- [ ] Tested in browser as a real user
- [ ] Output type confirmed compatible with downstream nodes
- [ ] No NOVA.md contradiction
- [ ] STYLE.md followed

### Commit & merge
- [ ] `git switch develop` → `git merge --no-ff …` → `git branch -d <branch>` → `git push origin --delete <branch>` → `git push origin develop`
- [ ] Release workboard claim.
- [ ] Update `docs/tickets/INDEX.md` status.
- [ ] Write structured response to `docs/pm/PM.md` under the ticket section.

### Merge blockers — do not merge if
- Any gate in the pre-response checklist fails.
- The parent ticket has unchecked `- [ ]` AC items.
- UI changes have no Playwright E2E spec.
- Docs contradict implemented behavior.
- Secrets or generated artifacts are present.
