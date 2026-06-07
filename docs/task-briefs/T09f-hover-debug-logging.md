---
id: T09f-hover-debug-logging
parent: TICK-009
title: Add hover-pipeline debug logging to diagnose missing blue highlight
lane: ui (switch)
branch: fix/tick-009f-hover-debug-logging
---

## Context

PM confirmed (2026-06-07 run): clicking works, counter increments, Approve returns to 2D.
Hover still broken: moving the mouse over a face in Select.Faces mode does NOT turn the face blue.

All Playwright E2E tests pass (32/32). The hover spec (AC-11) injects a fake scene item with
hand-crafted `triangleToGroup` and materials — it does NOT exercise the real `toSelectionMesh()`
/ `traverseVisible()` path. So the automated gate cannot catch this regression.

Per PM constraint: "When the ticket approval is failed, agents should focus on creating related
logs for tickets so that when there is something wrong, we can identify the problem. Do not try
to track everything immediately. Understand the problem first."

This task adds debug trace logging exposed on `window.__novaHoverDebug` so the PM can open
DevTools and see exactly where the hover pipeline breaks.

## Owned paths

```
src/viewer/selection-mode.js
src/viewer/geo-selector.js
```

## Do NOT touch

```
src/geometry/geometry-lib.js
src/nodes/categories/geometry.js
src/ui/node-renderer.js
src/core/engine.js
src/app/app.js
src/main.js
tests/**
docs/tickets/INDEX.md
```

## Goal

Add `window.__novaHoverDebug` object that accumulates trace data at each stage of the hover
pipeline. The PM can evaluate `JSON.stringify(window.__novaHoverDebug, null, 2)` in the browser
console after entering Select.Faces mode and hovering over the box.

## Debug state to expose

```js
window.__novaHoverDebug = {
  // Set during _swapToFaceMeshes()
  swapAttempted: false,        // did _swapToFaceMeshes run at all?
  swapItemCount: 0,            // how many _sceneItems were iterated
  swapSucceeded: 0,            // how many items got _selectionSwappedMesh set
  swapError: null,             // last error from the swap try/catch, if any
  itemWasHidden: false,        // was item.visible === false before force-show?
  itemGroupWasHidden: false,   // was item.group.visible === false before force-show?

  // Set each mousemove in the hover handler
  lastHoverTrace: {
    selectionModeActive: false,  // isSelectionModeActive() return value
    anySelMesh: false,           // any item has _selectionSwappedMesh
    candidateCount: 0,           // number of meshes in the raycast candidate list
    hitFound: false,             // did raycaster produce a hit?
    hitOnSelMesh: false,         // was the hit object a selection mesh?
    sceneItemFound: false,       // was the matching _sceneItems entry found?
    selectionMeshHoverCalled: false, // did selectionMeshHover() run?
    faceIndex: null,             // hit.faceIndex value
    triangleToGroupLength: null, // result.triangleToGroup.length
    groupIndex: null,            // looked-up groupIndex (null if not found)
    materialSet: false,          // did mat.color.set(FACE_HOVER_COLOR) execute?
    renderRequested: false       // did _requestRender() run?
  }
};
```

## Instructions

### 1. Branch setup

```powershell
git switch develop
git pull --ff-only
git switch -c fix/tick-009f-hover-debug-logging
```

### 2. Add debug object init in selection-mode.js

Near the top of `selection-mode.js` (after `const _state = {...}`), add:

```js
// ── Hover-pipeline debug trace (T09f) ──────────────────────────────────────
// Exposes internal state at each step so the PM can diagnose hover failures
// via window.__novaHoverDebug in the browser console.
// Remove when hover is confirmed working in-browser.
if (typeof window !== 'undefined') {
  window.__novaHoverDebug = {
    swapAttempted: false, swapItemCount: 0, swapSucceeded: 0, swapError: null,
    itemWasHidden: false, itemGroupWasHidden: false,
    lastHoverTrace: {
      selectionModeActive: false, anySelMesh: false, candidateCount: 0,
      hitFound: false, hitOnSelMesh: false, sceneItemFound: false,
      selectionMeshHoverCalled: false, faceIndex: null, triangleToGroupLength: null,
      groupIndex: null, materialSet: false, renderRequested: false
    }
  };
}
```

### 3. Instrument _swapToFaceMeshes in selection-mode.js

Inside `_swapToFaceMeshes()`:
- Set `window.__novaHoverDebug.swapAttempted = true` at the start.
- Set `window.__novaHoverDebug.swapItemCount = viewer._sceneItems.length` before the loop.
- Inside the loop, before force-showing: record `itemWasHidden` and `itemGroupWasHidden`.
- After `item._selectionSwappedMesh = result.mesh`: increment `swapSucceeded`.
- In the catch: set `swapError = err && err.message`.

### 4. Instrument the mousemove hover path in geo-selector.js

Inside the `if (isSelectionModeActive())` block in the mousemove handler:
- Set `window.__novaHoverDebug.lastHoverTrace.selectionModeActive = true`.
- After computing `anySelMesh`: set `lastHoverTrace.anySelMesh = anySelMesh`.
- After building `candidateMeshes`: set `lastHoverTrace.candidateCount = candidateMeshes.length`.
- After `intersectObjects`: set `lastHoverTrace.hitFound = hit !== null`.
- After checking `hit.object.userData.isSelectionMesh`: set `lastHoverTrace.hitOnSelMesh = true/false`.
- After finding `selMeshHoverItem`: set `lastHoverTrace.sceneItemFound = selMeshHoverItem !== null`.
- Before calling `selectionMeshHover(...)`: set `lastHoverTrace.selectionMeshHoverCalled = true`.

### 5. Instrument selectionMeshHover in selection-mode.js

At the start of `selectionMeshHover`, guard: `if (typeof window !== 'undefined' && window.__novaHoverDebug)`.
Inside the function:
- Set `lastHoverTrace.faceIndex = hit && hit.faceIndex`.
- Set `lastHoverTrace.triangleToGroupLength = result.triangleToGroup && result.triangleToGroup.length`.
- After `groupIndex = result.triangleToGroup[triIndex]`: set `lastHoverTrace.groupIndex = groupIndex`.
- After `mat.color.set(FACE_HOVER_COLOR)`: set `lastHoverTrace.materialSet = true`.
- After `_requestRender()`: set `lastHoverTrace.renderRequested = true`.

### 6. Lint and build

```powershell
npm.cmd run lint:all
npm.cmd run test:e2e
npm.cmd run build
```

All 32 E2E tests must still pass.

### 7. Commit and push

```powershell
git add src/viewer/selection-mode.js src/viewer/geo-selector.js
git commit -m "debug(TICK-009): add hover-pipeline trace logging on window.__novaHoverDebug"
git push -u origin fix/tick-009f-hover-debug-logging
```

### 8. Update ticket Run comments

Overwrite the `## Run comments` section in `docs/tickets/TICK-009.md` with the current status.

### 9. Structured JSON output (RULES.md §10)

Return:
```json
{
  "task": "T09f",
  "branch": "fix/tick-009f-hover-debug-logging",
  "status": "ready_for_pm_debug",
  "changed": [
    "src/viewer/selection-mode.js — added __novaHoverDebug init + swap + hover instrumentation",
    "src/viewer/geo-selector.js — added lastHoverTrace fields in mousemove handler"
  ],
  "lint": "0 errors",
  "test": "32/32 E2E pass",
  "playwright_tested": true,
  "playwright_result": "32 passed",
  "how_to_test": [
    "npm run dev → localhost:5173 → open DevTools console",
    "Create Box → Select.Faces → wire → Run → click Select Faces",
    "Move mouse slowly over the 3D viewport",
    "In console: JSON.stringify(window.__novaHoverDebug, null, 2)",
    "Report the full output — especially candidateCount, hitFound, groupIndex, materialSet"
  ]
}
```

## Acceptance criteria

- [ ] `window.__novaHoverDebug` exists in the browser after clicking Select Faces
- [ ] `swapSucceeded >= 1` when a Box is wired to Select.Faces
- [ ] `lastHoverTrace.candidateCount >= 1` when mouse is over the viewport
- [ ] `lastHoverTrace.hitFound` reflects whether the raycast hit something
- [ ] All 32 E2E tests still pass
- [ ] lint:all 0 errors

## Merge checklist

- [ ] `window.__novaHoverDebug` populated with correct fields after Select Faces activation
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test:e2e` — 32/32 pass
- [ ] `npm run build` — green
- [ ] `docs/tickets/TICK-009.md` Run comments updated
- [ ] Workboard claim released on merge
