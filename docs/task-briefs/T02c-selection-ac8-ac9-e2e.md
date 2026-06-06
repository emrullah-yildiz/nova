# T02c — E2E Playwright spec: AC-8 (face hover blue) + AC-9 (Approve returns geometry)

**Parent ticket:** [TICK-002](../tickets/TICK-002.md)
**Lane:** ui (agent: switch)
**Branch:** `fix/selection-mode-e2e`
**Status:** blocked — awaits T02b merge (the spec will fail until the bugs are fixed)
**Dependency:** T02b must be merged first

---

## Goal

Extend `tests/e2e/geometry-selection.spec.js` with two new test cases that assert AC-8 and AC-9 are fixed. These tests prove the work done in T02b is correct and guard against regressions.

Do NOT fix any source code in this task — that is T02b's scope. Only write spec code.

---

## Owned paths

```
tests/e2e/geometry-selection.spec.js   (extend with AC-8 and AC-9 specs)
```

**Do NOT touch:**
- `src/**` — all source fixes belong to T02b
- `docs/**` — morpheus manages those
- Any file outside `tests/e2e/geometry-selection.spec.js`

---

## Interface / contracts the spec relies on

After T02b is merged, the following behaviors are guaranteed:

| Behavior | Observable in spec |
|---|---|
| Hovering over a box mesh face in face-selection mode turns that face blue | DOM: the canvas renders blue on the mesh; OR a `data-hovered-face` attribute or CSS class on the viewport element; OR read `Viewer3D._hoveredFaceMesh.material.color.getHex()` via `page.evaluate()` |
| Output.Watch after Approve shows structured value, not bare string | `.watch-value` or equivalent element text does NOT equal the node label string; contains a JSON-like value with typed fields |

Coordinate with T02b on the exact DOM/JS hook to assert the blue hover. The safest approach is `page.evaluate()` to inspect `window.Viewer3D._hoveredFaceMesh` and its material color hex. Agree on the hook name before writing the spec so it does not require a second round-trip.

---

## New test cases to add

### Test: AC-8 — face hover turns blue in selection mode

```
Scenario: AC-8 — per-face blue highlight on hover in face-selection mode
  Given  a workspace with a Box.ByCenterWidthDepthHeight node in the 3D viewport
  When   the user clicks Select on the Select.Faces node (enters selection mode)
  And    the user moves the mouse over the box mesh surface
  Then   the hovered face material color is 0x89b4fa (accent-blue)
  And    no other non-selected face is colored 0x89b4fa (hover is exclusive to hit face)
  And    already-selected items remain 0xa6e3a1 (green) — hover does not override selection color
```

Implementation notes:
- Use `page.mouse.move(x, y)` to simulate the hover over the canvas at a coordinate where the box is rendered.
- Assert via `page.evaluate(() => window.Viewer3D._hoveredFaceMesh?.material?.color?.getHex())` equals `0x89b4fa`. If T02b stores the hovered mesh differently, use whatever T02b exposes.
- If the THREE canvas is too opaque to assert color directly, assert a DOM attribute or class that T02b sets as a side-effect (e.g., `data-face-hovered="true"` on `#viewport-3d`). Prefer the JS evaluation route as it is more reliable.

### Test: AC-9 — Approve outputs structured geometry value

```
Scenario: AC-9 — Output.Watch shows structured geometry value after Approve
  Given  a workspace with Box.ByCenterWidthDepthHeight → Select.Faces → Output.Watch
  When   the user enters face-selection mode
  And    clicks on the box to add it to the selection set
  And    clicks Approve
  Then   the Output.Watch panel shows a value that:
           - is NOT the bare string "Box.ByCenterWidthDepthHeight (node-1)" (or equivalent label)
           - is NOT "[object Object]"
           - IS a structured value: either JSON with a "_type" field, or an array/object with spatial properties
```

Implementation notes:
- Wire a `Output.Watch` node downstream of `Select.Faces` before entering selection mode.
- After Approve, wait for the watch panel to update (use `page.waitForFunction` or `waitForSelector` with the updated text).
- Assert `watchText !== expectedLabel` AND `watchText !== '[object Object]'`.
- Optionally parse the watch text as JSON and assert `parsed._type` exists, or assert the text includes `nodeId` or `varName` as structured fields. This depends on what T02b's output shape looks like.

---

## AC coverage

| AC | Assertion |
|---|---|
| AC-8 | `page.evaluate(() => window.Viewer3D._hoveredFaceMesh?.material?.color?.getHex()) === 0x89b4fa` after mouse-move over box face |
| AC-9 | Watch panel text is NOT a bare string label and IS a structured value after Approve |

---

## Testing gate

- The two new test cases must pass with `npm run test:e2e`.
- Existing passing tests in `geometry-selection.spec.js` must remain green (no regressions to AC-1 through AC-7 specs).
- `npm run lint:all` — 0 errors.
- `npm run test` — all unit tests pass.

---

## Merge checklist

- [ ] AC-8 spec added: hovering box face in selection mode → material color is accent-blue (0x89b4fa), asserted via `page.evaluate`
- [ ] AC-9 spec added: after Approve, Output.Watch text is NOT a bare string label and has typed/structured fields
- [ ] All existing `geometry-selection.spec.js` tests still pass (no regressions)
- [ ] `npm run test:e2e` exits 0 with both new specs green
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all unit tests pass
- [ ] TICK-002 AC-8 and AC-9 checkboxes updated: `— covered by tests/e2e/geometry-selection.spec.js:<line>`
- [ ] Workboard row status updated on merge

---

## Notes

- This task is purely additive — do not delete or modify existing spec tests.
- Keep the new test cases close to the existing ones in the file (group by AC number, add a comment header `// ── AC-8`).
- If the T02b hover hook (`_hoveredFaceMesh`) is not yet stable when you start, stub the assertion with a TODO comment and align with the T02b agent before finalizing.
- The branch is `fix/selection-mode-e2e` — same as T02a and T02b. Do not create a separate branch.
