# T02a — Selection Mode: Playwright E2E Spec + Bug Fixes (updated 2026-06-05)

**Parent ticket:** [TICK-002](../tickets/TICK-002.md)
**Lane:** ui (agent: switch)
**Branch:** `fix/selection-mode-e2e`
**Status:** active — new bugs added by PM 2026-06-05

---

## Goal

Four new bugs were reported by the PM and captured as AC-8 through AC-11. Fix them
on the existing `fix/selection-mode-e2e` branch. Also extend the Playwright spec to
cover the new ACs.

**Original goal (AC-1 through AC-7):** Write a Playwright E2E spec covering the full
Select.Faces pick-and-approve flow. Those ACs are largely done; do not regress them.

**New goal (AC-8 through AC-11):**

1. **AC-8 — Mesh surface not highlighted in face-selection mode.**
   Box, Prism, Solid, and panel geometry meshes are not being highlighted when
   face-selection mode is active. Identify why `_applySelectionHighlight` (or
   equivalent) is not reaching those scene objects and fix it so any mesh geometry
   turns green during face-selection mode.

2. **AC-9 — Approve returns a string, not the mesh surface object.**
   The `faces` output port carries a plain string label after Approve instead of the
   actual mesh/geometry object. Trace the `onApprove` path in `selection-mode.js`
   and `geo-selector.js`: find where the selected item is serialised to a string and
   change it to pass the actual geometry object (the Three.js mesh userData or the
   original geometry reference stored at pick time).

3. **AC-10 — Selection counter double-counts on each click.**
   The counter shows an incorrect number (goes up and down on every click rather than
   reflecting the true set size). Inspect the click handler that updates the counter
   — most likely it is adding without checking whether the item is already in the
   set, or it is re-running on both mousedown and mouseup. Fix so the counter equals
   `selectionSet.size` after each toggle.

4. **AC-11 — Mesh geometry must present as a whole, faces/edges selectable per mode.**
   Every mesh node (Box, Prism, Solid, Panel) must render as a complete object in
   normal view. Only in face-selection mode should individual faces be highlighted
   and selectable; only in edge-selection mode should edges be selectable. Verify the
   geometry pipeline passes the full mesh to the viewer and that `_itemMatchesMode`
   is not accidentally filtering out valid mesh objects.

---

## Owned paths

```
tests/e2e/geometry-selection.spec.js   (extend spec to cover AC-8, AC-9, AC-10)
src/viewer/selection-mode.js           (fix — highlight, counter, approve output)
src/viewer/geo-selector.js             (fix — selected item serialisation, hit-test)
src/nodes/categories/geometry.js       (fix-only — only if a bug is confirmed here)
src/viewer/viewer3d.js                 (fix-only — only if a bug is confirmed here)
```

**Do NOT touch:**
- `src/ui/node-renderer.js` — hot file; request a hot-file lock before touching
- `src/core/**`, `src/geometry/**`, `src/app/**`, `worker/**`, `api/**`
- `src/nodes/categories/patterns.js` — owned by T04a on feat/pattern-on-surface-geo
- Any file not listed above

---

## Interface / contract

| Symbol | Location | Expected behaviour |
|---|---|---|
| `window.activateSelectionMode(nodeId, kind)` | `selection-mode.js` | Switches canvas to selection mode |
| Approve button | DOM, `.approve-selection-btn` or `data-testid="approve-selection"` | Exits mode, fires output with geometry object (not string) |
| Cancel button | DOM, `.cancel-selection-btn` or `data-testid="cancel-selection"` | Exits mode, no output change |
| Selection counter | DOM element showing "N selected" | Must equal exact set size after each toggle |
| Node output port `faces` | `Select.Faces` node output | Carries the actual geometry object (not a string label) |

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
| AC-8 | E2E | Face-selection mode on a workspace with a Box/Prism/Solid highlights the mesh surface green; mesh is hoverable/clickable |
| AC-9 | E2E | After selecting a box face and clicking Approve, `Output.Watch` shows a structured geometry value — NOT a bare string; value has spatial fields (type, vertices, or equivalent) |
| AC-10 | E2E | Selection counter accurately reflects set size: 0 → 1 after first pick, 1 → 2 after second pick, 2 → 1 after deselecting one; no double-count on a single click |
| AC-11 | Manual | Box/Prism/Solid meshes appear as complete objects in normal view; face/edge sub-elements are selectable only in the corresponding mode — document in ticket with date |

---

## Testing gate

- Playwright E2E: AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-9, AC-10 — all must be green before merge.
- Manual browser: AC-5, AC-6, AC-11 — agent records observation in TICK-002 with date.
- Unit tests: none required.

---

## Merge checklist

- [ ] AC-1 verified: spec asserts "Select" button presence after adding Select.Faces node
- [ ] AC-2 verified: spec asserts toolbar DOM presence within 500 ms and green highlight on mesh
- [ ] AC-3 verified: spec clicks mesh twice and asserts highlight state change
- [ ] AC-4 verified: spec wires Output.Watch, clicks Approve, asserts watch text is non-empty and not "[object Object]"
- [ ] AC-5 verified: manual browser observation recorded in TICK-002 (date + observation)
- [ ] AC-6 verified: manual browser observation recorded in TICK-002 (date + observation)
- [ ] AC-7 verified: `npm run test:e2e` exits 0 with geometry-selection.spec.js in the run
- [ ] AC-8 verified: spec adds a Box node, enters face-selection mode, asserts mesh turns green (highlight class/emissive)
- [ ] AC-9 verified: spec clicks Approve after picking a box face, asserts Output.Watch value is NOT a bare string and has spatial properties
- [ ] AC-10 verified: spec selects 2 items, deselects 1, asserts counter reads "1 selected" (not "2" or "0")
- [ ] AC-11 verified: manual browser — Box/Prism rendered complete; faces and edges independently selectable by mode; recorded in TICK-002 with date
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all unit tests pass
- [ ] TICK-002 AC checkboxes updated (`[x]`) with spec file + line references or manual-date notes
- [ ] Workboard row released on merge

---

## Root-cause checklist (investigate before coding)

Before touching any code, read these specific locations and note what you find:

1. `src/viewer/selection-mode.js` — `_applySelectionHighlight(item)`: does it iterate
   `item.children` to reach the actual `THREE.Mesh`? Does it guard against items that
   are `THREE.Group` wrappers? Box objects in the scene may be Groups — the highlighter
   must recurse into children.

2. `src/viewer/geo-selector.js` — `_getSelectedItems()` or equivalent: what does it
   return? Is it returning `userData.label` (a string) instead of the scene object or
   the original geometry reference? Fix to return the geometry object.

3. `src/viewer/selection-mode.js` — click handler / `selectionModeClick()`: check
   whether the counter update fires on both mousedown and mouseup, or whether it runs
   outside the Set toggle guard. The counter must only change when the Set actually
   changes (`wasInSet !== isNowInSet`).

4. `src/viewer/viewer3d.js` — mesh registration: confirm Box/Prism/Solid nodes call
   `addMesh` / `registerSceneItem` so they appear in the raycaster target list.

---

## Notes

- Original work lives in `fix/selection-mode-e2e` and `feat/geometry-selection`
  (both merged to develop). This branch is the continuation — bug fixes extend the
  same branch.
- Keep all fixes minimal and scoped. Do not refactor selection-mode.js wholesale.
- TICK-003 (AC-4) listed `geometry-selection.spec.js` as a dependency. Additional
  tests added here are additive — they do not break TICK-003's status.
