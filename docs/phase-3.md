# Phase 3: Enterprise Packaging and Modular Delivery

## Objective

Move the project from prototype tooling into a maintainable, buildable architecture that supports enterprise packaging, versioned deployment, and future modular delivery.

## Goals

- Establish a modern module-aware build system
- Create a single application entrypoint
- Move legacy browser runtime behavior into explicit source modules
- Preserve temporary compatibility globals only where current browser markup or integrations still require them
- Document the enterprise delivery workflow and acceptance criteria

## Phase 3 Deliverables

- `vite.config.js` for modern dev and production builds
- `src/main.js` as the module bootstrap entrypoint
- Source modules under `src/` for app, core, runtime, geometry, AI, UI, viewer, and integration layers
- `package.json` scripts for dev, build, test, lint, and browser workflow validation
- Documentation for the Source to Dist workflow and migration status

## Completion Status

**Status as of May 18, 2026:** complete.

- `npm run build` succeeds and emits `dist/index.html` plus bundled assets under `dist/assets/`.
- `src/main.js` initializes the app using explicit ES module imports.
- `src/legacy-loader.js` raw-script injection has been removed from the Vite boot path.
- There are no remaining `?raw` runtime imports under `src/`.
- The production build no longer reports the previous large JavaScript chunk warning caused by bundling raw legacy scripts.
- Runtime compatibility globals remain available where inline handlers and browser integrations still depend on `window.*`.

## Current Validation Gates

- `npm run lint:all`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- `npm audit --audit-level=moderate`

## Follow-Up Work

- Reduce temporary `window.*` compatibility bridges.
- Replace inline HTML event handlers with module-owned DOM listeners.
- Decide whether root legacy files should remain as a no-build fallback or be retired.
- Expand browser workflow coverage around drag/drop wiring, save/load, help panels, 3D viewport selection, settings, and Revit data flows.
- Replace placeholder deploy jobs with a real staging or production deployment target.
