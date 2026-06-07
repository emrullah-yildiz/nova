---
id: T09b-face-selection-orbit-flat
parent: TICK-009
title: Fix orbit/click conflict + flat shading for face selection
lane: ui (switch)
branch: fix/tick-009b-orbit-flat
status: ready
created: 2026-06-07
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Goal

Fix two PM-reported bugs discovered after the TICK-009 feature shipped to develop:

1. **Bug A — Orbit drag resets face counter**: Releasing the mouse after an orbit (drag-rotate) fires a click event that triggers `clearSelection()`, resetting the face selection counter to 0. Orbit drags must never be treated as selection clicks.

2. **Bug B — Face colors show lighting/shadows**: Selection mesh faces use `MeshPhongMaterial` which responds to the scene's three-point lighting rig, showing shadows and bright zones. PM wants flat, matte, unlit colors — the same teal/blue/green hues but completely uniform with no shading variation.

## Owned paths

```
src/viewer/geo-selector.js
src/geometry/geometry-lib.js
src/viewer/selection-mode.js
tests/e2e/geometry-selection.spec.js   (add/update orbit-no-reset E2E case)
```

## Do NOT touch

```
src/nodes/categories/geometry.js
src/ui/node-renderer.js
src/viewer/viewer3d.js
src/core/**
worker/**
api/**
docs/ARCHITECTURE.md
```

## Fix A — Orbit/click guard (src/viewer/geo-selector.js)

**Current code (lines 308-382):** The click handler already has an orbit guard using `_lastMouseDown` position. The guard computes `Math.abs(e.clientX - self._lastMouseDown.x) > 5` inside the `click` event. The problem: some browser/Three.js OrbitControls combinations fire the `click` event with `clientX/Y` equal to the *pointerdown* position rather than the *pointerup* position, making the delta always ~0 and never triggering the guard.

**Fix:** Replace the position-delta guard with a `_isDragging` boolean flag:

1. On `mousedown` (already listening at line 380): reset `_isDragging = false`.
2. Add a `mousemove` listener on `renderer.domElement`: if `_isDragging` is not already true, check that the mouse moved > 3px from the mousedown position and set `_isDragging = true`.
3. In the `click` handler: replace the current distance check `if (self._lastMouseDown && ...)` with `if (self._isDragging) return;`.
4. On `mousedown`: also record `_lastMouseDown = {x, y}` (keep this, needed by step 2's mousemove check).

This pattern is unambiguous: `_isDragging` is only set when the browser actually fires a `mousemove` event with meaningful displacement, regardless of what coordinates the `click` event carries.

```js
// In _initRaycaster():

// mousedown handler (replace existing):
this.renderer.domElement.addEventListener('mousedown', function(e) {
  self._lastMouseDown = { x: e.clientX, y: e.clientY };
  self._isDragging = false;
});

// NEW mousemove orbit-detect (add alongside existing mousemove handler):
// Keep the existing mousemove (hover logic) unchanged. Only add the drag flag
// check at the very top of the existing mousemove handler:
//   if (self._lastMouseDown &&
//       (Math.abs(e.clientX - self._lastMouseDown.x) > 3 ||
//        Math.abs(e.clientY - self._lastMouseDown.y) > 3)) {
//     self._isDragging = true;
//   }

// click handler guard (replace line 311):
if (self._isDragging) return;
```

Note: The `mousemove` handler in geo-selector.js is a single large handler (lines 394-551). Add the drag-flag check as the very first lines inside that handler, before any `isSelectionModeActive()` branch:

```js
// Top of existing mousemove handler — add before line 395's visibility check:
if (self._lastMouseDown &&
    (Math.abs(e.clientX - self._lastMouseDown.x) > 3 ||
     Math.abs(e.clientY - self._lastMouseDown.y) > 3)) {
  self._isDragging = true;
}
```

## Fix B — Flat/matte shading (src/geometry/geometry-lib.js + src/viewer/selection-mode.js)

### geometry-lib.js — toSelectionMesh()

**Current code (line 670):**
```js
const baseMat = new THREE.MeshPhongMaterial({
  color: 0x94e2d5,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});
```

**Change to:**
```js
const baseMat = new THREE.MeshBasicMaterial({
  color: 0x94e2d5,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});
```

`MeshBasicMaterial` ignores the scene's lighting completely. The `polygonOffset` properties are supported by `MeshBasicMaterial` and must be kept to prevent z-fighting.

### selection-mode.js — remove emissive writes

`MeshBasicMaterial` does not have `emissive` or `emissiveIntensity` properties. Setting them is a silent no-op in most Three.js builds but generates console warnings in strict mode. Remove all `mat.emissive.set(...)` and `mat.emissiveIntensity = ...` writes in the functions that operate on selection mesh materials:

Affected functions:
- `_swapToFaceMeshes()` (lines ~193-201): the initial teal color setup block.
- `_applySelectionHighlight()` (lines ~280-288): the per-group color update.
- `selectionMeshClick()` (lines ~535-560): deselect and select branches.
- `selectionMeshHover()` (lines ~586-624): restore-previous and apply-hover branches.

In each of these, remove only the two lines:
```js
if (mat.emissive && typeof mat.emissive.set === 'function') mat.emissive.set(color);
if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = <value>;
```

Keep all `mat.color.set(color)` and `mat.opacity = ...` and `mat.needsUpdate = true` lines — those work on `MeshBasicMaterial`.

The colors stay the same:
- Candidate (teal): `0x94e2d5` / `CANDIDATE_COLOR`
- Hover (blue): `0x89b4fa` / `FACE_HOVER_COLOR`
- Selected (green): `0xa6e3a1` / `SELECTED_COLOR`

## Acceptance criteria (observable)

- [ ] AC-T09b-1: Orbiting (left-click drag to rotate the 3D view) and then releasing does NOT decrement or reset the face selection counter. Verified manually: select a face (counter = 1), then orbit, then release — counter still shows 1.
- [ ] AC-T09b-2: Clicking genuinely empty viewport space (no mesh) DOES still reset the counter to 0 and clear all face selections (existing AC-6 must continue to pass).
- [ ] AC-T09b-3: Face selection meshes render as flat solid colors with no shadows, specular highlights, or brightness variation from the scene lighting. Verified by moving a directional light or comparing with different camera angles — the face color stays uniform.
- [ ] AC-T09b-4: Hovering a face still shows blue (`0x89b4fa`) flat color; clicking a face shows green (`0xa6e3a1`) flat color; unselected candidate faces show teal (`0x94e2d5`) flat color.
- [ ] AC-T09b-5: `npm run lint:all` — 0 errors.
- [ ] AC-T09b-6: `npm run test` — all pass (face-grouping unit tests unaffected).
- [ ] AC-T09b-7: `npm run test:e2e` — all pass. The geometry-selection spec's existing AC-11 steps (hover blue, click green, deselect, empty-click resets) must still pass.
- [ ] AC-T09b-8: A Playwright E2E step (in `tests/e2e/geometry-selection.spec.js`) simulates an orbit drag (mousedown + mousemove 50px + mouseup) and then asserts that the face counter value is unchanged.

## Testing gate

- Playwright E2E: AC-T09b-2 (empty click still clears), AC-T09b-7 (existing AC-11), AC-T09b-8 (orbit no-reset).
- Manual browser: AC-T09b-1 (orbit then release), AC-T09b-3 (flat shading), AC-T09b-4 (colors).
- Unit: AC-T09b-6 (existing face-grouping tests — no changes expected).

## Merge checklist

- [ ] AC-T09b-1 verified (manual orbit test)
- [ ] AC-T09b-2 verified (empty-click still resets)
- [ ] AC-T09b-3 verified (flat shading, no lighting influence)
- [ ] AC-T09b-4 verified (hover blue / click green / candidate teal)
- [ ] AC-T09b-5: `npm run lint:all` passes
- [ ] AC-T09b-6: `npm run test` passes
- [ ] AC-T09b-7: `npm run test:e2e` passes (AC-11 intact)
- [ ] AC-T09b-8: orbit-no-reset E2E step added and passing
- [ ] TICK-009.md Bug A and Bug B status updated to resolved
- [ ] agent-workboard.md row released

## Implementation order

1. Fix geometry-lib.js `toSelectionMesh()` — change `MeshPhongMaterial` to `MeshBasicMaterial`.
2. Fix selection-mode.js — remove `emissive` writes from all four affected functions.
3. Fix geo-selector.js — replace position-delta orbit guard with `_isDragging` flag.
4. Add orbit-drag E2E step to `tests/e2e/geometry-selection.spec.js`.
5. Run `npm run lint:all && npm run test && npm run test:e2e`.
6. Push branch `fix/tick-009b-orbit-flat`.
