# T02d — Fix Select.Faces: real face hover highlight + real Mesh geometry output

**Parent ticket:** [TICK-002](../tickets/TICK-002.md)
**Lane:** ui (agent: switch)
**Branch:** `fix/tick-002-face-mesh-hover`
**Status:** queued
**Dependency:** none — independent branch off develop

---

## Goal

The PM reports two failures that previous work (T02b) was supposed to fix but did not land correctly:

1. **AC-8 — Hovering the mouse over a Box face in Select.Faces mode does NOT highlight the face.** No blue or green tint appears on the individual face mesh under the cursor. The viewport is unresponsive to mouse position during selection mode.

2. **AC-9 — Clicking Approve does NOT return an actual Mesh geometry.** The `Select.Faces` output port carries a `FaceSelection` descriptor wrapper (`{ _type, label, nodeId, varName }`) — NOT the actual `THREE.Mesh` geometry or face data with spatial coordinates. `Output.Watch` does not show real geometry data (vertices, faces, geometry reference).

This task fixes both from scratch on a clean new branch `fix/tick-002-face-mesh-hover` off develop.

---

## Owned paths

```
src/viewer/geo-selector.js           (fix or add per-face mousemove raycasting in selection mode)
src/viewer/selection-mode.js         (fix approveSelection to pass actual Three.js mesh objects)
src/ui/node-renderer.js              (fix _activateNodeSelection onApprove to extract real geometry)
src/nodes/categories/geometry.js     (fix Select.Faces execute to return real geo objects, not strings/descriptors)
tests/geometry-selection.test.js     (update/add unit assertions for AC-8 hover side-effect and AC-9 output shape)
tests/e2e/geometry-selection.spec.js (add or fix E2E assertions for AC-8 hover and AC-9 output)
```

**Do NOT touch:**
- `src/viewer/viewer3d.js` — not needed for these two fixes
- `src/core/**`, `src/geometry/**`, `src/app/app.js`, `worker/**`, `api/**`
- Any file not listed above

---

## Hot-file lock required

`src/ui/node-renderer.js` is a hot file (ENGINEERING.md §3). Claim the lock in the workboard before editing. Release on merge.

---

## Fix specification

### AC-8: Per-face hover highlight

**What must happen:**
- When `isSelectionModeActive()` is true and the user moves the mouse over the Three.js renderer canvas, the specific `THREE.Mesh` child under the cursor turns blue (`0x89b4fa` — STYLE.md accent-blue).
- Moving to a different face: previous face restores to teal (`0x94e2d5`), new hit face turns blue.
- Moving off all geometry: all candidate faces restore to teal.
- Already-selected items remain green (`0xa6e3a1`) — hover blue does NOT override the selected-green color.

**Where to fix:**
In `src/viewer/geo-selector.js`, the `mousemove` handler currently only handles panel-mesh hover (`isPanelMesh` path). Add a parallel path guarded by `isSelectionModeActive()`:

```
When isSelectionModeActive() AND mousemove fires:
  Collect all mesh children of scene items that match the current mode
    (i.e., item.group.children that pass _itemMatchesMode)
  Run Raycaster.intersectObjects(meshChildren, false)   // false = non-recursive, already leaf meshes
  If hit:
    meshChildren.forEach(m => {
      if (alreadySelected(m)) m.material.color.setHex(0xa6e3a1)   // keep green
      else if (m === hit[0].object) m.material.color.setHex(0x89b4fa)  // blue hover
      else m.material.color.setHex(0x94e2d5)                          // teal candidate
    })
  Else:
    meshChildren.forEach(m => {
      if (alreadySelected(m)) m.material.color.setHex(0xa6e3a1)
      else m.material.color.setHex(0x94e2d5)
    })
  Store hit[0].object as _hoveredFaceMesh on the geo-selector instance (or on window.Viewer3D)
    so the E2E spec can read it via page.evaluate
```

**Key requirement:** The `Raycaster` used here must use the camera and canvas size from the renderer — use the same raycaster setup already in `geo-selector.js` for the click path. Do not add a second raycaster.

### AC-9: Approve returns actual Mesh geometry

**What must happen:**
- `Output.Watch` downstream of `Select.Faces` must show REAL geometry data — the actual `THREE.Mesh` geometry of the selected face, or at minimum a serializable object containing `{ vertices: Float32Array | Array, faces: Array, type: 'Mesh' }` that is clearly spatial data, not a string.
- The output must NOT be: a bare string label, a `[object Object]` dump, or a `FaceSelection` descriptor with only `{ _type, label, nodeId, varName }`.

**3-step fix chain:**

**Step 1 — `src/viewer/selection-mode.js` `approveSelection()`:**
Pass full item objects (not label strings) to the `onApprove` callback.

```js
// Before (wrong):
const labels = _state.items.map(it => it.label);
cb(labels);

// After (correct):
cb(_state.items);   // pass full SceneItem objects
```

**Step 2 — `src/ui/node-renderer.js` `_activateNodeSelection` onApprove handler:**
Extract the actual `THREE.Mesh` geometry from the scene item and store it in a form the execute function can use.

```js
onApprove: (items) => {
  // items: SceneItem[] — each has .group (THREE.Group) and .nodeId, .varName
  const geoData = items.map(item => {
    // Find the first real mesh child in the group
    let mesh = null;
    item.group.traverse(child => { if (!mesh && child.isMesh) mesh = child; });
    if (!mesh) return { _type: 'FaceSelection', label: item.label, nodeId: item.nodeId, varName: item.varName };
    // Extract geometry data that is JSON-serializable
    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    return {
      _type: 'Mesh',
      label: item.label,
      nodeId: item.nodeId,
      varName: item.varName,
      vertexCount: posAttr ? posAttr.count : 0,
      vertices: posAttr ? Array.from(posAttr.array).slice(0, 30) : [],  // first 10 vertices (x,y,z × 10)
      faceCount: geo.index ? geo.index.count / 3 : posAttr ? posAttr.count / 3 : 0,
    };
  });
  nd.controlValues._selectedGeo = JSON.stringify(geoData);
  nd.controlValues._selectedLabels = items.map(it => it.label).join('||');
  triggerRecompute(nd);
}
```

**Step 3 — `src/nodes/categories/geometry.js` `Select.Faces` execute:**
Return the parsed geometry data objects, not strings.

```js
execute({ controlValues }) {
  const raw = controlValues._selectedGeo;
  if (!raw) return { faces: [] };
  try {
    const geoData = JSON.parse(raw);
    return { faces: geoData };  // array of { _type:'Mesh', label, vertexCount, vertices, faceCount }
  } catch {
    return { faces: [] };
  }
}
```

After this fix, `Output.Watch` shows something like:
```
[{ "_type": "Mesh", "label": "Box (node-1)", "vertexCount": 24, "vertices": [0.5, -0.5, 0.5, ...], "faceCount": 12 }]
```
That is REAL geometry data, observable in the watch panel.

---

## Interface contracts

After this task, downstream consumers of `Select.Faces` output receive `Array<{ _type: 'Mesh', label, nodeId, varName, vertexCount, vertices, faceCount }>`. This is a breaking change from the previous `FaceSelection` descriptor — document it in a comment at the top of `Select.Faces` execute.

The E2E hook for AC-8 hover: `geo-selector.js` must expose `window.__geoSelectorHoveredFaceMesh` (or equivalent) so the spec can read the hovered mesh's material color via `page.evaluate`.

---

## AC coverage

| AC | Fix location | Observable result |
|---|---|---|
| AC-8 | geo-selector.js mousemove path | Hovered face turns blue (0x89b4fa) during selection mode; readable via page.evaluate |
| AC-9 | selection-mode.js + node-renderer.js + geometry.js | Output.Watch shows structured Mesh geometry with vertexCount + vertices array, not a bare string |

---

## Testing gate

- Unit tests: Update `tests/geometry-selection.test.js` to assert:
  - `Select.Faces` execute with a `_selectedGeo` JSON containing real mesh data returns an array with `_type: 'Mesh'` and `vertexCount > 0`.
- E2E (Playwright): Add/fix test cases in `tests/e2e/geometry-selection.spec.js`:
  - AC-8: `page.mouse.move` over box face → `page.evaluate(() => window.__geoSelectorHoveredFaceMesh?.material?.color?.getHex())` equals `0x89b4fa`.
  - AC-9: After Approve, `.watch-value` text contains `"_type"` and `"Mesh"` or contains `"vertexCount"`.
- Run `npm run lint:all && npm run test && npm run test:e2e` — all must pass before pushing.

---

## Merge checklist

- [ ] AC-8: Hovering over a box face in face-selection mode — the face turns blue, confirmed via `page.evaluate` in E2E spec
- [ ] AC-9: Output.Watch after Approve shows `_type: 'Mesh'` with vertexCount and vertices array — confirmed via E2E spec and manual browser check
- [ ] `src/ui/node-renderer.js` hot-file lock claimed in workboard before editing
- [ ] Unit tests updated and passing (`npm run test`)
- [ ] E2E spec assertions added and passing (`npm run test:e2e`)
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run build` — clean build
- [ ] TICK-002 AC-8 and AC-9 checkboxes updated with branch reference and date
- [ ] Workboard row released on merge

---

## Root-cause investigation hints

Before writing code, open the running app and check these:

1. **Is the mousemove handler in geo-selector.js actually firing during selection mode?**
   Add `console.log('hover-debug:', isSelectionModeActive())` in the mousemove handler. If it never logs, the handler is not attached to the renderer canvas or is being eaten by an overlay div.

2. **What does geo-selector.js currently do in selection mode on mousemove?**
   Search for `mousemove` in `src/viewer/geo-selector.js`. If the handler returns early when `isSelectionModeActive()` is true, that's the bug — remove the early return.

3. **Does approveSelection pass items or labels?**
   Search for `approveSelection` in `src/viewer/selection-mode.js`. Check what argument is passed to the callback. If it's `.map(it => it.label)`, that's the AC-9 root cause.

4. **What does Output.Watch actually render?**
   In node-renderer.js, search for `_selectedGeo` and `_selectedLabels`. If `_selectedGeo` is not set or `Select.Faces` execute still reads `_selectedLabels` (the string path), that's the failure point.
