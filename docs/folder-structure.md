# Recommended Folder Structure

This section records the active source layout after the module migration cleanup.

## Proposed layout

- `src/`
  - `src/main.js` - Vite/module bootstrap entrypoint
  - `src/app/` - application shell and shared app state setup
  - `src/core/` - graph engine, node registry, compute helpers, and renderer bridges
  - `src/runtime/` - parser, port handling, and Python runner integration
  - `src/ai/` - AI client/runtime integration and provider helpers
  - `src/geometry/` - geometry kernel and math utilities
  - `src/ui/` - node editor UI, panels, persistence flows, and Revit/geometry selector modules
  - `src/viewer/` - 3D viewport and rendering helpers
- `tests/` - automated unit tests
- `e2e/` - browser workflow tests
- `docs/` - process, architecture, and onboarding documentation
- `assets/` - static assets, images, and external resources

## Migration guidance

1. Put new runtime code under `src/` and import it from `src/main.js` or the owning module.
2. Keep compatibility globals only where inline handlers or integrations still require them.
3. Do not reintroduce root runtime scripts or a file-protocol fallback loader.
4. Use `tests/` and `e2e/` to validate behavior after each compatibility bridge is removed.

## Benefits

- Easier code ownership and separation of concerns
- More predictable test coverage boundaries
- Clearer path to a build system and enterprise packaging
