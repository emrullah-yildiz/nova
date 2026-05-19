# Phase 2: Code Quality and Maintainability

## Objective

Add quality tooling, automated tests, and developer hygiene so the repository becomes maintainable and easier to evolve for enterprise scenarios.

## Completed items

- Added ESLint configuration for browser and node code
- Added Prettier configuration for consistent formatting
- Added a first `vitest` unit test covering the geometry kernel
- Updated `package.json` scripts for linting, formatting, and test execution

## Next work items

- Added lint rules for the app and UI modules
- Introduced folder structure guidelines for `src/`, `tests/`, and `assets/`
- Began modularizing high-risk files (`app.js`, `engine.js`, `gpt-client.js`)
- Added additional unit tests for UI and node library behavior
- Added a build/toolchain plan for Source->Dist transition

## Phase 2 progress

- Added `src/ui/node-library-utils.js` and `tests/node-library-utils.test.js` for UI suggestion logic
- Added `lint:app` and `lint:legacy` scripts for targeted legacy and UI linting
- Added ESLint globals for legacy runtime APIs used by app/UI modules
- Added `docs/toolchain-plan.md` for the Source->Dist workflow
- Updated the `build` script to reference the planned build workflow

- Added core unit test coverage for the geometry kernel
- Added `FormulaEval` tests to validate expression parsing and evaluation
- Added engine compute path tests for `number-input` and `math-add` nodes
- Added extended engine tests for formula evaluation, multiply, and clamp node behavior
- Added folder structure guidance for future modularization
- Added `lint:tests` and `lint:src` to simplify repeated linting tasks
- Added a first source module at `src/core/formula-eval.js`
- Verified `npm test` passes for `tests/geometry.test.js`, `tests/formula-eval.test.js`, `tests/engine.test.js`, and `tests/engine-extended.test.js`
- Verified `npm run lint` and `npm run lint:formula` pass for the current targeted files

## Phase 2 deliverables

1. Working test harness with automated coverage tracking
2. Code style enforcement via ESLint and Prettier
3. A reproducible developer workflow for local validation
4. Documentation of quality gates for future commits

## Current validation update

- `npm test` passes with 29 tests across 8 files.
- `npm test -- --coverage` reports 81.54% statement coverage and 87.32% line coverage for the currently tested extracted modules.
- `npm run lint:all` exits successfully without warnings after scoping legacy unused-variable noise out of the all-repo lint target.
- `.github/workflows/ci.yml` now treats lint and `npm audit --audit-level=moderate` as blocking checks; Snyk is blocking when `SNYK_TOKEN` is configured.
- `live-server` was removed from dev dependencies and `npm start` now uses Vite, clearing the audit-blocking dependency chain.
- `npm run test:e2e` adds Playwright browser workflow coverage for app load, New Project, graph execution, save/load, and missing-API-key AI failure handling.
- Local machines need `npx playwright install chromium` once before running the browser workflow checks; CI installs Chromium automatically.
