# Source → Dist Toolchain Plan

## Objective

Create a reproducible build workflow for the prototype that supports incremental migration from legacy global scripts to a modular `src/` codebase.

## Current state

- The app now boots through `src/main.js` using explicit ES module imports.
- Quality tooling is in place: ESLint, Prettier, Vitest.
- Core behavior has migrated into `src/core/`, `src/ai/`, `src/app/`, `src/runtime/`, `src/geometry/`, `src/viewer/`, and `src/ui/` modules.
- `npm test`, `npm test -- --coverage`, `npm run lint:all`, and `npm run build` currently complete successfully.
- The Vite build works without `src/legacy-loader.js` or `?raw` legacy script injection.
- Compatibility bridges remain in place for browser globals such as `window.app`, `window.Geo`, `window.Viewer3D`, `window.NFLogger`, and node registry objects while inline handlers and plugin integrations are still being cleaned up.

## Recommended next steps

1. Keep the existing `index.html` bootstrap while converting individual legacy files to ES modules.
2. Create a single application entrypoint under `src/main.js` that imports the new moduleized layers.
3. Replace legacy globals progressively with exported APIs and explicit imports.
4. Use a modern bundler for dev and production builds:
   - Prefer `Vite` for fast dev server, HTML entry processing, and static asset handling.
   - Use `esbuild` or `Rollup` if a lightweight bundle is desired.
5. Preserve the current app behavior during migration by using compatibility wrapper files at the legacy entrypoint.
6. Use the branch plan in `docs/module-migration-branch-plan.md` to create focused PRs from `develop` back into `develop`.

## Toolchain components

- `npm run start` - local Vite development server
- `npm test` — automated test execution via `vitest`
- `npm run lint:src` — lint new `src/` modules
- `npm run lint:app` / `npm run lint:legacy` — lint UI and legacy browser files
- `npm run format` — code formatting via `prettier`
- `npm run build` - produces the current Vite `dist/` bundle while migration continues

Current correction: `npm run build` is no longer a placeholder. It produces the Vite `dist/` bundle through explicit source-module imports.

## Build output

- `dist/` — production assets
- `dist/index.html` — built app shell
- `dist/assets/` — bundled JavaScript and static assets

## Migration plan

1. Establish the `src/` structure.
2. Extract one legacy layer at a time:
   - Core compute engine
   - AI provider and GPT integration
   - UI helpers and node library logic
3. Add tests for each extracted module before replacing the legacy entrypoint.
4. Continue reducing compatibility globals and inline event handlers now that raw-script injection is gone.
5. Split the production bundle if future runtime growth pushes chunks back over the warning threshold.
6. Expand browser workflow coverage around drag/drop wiring, file import/export, 3D viewport behavior, and settings flows.

## Acceptance criteria for Phase 2

- Legacy runtime files remain runnable during migration.
- Quality tooling validates both new modules and old UI code.
- Unit tests cover new module boundaries and legacy UI helper behaviors.
- Build plan is documented and reproducible.
