# Agent Rules

> The single rulebook for writing code in Nova, as a human or an AI agent.
> Companion: [`ARCHITECTURE.md`](ARCHITECTURE.md) — *what & why*; this file is *how*.
>
> A junior developer should be able to take one task from start to merge using only this file.

---

## 0. Prime directive

**Every change must serve the big picture in [`ARCHITECTURE.md`](ARCHITECTURE.md).** Before you code, confirm the change fits the architecture, patterns, and roadmap there. If it doesn't, either (a) update ARCHITECTURE.md in the *same* branch with a matching decision in [`architecture/decisions.md`](architecture/decisions.md), or (b) stop and reconsider. Code that contradicts ARCHITECTURE.md is wrong by definition.

---

## 1. Operating principles

Treat every change like it ships to production tonight.

- **One mission per branch.** A branch does exactly one thing. If you discover a second thing, write it down and do it on its own branch.
- **Smallest viable change.** Small, reversible diffs. No drive-by refactors, no reformatting unrelated lines, no "while I'm here."
- **Reuse before you write.** Search for an existing helper/pattern first (ARCHITECTURE.md §4 lists house patterns). Prefer referencing existing code over copying blocks.
- **Assume nothing is safe.** User- and AI-provided content is untrusted. API changes enforce auth, authorization, and tenant scoping. The server is the authority for permissions.
- **Never commit** secrets, API keys, tokens, private URLs, generated bundles, logs, local exports, screenshots, or build artifacts.
- **Preserve backwards compatibility** while legacy browser globals (`window.*` bridges) still have consumers.
- **When uncertain, make the conservative choice and write it down** in a decision entry or handoff. Silent guesses are how mistakes hide.
- **Prove it before you call it done** (§5). "It should work" is not done.
- **No duplicate nodes — enumerate the existing library FIRST.** Before adding any node, list the nodes already in its target category and confirm none already does the job.
- Every new node is tested like a real user — meaningful results, usable inputs/outputs, working sample graph.

---

## 2. Ticket lifecycle

```
⬜ draft      PM has not confirmed AC yet — agents may not start work
🔵 ready      PM confirmed via docs/PM.md — morpheus decomposes, agents branch
🟡 in-progress At least one task branch is active
🔴 blocked    Waiting on a dependency or external input
✅ done        All AC checked [x], merged to develop, PM wrote APPROVE TICK-NNN
```

**PM approval flow:**
1. Agents merge to develop, update `## Run comments` in the ticket file.
2. Morpheus writes the structured Coordinator Response to `docs/PM.md`.
3. PM tests on develop, then writes `APPROVE TICK-NNN` in `docs/PM.md → ### Planning` before the next run.
4. On the next "run", morpheus reads APPROVE entries → marks ✅ done → `git mv docs/tickets/TICK-NNN.md docs/tickets/done/TICK-NNN.md`.
5. A ticket is **never archived without a PM APPROVE** — merged ≠ done.

---

## 3. Branch discipline

**One branch = one ticket, always off `develop`, merged back and deleted.**

```powershell
# 1. Start from up-to-date develop
git switch develop
git pull --ff-only origin develop

# 2. One branch for one ticket
git switch -c type/tick-NNN-short-name   # feat/ fix/ chore/ docs/ refactor/

# 3. Work in small chunks

# 4. Merge back, delete, push
git switch develop
git merge --no-ff type/tick-NNN-short-name -m "merge: short task summary"
git branch -d type/tick-NNN-short-name
git push origin --delete type/tick-NNN-short-name
git push origin develop
```

After every merge, delete orphaned `worktree-agent-*` branches:
```powershell
git branch | Select-String "worktree-agent-" | ForEach-Object { git branch -D $_.ToString().Trim() }
```

---

## 4. Multi-agent ownership

Claim the workboard before coding. Release on merge. Rules:

1. **Partition by module.** Each agent owns a *disjoint* set of path globs from the map in [`ARCHITECTURE.md`](ARCHITECTURE.md) §3. Two agents must never own overlapping paths.
2. **New file over shared edit.** Land behavior in a *new file you own*, wired in with a one-line touch to a shared file.
3. **Claim before coding.** Add your row to [`agent-workboard.md`](agent-workboard.md) before the first edit.
4. **Serialize hot files.** Only one agent at a time may lock:
   `src/app/app.js` · `src/main.js` · `src/ui/node-renderer.js` · `src/core/node-library.js` · `worker/index.mjs` · `wrangler.toml` · root `README.md` · `docs/ARCHITECTURE.md` · `.github/workflows/ci.yml`
5. **Sequence dependencies.** If task B needs task A's output, run A → merge → start B from updated develop.
6. **One integrator.** Only one agent/person runs `git push` to develop at a time.

---

## 5. Testing ladder

Run the smallest relevant check first, then widen as runtime risk rises.

| Risk | Run (cumulative) |
|---|---|
| Docs only | `rg` stale-ref check + `git diff --check` |
| One module's logic | `npm.cmd test <path/to/file.test.js>` |
| Any runtime/frontend code | `npm.cmd run lint:all` → `npm.cmd test` → `npm.cmd run build` |
| Browser workflow / UI | `npx.cmd playwright install chromium` (once) → `npm.cmd run test:e2e` |
| Worker / deployment | `npm.cmd run build` → `npx.cmd wrangler deploy --dry-run --env dev` |
| Dependencies changed | `npm.cmd audit --audit-level=moderate` |

Rules:
- A risky behavior change with no test is a **merge blocker**.
- Verify DOM/3D/render behavior in-app (Playwright) — headless unit tests can't see it.
- Report what you ran *and what you skipped and why*. Don't claim green you didn't run.

---

## 6. Security pass (mandatory per PR)

Every PR gets a security pass on the diff. For changes touching auth/authz, input parsing, file uploads, external integrations, or personal-data handling: run `/security-review` and file any new gaps as `docs/security/tickets/SEC-*`. Open security tickets are triaged by tech-lead → fixed by security-engineer → gated by reviewer.

---

## 7. Documentation duties

In the **same branch** as the code:

- **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — update when you change architecture, a design pattern, the module map, current status, or the roadmap.
- **[`architecture/decisions.md`](architecture/decisions.md)** — append a dated entry (newest first) for any durable decision about deployment, auth/session, data model, AI routing, realtime, or Connect/Revit safety.
- **[`agent-workboard.md`](agent-workboard.md)** — release your claim on merge.
- Root `README.md` — only for setup/script/deployment/product-behavior changes.
- After any rename/delete, search for stale references:
  ```powershell
  rg -n "old-name" README.md docs src worker api server .github
  ```

---

## 8. Start → merge checklist

### Before you start — ticket gate
- [ ] Locate the parent ticket (`docs/tickets/TICK-NNN.md`) from your task brief.
- [ ] Read its **Acceptance Criteria** — these are what "done" means.
- [ ] Read its **Testing gate** — know which AC require E2E, unit tests, or manual verification.
- [ ] Ticket status must be 🔵 ready. If ⬜ draft, stop — wait for PM confirmation.

### Start
- [ ] Read [`ARCHITECTURE.md`](ARCHITECTURE.md) and confirm the task fits the big picture.
- [ ] Read [`agent-workboard.md`](agent-workboard.md); confirm your paths don't overlap an active claim. **Claim your row.**
- [ ] `git status` is clean.
- [ ] `git switch develop; git pull --ff-only origin develop`.
- [ ] `git switch -c type/tick-NNN-short-name`.

### Work
- [ ] Targeted `rg` before reading large files; inspect only involved files.
- [ ] Small diff, no unrelated refactors, prefer a new owned file.
- [ ] No generated files, logs, exports, screenshots, artifacts, secrets, or private URLs staged.

### Validation
- [ ] Ran the testing ladder (§5) appropriate to the risk; recorded results and anything skipped.
- [ ] UI/CSS work: all colors, fonts, spacing, icons follow [`STYLE.md`](STYLE.md).

### Acceptance criteria sign-off
For each AC in the parent ticket:
- [ ] Check it off (`- [x]`) in `docs/tickets/TICK-NNN.md` with a note: test file + line, or "manual browser: YYYY-MM-DD".
- [ ] UI changes: confirm at least one `tests/e2e/*.spec.js` covers the E2E-gated ACs.

### Commit & end
- [ ] Stage only intended files; commit with `type: short task summary`.
- [ ] `git switch develop` → `git merge --no-ff …` → `git branch -d <branch>` → `git push origin --delete <branch>` → `git push origin develop`.
- [ ] Delete any orphaned `worktree-agent-*` branches.
- [ ] Release your workboard claim.
- [ ] Update `docs/tickets/INDEX.md` status.
- [ ] **Write your structured JSON output** (§10) so morpheus can synthesize the run result.

---

## 9. Merge blockers — do not merge if

- Required checks fail (lint, tests, build).
- The parent ticket has unchecked `- [ ]` AC items.
- UI changes have no Playwright E2E spec covering the E2E-gated ACs.
- Oracle has not issued `VERDICT: APPROVE`.
- The PR did not get its mandatory security pass, or introduced an unresolved `critical`/`high` SEC ticket.
- Docs contradict implemented behavior.
- Secrets or generated artifacts are present.
- Deployment config points production domains at dev environments.
- The branch contains unexplained unrelated changes.

---

## 10. Structured output contract

**Every agent must produce this JSON object as its final output.** Morpheus reads these to synthesize the Coordinator Response in `docs/PM.md`. The stop hook validates the schema — missing fields block completion.

```json
{
  "ticket": "TICK-NNN",
  "branch": "type/tick-NNN-short",
  "files_changed": ["src/viewer/geo-selector.js", "tests/e2e/geometry-selection.spec.js"],
  "validation": {
    "lint": "0 errors",
    "tests": "1917 pass",
    "e2e": "12 pass",
    "build": "green"
  },
  "ac_checked": ["AC-1", "AC-2", "AC-3"],
  "issue": "Root cause description, or null if this was new work",
  "changed": [
    "Replaced position-delta guard with _isDragging boolean flag in geo-selector.js",
    "Changed MeshPhongMaterial to MeshBasicMaterial in toSelectionMesh()"
  ],
  "how_to_test": [
    "npm run dev → open localhost:5173",
    "Create Box.ByCenterWidthDepthHeight node",
    "Add Select.Faces node, click Select",
    "Orbit (drag-rotate) the scene, release — counter must NOT reset"
  ],
  "gaps": []
}
```

Required fields: `ticket`, `branch`, `files_changed`, `validation`, `ac_checked`, `issue`, `changed`, `how_to_test`, `gaps`.

After writing the JSON, **also update `## Run comments`** in the ticket file (`docs/tickets/TICK-NNN.md`) with the same information in human-readable form. Delete the previous run's comment — do not accumulate history.

---

## 11. Token efficiency

- Read [`ARCHITECTURE.md`](ARCHITECTURE.md) + this file first; then only the Tier-2 docs the task needs. Don't load the whole repo unless explicitly asked.
- Use targeted `rg "term" path` over opening broad folders.
- Don't paste full logs, bundles, or session JSON into context — keep error lines, filenames, and the relevant fields.
- Reuse findings already in the thread instead of re-deriving them.
