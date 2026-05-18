# NodeFlow AI

NodeFlow AI is a browser-based visual scripting and parametric design prototype with AI-assisted graph editing.

## Overview

This repository contains a lightweight static web application that combines a node-based design canvas, a 3D viewport, a custom geometry kernel, and AI integration for code generation.

## Current status

- Prototype/demo application, not yet packaged for production
- Plain HTML/CSS/JavaScript with global browser scripts
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

- `index.html` — main application shell
- `app.js` — application state and UI workflow
- `engine.js` — graph execution and node runtime
- `geometry-lib.js`, `geo-advanced.js`, `nurbs-math.js` — geometry kernel
- `gpt-client.js`, `gpt-integration.js` — AI API integration
- `node-library.js`, `node-renderer.js`, `node-search-popup.js` — node editor UI
- `save-load.js`, `logger.js`, `viewer3d.js` — persistence, logging, and 3D viewport

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

This repo currently works as a static browser app, but enterprise readiness requires upstream work on packaging, modularization, testing, and security.
