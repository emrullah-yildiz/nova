# T02a — Selection Mode: Playwright E2E Spec + Bug Fixes

**Parent ticket:** [TICK-002](../tickets/TICK-002.md)
**Lane:** ui (agent: switch)
**Branch:** `fix/selection-mode-e2e`
**Status:** queued

---

## Goal

Write a Playwright E2E spec that exercises the full Select.Faces pick-and-approve
flow in a running browser. Fix any bugs the spec reveals in the existing wiring
(`selection-mode.js`, `geo-selector.js`, viewer). Do NOT re-implement what already
works — only verify and fix gaps.

---

## Owned paths

```
tests/e2e/geometry-selection.spec.js   (create new)
src/viewer/selection-mode.js           (fix-only, do not refactor)
src/viewer/geo-selector.js             (fix-only, do not refactor)
src/nodes/categories/geometry.js       (fix-only — only if a bug is found here)
src/viewer/viewer3d.js                 (fix-only — only if a bug is found here)
```

**Do NOT touch:**
- `src/ui/node-renderer.js` (hot file, no other task owns it but keep hands off unless
  a confirmed bug requires it; request a hot-file lock first)
- `src/core/**`, `src/geometry/**`, `src/app/**`, `worker/**`, `api/**`
- Any file not listed above

---

## Interface / contract

The spec depends on the public API that the wiring branch established:

| Symbol | Location | Behaviour |
|---|---|---|
| `window.activateSelectionMode(nodeId, kind)` | `selection-mode.js` | Switches canvas to selection mode |
| Approve button | DOM, `.approve-selection-btn` or equivalent | Exits mode, fires output |
| Cancel button | DOM, `.cancel-selection-btn` or equivalent | Exits mode, no output change |
| Node output port `faces` | `Select.Faces` node output | Carries selected item(s) after Approve |

Confirm the actual DOM selectors before hardcoding them in the spec. Use
`data-testid` attributes if the elements lack stable selectors; add the
`data-testid` to the source file (counts as a fix-only touch).

---

## AC coverage

| AC | Type | What to assert |
|---|---|---|
| AC-1 | E2E | Add `Select.Faces` node → "Select" button visible in canvas |
| AC-2 | E2E | Click Select → toolbar appears within 500 ms, mesh highlighted green |
| AC-3 | E2E | Click mesh → enters selection set; click again → leaves set |
| AC-4 | E2E | Click Approve → `Output.Watch` downstream of `faces` shows non-empty, non-`[object Object]` value |
| AC-5 | Manual | Cancel hides toolbar, output unchanged — document in ticket with date |
| AC-6 | Manual | Edge/Point mode discrimination — document in ticket with date |
| AC-7 | E2E | `npm run test:e2e` passes with spec covering AC-1 through AC-4 |

---

## Testing gate

- Playwright E2E: AC-1, AC-2, AC-3, AC-4, AC-7 — all must be green before merge.
- Manual browser: AC-5, AC-6 — agent records observation in TICK-002 with date.
- Unit tests: none required.

---

## Merge checklist

- [ ] AC-1 verified: spec asserts "Select" button presence after adding Select.Faces node
- [ ] AC-2 verified: spec asserts toolbar DOM presence within 500 ms and green highlight class on mesh
- [ ] AC-3 verified: spec clicks mesh twice and asserts highlight state change
- [ ] AC-4 verified: spec wires Output.Watch, clicks Approve, asserts watch text is non-empty and not "[object Object]"
- [ ] AC-5 verified: manual browser observation recorded in TICK-002 (date + observation)
- [ ] AC-6 verified: manual browser observation recorded in TICK-002 (date + observation)
- [ ] AC-7 verified: `npm run test:e2e` exits 0 with geometry-selection.spec.js in the run
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all unit tests pass
- [ ] TICK-002 AC checkboxes updated (`[x]`) with spec file + line references
- [ ] Workboard row released on merge

---

## Notes

- The `feat/geometry-selection` branch (already merged) wrote the nodes and wiring.
  Read `src/viewer/selection-mode.js` and `src/viewer/geo-selector.js` before writing
  the spec to understand the actual DOM events and state transitions.
- If the spec reveals a real bug, fix it in the same branch. Keep the fix minimal —
  no refactoring.
- TICK-003 (AC-4) depends on the `geometry-selection.spec.js` file this task
  produces. This task must merge before TICK-003 can be closed.
