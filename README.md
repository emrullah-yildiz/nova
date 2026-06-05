# Nova

Nova is a browser-based visual scripting workspace for parametric design, geometry exploration, AI-assisted graph creation, and Revit/Rhino-oriented workflows.

## Overview

The application combines a node-based design canvas, a 3D viewport, a custom geometry kernel, AI-assisted code generation, and early Nova Connect support for desktop design-tool integrations.

## Current Status

- Vite-powered browser application with explicit `src/` module imports.
- Graph execution, geometry utilities, node registry, AI workflow, and UI modules are organized under `src/`.
- Vitest and Playwright coverage are present.
- GitHub Actions gates linting, unit tests, browser workflow tests, build, dependency audit, and Cloudflare Worker deploys.
- Cloudflare Workers are the only deployment target. `develop` deploys to `nova-dev`; `main` deploys to `hi-nova.work`.
- The Worker hosts static assets, API routes, AI proxying, feedback, auth/project routes, and realtime room entrypoints.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the local Vite dev server:

```bash
npm start
```

3. Or run the equivalent dev command directly:

```bash
npm run dev
```

4. Build a production bundle:

```bash
npm run build
```

5. Start the local Cloudflare Worker shape:

```bash
npm run build
npm run cf:dev
```

6. Run browser workflow checks:

```bash
npx playwright install chromium
npm run test:e2e
```

7. Open `http://127.0.0.1:8080` in your browser if the server does not automatically open.

## Project Structure

- `index.html` - main application shell
- `src/main.js` - browser module bootstrap
- `src/app/` - application state and persistence helpers
- `src/core/` - graph execution, compute engine, node metadata, and logging
- `src/geometry/` - geometry kernel and math utilities
- `src/ai/` - AI client and assistant integration
- `src/ui/` - node editor, library, help, port, and canvas UI modules
- `src/viewer/` - 3D viewport and geometry selection
- `src/integrations/` - Nova Connect and Revit browser integration modules
- `integrations/revit-addin/` - C# Revit add-in source
- `scripts/connect-hub.cjs` - local Nova Connect WebSocket hub prototype
- `tests/` - Vitest and Playwright tests

## Testing

Nova has two test layers. Run them locally before pushing any change.

### Unit tests (Vitest)

```bash
npm run test
```

Runs all Vitest specs under `tests/`. No browser or dev server required.

### E2E tests (Playwright)

One-time browser setup (run once per machine):

```bash
npx playwright install chromium
```

Run the full E2E suite (starts the Vite dev server automatically):

```bash
npm run test:e2e
```

Specs live in `tests/e2e/`. The Playwright configuration is at `playwright.config.js`
(timeout: 30 s per test, baseURL `http://localhost:5173`).

CI runs `npm run test:e2e` automatically on every pull request that touches `src/`
or `tests/`. A failing spec blocks the PR.

---

## Documentation

Two files are the entry points:

- **`docs/NOVA.md`** - the living **source of truth**: what Nova is, how it's
  built, design patterns, current status, and roadmap. Read it before any
  architectural decision.
- **`docs/ENGINEERING.md`** - **how we work**: operating principles, branch-per-task,
  the multi-agent model, the testing ladder, and the start→merge checklist.

See `docs/README.md` for the full doc map. Detailed specs live under
`docs/architecture/` (decisions, deployment, accounts-collaboration, revit-connect)
and `docs/design/` (AI chat + prompt).

Before merging a task branch, run the checklist in `docs/ENGINEERING.md` and record
durable decisions in `docs/architecture/decisions.md`.
