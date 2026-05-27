# Nova

Nova is a browser-based visual scripting workspace for parametric design, geometry exploration, AI-assisted graph creation, and Revit/Rhino-oriented workflows.

## Overview

The application combines a node-based design canvas, a 3D viewport, a custom geometry kernel, AI-assisted code generation, and early Nova Connect support for desktop design-tool integrations.

## Current Status

- Vite-powered browser application with explicit `src/` module imports.
- Graph execution, geometry utilities, node registry, AI workflow, and UI modules are organized under `src/`.
- Vitest and Playwright coverage are present.
- GitHub Actions gates linting, unit tests, browser workflow tests, build, and dependency audit.
- Enterprise backend work is planned but not yet implemented.

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

5. Run browser workflow checks:

```bash
npx playwright install chromium
npm run test:e2e
```

6. Open `http://127.0.0.1:8080` in your browser if the server does not automatically open.

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

## Enterprise Planning

Current enterprise planning documents:

- `docs/backend-architecture.md`
- `docs/enterprise-mvp-requirements.md`
- `docs/revit-plugin-architecture.md`

Enterprise readiness work should focus on the trusted backend boundary, secure AI proxying, project persistence, identity/RBAC, audit logging, and hardened Nova Connect pairing.
