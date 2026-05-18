# Recommended Folder Structure

This section documents the current module layout after the Phase 3 migration.

## Current Layout

- `src/`
  - `src/app/` - application shell, persistence, and app-level patches
  - `src/ui/` - UI components and DOM-related code
  - `src/core/` - engine, graph compute logic, node metadata, and logging
  - `src/ai/` - GPT client, AI assistant runtime, and integration glue
  - `src/geometry/` - geometry kernel and math utilities
  - `src/runtime/` - parser and Python runner modules
  - `src/viewer/` - 3D viewport, rendering helpers, and geometry selector
  - `src/integrations/` - external integration bridges such as Revit
- `tests/` - automated unit and browser workflow tests
- `docs/` - process, architecture, and onboarding documentation
- root legacy files - historical/no-build fallback files; keep source-of-truth changes in `src/`

## Migration Guidance

1. Treat `src/main.js` as the application bootstrap and `src/` as the source of truth.
2. Keep compatibility globals only where current browser markup or integrations still require them.
3. Do not add new root-level runtime scripts, `?raw` runtime imports, or raw-loader shims.
4. Use unit tests and Playwright workflows to validate behavior after module changes.

## Benefits

- Easier code ownership and separation of concerns
- More predictable test coverage boundaries
- Clearer path to production hardening and enterprise packaging
