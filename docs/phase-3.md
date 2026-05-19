# Phase 3: Enterprise Packaging and Modular Delivery

## Objective

Move the project from prototype tooling into a maintainable, buildable architecture that supports enterprise packaging, versioned deployment, and future modular delivery.

## Goals

- Establish a modern module-aware build system
- Create a single application entrypoint for future refactoring
- Begin migrating legacy browser globals to explicit source modules
- Document the enterprise delivery workflow and acceptance criteria

## Phase 3 deliverables

- `vite.config.js` for modern dev and production builds
- `src/main.js` as the module bootstrap entrypoint
- `package.json` scripts for `dev`, `build`, and `preview`
- A documented Source→Dist plan in `docs/toolchain-plan.md`
- `docs/phase-3.md` describing enterprise packaging goals

## Phase 3 tasks

1. Add Vite as the primary build and dev server tool.
2. Create a module-aware application entrypoint under `src/main.js`.
3. Preserve current runtime behavior with compatibility wrappers during migration.
4. Update `index.html` to optionally support ESM bootstrap.
5. Add build scripts and documentation for the Source→Dist workflow.
6. Extend source structure guidance for enterprise packaging.

## Acceptance criteria

- `npm run dev` starts a local dev server for the app.
- `npm run build` produces a `dist/` bundle from the current application shell.
- The repository has a documented enterprise packaging plan.
- Core modules can be incrementally imported from `src/`.

## Current validation update

- `npm run build` succeeds and emits `dist/index.html` plus bundled assets under `dist/assets/`.
- The production build currently reports a large JavaScript chunk warning because the legacy runtime is still loaded through `src/legacy-loader.js`.
- Phase 3 should remain open until raw legacy script injection is replaced by explicit module imports for the major runtime areas.
- `Viewer3D` is now imported from `src/viewer/viewer3d.js` and exposed through `window.Viewer3D` for legacy consumers, removing one raw-script injection from the Vite boot path.
- `AIEngine` is now imported from `src/ai/ai-engine.js` and exposed through `window.AIEngine`, removing another raw-script injection from the Vite boot path.
- `NFLogger` is now imported from `src/core/logger.js` and exposed through `window.NFLogger`, removing the logger raw-script injection from the Vite boot path.
- `NODE_META` and its helper functions are now imported from `src/core/node-metadata.js` and exposed through compatibility globals, removing the metadata raw-script injection from the Vite boot path.
- `NODE_LIBRARY`, `NODE_TYPE_MAP`, and `TYPE_COLORS` are now imported from `src/core/nodes.js` and exposed through compatibility globals, removing the node registry raw-script injection from the Vite boot path.
- The remaining migration work is split into GitHub-ready branch tasks in `docs/module-migration-branch-plan.md`.

## Notes

This phase is intentionally incremental: it establishes the build tooling and entrypoint without requiring a full runtime refactor yet.
