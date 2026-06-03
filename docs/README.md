# Nova Documentation

This folder is the coordination surface for humans and AI agents. Keep it small,
current, and decision-oriented.

## Start here (Tier 1)

- **[`NOVA.md`](NOVA.md)** — the living **source of truth**: what Nova is, how it's
  built, the design patterns, current status, and the roadmap. Read it before any
  architectural decision. Always kept current.
- **[`ENGINEERING.md`](ENGINEERING.md)** — **how we work**: operating principles,
  branch-per-task, the multi-agent model, the testing ladder, and the
  start→merge checklist. A junior dev can run a whole task from this one file.

## Detailed specs (Tier 2)

```
docs/
  NOVA.md                 ← source of truth (start here)
  ENGINEERING.md          ← coding + multi-agent rules
  README.md               ← this index
  agent-workboard.md      ← live concurrency claims (who owns what now)
  agent-handoff.md        ← short-lived task handoffs between agents
  enterprise-api.env.example  ← env-var reference
  architecture/
    decisions.md          ← durable decision log (append-only, newest first)
    deployment.md         ← Cloudflare Worker deploy, domains, secrets
    accounts-collaboration.md ← accounts + realtime collab design
    revit-connect.md      ← Nova Connect + Revit architecture
  design/
    ai-chat-experience.md ← AI chat UX architecture
    ai-system-prompt.md   ← AI expert-design prompt
```

Every Tier-2 doc links back up to `NOVA.md`.

## Documentation policy

- Update [`NOVA.md`](NOVA.md) in the same branch as any change to architecture,
  design patterns, the module map, current status, or the roadmap.
- Append durable decisions to [`architecture/decisions.md`](architecture/decisions.md)
  (newest first); mark superseded entries instead of deleting them.
- Add an [`agent-handoff.md`](agent-handoff.md) entry when a task leaves context the
  next agent needs.
- Claim/release your owned paths on [`agent-workboard.md`](agent-workboard.md) as
  you start/finish.
- Prefer updating an existing doc over adding new fragments; delete stale docs when
  superseded.
- Update this index when adding, removing, or renaming docs.
