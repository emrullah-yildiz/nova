# Nova — Claude Code Context

This file is loaded automatically by Claude Code at session start.
It is the single entry point that tells Claude Code how to operate in this repo.

## Read immediately on every session start

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — what Nova is, architecture, patterns, module ownership map.
2. [`docs/RULES.md`](docs/RULES.md) — how to work: branching, testing ladder, multi-agent rules, structured output contract, start→merge checklist.
3. [`docs/STYLE.md`](docs/STYLE.md) — UI design system: colors, fonts, spacing, icons. **Mandatory for any UI/viewer/CSS task.**
4. [`docs/PM.md`](docs/PM.md) — the PM's current sprint goals and the active run session.
5. [`docs/tickets/INDEX.md`](docs/tickets/INDEX.md) — live ticket board. Know what's in-progress before starting anything new.

Do not load any other docs unless the task specifically needs them.

---

## Sprint lifecycle

```
PM edits docs/PM.md → writes what they want in ### Planning → says "run"
        │
        ▼
Morpheus reads docs/PM.md (Planning section + Sprint goals)
        │
        ├─ APPROVE TICK-NNN entries → archive those tickets → move to docs/tickets/done/
        │
        ├─ New sprint items → create TICK-NNN tickets → show AC in Coordinator Response
        │                     PM reads response, confirms by writing "APPROVE TICK-NNN" next run
        │
        ├─ Confirmed/ready tickets → decompose into task briefs → dispatch agents in parallel
        │
        └─ Agents work on branches (one branch per ticket)
                │
                ▼
        Each agent produces structured JSON output (RULES.md §10)
                │
                ▼
        Solution tested (lint:all + test + build must pass; UI changes need Playwright E2E)
                │
                ▼
        Branch merged to develop → branch deleted
                │
                ▼
        Morpheus synthesizes all agent JSON into Coordinator Response
        Writes to docs/PM.md ### Coordinator Response (overwrites previous)
        Writes ## Run comments in each ticket file (overwrites previous)
                │
                ▼
        PM reads docs/PM.md Coordinator Response
        PM writes APPROVE TICK-NNN in Planning → says "run" → tickets archive
```

---

## "run" — the PM trigger

When the user says **"run"** (or "start", "go", "plan", "kick off"):

1. Read `docs/PM.md` and `docs/tickets/INDEX.md`.
2. Invoke **morpheus** via the Agent tool with the prompt below.

```
Read docs/PM.md (full file) and docs/tickets/INDEX.md.

PHASE 1 — Process APPROVE entries:
  For every "APPROVE TICK-NNN" in ### Planning:
    - Confirm all ACs are [x] in the ticket file.
    - Mark status ✅ done in INDEX.md.
    - git mv docs/tickets/TICK-NNN.md docs/tickets/done/TICK-NNN.md
    - Delete the task brief files for that ticket.

PHASE 2 — New sprint items (no ticket yet):
  For each goal in the Sprint section with no TICK-* ticket:
    - Create docs/tickets/TICK-NNN.md using docs/tickets/_template.md.
    - Show the AC in the Coordinator Response for PM confirmation.
    - Do NOT dispatch agents until PM writes APPROVE in the next run.

PHASE 3 — Ready tickets (status: 🔵 ready):
  - Decompose into task briefs under docs/task-briefs/.
  - Update docs/agent-workboard.md with new claims.
  - Dispatch specialist agents in PARALLEL for independent tasks (one branch per ticket).
  - Each agent MUST return the structured JSON defined in docs/RULES.md §10.

PHASE 4 — Synthesize and write results:
  Collect all agent JSON outputs. Write to docs/PM.md ### Coordinator Response:

  {
    "run": "YYYY-MM-DD",
    "tickets_actioned": [
      {
        "id": "TICK-NNN",
        "title": "...",
        "status": "archived | reopened | in-progress",
        "issue": "What was wrong, or null",
        "changed": ["..."],
        "how_to_test": ["Step 1", "Step 2"]
      }
    ],
    "new_tickets": [{ "id": "TICK-NNN", "title": "...", "ac_preview": ["AC-1 ..."] }],
    "agents_dispatched": [{ "agent": "switch", "brief": "T09d", "branch": "feat/tick-009d" }],
    "blockers": []
  }

  Also overwrite ## Run comments in each actioned ticket file with the same data in human-readable form.
  DELETE the old ### Coordinator Response before writing the new one.
  DELETE the old ## Run comments in ticket files before writing the new ones.

PHASE 5 — Report:
  - Summarize in 2–3 sentences what was done.
  - If all active tickets are archived: say so and ask the PM for the next sprint green light.
```

Do not archive a ticket without a PM APPROVE entry. Do not dispatch agents for ⬜ draft tickets.

---

## Branch rules (enforced)

- **One branch per ticket.** Name it `type/tick-NNN-description`.
- Branch off `develop`. Merge back to `develop`. Never commit straight to `develop` or `main`.
- After merge: delete local branch + remote branch. Clean up orphaned `worktree-agent-*` branches.
- Run `npm run lint:all && npm run test && npm run build` before every push.
- UI/viewer changes require a Playwright E2E spec.
- Every ticket's AC must be checked off `[x]` before the branch merges.

---

## Agent team

| Trigger | Agent | Role |
|---|---|---|
| "run" / "start" / "go" | morpheus | Reads PM.md → writes/archives tickets → dispatches agents → writes Coordinator Response |
| "review" + branch name | oracle | Adversarial diff review + AC check before merge |
| "merge" / "land" | dozer | Merges green branches into develop in dependency order |
| "security audit" | seraph | Read-only security audit → files SEC-* tickets |
| "fix security" | ghost | Implements code fixes for SEC-* tickets |

---

## Workboard

`docs/agent-workboard.md` is the live ownership map — claim before coding, release on merge.
