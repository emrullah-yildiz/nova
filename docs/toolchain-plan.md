# Source To Dist Toolchain Plan

## Objective

Create a reproducible build workflow for Nova that supports a modular `src/` codebase, automated validation, and production bundling.

## Current State

- The app boots through `src/main.js` using explicit ES module imports.
- `src/legacy-loader.js` has been removed.
- There are no remaining `?raw` runtime imports under `src/`.
- Core behavior now lives under `src/core/`, `src/ai/`, `src/app/`, `src/runtime/`, `src/geometry/`, `src/viewer/`, `src/ui/`, and `src/integrations/`.
- Root legacy files remain only as historical/no-build fallback files; source-of-truth runtime changes should be made in `src/`.
- Compatibility bridges remain for browser globals such as `window.app`, `window.Geo`, `window.Viewer3D`, `window.NFLogger`, and node registry objects while inline handlers and integrations are cleaned up.
- CI uses Node 24 and gates lint, unit tests with coverage, Playwright browser workflows, npm audit, and production build.

## Toolchain Components

- `npm run start` - local Vite development server
- `npm test` - automated test execution via Vitest
- `npm run test:e2e` - Playwright browser workflow tests
- `npm run lint:src` - lint source modules
- `npm run lint:all` - lint the repository
- `npm run format` - code formatting via Prettier
- `npm run build` - produce the Vite `dist/` bundle
- `npm audit --audit-level=moderate` - security audit gate

## Build Output

- `dist/` - production assets
- `dist/index.html` - built app shell
- `dist/assets/` - bundled JavaScript and static assets

## Migration Status

The module migration is complete. The final migration branch removed the raw-script loader and made `src/main.js` responsible for importing, installing, and initializing the runtime directly.

Completed migration areas:

- Geometry kernel
- Parser and Python runner
- AI client runtime
- Engine runtime
- Node editor UI
- App shell
- Persistence and panels
- Geo selector and Revit bridge
- Logger patch
- Legacy loader removal

## Recommended Next Steps

1. Reduce temporary `window.*` compatibility bridges where direct imports or event listeners are available.
2. Replace inline HTML event handlers with DOM listener registration inside modules.
3. Decide whether root legacy files should remain as a no-build fallback or be retired.
4. Expand Playwright coverage for drag/drop wiring, file import/export, help panels, 3D viewport selection, settings flows, and Revit data flows.
5. Convert placeholder deploy jobs into a real staging or static-hosting deployment target.

## Acceptance Criteria

- Source modules remain the runtime source of truth.
- No new `?raw` runtime imports or raw-loader shims are introduced.
- Unit, browser workflow, lint, build, and audit gates pass before merge.
- Documentation is updated when runtime ownership or bootstrap behavior changes.
