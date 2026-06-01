# Repository Instructions

## Scope

These instructions apply to the entire repository.

## Working Style

- Be concise, targeted, and efficient with context.
- Inspect only files directly relevant to the current task.
- Prefer partial reads and targeted searches over broad repository scans.
- Make the smallest viable change and avoid unrelated refactors.
- Prefer diffs and changed sections over full-file rewrites.
- Reference existing files, functions, and patterns instead of copying large blocks.
- Preserve backwards compatibility, especially while legacy browser globals remain.

## Architecture

- The app now boots through explicit `src/` module imports from `src/main.js`.
- New browser/runtime code should live under `src/`.
- Cloudflare Worker code lives under `worker/`.
- Shared server helpers that are imported by Worker and tests may live under `api/`, but Worker routes are the deployment source of truth.
- Keep temporary `window.*` compatibility bridges only when existing browser consumers still need them.
- Current architecture and agent coordination docs:
  - `docs/architecture-decisions.md`
  - `docs/accounts-collaboration.md`
  - `docs/revit-plugin-architecture.md`
  - `docs/deployment-guide.md`
  - `docs/agent-handoff.md`
- Before merging a branch, use `docs/agent-merge-checklist.md` to verify docs, tests, validation commands, and merge blockers.

## Coding Style

- Use existing JavaScript style in nearby files.
- Keep code simple and browser-compatible.
- Do not add dependencies unless necessary.
- Use existing config files as the source of truth:
  - `.eslintrc.cjs`
  - `.prettierrc`
  - `vite.config.js`
  - `vitest.config.js`
  - `playwright.config.cjs`

## Testing

Run the smallest relevant checks first, then broader gates when runtime behavior changes.

Common commands:

```powershell
npm.cmd run lint:all
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd audit --audit-level=moderate
```

Use `npm.cmd` on Windows to avoid PowerShell execution-policy issues.

Browser workflow tests require Chromium once per machine:

```powershell
npx.cmd playwright install chromium
```

## Token Efficiency Rules

- Follow `docs/ai-agent-token-guide.md`.
- Do not load or analyze the entire repository unless explicitly requested.
- Avoid long explanations unless requested.
- Do not repeat unchanged code or large logs.
- Work incrementally and report only essential implementation details.
- Compress progress during long sessions and drop irrelevant history.

