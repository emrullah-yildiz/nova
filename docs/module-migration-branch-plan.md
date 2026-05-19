# Module Migration Branch Plan

## Objective

Complete the remaining module migration by replacing `src/legacy-loader.js` raw-script injection with explicit ES module imports, while preserving legacy `window.*` compatibility until each consumer has moved to direct imports.

## Branching Strategy

- `main` remains the production-ready branch.
- `develop` is the integration branch for module migration work.
- Each migration task branches from `develop` and opens a pull request back into `develop`.
- Use `feature/module-*` branches for migration work and `fix/module-*` branches for follow-up defects found after merge.
- Promote `develop` to `main` only after the full module migration passes lint, unit tests, browser workflow tests, build, and audit.

## Migration Tasks

### 1. `feature/module-geometry-kernel`

**Summary:** Move the geometry runtime into explicit modules.

**Description:** Convert `geometry-lib.js`, `geo-advanced.js`, and `nurbs-math.js` into `src/geometry/` modules with named exports and a temporary compatibility bridge for legacy consumers. Remove these files from `legacyScripts` once `src/main.js` imports the moduleized API directly.

**Scope:**

- Add `src/geometry/geometry-lib.js`.
- Add `src/geometry/geo-advanced.js`.
- Add `src/geometry/nurbs-math.js`.
- Expose required compatibility globals from `src/main.js` or a dedicated bridge module.
- Add or extend geometry tests that cover existing constructor/helper behavior.

**Acceptance criteria:**

- `geometry-lib.js`, `geo-advanced.js`, and `nurbs-math.js` are no longer imported through `?raw`.
- Existing geometry tests pass.
- `npm run lint:src`, `npm test`, and `npm run build` pass.

### 2. `feature/module-parser-pyrunner`

**Summary:** Move parser and Python runner code behind explicit runtime modules.

**Description:** Convert `parser.js` and `pyrunner.js` into `src/runtime/` modules. Preserve the browser globals currently used by `app.js`, `engine.js`, and AI-generated code until those consumers are migrated.

**Scope:**

- Add `src/runtime/parser.js`.
- Add `src/runtime/pyrunner.js`.
- Export parser and runner APIs with a compatibility bridge.
- Add targeted tests for parsing and runner behavior that is stable enough to assert.

**Acceptance criteria:**

- `parser.js` and `pyrunner.js` are removed from `legacyScripts`.
- Runtime globals remain available to legacy code.
- `npm run lint:src`, `npm test`, and `npm run build` pass.

### 3. `feature/module-ai-client-runtime`

**Summary:** Finish AI client runtime migration.

**Description:** Replace raw loading of root `gpt-client.js` with the existing `src/ai/gpt-client.js` import path, and verify that `src/ai/gpt-integration.js` uses explicit imports instead of depending on script order.

**Scope:**

- Remove `gpt-client.js` from `legacyScripts`.
- Keep `window.GPTClient` compatibility from `src/main.js`.
- Audit `src/ai/gpt-integration.js` for implicit global dependencies.
- Extend AI client tests if the compatibility bridge changes.

**Acceptance criteria:**

- `gpt-client.js` is no longer imported through `?raw`.
- GPT integration behavior remains covered by existing tests.
- `npm run lint:src`, `npm test`, and `npm run build` pass.

### 4. `feature/module-engine-runtime`

**Summary:** Move graph execution out of raw legacy injection.

**Description:** Convert `engine.js` into explicit `src/core/` modules, using the already extracted `src/core/compute-engine.js` and `src/core/graph-helpers.js` as the stable boundary. This is the highest-risk migration slice and should avoid unrelated UI changes.

**Scope:**

- Add or complete `src/core/engine.js`.
- Replace implicit global dependencies with imports from `src/core/nodes.js`, `src/core/compute-engine.js`, `src/core/graph-helpers.js`, and geometry/runtime modules.
- Preserve any required `window.*` bridge for `app.js` and node UI consumers.
- Extend engine tests around graph execution, error handling, and computed output updates.

**Acceptance criteria:**

- `engine.js` is removed from `legacyScripts`.
- Existing `tests/engine*.test.js` and `tests/compute-engine.test.js` pass.
- Browser workflow tests still execute graphs successfully.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 5. `feature/module-node-editor-ui`

**Summary:** Move node editor rendering and library UI into modules.

**Description:** Convert `node-renderer.js`, `node-library.js`, `node-search-popup.js`, `line-render-patch.js`, and `wire-portal-patch.js` into `src/ui/` modules. Use the existing `src/ui/node-library-utils.js` as the first stable helper boundary.

**Scope:**

- Add `src/ui/node-renderer.js`.
- Add `src/ui/node-library.js`.
- Add `src/ui/node-search-popup.js`.
- Add moduleized line rendering and wire portal helpers.
- Keep compatibility globals only for legacy app consumers.
- Extend UI helper and Playwright workflow coverage for node creation, search, rendering, and connections.

**Acceptance criteria:**

- Node editor UI files listed above are removed from `legacyScripts`.
- Node search, library insertion, wire drawing, and node rendering still work in browser workflow tests.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 6. `feature/module-app-shell`

**Summary:** Move the application shell and state orchestration into `src/app/`.

**Description:** Convert `app.js` into moduleized application shell code after the engine, runtime, and node UI boundaries are stable. This branch should make `src/main.js` responsible for importing and initializing the app directly.

**Scope:**

- Add `src/app/app.js`.
- Export an app factory or singleton initializer.
- Replace global script-order initialization with explicit `init()` from `src/main.js`.
- Keep file-protocol fallback behavior documented if root legacy files remain for local fallback.

**Acceptance criteria:**

- `app.js` is removed from `legacyScripts`.
- `legacy-loader.js` no longer polls for a global `app`.
- Existing app initialization works from Vite dev server and production build.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 7. `feature/module-persistence-and-panels`

**Summary:** Move persistence, settings, help, and panel UI into modules.

**Description:** Convert `save-load.js`, `ui-enhancements.js`, `port-handler.js`, `node-help.js`, and `node-help-panel.js` into explicit modules once the app shell can import UI services directly.

**Scope:**

- Add `src/app/save-load.js` or `src/persistence/save-load.js`.
- Add moduleized settings and UI enhancement helpers.
- Add `src/ui/port-handler.js`.
- Add `src/ui/node-help.js` and `src/ui/node-help-panel.js`.
- Preserve compatibility only where the migrated app shell still requires it.

**Acceptance criteria:**

- The listed panel and persistence files are removed from `legacyScripts`.
- Save/load, settings, help panel, and port interactions remain covered by unit or browser workflow tests.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 8. `feature/module-geo-selector-revit`

**Summary:** Move selector and Revit-specific nodes into modules.

**Description:** Convert `geo-selector.js` and `revit-nodes.js` into explicit modules after core geometry and app-shell boundaries are stable.

**Scope:**

- Add `src/geometry/geo-selector.js` or `src/ui/geo-selector.js`, depending on final dependency direction.
- Add `src/integrations/revit/revit-nodes.js`.
- Import Revit node registration explicitly from `src/main.js` or the app shell.
- Add coverage for Revit node registration and selector behavior where feasible.

**Acceptance criteria:**

- `geo-selector.js` and `revit-nodes.js` are removed from `legacyScripts`.
- Revit node definitions and geometry selection behavior remain available.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 9. `feature/module-legacy-loader-removal`

**Summary:** Remove the raw-script loader after all runtime slices are moduleized.

**Description:** Delete `src/legacy-loader.js` raw injection, remove its import from `src/main.js`, and update docs to mark Phase 3 module migration complete.

**Scope:**

- Remove all `?raw` imports used only by `legacy-loader.js`.
- Delete or retire `src/legacy-loader.js`.
- Update `docs/phase-3.md`, `docs/toolchain-plan.md`, and `docs/enterprise-readiness-strategy.md`.
- Verify whether root legacy files are still needed for file-protocol fallback and document the decision.

**Acceptance criteria:**

- `src/main.js` initializes the app using only ES module imports.
- Production build no longer bundles raw legacy scripts through `legacy-loader.js`.
- Documentation marks the module migration step complete with remaining follow-up risks clearly listed.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, `npm run build`, and `npm audit --audit-level=moderate` pass.

## Suggested Merge Order

1. `feature/module-ai-client-runtime`
2. `feature/module-geometry-kernel`
3. `feature/module-parser-pyrunner`
4. `feature/module-engine-runtime`
5. `feature/module-node-editor-ui`
6. `feature/module-app-shell`
7. `feature/module-persistence-and-panels`
8. `feature/module-geo-selector-revit`
9. `feature/module-legacy-loader-removal`

## PR Checklist

- Branch starts from current `develop`.
- PR targets `develop`.
- Scope is limited to one migration task.
- Compatibility globals are documented in the PR description.
- `src/legacy-loader.js` has fewer raw-loaded files after the PR, unless the branch is a preparatory test-only branch.
- Relevant unit tests are added or updated.
- Browser workflow tests are updated for user-facing runtime behavior.
- CI passes before merge.
