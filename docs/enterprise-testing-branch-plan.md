# Enterprise Testing Branch Plan

## Objective

Complete the enterprise-grade testing work by expanding from smoke coverage into repeatable browser workflows, runtime contract tests, coverage ratchets, accessibility checks, and performance baselines.

## Branching Strategy

- `main` remains the production-ready branch.
- `develop` is the integration branch for enterprise testing work.
- Each testing task branches from `develop` and opens a pull request back into `develop`.
- Use `feature/testing-*` branches for planned coverage work and `fix/testing-*` branches for follow-up defects discovered by the new suites.
- Promote `develop` to `main` only after lint, unit tests, browser workflow tests, build, audit, and the agreed coverage thresholds pass.

## Testing Tasks

### 1. `feature/testing-node-editor-workflows`

**Summary:** Expand Playwright coverage for core node editor interactions.

**Description:** Add browser workflow tests that exercise the real workspace UI beyond the current smoke path. This is the highest-priority testing slice because graph creation, node search, insertion, wiring, execution, and visual output are the core product loop.

**Scope:**

- Add Playwright coverage for opening the workspace and adding nodes through UI controls.
- Verify node search or library insertion for common node types.
- Verify graph execution after UI-driven node creation.
- Verify visible node count and wire state after the workflow.
- Keep tests deterministic by avoiding external APIs and unstable timing assumptions.

**Acceptance criteria:**

- Browser workflow tests cover at least one UI-driven node creation path.
- Browser workflow tests cover at least one connection/execution path from the workspace.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, `npm run build`, and `npm audit --audit-level=moderate` pass.

### 2. `feature/testing-persistence-import-export`

**Summary:** Cover project persistence, local storage, and file import/export workflows.

**Description:** Extend browser and unit coverage around saving, loading, clearing, importing, and exporting projects so users can trust long-running graph work.

**Scope:**

- Add tests for save/load edge cases and invalid project payload handling.
- Add Playwright coverage for local project save and reload through UI where feasible.
- Add coverage for export payload shape and import recovery behavior.
- Verify missing or malformed project data reports a controlled error.

**Acceptance criteria:**

- Persistence tests cover successful save/load and malformed input paths.
- Browser workflow coverage includes a user-facing persistence path.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 3. `feature/testing-viewer-geometry-workflows`

**Summary:** Add browser coverage for geometry output and 3D viewer behavior.

**Description:** Verify that geometry-producing graphs still produce renderable data and that the viewer path fails gracefully when rendering dependencies or containers are unavailable.

**Scope:**

- Add unit coverage for geometry output normalization used by the engine/viewer bridge.
- Add Playwright coverage for a graph that produces geometry output.
- Verify 3D/viewer toggles or warnings remain controlled.
- Avoid brittle pixel assertions until the viewer is stable enough for screenshot checks.

**Acceptance criteria:**

- Geometry-producing graph behavior is covered in unit or browser tests.
- Viewer unavailable states remain non-fatal in browser workflow tests.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 4. `feature/testing-ai-runtime-contracts`

**Summary:** Harden AI client and prompt/runtime contract tests.

**Description:** Expand tests around provider selection, API key validation, missing-key failures, prompt construction, and network error handling without calling live AI providers.

**Scope:**

- Add mocked fetch tests for success, provider failure, malformed responses, and timeout-like errors.
- Verify provider-specific API URLs and key validation.
- Cover missing-key UI behavior in Playwright.
- Keep all tests offline and deterministic.

**Acceptance criteria:**

- AI client tests cover success and failure contract paths with mocked network calls.
- Browser workflow tests still verify missing-key behavior before any provider call.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 5. `feature/testing-revit-selector-contracts`

**Summary:** Cover Revit node registration and geometry selector contracts.

**Description:** Add tests for Revit-specific node registration and geometry selector behavior at the module boundary, while real plugin transport remains a later infrastructure task.

**Scope:**

- Verify Revit node definitions are registered and discoverable.
- Cover selector initialization when viewer state is present and absent.
- Add regression coverage for mocked Revit data consumption.

**Acceptance criteria:**

- Revit node registration is covered by automated tests.
- Selector unavailable paths remain controlled and visible.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 6. `feature/testing-accessibility-smoke`

**Summary:** Add accessibility smoke checks for primary screens.

**Description:** Add lightweight browser assertions for keyboard-reachable primary controls, visible labels, and stable focus behavior before adopting a larger accessibility scanner.

**Scope:**

- Verify landing and workspace primary controls are reachable by role or label.
- Add keyboard navigation checks for opening the workspace and settings.
- Document follow-up scanner options such as axe after baseline semantics are stable.

**Acceptance criteria:**

- Playwright tests cover keyboard access to primary workflows.
- Primary buttons and dialogs are asserted by accessible role/name where possible.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 7. `feature/testing-performance-baseline`

**Summary:** Establish build and browser performance baselines.

**Description:** Add repeatable lightweight checks for bundle size, app boot time, and graph execution timing so later optimization work has a measured target.

**Scope:**

- Add a script or test helper that records production bundle size.
- Add Playwright timing checks for app initialization under the local dev server.
- Add a unit or browser timing baseline for a representative graph execution.
- Keep thresholds generous at first to avoid noisy CI failures.

**Acceptance criteria:**

- Performance baseline is documented and runnable in CI or local validation.
- Thresholds are explicit and intentionally conservative.
- `npm run lint:all`, `npm test`, `npm run test:e2e`, and `npm run build` pass.

### 8. `feature/testing-coverage-ratchet`

**Summary:** Add coverage thresholds after the broader suites land.

**Description:** Convert coverage reporting into enforceable thresholds once the high-value workflow tests are in place, using a ratchet that can rise over time without blocking useful focused PRs too early.

**Scope:**

- Capture the current coverage baseline after tasks 1-7.
- Add Vitest coverage thresholds for statements, branches, functions, and lines.
- Document the next target increments toward enterprise coverage.
- Ensure CI fails when coverage drops below the agreed baseline.

**Acceptance criteria:**

- Coverage thresholds are configured in `vitest.config.js` or an equivalent test config.
- CI blocks coverage regressions.
- `npm run test -- --coverage --reporter=verbose` passes with the configured thresholds.

## Suggested Merge Order

1. `feature/testing-node-editor-workflows`
2. `feature/testing-persistence-import-export`
3. `feature/testing-viewer-geometry-workflows`
4. `feature/testing-ai-runtime-contracts`
5. `feature/testing-revit-selector-contracts`
6. `feature/testing-accessibility-smoke`
7. `feature/testing-performance-baseline`
8. `feature/testing-coverage-ratchet`

## PR Checklist

- Branch starts from current `develop`.
- PR targets `develop`.
- Scope is limited to one testing task.
- New tests avoid live external APIs and unstable timing assumptions.
- User-facing workflows are covered with Playwright when the behavior is primarily browser-driven.
- Module contracts are covered with Vitest when the behavior is pure runtime logic.
- CI passes before merge.
