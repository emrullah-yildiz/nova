# T4 — Geometry Selection Architecture (feat/geometry-selection)

**Lane:** ui-engineer (owns src/ui/, src/viewer/, src/nodes/categories/, src/geometry/geo-selector.js)  
**Branch:** `feat/geometry-selection`  
**Started from:** `develop` (clean)  
**Hot file locks:** `src/ui/node-renderer.js`, `src/core/node-library.js`

## Goal
Remove any existing single-element-select / "Select Element" / "Select Nodes" nodes
from the library. Add three new nodes — `Select.Faces`, `Select.Edges`,
`Select.Points` — each backed by a 3D interactive selection mode. Each node body
shows a "Select" button; clicking it activates selection mode in the 3D viewport.
While active, two toolbar buttons appear (green Approve, red Cancel). Approve stores
the selection as the node output; Cancel discards it.

## Owned paths (do not touch anything outside these)
- `src/nodes/categories/geometry.js` — add Select.Faces, Select.Edges, Select.Points node defs; remove any old select-element nodes
- `src/geometry/geo-selector.js` — geometry-layer selection logic (raycasting, hit-test vs mesh faces/edges/vertices)
- `src/viewer/geo-selector.js` — 3D viewport selection mode controller (activate, deactivate, accumulate picks, approve/cancel)
- `src/viewer/viewer3d.js` — wire selection mode signals into the viewer (mode flag, cursor change, pick events)
- `src/ui/node-renderer.js` (HOT) — render the "Select" button in the node body for these three node types
- `src/core/node-library.js` (HOT) — remove any old select-element node registrations
- `tests/geometry-selection.test.js` (new) — unit tests for geo-selector logic + node output contract

## Do NOT touch
- `src/runtime/` — not your lane
- `src/ai/` — not your lane
- `src/enterprise/` — not your lane
- Any file not listed above

## Before writing any code — fit gate
Per NOVA.md §4 "No duplicate nodes": search the existing library for any node
whose `type` includes "Select" or whose description mentions element/node selection:
```js
// in src/nodes/categories/geometry.js and src/core/nodes.js (legacy)
// and src/core/node-library.js
```
Remove those before adding the new ones. Do NOT ship functional duplicates.

## Architecture contract

### Node definitions (in src/nodes/categories/geometry.js)
```js
{
  type: 'Select.Faces',
  label: 'Select Faces',
  category: 'Geometry',
  inputs: [],                          // no wired inputs — selection is interactive
  outputs: [{ name: 'faces', type: 'list' }],
  meta: { selectionMode: 'faces' },    // consumed by node-renderer to show button
  help: { description: '...', example: { /* producer→this→consumer */ } }
}
// Same shape for Select.Edges (outputs: [{name:'edges',type:'list'}])
// and Select.Points (outputs: [{name:'points',type:'list'}])
```

### Selection mode state (new owned module: src/viewer/geo-selector.js)
```js
export function activateSelectionMode(nodeId, mode, onApprove, onCancel) { ... }
// mode: 'faces' | 'edges' | 'points'
// onApprove(items: GeoFace[]|GeoEdge[]|GeoPoint[]) → stored as node output
// onCancel() → discard, restore previous state

export function deactivateSelectionMode() { ... }
export function isSelectionModeActive() { ... }   // returns bool
```

### node-renderer hook (src/ui/node-renderer.js)
In the node body render function, check `node.meta?.selectionMode`. If set, render:
```html
<button class="nova-select-btn" data-node-id="${node.id}">Select</button>
```
Wire a click handler that calls `activateSelectionMode(node.id, node.meta.selectionMode, ...)`.

### Toolbar (in viewer3d.js or a dedicated toolbar element)
When selection mode is active, inject two buttons left of the run-mode toggle:
```html
<button id="selection-approve" title="Approve selection">✓</button>   <!-- green -->
<button id="selection-cancel"  title="Cancel selection">✗</button>    <!-- red -->
```
Approve calls `onApprove(accumulatedItems)`; Cancel calls `onCancel()`. Both
deactivate selection mode and remove the buttons.

### Output format
Each approved item must be a plain serialisable object:
```js
// Face
{ type: 'GeoFace', nodeId: string, faceIndex: number, normal: {x,y,z}, centroid: {x,y,z} }
// Edge
{ type: 'GeoEdge', nodeId: string, edgeIndex: number, start: {x,y,z}, end: {x,y,z} }
// Point / vertex
{ type: 'GeoPoint', nodeId: string, vertexIndex: number, position: {x,y,z} }
```
The node output is always a **list** (even if only one item selected).

### Hidden geometry
In selection mode, items whose mesh is not currently visible in the viewport must
NOT be selectable (skip in raycasting hit-test).

## Steps
1. `git switch develop && git pull --ff-only origin develop`
2. `git switch -c feat/geometry-selection`
3. Claim row in `docs/agent-workboard.md` (status `active`) + push branch.
4. Search and remove old select-element nodes from `src/core/node-library.js` and
   `src/nodes/categories/geometry.js`.
5. Implement `src/geometry/geo-selector.js` — pure raycasting / hit-test logic.
6. Implement `src/viewer/geo-selector.js` — selection mode state machine.
7. Wire into `src/viewer/viewer3d.js` — mode flag, cursor, pick event forwarding.
8. Add "Select" button rendering in `src/ui/node-renderer.js`.
9. Add toolbar Approve/Cancel buttons, wired to viewer3d.js.
10. Add node defs in `src/nodes/categories/geometry.js`.
11. Register nodes (if needed) in `src/core/node-library.js`.
12. Write `tests/geometry-selection.test.js` — unit test the geo-selector logic and
    the node output contract (Vitest + jsdom; no Playwright needed for unit tests).
13. Run `npm run test` — all green. `npm run lint:all` — zero errors. `npm run build` — passes.
14. Commit, merge to develop, push. Release workboard row.

## Sample graph for help.example (must run and produce meaningful output)
NumberSlider(0) → Select.Faces → List.Count → Watch

(The example can use a hardcoded face list from a prior geometry node wired in,
since interactive selection is not runnable in the engine — document this limitation
in the node's help text.)

## Merge checklist
- [ ] Old select-element nodes removed; no functional duplicates.
- [ ] Three new nodes registered and visible in library.
- [ ] "Select" button renders in node body.
- [ ] Approve/Cancel toolbar appears/disappears correctly.
- [ ] Hidden geometry not selectable.
- [ ] Output is a list of serialisable GeoFace/GeoEdge/GeoPoint objects.
- [ ] `npm run test` all green.
- [ ] Hot file locks released.
