# Recommended Folder Structure

This section defines a starting point for Phase 2 and Phase 3 refactoring.

## Proposed layout

- `src/`
  - `src/ui/` — UI components and DOM-related code
  - `src/core/` — engine, runtime, graph compute logic
  - `src/ai/` — GPT integration and AI assistant logic
  - `src/geometry/` — geometry kernel and math utilities
  - `src/viewer/` — 3D viewport and rendering helpers
- `tests/` — automated tests
- `docs/` — process, architecture, and onboarding documentation
- `assets/` — static assets, images, and external resources

## Migration guidance

1. Leave the existing prototype files in place while moving code incrementally.
2. Create wrapper modules in `src/` that import the old files and expose a cleaner API.
3. Keep `index.html` as the entry point until a build step is introduced.
4. Use `tests/` to validate behavior after each extracted module is moved.

## Benefits

- Easier code ownership and separation of concerns
- More predictable test coverage boundaries
- Clearer path to a build system and enterprise packaging
