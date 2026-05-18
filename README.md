# Nova

Nova is a browser-based visual scripting and parametric design prototype with AI-assisted graph editing.

Nova is a visual scripting workspace for Revit/Rhino.

## Overview

This repository contains a lightweight static web application that combines a node-based design canvas, a 3D viewport, a custom geometry kernel, and AI integration for code generation.

## Current status

- Prototype/demo application, not yet packaged for production
- Vite-powered HTML/CSS/JavaScript application with explicit ES module bootstrap
- Includes AI prompt integration via OpenAI/Groq/OpenRouter
- Includes Revit scripting examples and geometry utilities

## Run locally

1. Install dev dependencies:

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

## Project structure

- `index.html` - main application shell
- `src/main.js` - application bootstrap and module installer sequence
- `src/app/`, `src/core/`, `src/runtime/` - app state, graph execution, parser, and Python runner runtime
- `src/geometry/` - geometry kernel and math utilities
- `src/ai/` - AI client and provider integration
- `src/ui/` - node editor, panels, persistence UI, and Revit/geometry selector modules
- `src/viewer/` - 3D viewport and rendering helpers
- `tests/`, `e2e/` - unit and browser workflow coverage

## Phase 1 launch

This initial phase has begun with:

- `README.md` added
- `package.json` added
- `LICENSE` added
- `.gitignore` added
- `docs/phase-1.md` added

## Next Phase 1 goals

- Establish a modular build toolchain
- Add architecture and documentation artifacts
- Separate UI, engine, and AI integration cleanly
- Create a clear developer onboarding path

## Notes for maintainers

This repo now boots through the Vite/module path only. Legacy root runtime scripts and the old file-protocol fallback loader have been removed, so new runtime work should be added under `src/`.
