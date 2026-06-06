---
id: T09d
ticket: TICK-009
title: node-renderer.js onApprove + E2E spec
lane: ui
agent: switch (ui-engineer)
branch: feat/tick-009-per-face-selection
status: blocked (awaits T09b merge — needs getSelectedFaces() from selection-mode.js)
created: 2026-06-07
depends-on: T09b merged
---

## Parent ticket

[TICK-009 — Select.Faces per-face hover, selection, and planar face output](../tickets/TICK-009.md)

## Goal

1. Update `_activateNodeSelection` in `node-renderer.js` so that on Approve, it calls `getSelectedFaces()` from `selection-mode.js`, converts each selected face group to `{ _type: 'Face', vertices, normal, area }` using `getFaceVertices()`, stores the JSON-encoded array in `nd.controlValues._selectedFaces`, and triggers recompute.
2. Write the Playwright E2E spec `tests/e2e/geometry-selection.spec.js` covering AC-11.

## AC coverage

- AC-7 (Approve → output carries face polygon data — onApprove wires it up)
- AC-8 (Cancel → output unchanged — existing cancel path must NOT set `_selectedFaces`)
- AC-11 (E2E spec: hover → blue, click → green + counter, deselect, empty click, Approve → watch contains Face data)

## Owned paths

```
src/ui/node-renderer.js
tests/e2e/geometry-selection.spec.js
```

Hot lock: `src/ui/node-renderer.js`

## Do NOT touch

```
src/geometry/geometry-lib.js
src/viewer/geo-selector.js
src/viewer/selection-mode.js
src/nodes/categories/geometry.js
src/main.js
src/core/node-library.js
tests/geometry-selection.test.js
docs/agent-workboard.md
```

## Sequencing constraint

T09d MUST NOT start until T09b is merged to the branch. `getSelectedFaces()` must be exported from `selection-mode.js` (added in T09b) before this code is written.

## Implementation spec

### node-renderer.js — `_activateNodeSelection` onApprove handler

Locate the existing `onApprove` callback passed to `activateSelectionMode(...)`. Currently it receives `items[]` (scene-item objects) and likely stores a `FaceSelection` descriptor. Replace it with:

```js
onApprove: function(items) {
  // items: still passed by approveSelection() for backward compat,
  // but for per-face selection we use getSelectedFaces() instead.
  const { getSelectedFaces } = await import('./selection-mode.js');
  // OR if already statically imported:
  const facesRaw = getSelectedFaces();
  // facesRaw: [{ itemId, groupIndex, faceGroups, mesh3 }, ...]

  const faceArray = facesRaw.map(f => {
    const { groupIndex, faceGroups, mesh3 } = f;
    if (!mesh3 || typeof mesh3.getFaceVertices !== 'function') return null;
    const vertices = mesh3.getFaceVertices(groupIndex, faceGroups);
    const group = faceGroups[groupIndex];
    const normal = group ? group.normal : [0, 0, 1];

    // Compute area: sum of triangle areas in this group
    let area = 0;
    if (group && group.triangleIndices) {
      group.triangleIndices.forEach(triIdx => {
        const [i0, i1, i2] = mesh3.faces[triIdx];
        const v0 = mesh3.vertices[i0], v1 = mesh3.vertices[i1], v2 = mesh3.vertices[i2];
        const ax = v1.x - v0.x, ay = v1.y - v0.y, az = v1.z - v0.z;
        const bx = v2.x - v0.x, by = v2.y - v0.y, bz = v2.z - v0.z;
        area += 0.5 * Math.sqrt(
          (ay*bz - az*by)**2 + (az*bx - ax*bz)**2 + (ax*by - ay*bx)**2
        );
      });
    }

    return { _type: 'Face', vertices, normal, area };
  }).filter(Boolean);

  nd.controlValues._selectedFaces = JSON.stringify(faceArray);
  // Trigger recompute so Select.Faces execute runs with the new data
  if (typeof app !== 'undefined' && typeof app.recomputeNode === 'function') {
    app.recomputeNode(nd.id);
  } else if (typeof app !== 'undefined' && typeof app._triggerRecompute === 'function') {
    app._triggerRecompute(nd.id);
  }
  // Refresh node display
  if (typeof renderNode === 'function') renderNode(nd);
},
```

Note: the exact recompute call depends on the existing pattern in node-renderer.js. Find how other control value changes trigger recompute (search for `recomputeNode` or `_triggerRecompute` in the file) and use the same pattern.

### Cancel handler

The cancel handler must NOT modify `nd.controlValues._selectedFaces`. Confirm the existing cancel callback is a no-op or only closes the toolbar. No changes needed there unless it currently writes to `_selectedGeo` or similar — in that case, remove that write.

### E2E spec — `tests/e2e/geometry-selection.spec.js`

Check whether this file already exists (it likely does from TICK-002 work). If so, append a new `test` block to the existing file. Do not delete existing tests.

```js
test('AC-11: per-face hover, click, deselect, empty click, Approve', async ({ page }) => {
  // 1. Open workspace and add Box + Select.Faces
  await page.goto('http://localhost:5173');
  // Wait for app to load
  await page.waitForSelector('#canvas-area', { timeout: 10000 });

  // Add Box node
  // (Use the existing helper pattern from this spec file, or search the library panel)
  // Example (adjust selectors to match actual app):
  await page.click('[data-testid="library-search"]');
  await page.fill('[data-testid="library-search"]', 'Box.By');
  await page.click('text=Box.ByCenterWidthDepthHeight');

  // Add Select.Faces node
  await page.fill('[data-testid="library-search"]', 'Select.Faces');
  await page.click('text=Select.Faces');

  // Wire Box → Select.Faces (adjust if the app has an auto-wire or drag mechanism)
  // ...

  // 2. Activate selection mode
  await page.click('button:has-text("Select")');
  await page.waitForSelector('.selection-mode-toolbar');

  // 3. Hover over the 3D viewport to check face highlight
  const viewport = page.locator('#viewport-3d');
  const box3d = await viewport.boundingBox();
  // Move to center of viewport
  await page.mouse.move(box3d.x + box3d.width / 2, box3d.y + box3d.height / 2);
  await page.waitForTimeout(200);

  // Assert window.__geoSelectorHoveredFaceGroup is non-null
  const hovered = await page.evaluate(() => window.__geoSelectorHoveredFaceGroup);
  expect(hovered).not.toBeNull();

  // 4. Click the face — should select it
  await page.mouse.click(box3d.x + box3d.width / 2, box3d.y + box3d.height / 2);
  await page.waitForTimeout(100);
  const counterAfterClick = await page.locator('#sel-mode-count').textContent();
  expect(counterAfterClick).toBe('1 face selected');

  // 5. Click the same face again — deselect
  await page.mouse.click(box3d.x + box3d.width / 2, box3d.y + box3d.height / 2);
  await page.waitForTimeout(100);
  const counterAfterDeselect = await page.locator('#sel-mode-count').textContent();
  expect(counterAfterDeselect).toBe('0 faces selected');

  // 6. Select a face again, then click empty space → clear
  await page.mouse.click(box3d.x + box3d.width / 2, box3d.y + box3d.height / 2);
  // Click empty corner (far from box)
  await page.mouse.click(box3d.x + 10, box3d.y + 10);
  await page.waitForTimeout(100);
  const counterAfterEmpty = await page.locator('#sel-mode-count').textContent();
  expect(counterAfterEmpty).toBe('0 faces selected');

  // 7. Select one face, then Approve
  await page.mouse.click(box3d.x + box3d.width / 2, box3d.y + box3d.height / 2);
  await page.click('button:has-text("Approve")');
  await page.waitForTimeout(300);

  // 8. Wire Select.Faces.faces → Output.Watch and check output
  // (Add Output.Watch node, wire it, then inspect the watch display)
  // ... (adjust to existing test helpers)

  // Assert watch output contains Face data
  const watchText = await page.locator('.watch-output, .node-output, [data-testid="watch-value"]').first().textContent();
  expect(watchText).toContain('_type');
  expect(watchText).toContain('Face');
  expect(watchText).toContain('vertices');
});
```

Note: adjust all selectors (`[data-testid="..."]`, `.watch-output`, etc.) to match what is actually in the DOM. Read the existing geometry-selection.spec.js (if it exists) and follow the same patterns for adding nodes and reading watch output — do not invent new patterns.

## Interface contract consumed

From `selection-mode.js` (added by T09b):
```js
import { getSelectedFaces } from '../viewer/selection-mode.js';
// Returns: [{ itemId, groupIndex, faceGroups, mesh3 }]
```

From `geometry-lib.js` (added by T09a):
```js
mesh3.getFaceVertices(groupIndex, faceGroups)
// Returns: [[x,y,z], ...]
```

## Testing gate

- E2E (Playwright): AC-11 — `npm run test:e2e` spec passes
- Manual browser: AC-7, AC-8 (approve/cancel output shape)
- Lint: `npm run lint:all` — 0 errors

## Merge checklist

- [ ] AC-7: On Approve, `nd.controlValues._selectedFaces` is set to JSON array of `{ _type: 'Face', vertices, normal, area }` objects; downstream recompute fires
- [ ] AC-8: On Cancel, `_selectedFaces` is NOT modified; output unchanged
- [ ] AC-11: E2E spec `tests/e2e/geometry-selection.spec.js` passes in full:
  - [ ] Hover → `window.__geoSelectorHoveredFaceGroup` non-null
  - [ ] Click → counter = "1 face selected"
  - [ ] Re-click → counter = "0 faces selected"
  - [ ] Empty click → counter = "0 faces selected"
  - [ ] Approve → watch output contains `_type`, `Face`, `vertices`
- [ ] `npm run lint:all` 0 errors
- [ ] `npm run test:e2e` all pass

## Notes

- `src/ui/node-renderer.js` is a hot file. Claim it in agent-workboard.md before editing.
- If `getSelectedFaces()` is not yet importable (T09b not merged), do NOT start this task. Wait for merge confirmation.
- The area calculation for arbitrary polygons: if a face group has more than 2 triangles (non-planar quads, complex shapes), sum the individual triangle areas. The formula above handles both cases.
- If node-renderer.js uses dynamic imports (e.g., `import('./selection-mode.js')`) for circular dependency avoidance, follow the same pattern.
