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

- The app is migrating from legacy global browser scripts to explicit `src/` modules.
- New or migrated code should live under `src/` and expose `window.*` compatibility bridges only when legacy consumers still need them.
- Keep root legacy files intact when they are still needed by the file-protocol fallback in `index.html`.
- Reduce `src/legacy-loader.js` raw-script injection incrementally, one contained runtime slice at a time.
- Follow the current migration notes in:
  - `docs/toolchain-plan.md`
  - `docs/phase-3.md`
  - `docs/enterprise-readiness-strategy.md`

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

- Do not load or analyze the entire repository unless explicitly requested.
- Avoid long explanations unless requested.
- Do not repeat unchanged code or large logs.
- Work incrementally and report only essential implementation details.
- Compress progress during long sessions and drop irrelevant history.

