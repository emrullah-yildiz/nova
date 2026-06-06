---
id: TICK-008
title: Live agent dashboard — futuristic real-time view of agent activity
status: draft
priority: high
type: feature
sprint: 2026-06-06
created: 2026-06-06
lanes: ui, platform
branch: feat/agent-dashboard
---

## User story

As the PM, when I say "run" in the Claude Code chat, I can open a live dashboard app that shows me exactly what agents are doing right now — their active tasks, inter-task dependencies, token usage estimates, and animated status — so I can follow complex multi-agent sprints in real time without reading raw logs.

## Context

The team runs multi-agent sprints through morpheus. Currently the only visibility is reading `docs/agent-workboard.md` and watching the Claude Code terminal. This ticket adds a standalone web dashboard that:

1. Reads `docs/agent-workboard.md` (and optionally `docs/tickets/INDEX.md`) as its data source.
2. Renders a futuristic, animated real-time view of all active/queued/blocked tasks, the agents working them, and the dependency chain between tasks.
3. Starts updating the moment "run" is said — no manual refresh.

The dashboard is a standalone HTML/JS page served locally (e.g., `npm run dashboard` → `http://localhost:4242`). It does not require the Nova app to be running. It polls or watches the markdown files on disk and re-renders on change.

## Acceptance criteria

- [ ] AC-1  Running `npm run dashboard` starts a local server and opens (or prints) `http://localhost:4242`. The page loads within 3 seconds.
- [ ] AC-2  The dashboard reads `docs/agent-workboard.md` and renders one card per active row: agent name, task description, branch, owned paths, and current status (active / queued / blocked / merged).
- [ ] AC-3  The dashboard re-renders automatically within 5 seconds of `docs/agent-workboard.md` changing on disk — no manual browser refresh required.
- [ ] AC-4  Tasks that are connected by a declared dependency (e.g., "awaits T07a merge") are visually linked with an animated connector line on the dashboard.
- [ ] AC-5  Each agent card shows an estimated token usage badge. The estimate is derived from the task brief word count × a fixed cost coefficient (e.g., 4 tokens/word). The badge updates when the workboard changes.
- [ ] AC-6  The visual design is dark-theme, futuristic, and high-contrast — matching Nova's design language (`docs/STYLE.md`). Active tasks pulse or glow; blocked tasks show a distinct color; completed/merged tasks fade out.
- [ ] AC-7  The dashboard degrades gracefully when `docs/agent-workboard.md` is empty or has no active rows — it shows "No active agents" in the center of the canvas.
- [ ] AC-8  A Playwright E2E spec (`tests/e2e/agent-dashboard.spec.js`) launches the dashboard server, navigates to `http://localhost:4242`, and asserts: the page title is present, at least one agent card renders (using a fixture workboard file), and the auto-refresh fires when the fixture file is modified.

## Testing gate

- E2E (Playwright): AC-1, AC-2, AC-3, AC-8
- Manual browser: AC-4, AC-5, AC-6, AC-7
- Unit test: AC-5 (token-estimate calculation function in isolation)

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/agent-dashboard`
2. `npm install && npm run dashboard`
3. Open `http://localhost:4242` in a browser.
4. **AC-1:** Page loads, dashboard title visible.
5. **AC-2:** Read `docs/agent-workboard.md` — confirm every active row has a matching card with correct agent name and status.
6. **AC-3:** Edit `docs/agent-workboard.md` (add a fake row). Watch the browser — within 5 s the new card appears without a manual refresh.
7. **AC-4:** Confirm that tasks with "awaits T07a" or similar text show a visual connector to the dependency task.
8. **AC-5:** Hover or inspect an agent card — a token-estimate badge is visible and has a non-zero value.
9. **AC-6:** Visual check — dark background, glowing active cards, blocked cards in a distinct color (e.g., amber), merged/done cards faded.
10. **AC-7:** Delete or clear `docs/agent-workboard.md` rows temporarily — dashboard shows "No active agents" message.

### Automated tests

```bash
npm run lint:all          # must be 0 errors
npm run test              # all unit/integration tests must pass
npm run test:e2e          # Playwright specs must pass
```

### How to mark an AC done

Change `- [ ] AC-N` to `- [x] AC-N` and append a note:
- For automated: `— covered by tests/e2e/agent-dashboard.spec.js:line`
- For manual: `— manual browser YYYY-MM-DD: [what you observed]`

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC-1, AC-2, AC-3, AC-8
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

## Notes

- The dashboard is a developer/PM tool — it does not ship as part of the Nova product. It lives in `dashboard/` or `tools/dashboard/`.
- Polling interval for file-watch: 2 s is sufficient. Use `chokidar` or a plain `setInterval` + `fs.statSync` to detect changes.
- Token estimate formula: `wordCount(taskBrief) × 4`. Word count = whitespace-split token count of the task brief markdown. This is an order-of-magnitude estimate, not a precise billing figure.
- Dependency parsing: scan each workboard row's "Task" cell for patterns like "awaits T07a", "depends on T06b", "blocked (awaits ...)". Extract the referenced task ID and draw a directed edge.
- Animation: CSS keyframe `@keyframes pulse` for active cards; `opacity: 0.4` for merged/done. Connector lines: SVG `<line>` elements overlaid on the card grid, animated with `stroke-dashoffset`.
- The dashboard server script: `dashboard/server.js` — a minimal Node.js HTTP server (no framework needed, or use `http-server` / `serve` as a dep). Serves `dashboard/index.html` and a `/data` endpoint that returns the parsed workboard JSON.
