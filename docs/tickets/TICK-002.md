---
id: TICK-002
title: Select Faces/Edges/Points — end-to-end browser verification + Playwright spec
status: ready
priority: high
type: bug
sprint: 2026-06-05
created: 2026-06-05
lanes: ui
branch: fix/selection-mode-e2e
---

## User story

As a designer, I can click the "Select" button on a Select.Faces / Select.Edges / Select.Points node,the view changes from node layout to 3D viewer, Approve(green check) and Cancel(red cross) buttons appears on the left side of Auto test, users pick geometry in the 3D viewport, and click Approve — so the node's output contains the geometry I picked and I can wire it downstream.

## Context

The wiring fix for geometry selection mode landed in a pre-ticket era branch (fix/selection-mode-wiring). The PM needs confirmation that the full end-to-end flow works correctly in the browser and that a Playwright E2E spec guards against regression. Without the spec, any future refactor of `selection-mode.js`, `geo-selector.js`, or the viewer could silently break the pick-and-approve flow.

Relevant files: `src/viewer/selection-mode.js`, `src/viewer/geo-selector.js`, `src/nodes/categories/geometry.js`, `src/viewer/viewer3d.js`.

## Acceptance criteria

- [ ] AC-1  Opening a workspace and adding a `Select.Faces` node shows a "Select" button in the node's controls area in the canvas.
- [ ] AC-2  Clicking the Select button switches the canvas to 3D selection mode: the Approve/Cancel toolbar appears at the top of the viewport within 500 ms, and meshes in the scene are visually highlighted (green) while non-matching items are dimmed.
- [ ] AC-3  Clicking a mesh in the viewport while in face-selection mode toggles it into the selection set; clicking it again removes it. The visual highlight changes accordingly.
- [ ] AC-4  Clicking Approve exits selection mode, hides the toolbar, and the node's output port (`faces`) carries the selected mesh item(s) — verified by wiring `Output.Watch` downstream and confirming the watch panel shows a non-empty, non-`[object Object]` value.
- [ ] AC-5  Clicking Cancel exits selection mode, hides the toolbar, and the node's output remains unchanged (empty / previous value).
- [ ] AC-6  `Select.Edges` mode only highlights edge/line geometry; `Select.Points` mode only highlights point geometry. Clicking a mesh in Edges mode does NOT add it to the selection.
- [ ] AC-7  A Playwright E2E spec in `tests/e2e/geometry-selection.spec.js` covers AC-1 through AC-4 and passes with `npm run test:e2e`.

## Testing gate

- E2E (Playwright): AC-1, AC-2, AC-3, AC-4, AC-7
- Manual browser verification: AC-5, AC-6 (toolbar hide + cancel + mode discrimination)
- Unit test: none required for this ticket

## How to test

### Local dev verification

1. `git switch develop && git pull --ff-only && git switch fix/selection-mode-e2e`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Create a new workspace. Open the node library → Geometry → add `Select.Faces`.
4. **AC-1:** Confirm a "Select" button appears in the node's controls area.
5. Add a `Box.ByCenterWidthDepthHeight` node and wire it into the scene so a mesh is visible in the 3D viewport.
6. **AC-2:** Click "Select" on the `Select.Faces` node. Confirm:
   - Canvas switches to 3D view
   - Approve (✓) and Cancel (✕) toolbar appears within ~500 ms
   - The box mesh is highlighted green; background items are dimmed
7. **AC-3:** Click the box mesh → confirm it enters the selection set (highlight changes). Click it again → confirm it leaves the set.
8. Wire an `Output.Watch` node to the `faces` output of `Select.Faces`. **AC-4:** Click Approve → confirm the watch panel shows a non-empty, readable value (not `[object Object]`).
9. Enter selection mode again. **AC-5:** Click Cancel → confirm the toolbar disappears and the watch value is unchanged.
10. Add `Select.Edges` and `Select.Points` nodes. **AC-6:** Enter Edges mode — confirm only edge/line geometry highlights, clicking a solid mesh does NOT select it. Repeat for Points mode.

### Automated tests

```bash
npm run lint:all
npm run test
npm run test:e2e          # tests/e2e/geometry-selection.spec.js must pass (AC-7)
```

### How to mark an AC done

Change `- [ ] AC-N` → `- [x] AC-N` with a note:
- Automated: `— covered by tests/e2e/geometry-selection.spec.js:line`
- Manual: `— manual browser YYYY-MM-DD: [what you observed]`

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

- [T02a](../task-briefs/T02a-selection-mode-e2e.md) — lane: ui (switch) — Playwright E2E spec for Select.Faces/Edges/Points pick-and-approve flow + any bug fixes the spec reveals

## Notes

- The Select.Faces/Edges/Points nodes themselves were written in the pre-ticket feat/geometry-selection branch. This ticket is purely verification + spec coverage.
- Do not re-implement the wiring — only write the missing E2E spec and fix any bugs the spec reveals.
- If the spec reveals a real bug, it is handled within the same branch (spec + fix = one task).
