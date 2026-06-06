# T02e — Selection Interaction Model Fix

**Parent ticket:** [TICK-002](../tickets/TICK-002.md)
**Branch:** `fix/tick-002-selection-interaction`
**Lane:** ui (switch)
**Status:** queued
**Created:** 2026-06-07

---

## Goal

The PM reports the full selection interaction model is still not working correctly in the
browser. The five required behaviors must all work together:

1. **Hover** — when the mouse moves over any mesh face, that face surface changes color
   (blue highlight, #89b4fa). Moving away restores it.
2. **Click face** — clicking a highlighted face adds it to the selection set; the "N
   selected" counter in the toolbar increments by exactly 1.
3. **Click another face** — each additional click on a different face increments the
   counter again (+1 per face, no cap).
4. **Click empty area** — clicking anywhere in the viewport with no mesh under the cursor
   resets the selection set to zero and the counter shows "0 selected".
5. **Re-click selected face** — clicking an already-selected (green) face deselects it;
   the counter decrements by 1.

All five behaviors must work simultaneously in a single live selection session.

---

## Acceptance criteria covered

This task is a re-implementation pass on the same ACs previously claimed by T02b and T02d:

- **AC-8** — Hover over mesh face → that face turns blue (#89b4fa). Moving away restores.
- **AC-10** — Counter shows exact count: 0 → 1 → 2 on successive clicks; deselect → -1.
- New sub-requirement (PM comment 2026-06-07): click on empty viewport area → count resets
  to 0 (AC-10 extension, this edge case was missing).

---

## Owned paths

```
src/viewer/geo-selector.js
src/viewer/selection-mode.js
tests/e2e/geometry-selection.spec.js
```

**Do NOT touch:**
- `src/ui/node-renderer.js`
- `src/nodes/categories/geometry.js`
- `src/viewer/viewer3d.js`
- Any file under `src/core/`, `src/geometry/`, `worker/`, `api/`
- Any other test file

---

## Current behavior (what is broken)

Based on the PM's "unfunctional" report after T02d:

1. **Hover color may not be reaching actual mesh material** — the mousemove handler in
   `geo-selector.js` sets `m.material.color.setHex(0x89b4fa)` but if the scene contains
   a `Box.ByCenterWidthDepthHeight` whose mesh material is `MeshStandardMaterial` (which
   uses `roughness`/`metalness` rather than `emissive`), the color change may be invisible
   under the current scene lighting. Verify and fix the material property path.

2. **Click on empty area does not reset to 0** — the raycaster click handler in
   `geo-selector.js` only calls `_deselectAll()` in normal (non-selection) mode. When
   `isSelectionModeActive()` is true, clicking empty space hits the `return` branch without
   clearing `_state.items` in `selection-mode.js`. The fix: when selection mode is active
   and the raycast returns no intersects, call `selectionModeClick` with a sentinel clear
   or add a dedicated `clearSelectionModeItems()` export.

3. **Counter correctness** — verify `_updateToolbarCount` is called on every state change
   including the new "click empty = reset to 0" path.

---

## Implementation guide

### Fix 1 — Robust face color change on hover

In `geo-selector.js` `mousemove` handler (AC-8 path, ~line 358), after the raycast hits
`hitMesh`:

- After setting `m.material.color.setHex(...)`, also force `m.material.needsUpdate = true`.
- If `m.material` is a `MeshStandardMaterial` (check `m.material.type ===
  'MeshStandardMaterial'`), the `emissive` path already works but the renderer needs
  `needsUpdate`. Add it.
- Also ensure the `THREE.Raycaster` `params.Points.threshold` and
  `params.Line.threshold` are small (≤0.1) so point/line geometry near the mouse does
  not interfere with face selection.

### Fix 2 — Click empty area resets selection to zero

In `geo-selector.js` click handler, change the empty-space branch:

```js
// BEFORE (line ~327):
if (!isSelectionModeActive()) self._deselectAll();

// AFTER:
if (isSelectionModeActive()) {
  clearSelectionModeItems();   // new export from selection-mode.js
} else {
  self._deselectAll();
}
```

Add to `selection-mode.js`:

```js
export function clearSelectionModeItems() {
  if (!_state.active) return;
  _state.items = [];
  _applySelectionHighlight();
  _updateToolbarCount();
}
```

### Fix 3 — Ensure counter is always accurate

- `selectionModeClick` already calls `_updateToolbarCount()` — verify this is NOT skipped
  when `_itemMatchesMode` returns false (it already returns early, which is correct —
  non-matching clicks should not change the counter).
- After `clearSelectionModeItems()` call `_updateToolbarCount()` (already in the proposed
  implementation above).

---

## Testing gate

| AC | Coverage required |
|---|---|
| AC-8 (hover color) | E2E: assert `window.__geoSelectorHoveredFaceMesh.material.color` hex = 0x89b4fa after synthetic mousemove |
| AC-10 (counter) | E2E: assert counter text after 0, 1, 2 clicks and after empty-space click |
| Empty-area reset | E2E: new assertion — after 2 clicks, click empty area, counter must read "0 selected" |

All assertions belong in `tests/e2e/geometry-selection.spec.js` (extend existing AC-8 and
AC-10 test blocks; add empty-area sub-step).

---

## Merge checklist

- [ ] AC-8 verified: hovered face turns blue (#89b4fa) visibly in the browser
- [ ] AC-10 verified: counter reads 0 → 1 → 2 on successive face clicks
- [ ] Empty-area click verified: counter reads 0 selected after clicking empty viewport
- [ ] Re-click deselect verified: clicking a green (selected) face decrements counter
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run test:e2e` → geometry-selection.spec.js all pass

---

## Interface / contract

No new exports change the public API of `selection-mode.js` except one addition:

```js
// New named export — add to selection-mode.js
export function clearSelectionModeItems() { … }
```

`geo-selector.js` imports it at the top alongside `selectionModeClick`.

---

## Do NOT

- Do not change `approveSelection`, `cancelSelection`, or `activateSelectionMode` signatures.
- Do not touch `node-renderer.js` — AC-9 (structured geometry output) was fixed by T02b/T02d
  and must not be regressed.
- Do not rewrite `_applySelectionHighlight` logic beyond the `needsUpdate` fix.
