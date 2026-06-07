# Nova Documentation

This folder is the coordination surface for humans and AI agents. Keep it small, current, and decision-oriented.

## Start here (Tier 1)

| File | Purpose |
|---|---|
| [`PM.md`](PM.md) | **PM's single page** — sprint goals, run session planning, coordinator response |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **Source of truth** — what Nova is, architecture, patterns, module map, roadmap |
| [`RULES.md`](RULES.md) | **Agent operating rules** — branching, testing, checklist, structured output contract |
| [`STYLE.md`](STYLE.md) | **UI design system** — colors, fonts, spacing, icons (mandatory for any UI task) |

## Live coordination

| File | Purpose |
|---|---|
| [`agent-workboard.md`](agent-workboard.md) | Live ownership claims — who owns what right now |
| [`agent-handoff.md`](agent-handoff.md) | Short-lived task context between agents |

## Tickets

```
tickets/
  INDEX.md          ← live ticket board (morpheus owns this)
  _template.md      ← ticket template
  TICK-NNN.md       ← active tickets
  done/             ← archived tickets (PM approved)
```

## Detailed specs (Tier 2)

```
architecture/
  decisions.md              ← durable decision log (append-only, newest first)
  deployment.md             ← Cloudflare Worker deploy, domains, secrets
  accounts-collaboration.md ← accounts + realtime collab design
  revit-connect.md          ← Nova Connect + Revit architecture

design/
  ai-chat-experience.md     ← AI chat UX architecture
  ai-system-prompt.md       ← AI expert-design prompt

security/
  tickets/SEC-*.md          ← security audit tickets

task-briefs/
  T??-*.md                  ← morpheus-generated agent task briefs (deleted when ticket archives)
```

## Documentation policy

- Update [`ARCHITECTURE.md`](ARCHITECTURE.md) in the same branch as any change to architecture, design patterns, the module map, current status, or the roadmap.
- Append durable decisions to [`architecture/decisions.md`](architecture/decisions.md) (newest first); mark superseded entries instead of deleting.
- Claim/release owned paths on [`agent-workboard.md`](agent-workboard.md) as you start/finish.
- Add a [`agent-handoff.md`](agent-handoff.md) entry when a task leaves context the next agent needs.
- Delete stale task briefs when their parent ticket archives.
- Prefer updating an existing doc over adding new fragments.
