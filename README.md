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

## Documentation

Start with `docs/README.md`. The most important current docs are:

- `docs/AGENTS.md` - repository instructions for AI agents and contributors.
- `docs/ai-agent-token-guide.md` - token-efficient working rules for agents.
- `docs/agent-merge-checklist.md` - checklist before merging task branches to `develop`.
- `docs/agent-handoff.md` - short task handoffs for multi-agent collaboration.
- `docs/architecture-decisions.md` - durable architecture decision log.
- `docs/deployment-guide.md` - Cloudflare Worker deployment and branch/domain mapping.
- `docs/accounts-collaboration.md` - accounts, sharing, and realtime collaboration architecture.
- `docs/revit-plugin-architecture.md` - Nova Connect and Revit integration architecture.

Before merging a task branch, use `docs/agent-merge-checklist.md` and record
durable decisions in `docs/architecture-decisions.md`.
