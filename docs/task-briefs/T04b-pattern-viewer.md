# T04b — Pattern on Surface: Viewer Rendering (Per-Item Scene Objects + Hover Highlight)

**Parent ticket:** [TICK-004](../tickets/TICK-004.md)
**Lane:** ui (agent: switch)
**Branch:** `feat/pattern-on-surface-viewer`
**Status:** queued
**Dependency:** none — can start immediately in parallel with T04a (interface contract is pre-agreed; see below)

---

## Goal

Update the 3D viewer so that when a node outputs a list of panel objects
(`{ points: Point[], frame: Plane }`) rather than a single merged mesh, each
panel object is registered as a **separate scene object** — meaning:

1. Each panel renders as a visually distinct, filled quad in the viewport (AC-3).
2. Hovering or clicking a single panel highlights only that panel, not the whole
   grid (AC-4).

The viewer must detect the panel-object list format and iterate it, rather than
expecting a single mesh value.

---

## Owned paths

```
src/viewer/viewer3d.js      (modify — iterate panel-object list, register each as scene object)
src/viewer/geo-selector.js  (modify — per-object hover/click hit-test, individual highlight)
```

**Do NOT touch:**
- `src/nodes/categories/patterns.js` — owned by T04a
- `src/geometry/**` — owned by T04a
- `src/ui/**`, `src/app/**`, `src/core/**`, `worker/**`, `api/**`
- `tests/e2e/pattern-on-surface.spec.js` — owned by T04a (authored there)

---

## Interface / contract (pre-agreed — implement exactly this)

The panel-object list that flows into the viewer has this shape:

```js
[
  {
    points: Point[],   // array of 4 corner points (x, y, z)
    frame: {
      origin: Point,   // centroid
      xAxis:  Vector,
      yAxis:  Vector,
      normal: Vector
    }
  },
  // …15 more for a 4×4 grid
]
```

The viewer identifies this format by checking whether array items have a `points`
property that is itself an array (i.e. `Array.isArray(item.points)`). If so, treat
the list as a panel-object list.

For each panel object, construct a quad mesh from `panel.points` and add it as an
independent Three.js (or equivalent) `Mesh` object with its own scene ID.

Expose a window-level counter or `data-testid` on the canvas wrapper so T04a's
Playwright spec can assert the count of distinct scene objects. Suggested:

```js
window._novaSceneObjectCount = scene.children.filter(/* meshes only */).length;
```

or add a `data-panel-count` attribute to the canvas container element, updated on
each render. Coordinate with the T04a agent on the exact attribute/accessor name
before either task finalizes.

---

## AC coverage (this task)

| AC | Type | What this task does |
|---|---|---|
| AC-3 | Manual | Viewport shows 16 visually distinct filled quads conforming to the curved surface |
| AC-4 | Manual | Hovering a single panel highlights only that panel |

AC-1, AC-2, AC-5, AC-6, AC-7, AC-8, AC-9 are covered by T04a.

---

## Testing gate

- Manual browser: AC-3, AC-4 — observe in running app and record in TICK-004 with date.
- No dedicated Vitest unit test required for this task (viewer rendering is not
  unit-testable headlessly); the Playwright spec in T04a exercises the viewport
  indirectly via scene-object count.

---

## Merge checklist

- [ ] AC-3 verified: manual browser — 16 quads visible in viewport, each conforming to curved surface; no panel lies flat; recorded in TICK-004 with date
- [ ] AC-4 verified: manual browser — hovering one panel highlights only that panel; recorded in TICK-004 with date
- [ ] `window._novaSceneObjectCount` (or agreed accessor) is exposed so T04a's Playwright spec can read it — coordinate with T04a agent
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass (no regressions in existing viewer behavior)
- [ ] Existing selection mode (TICK-002) still works after viewer changes — manual spot-check
- [ ] TICK-004 AC-3 and AC-4 checkboxes updated in ticket file
- [ ] Workboard row released on merge

---

## Notes

- The viewer currently renders a single merged mesh per node output. This task
  extends it to handle a list of panel objects. Do not break the single-mesh path;
  it must still work for all existing geometry nodes.
- Keep the format detection minimal: `Array.isArray(value) && value.length > 0 && Array.isArray(value[0]?.points)`.
  If the item does not have `points`, fall back to existing mesh rendering.
- Individual hover highlight: give each Three.js mesh a unique `userData.panelId`
  so the hit-test in `geo-selector.js` can match and highlight only the hovered
  object. Do not change the global selection-mode wiring — this is hover-only.
- If merging T04b before T04a is complete, the per-panel rendering will produce
  empty results until T04a's kernel changes are on `develop`. This is acceptable —
  each task merges when ready; `develop` is always green but may not show the full
  feature until both are merged.
- Coordinate with T04a agent on the `window._novaSceneObjectCount` accessor name
  before either task finalizes their branch.
