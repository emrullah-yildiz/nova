# Nova — Claude Code Context

This file is loaded automatically by Claude Code at session start.
It is the single entry point that tells Claude Code how to operate in this repo.

## Read immediately on every session start

1. [`docs/NOVA.md`](docs/NOVA.md) — what Nova is, architecture, patterns, module ownership map.
2. [`docs/ENGINEERING.md`](docs/ENGINEERING.md) — how to work: branching, testing ladder, multi-agent rules, start→merge checklist.
3. [`docs/STYLE.md`](docs/STYLE.md) — UI design system: colors, fonts, spacing, icons. **Mandatory for any UI/viewer/CSS task.**
4. [`docs/pm/PM.md`](docs/pm/PM.md) — unified PM workspace: current sprint, ticket responses awaiting review, PM comments. Read this to understand what matters right now.
5. [`docs/tickets/INDEX.md`](docs/tickets/INDEX.md) — live ticket board. Know what's in-progress before starting anything new.

Do not load any other docs unless the task specifically needs them.

---

## Sprint lifecycle

This is the canonical loop. Every sprint follows these phases in order.

```
PM edits PM.md ("This Sprint" section) → says "run"
        │
        ▼
Morpheus reads docs/pm/PM.md + docs/tickets/INDEX.md
        │
        ├─ New sprint items → create TICK-NNN tickets → show AC to PM → wait for confirmation
        │
        ├─ Confirmed tickets (ready) → decompose into task briefs → dispatch agents
        │
        └─ Tickets with PM comments → re-read PM.md "Ticket Responses" → fix or archive (see below)
                │
                ▼
        Agents work on branches (one branch per ticket)
                │
                ▼
        Solution tested in-browser (like a real user)
        lint:all + test + build + test:e2e must all pass
                │
                ▼
        Agent writes structured response to PM.md under the ticket section
        Branch merged to develop → local + remote branch deleted
                │
                ▼
        PM tests on develop → writes comment in "Your Comments" block in PM.md
                │
                ▼
        PM says "run" → morpheus reads PM.md comments:
          - Comment is negative / reports a bug → reopen ticket, new branch, fix, re-merge
          - Comment is positive / "Approved" → archive ticket (git mv to archive/)
                │
                ▼
        All tickets archived → morpheus reports → PM gives green light for next sprint
```

---

## "run" — the PM trigger

When the user says **"run"** (or "start", "go", "plan", "kick off"):

1. Read `docs/pm/PM.md` and `docs/tickets/INDEX.md`.
2. Invoke **morpheus** via the Agent tool with the prompt below.

```
Read docs/pm/PM.md and docs/tickets/INDEX.md.

PHASE 1 — PM comment review (do this first):
  Read the "Ticket Responses — Awaiting Your Review" section in docs/pm/PM.md.
  For every ticket response that has content in its "Your Comments" block:
    - If the comment is positive / says "Approved":
        → In docs/tickets/TICK-NNN.md: mark all AC [x], update status to ✅ done.
        → Move the ticket row to the Done table in docs/tickets/INDEX.md.
        → MOVE (not copy) the ticket file: `git mv docs/tickets/TICK-NNN.md docs/tickets/archive/TICK-NNN.md`. The original must not remain in docs/tickets/.
        → Move the ticket response block in PM.md from "Awaiting Your Review" to "Processed History".
    - If the comment reports a problem, regression, or missing behavior:
        → Set ticket status back to 🔵 ready in TICK-NNN.md.
        → Create a new task brief for the fix under docs/task-briefs/.
        → Dispatch the appropriate specialist agent on a new branch.
        → Keep the ticket response in PM.md (it will be overwritten when the fix is done).
    - If the "Your Comments" block is empty: leave it as-is.

PHASE 2 — New sprint items (tickets that don't exist yet):
  Read the "This Sprint" section in docs/pm/PM.md.
  For each sprint item that has no TICK-* ticket in INDEX.md:
    - Write a ticket file at docs/tickets/TICK-NNN.md using docs/tickets/_template.md.
    - Show the PM the acceptance criteria and wait for confirmation before decomposing.

PHASE 3 — Ready tickets (status: 🔵 ready, PM has confirmed AC):
  - Decompose into task briefs under docs/task-briefs/.
  - Update docs/agent-workboard.md with new claims.
  - Dispatch specialist agents in parallel for independent tasks (one branch per ticket).
  - After merge: agent writes structured response to PM.md under the ticket section.

PHASE 4 — Report:
  - Tickets with PM comments actioned (fixed / archived).
  - New tickets created (with AC shown for PM confirmation).
  - Agents dispatched.
  - Any blockers.
  - If all active tickets are archived: tell the PM all tickets are closed and ask for next sprint green light.
```

Do not decompose into task briefs until the PM has confirmed the acceptance criteria.
Do not archive a ticket without a positive PM comment.

---

## Branch rules (enforced)

- **One branch per ticket.** Name it after the ticket: `fix/tick-002-description` or `feat/tick-006-description`.
- Branch off `develop`. Merge back to `develop`. Never commit straight to `develop` or `main`.
- After merge: delete local branch + remote branch. Clean up any orphaned `worktree-agent-*` branches.
- Run `npm run lint:all && npm run test && npm run build` before every push.
- UI/viewer changes require a Playwright E2E spec (the Stop hook enforces this).
- Every ticket's AC must be checked off `[x]` before the branch merges (the Stop hook enforces this).

---

## Agent team

| Trigger word | Agent | Role |
|---|---|---|
| "run" / "plan" / "start" | morpheus | Reads priorities + PM comments → writes/archives tickets → dispatches agents |
| "review" + branch name | oracle | Adversarial diff review + AC check before merge |
| "merge" / "land" | dozer | Merges green branches into develop in dependency order |
| "security audit" | seraph | Read-only security audit → files SEC-* tickets |
| "fix security" | ghost | Implements code fixes for SEC-* tickets |

---

## Workboard

`docs/agent-workboard.md` is the live ownership map — claim before coding, release on merge.

---

## Maintenance

This file only changes when the team structure or the sprint lifecycle changes.
Product priorities and PM comments → `docs/pm/PM.md`.
Architecture decisions → `docs/architecture/decisions.md`.
Agent rules → `docs/ENGINEERING.md`.
