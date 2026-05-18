# Source → Dist Toolchain Plan

## Objective

Create a reproducible build workflow for the prototype that supports incremental migration from legacy global scripts to a modular `src/` codebase.

## Current state

- The app is currently authored as a legacy browser prototype with multiple classic `<script>` files.
- Quality tooling is in place: ESLint, Prettier, Vitest.
- Core behavior has started migrating into `src/core/`, `src/ai/`, and `src/ui/` modules.
- The runtime still depends on legacy files such as `app.js`, `engine.js`, `gpt-client.js`, and `node-library.js`.
- `npm test`, `npm test -- --coverage`, `npm run lint:all`, and `npm run build` currently complete successfully.
- The current Vite build works, but it still bundles the legacy runtime through `src/legacy-loader.js` and reports a large JavaScript chunk warning.
- Compatibility bridges are in place for `Viewer3D`, `AIEngine`, `NFLogger`, `NODE_META`, and the node registry globals: `src/main.js` imports their `src/` modules directly and exposes legacy `window.*` globals, so the Vite boot path no longer injects root `viewer3d.js`, `ai-engine.js`, `logger.js`, `node-metadata.js`, or `nodes.js` as raw text.
- The remaining module migration is organized as branch-sized tasks in `docs/module-migration-branch-plan.md`.

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

Current correction: `npm run build` is no longer a placeholder. It produces the Vite `dist/` bundle, with the remaining caveat that the bundle still includes legacy scripts through `src/legacy-loader.js`.

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
4. Continue replacing `src/legacy-loader.js` raw-script injection with explicit imports as legacy files are converted. `Viewer3D`, `AIEngine`, `NFLogger`, `NODE_META`, and the node registry have already moved to this pattern.
5. Split the production bundle once large runtime areas have stable module boundaries.
6. Remove `src/legacy-loader.js` after all branch tasks in `docs/module-migration-branch-plan.md` have landed.

## Acceptance criteria for Phase 2

- Legacy runtime files remain runnable during migration.
- Quality tooling validates both new modules and old UI code.
- Unit tests cover new module boundaries and legacy UI helper behaviors.
- Build plan is documented and reproducible.
