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
- `src/main.js` now initializes the app using explicit ES module imports.
- `src/legacy-loader.js` raw-script injection has been removed from the Vite boot path.
- Runtime compatibility globals remain available where legacy inline handlers and browser integrations still depend on `window.*`.
- The production build no longer reports the previous large JavaScript chunk warning caused by bundling raw legacy scripts.

## Notes

This phase now establishes the build tooling, module entrypoint, and explicit runtime bootstrap without the raw legacy loader. Remaining hardening belongs in follow-up enterprise readiness work: broader browser workflow coverage, deployment, and production security review.
