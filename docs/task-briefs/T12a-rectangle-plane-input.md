# Task Brief T12a — Rectangle.ByCenterWidthDepth: add Plane input

**Parent ticket:** [TICK-012](../tickets/TICK-012.md)
**Branch:** `feat/tick-012-rectangle-plane-input`
**Agent:** mouse (geometry-engineer)
**Status:** queued

---

## Goal

Add an optional `Plane` input to the existing `Rectangle.ByCenterWidthDepth` node so the rectangle can be oriented to any plane in 3D space, with XY as the default when no Plane is wired.

---

## AC coverage

| AC | Requirement |
|---|---|
| AC-1 | New Plane port visible on canvas; default (no wire) → identical XY output as before |
| AC-2 | Wiring `Plane.XY` → same output as AC-1 |
| AC-3 | Wiring `Plane.XZ` → corners span Width in X, Depth in Z |
| AC-4 | Wiring `Plane.ByOriginNormal` (non-axis-aligned) → correctly transformed corners in 3D viewport |
| AC-5 | Existing graphs without a Plane wire produce the same result (no regression) |
| AC-6 | `help.example` includes `Plane.XY` wired in and `Output.Watch` shows count = 4 |

---

## Owned paths

**You may only touch these paths:**

```
src/geometry/nodes/Rectangle.ByCenterWidthDepth.js    (or equivalent path — find with rg)
src/nodes/categories/geometry.js                      (only the Rectangle entry if needed)
tests/geometry/rectangle-by-center.test.js            (create if absent)
```

**Do NOT touch:**
- `src/core/node-library.js` (hot file — do not claim)
- `src/app/app.js`, `src/main.js` (hot files)
- `src/ui/**`, `src/viewer/**` (switch lane — not yours)
- Any other geometry node file (no scope creep)

---

## Interface / contract

The node must accept an optional third input:

```js
{
  name: 'Plane',
  type: 'plane',      // matches the Plane type used by Plane.XY / Plane.XZ / Plane.ByOriginNormal
  optional: true,
  default: null       // null → fallback to world XY plane
}
```

A `plane` object has this shape (confirm against existing Plane nodes before assuming):
```js
{ origin: {x, y, z}, xAxis: {x, y, z}, yAxis: {x, y, z}, normal: {x, y, z} }
```

The four rectangle corners are constructed in the plane's local frame using `xAxis` (for Width) and `yAxis` (for Depth), then each corner point is:
```
worldPoint = origin + (localX * xAxis) + (localY * yAxis)
```

---

## Merge checklist

- [ ] AC-1 verified: canvas shows Plane port; no-wire output = same XY corners as before
- [ ] AC-2 verified: `Plane.XY` wire → same output as AC-1
- [ ] AC-3 verified: `Plane.XZ` wire → corners span Width in X, Depth in Z
- [ ] AC-5 verified: unit test confirms no regression for existing no-plane usage
- [ ] AC-6 verified: `help.example` graph includes `Plane.XY` → `Rectangle.ByCenterWidthDepth` → `Output.Watch` showing count 4
- [ ] AC-4 note: manual browser check — 3D viewport shows correctly-tilted rectangle for non-axis-aligned plane
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass (including new unit tests for AC-1, AC-2, AC-3, AC-5)
- [ ] `npm run build` → green
- [ ] Workboard row released on merge
- [ ] `docs/tickets/TICK-012.md` AC checkboxes updated to `[x]`
- [ ] `docs/tickets/INDEX.md` status updated

---

## Steps summary

1. `rg "Rectangle.ByCenterWidthDepth" src/` to find the node definition file.
2. `rg "Plane.XY\|PlaneXY\|plane.*xAxis" src/geometry/` to find the Plane object shape from existing Plane nodes.
3. Add the optional `Plane` input port definition.
4. Update the compute function: if `plane` is null/undefined, use world-XY defaults (`xAxis={x:1,y:0,z:0}`, `yAxis={x:0,y:1,z:0}`, `origin=center`). Otherwise transform corners into the given plane.
5. Update `help.example` to wire a `Plane.XY` node.
6. Write/update unit tests: no-plane (AC-1/AC-5), XY plane (AC-2), XZ plane (AC-3).
7. Run `npm run lint:all && npm run test && npm run build`.
8. Check all AC boxes in TICK-012.md, update ## Run comments, update INDEX.md.
9. Return structured JSON output per RULES.md §10 (`playwright_tested: false`, kernel-only change).

---

## Notes

- Enumerate all existing Rectangle nodes first (`rg "Rectangle\." src/`) to confirm no duplicate.
- The `Plane.XZ` plane: `xAxis=(1,0,0)`, `yAxis=(0,0,1)`, `normal=(0,1,0)`, `origin=center`.
- Keep the change small: do not refactor other Rectangle nodes or unrelated geometry helpers.
- No Playwright E2E needed — this is a geometry kernel change with no new UI component.
