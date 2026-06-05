---
id: TICK-005
title: Remove Pattern nodes category, kernel files, tests, and docs
status: draft
priority: high
type: chore
sprint: 2026-06-05
created: 2026-06-05
lanes: geometry, core
branch: chore/remove-pattern-nodes
---

## User story

As a developer, I can remove the entire Pattern category from Nova so the codebase no longer carries dead code for a feature that is being replaced.

## Context

Sprint A2 decision: the Pattern nodes category (FacadePanels, VoronoiMesh, PanelPlane, Panel.Points, etc.) is being removed entirely. The category was added in Sprint A1 but the PM has decided it is not the right direction. All related source files, geometry kernel files, tests, and documentation should be deleted cleanly so no trace remains.

TICK-004 has been cancelled and archived. This ticket supersedes it.

## Acceptance criteria

- [ ] AC-1  The node library in a running browser has no "Patterns" category. No `Pattern.*`, `Panel.Points`, or `Panel.ByPoints` node appears in the library panel.
- [ ] AC-2  `src/nodes/categories/patterns.js` is deleted. `git ls-files src/nodes/categories/patterns.js` returns nothing.
- [ ] AC-3  The node registry (`src/core/node-library.js` or equivalent) contains no import of `patterns.js` and no `Pattern.*` type registration. `npm run test` passes.
- [ ] AC-4  `src/geometry/geo-facade-panels.js` and `src/geometry/geo-voronoi.js` are deleted. No remaining `src/` file imports those paths.
- [ ] AC-5  Test files `tests/voronoi-bounds.test.js`, `tests/facade-panels-on-surface.test.js`, `tests/panel-frames-node.test.js`, `tests/geometry/geo-facade-panels.test.js` are deleted. `npm run test` passes with 0 failures.
- [ ] AC-6  `tests/e2e/pattern-on-surface.spec.js` is deleted. `npm run test:e2e` passes with 0 failures.
- [ ] AC-7  A global search (`grep -r "Pattern\." src/ tests/ docs/`) returns zero results. No stale references in imports, descriptions, sample graphs, or documentation.
- [ ] AC-8  `npm run lint:all && npm run test && npm run build` all pass. The production build contains no Pattern node code.

## Testing gate

- Unit test: AC-3, AC-5 (`npm run test` must pass after deletions)
- E2E (Playwright): AC-6 (`npm run test:e2e` must pass after spec deletion)
- Manual browser: AC-1 (confirm no Patterns category visible in the node library)

## How to test

1. `git switch develop && git pull --ff-only && git switch chore/remove-pattern-nodes`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. **AC-1:** Open the node library panel. Confirm no "Patterns" section exists. Search "Pattern" — no results.
4. **AC-2–AC-4:** Run `git ls-files src/nodes/categories/patterns.js src/geometry/geo-facade-panels.js src/geometry/geo-voronoi.js` — all should return nothing.
5. **AC-7:** Run `grep -r "Pattern\." src/ tests/ docs/` — zero results.

### Automated tests

```bash
npm run lint:all
npm run test
npm run test:e2e
```

### How to mark an AC done

Change `- [ ] AC-N` → `- [x] AC-N` with a note.

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

## Notes

- TICK-004 (Pattern nodes on surface) has been cancelled and archived — do not attempt to preserve any of its work.
- Also remove any Pattern-related task briefs under `docs/task-briefs/` (T04a, T04b, T04c).
- If any other node's `help.example` sample graph references a Pattern node, update that sample to remove the reference.
