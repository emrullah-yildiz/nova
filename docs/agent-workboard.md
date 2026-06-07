# Agent Work Board — live concurrency claims

> **Claim before you code.** This is the live record of who owns what *right now*,
> so multiple agents never touch the same files. It is short-lived state — not a
> history log (that's [`agent-handoff.md`](agent-handoff.md)). Rules live in
> [`ENGINEERING.md`](ENGINEERING.md) §3.

## How to use it

1. Before your first edit, **add a row** to *Active claims* with your branch, the
   path globs you own, and any hot files you need to lock.
2. Your owned globs **must be disjoint** from every other active row. If they
   overlap, coordinate or pick different work.
3. To edit a **hot file** (list below), put it in your "Hot locks" cell. Only one
   active row may lock a given hot file at a time — if it's taken, wait or ask.
4. On merge, **delete your row** (release the claim).

## Hot files (one agent at a time)

`src/app/app.js` · `src/main.js` · `src/ui/node-renderer.js` ·
`src/core/node-library.js` · `worker/index.mjs` · `wrangler.toml` ·
root `README.md` · `docs/NOVA.md` · `.github/workflows/ci.yml`

## Active claims

| Branch | Agent | Task | Owned paths (globs) | Hot locks | Started | Status |
|---|---|---|---|---|---|---|
| docs/doc-architecture-v2 | claude (orchestrator) | Documentation architecture upgrade — PM.md, ENGINEERING.md, CLAUDE.md, NOVA.md, _template.md, agent-workboard.md | `docs/**`, `CLAUDE.md` | `docs/NOVA.md` | 2026-06-07 | **active** |

## Released claims (last sprint — for reference, delete when stale)

All prior branches merged and closed as of 2026-06-07. See git log for history.
