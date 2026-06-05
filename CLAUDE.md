# Nova — Claude Code Context

This file is loaded automatically by Claude Code at session start.
It is the single entry point that tells Claude Code how to operate in this repo.

## Read immediately on every session start

1. [`docs/NOVA.md`](docs/NOVA.md) — what Nova is, architecture, patterns, module ownership map.
2. [`docs/ENGINEERING.md`](docs/ENGINEERING.md) — how to work: branching, testing ladder, multi-agent rules, start→merge checklist.
3. [`docs/pm/PRIORITIES.md`](docs/pm/PRIORITIES.md) — the PM's current sprint goals and backlog. Read this to understand what matters right now.
4. [`docs/tickets/INDEX.md`](docs/tickets/INDEX.md) — live ticket board. Know what's in-progress before starting anything new.

Do not load any other docs unless the task specifically needs them.

---

## "run" — the PM trigger

When the user says **"run"** (or "start", "go", "plan", "kick off"):

1. Read `docs/pm/PRIORITIES.md` to see the current sprint items.
2. Read `docs/tickets/INDEX.md` to see which tickets already exist.
3. For each sprint item that has no ticket yet → morpheus writes the ticket.
4. Invoke **morpheus** via the Agent tool with the prompt:

```
Read docs/pm/PRIORITIES.md and docs/tickets/INDEX.md.
For each sprint item that has no TICK-* ticket yet:
  - Write a ticket file at docs/tickets/TICK-NNN.md using the template at docs/tickets/_template.md.
  - Show the user the acceptance criteria for each new ticket and ask for confirmation before decomposing into task briefs.
For tickets already confirmed and ready (status: ready):
  - Decompose into task briefs under docs/task-briefs/.
  - Update docs/agent-workboard.md with new claims.
  - Dispatch specialist agents in parallel for independent tasks.
  - Report: tickets created, tasks dispatched, any blockers.
```

Do not decompose into task briefs until the user has confirmed the acceptance criteria for each ticket.

---

## Agent team

| Trigger word | Agent | Role |
|---|---|---|
| "run" / "plan" / "start" | morpheus | Reads priorities → writes tickets → dispatches agents |
| "review" + branch name | oracle | Adversarial diff review + AC check before merge |
| "merge" / "land" | dozer | Merges green branches into develop in dependency order |
| "security audit" | seraph | Read-only security audit → files SEC-* tickets |
| "fix security" | ghost | Implements code fixes for SEC-* tickets |

---

## Operating rules (always apply)

- Never commit straight to `develop` or `main`. Every change = its own branch.
- Run `npm run lint:all && npm run test && npm run build` before any push.
- UI/viewer changes require a Playwright E2E spec (the Stop hook enforces this).
- Every ticket's acceptance criteria must be checked off before the branch merges (the Stop hook enforces this).
- The workboard (`docs/agent-workboard.md`) is the live ownership map — claim before coding, release on merge.

---

## Maintenance

This file only changes when the team structure or the "run" workflow changes.
Product priorities → `docs/pm/PRIORITIES.md`.
Architecture decisions → `docs/architecture/decisions.md`.
Agent rules → `docs/ENGINEERING.md`.
