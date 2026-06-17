# Task Brief T13a — Surface.Trim: new node

**Parent ticket:** [TICK-013](../tickets/TICK-013.md)
**Branch:** `feat/tick-013-surface-trim`
**Agent:** mouse (geometry-engineer)
**Status:** queued

---

## Goal

Implement a new `Surface.Trim` node in the geometry kernel. The node takes a surface mesh and a cutting geometry mesh, removes the portion of the surface that intersects with or is enclosed by the cutting geometry, and outputs the remaining surface as a mesh.

---

## AC coverage

| AC | Requirement |
|---|---|
| AC-1 | `Surface.Trim` appears in the Surfaces category with `Surface` (mesh) and `Geometry` (mesh) inputs and a `Result` (mesh) output |
| AC-2 | `Surface.ByPatch` (square) + `Sphere.ByCenterRadius` (overlapping) → Result is mesh with sphere-intersection region removed; visible in 3D viewport |
| AC-3 | Non-intersecting cutting geometry → Result equals the original surface (no crash, no empty mesh) |
| AC-4 | Fully-enclosing cutting geometry → Result is empty mesh (zero triangles), not `undefined` or thrown error |
| AC-5 | `help.example` is a complete workflow: `Surface.ByPatch` → `Surface.Trim` ← `Sphere.ByCenterRadius` → `Output.Watch`; running shows a trimmed mesh (not `[object Object]` or `undefined`) |
| AC-6 | Vitest unit test covers AC-2 (fewer triangles than input), AC-3 (same count as input), AC-4 (zero triangles) |

---

## Owned paths

**You may only touch these paths:**

```
src/geometry/nodes/Surface.Trim.js              (new file — create it)
src/nodes/categories/surfaces.js               (add the Surface.Trim entry — one line registration)
tests/geometry/surface-trim.test.js            (new unit test file)
```

**Do NOT touch:**
- `src/core/node-library.js` (hot file — do not claim)
- `src/app/app.js`, `src/main.js` (hot files)
- `src/ui/**`, `src/viewer/**` (switch lane — not yours)
- Any other surface/geometry node file outside the above list
- `src/geometry/nodes/Surface.ByPatch.js` or `Sphere.ByCenterRadius.js` (do not modify consumers)

---

## Interface / contract

Node definition shape:

```js
{
  type: 'Surface.Trim',
  category: 'Surfaces',
  label: 'Surface.Trim',
  inputs: [
    { name: 'Surface', type: 'mesh' },
    { name: 'Geometry', type: 'mesh' }   // the cutting body
  ],
  outputs: [
    { name: 'Result', type: 'mesh' }
  ],
  help: {
    summary: 'Cuts a surface mesh with an intersecting geometry and returns the remaining portion.',
    example: { /* workflow graph — see AC-5 */ }
  }
}
```

### Trim algorithm approach

Use triangle-level filtering based on mesh intersection. A reasonable browser-side approximation:

1. Find the set of triangles in `Surface` whose centroid lies **inside** the bounding volume of `Geometry`.
2. For a sphere cutting body: test each triangle centroid against the sphere center + radius.
3. For a general mesh: use the geometry's AABB or a point-in-mesh test (ray-cast from centroid, count crossings).
4. Discard triangles that lie inside (or are clipped by) the cutting geometry. Keep the rest.
5. Return the filtered triangles as a new mesh object.

**Check what mesh helpers already exist** (`rg "triangles\|faces\|geometry.*helper" src/geometry/`) before writing new utilities — reuse if available.

Edge cases:
- No intersection (AC-3): all centroids outside → return original mesh unchanged (copy, not reference).
- Full enclosure (AC-4): all centroids inside → return `{ vertices: [], faces: [], triangles: [] }` (empty mesh, same shape as other mesh outputs — not `null`/`undefined`).

---

## Merge checklist

- [ ] AC-1 verified: node appears in Surfaces category library panel with correct ports
- [ ] AC-2 verified: unit test confirms trimmed triangle count < input count when sphere overlaps
- [ ] AC-3 verified: unit test confirms Result triangle count = input count when no intersection
- [ ] AC-4 verified: unit test confirms Result triangle count = 0 when fully enclosed; no throw
- [ ] AC-5 verified: `help.example` graph is a complete workflow (producer → Surface.Trim → Output.Watch); manual browser shows trimmed mesh in Watch
- [ ] AC-6 verified: Vitest unit test file passes for AC-2, AC-3, AC-4
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run build` → green
- [ ] Workboard row released on merge
- [ ] `docs/tickets/TICK-013.md` AC checkboxes updated to `[x]`
- [ ] `docs/tickets/INDEX.md` status updated

---

## Steps summary

1. `rg "Surface\." src/nodes/categories/` to enumerate existing Surface nodes — confirm no existing `Surface.Trim`.
2. `rg "Surface.ByPatch\|ByPatch" src/` to understand how existing surface nodes register and what mesh shape they emit.
3. `rg "Sphere.ByCenterRadius\|sphere" src/geometry/` to understand the sphere mesh shape.
4. Create `src/geometry/nodes/Surface.Trim.js` with the node definition and compute function.
5. Register it in `src/nodes/categories/surfaces.js` (single-line addition).
6. Build `help.example`: `Surface.ByPatch` (4 corners of a unit square) → `Surface.Trim` ← `Sphere.ByCenterRadius` (center=(0,0,0), radius=0.4) → `Output.Watch`.
7. Write `tests/geometry/surface-trim.test.js` covering AC-2, AC-3, AC-4.
8. Run `npm run lint:all && npm run test && npm run build`.
9. Check all AC boxes in TICK-013.md, update ## Run comments, update INDEX.md.
10. Return structured JSON output per RULES.md §10 (`playwright_tested: false`, kernel-only change).

---

## Notes

- Enumerate existing Surface nodes before writing (`rg "type:.*Surface\." src/`).
- The mesh object shape must match what `Surface.ByPatch` and other nodes already produce — do not invent a new mesh schema.
- Empty mesh for AC-4: use the same zero-length arrays as any other mesh output — do not return `null`, `undefined`, or throw.
- No Playwright E2E needed — this is a geometry kernel node with no new UI component.
- This is a new node, not a modification of an existing one — no backwards-compatibility concern.
