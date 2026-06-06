# T02b — Fix hover face highlight (blue, per-face) + fix Approve outputting actual mesh surface

**Parent ticket:** [TICK-002](../tickets/TICK-002.md)
**Lane:** ui (agent: switch)
**Branch:** `fix/selection-mode-e2e`
**Status:** queued
**Dependency:** none (continues on the same active branch as T02a)

---

## Goal

Two PM-reported bugs remain open on TICK-002:

1. **AC-8 — Hovering over a mesh face in face-selection mode must highlight just that face in blue, not the whole mesh in green.** The current `_applySelectionHighlight` in `selection-mode.js` applies a single color to the whole scene item group. The PM wants: mouse-over a face → that face turns blue; mouse leaves → face returns to teal/normal. This is per-face (triangle-level or mesh-child-level) hover, not per-scene-item.

2. **AC-9 — Clicking Approve after selecting a box face must output the actual mesh surface object (with spatial data), not the plain string label.** The current `approveSelection()` in `selection-mode.js` calls `_state.items.map(it => it.label)` — a string. The `_activateNodeSelection` onApprove handler in `node-renderer.js` then stores those strings in `nd.controlValues._selectedLabels`. The `Select.Faces` execute function returns those strings as its output list. Downstream `Output.Watch` therefore shows a bare string like `"Box.ByCenterWidthDepthHeight (node-1)"`, not a structured geometry value.

The fix must:
- For AC-8: add a per-face mousemove handler in `geo-selector.js` (or `selection-mode.js`) that uses the raycaster to identify the specific intersected face mesh and highlights it blue (`0x89b4fa`, per STYLE.md accent-blue). Restore the previous face color on mouseout or when the cursor moves to a different face. This must work when selection mode is active — i.e., it should coexist with the existing `_applySelectionHighlight` call that tints all candidate items teal.
- For AC-9: change `approveSelection()` to pass scene-item objects (not labels) to the `onApprove` callback. Update the `_activateNodeSelection` handler in `node-renderer.js` to store geometry references (the Three.js group's `userData` or the underlying Geo object accessible via `item.group`) in a way that the `Select.Faces` execute function can return structured geometry. The `Output.Watch` downstream must show a value that has spatial properties (a geometry object with `_type`, `vertices`, or equivalent) rather than a bare string.

---

## Owned paths

```
src/viewer/selection-mode.js       (fix approveSelection to pass items not labels; add per-face hover)
src/viewer/geo-selector.js         (add/update mousemove handler for per-face blue hover in selection mode)
src/ui/node-renderer.js            (update _activateNodeSelection onApprove to store geometry refs)
src/nodes/categories/geometry.js   (update Select.Faces/Edges/Points execute to return geo objects)
```

**Do NOT touch:**
- `src/viewer/viewer3d.js` — not needed for these two bugs; keep out
- `src/core/**`, `src/geometry/**`, `src/app/**`, `worker/**`, `api/**`
- `tests/e2e/**` — T02c owns the E2E spec for AC-8 and AC-9
- Any file not listed above

---

## Hot-file lock required

`src/ui/node-renderer.js` is a hot file (see ENGINEERING.md §3). Before touching it, confirm no other active workboard row holds the lock. Claim it in the workboard row for this branch before editing.

---

## Interface / contracts

### AC-8 — Per-face blue hover

The mousemove handler in `geo-selector.js` already has a panel-hover path (see `_hoveredPanelId`). Extend it for general selection-mode face hover:

```
When isSelectionModeActive() === true AND mousemove fires on the renderer canvas:
  Raycast against all visible mesh children of _sceneItems that match the current mode.
  If a face is hit:
    - Set that specific mesh's material.color to 0x89b4fa (accent-blue per STYLE.md)
    - Restore all other candidate meshes to their selection-mode teal (0x94e2d5)
  If no face is hit:
    - Restore all candidate meshes to teal
```

The per-face blue highlight must not replace the green highlight on already-selected items (those stay green at 0xa6e3a1).

### AC-9 — Geometry output contract

After this fix, the `onApprove` callback in `_activateNodeSelection` receives `items: SceneItem[]` where each SceneItem has the shape:

```js
{
  id: string,          // nodeId + ':' + varName
  nodeId: string,      // the source node id
  varName: string,
  label: string,       // human-readable name (for display only)
  group: THREE.Group,  // contains the actual Three.js mesh children
  visible: boolean,
  selected: boolean
}
```

The `group.userData` has `{ nodeId, varName, label, isGeoItem: true }`. The geometry reference accessible to the downstream execute function can be stored as a structured object:

```js
// shape to store in controlValues (serialisable to JSON for runGraph):
{
  label: item.label,
  nodeId: item.nodeId,
  varName: item.varName,
  // geometry reference: extract from app state after runGraph, keyed by nodeId+varName
}
```

Because Nova's graph runtime is synchronous and geometry values are keyed by node ID in `app.nodes`, the simplest correct approach is:
1. In `approveSelection()`, pass the full `_state.items` array (objects) to `onApprove` instead of the labels array.
2. In `_activateNodeSelection` onApprove, look up the source node for each item and get its computed output value from `app.nodes.find(n => n.id === item.nodeId)`. Store those geometry objects (or a structured descriptor with `{ _type, nodeId, varName, label }`) in a new hidden control — e.g., `_selectedGeo` — as JSON.
3. In `Select.Faces` execute, parse `_selectedGeo` and return the geometry objects from the graph's compute results rather than plain strings.

If accessing live geometry objects proves brittle at execute time (they are not part of `controlValues` JSON), the fallback correct approach is to return a descriptor array `[{ _type: 'FaceSelection', nodeId, varName, label }]` — which is still structured (not a bare string) and passes AC-9's assertion that `Output.Watch` shows a value with typed fields rather than a bare string.

Whichever approach is chosen, the key invariant: `Output.Watch` must NOT show a bare string after Approve.

---

## AC coverage

| AC | Type | What this task fixes |
|---|---|---|
| AC-8 | Bug fix (code) | Per-face blue hover highlight when selection mode is active |
| AC-9 | Bug fix (code) | Approve returns structured geometry value, not plain string |

T02c writes the Playwright assertions that prove these are fixed.

---

## Testing gate

- This task does NOT write E2E tests — that is T02c's job.
- Before submitting: run `npm run lint:all` (0 errors) and `npm run test` (all unit tests pass).
- Manually open `npm run dev`, add a Box node, enter Select.Faces mode, hover over the box, confirm the face turns blue. Click Approve, confirm Output.Watch shows a structured value.

---

## Merge checklist

- [ ] AC-8 fix confirmed: hovering over a mesh face in face-selection mode turns that face blue (not green, not the whole mesh)
- [ ] AC-9 fix confirmed: `Output.Watch` downstream of `Select.Faces` shows a structured value (has typed fields — not a bare string) after Approve
- [ ] `src/ui/node-renderer.js` hot-file lock claimed before edit and released after merge
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all unit tests pass (no regressions to existing geometry-selection.test.js)
- [ ] No regressions to AC-1 through AC-7 (existing E2E spec still green: `npm run test:e2e`)
- [ ] TICK-002 AC-8 and AC-9 checkboxes updated with fix description and branch reference
- [ ] Workboard row status updated on merge

---

## Root-cause guide

Read these before coding:

1. **AC-8 root cause location:** `src/viewer/geo-selector.js` lines 340–383. The existing mousemove handler only fires for `isPanelMesh` objects. Extend it (or add a parallel path guarded by `isSelectionModeActive()`) to raycast all `_itemMatchesMode`-compatible meshes and highlight the hit face blue.

2. **AC-9 root cause — step 1:** `src/viewer/selection-mode.js` line 271. `approveSelection()` maps items to labels (strings) before calling `cb`. Change this to pass items directly.

3. **AC-9 root cause — step 2:** `src/ui/node-renderer.js` line 831–836. The `onApprove` handler calls `labels.join('||')` and stores strings in `_selectedLabels`. Update to handle item objects.

4. **AC-9 root cause — step 3:** `src/nodes/categories/geometry.js` lines 552–555. `Select.Faces` execute reads `_selectedLabels`, splits on `||`, and returns the string array. Update to return structured geometry or descriptor objects.

---

## Notes

- Stay on the existing `fix/selection-mode-e2e` branch — do not create a new branch.
- Keep all changes minimal. Do not restructure selection-mode.js or geo-selector.js.
- The per-face blue hover is a NEW behavior not previously implemented. It requires traversing into `item.group.children` to find individual meshes and raycasting at that granularity. A Three.js `Raycaster.intersectObjects(meshes, false)` call with the individual mesh list (not the group) returns the exact triangle and face index — the `object` property of the first intersect is the specific mesh child to recolor.
