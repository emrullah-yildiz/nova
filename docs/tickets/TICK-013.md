---
id: TICK-013
title: Surface.Trim — cut a surface with intersecting geometry and extract the remainder
status: draft
priority: high
type: feature
sprint: A3
created: 2026-06-17
lanes: geometry
branch: feat/tick-013-surface-trim
---

## Summary

No `Surface.Trim` node exists in the library. The PM needs a node that takes a surface mesh and one or more cutting geometry objects, performs a trim (removing the portion of the surface that intersects with or is enclosed by the cutting geometry), and outputs the remaining surface. This is the canonical "trim surface" operation found in Rhino and Grasshopper.

## Problem definition

Users building parametric facades, panelised roofs, or cut profiles currently have no way to cut a surface with another geometry object and keep only the surviving portion. The closest existing operations are `Solid.BooleanSubtract` (for solids, not surfaces), `Curve.Trim` (for curves, not surfaces), and `Surface.ByPatch` (which creates surfaces but does not cut them). A `Surface.Trim` node fills this gap.

## Acceptance criteria

- [ ] AC-1  A `Surface.Trim` node appears in the Surfaces category of the node library with a `Surface` input (type `mesh`) and a `Geometry` input (type `mesh`) that specifies the cutting body. The node has a `Result` output of type `mesh` containing the trimmed surface.
- [ ] AC-2  When a flat `Surface.ByPatch` (e.g. a square patch) and a `Sphere.ByCenterRadius` overlapping it are wired in, the `Result` output is a mesh representing the portion of the patch that lies outside the sphere (the sphere-intersection region is removed). The trimmed mesh is visible in the 3D viewport.
- [ ] AC-3  When the cutting geometry does not intersect the surface at all, the `Result` output is the original surface unchanged (no crash, no empty mesh).
- [ ] AC-4  When the surface is fully enclosed by the cutting geometry, the `Result` output is an empty mesh (zero triangles) — not `undefined` or a thrown error.
- [ ] AC-5  The node's `help.example` sample graph is a complete workflow: a `Surface.ByPatch` (4-corner square) → `Surface.Trim` ← `Sphere.ByCenterRadius` (overlapping the centre) → `Output.Watch`. Running the graph produces a visible trimmed mesh in the Watch output (not `[object Object]` or `undefined`).
- [ ] AC-6  A Vitest unit test in `tests/` covers AC-2, AC-3, and AC-4: asserts that the trimmed mesh has fewer triangles than the input (AC-2), equals the input when no intersection (AC-3), and has zero triangles when fully enclosed (AC-4).

## Testing gate

- Unit test: AC-2, AC-3, AC-4, AC-6 (Vitest — check triangle counts)
- Manual browser: AC-1, AC-2, AC-5 (visual check in 3D viewport)
- E2E (Playwright): not required — geometry kernel node; no new UI component

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/tick-013-surface-trim`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Search the node library for "Trim" or browse the Surfaces category.
4. **AC-1:** Confirm `Surface.Trim` appears with Surface and Geometry inputs and a Result output.
5. **AC-2:** Add `Surface.ByPatch` (a square), `Sphere.ByCenterRadius` (overlapping centre), wire both to `Surface.Trim` → `Output.Watch`. Confirm trimmed mesh visible in viewport with the sphere-overlap region removed.
6. **AC-3:** Move the sphere away so it no longer intersects — confirm Result equals the full original patch.
7. **AC-4:** Scale the sphere to fully enclose the patch — confirm Result is empty (no crash).
8. **AC-5:** Open the node's help panel — confirm example runs and shows a trimmed mesh.

### Automated tests

```bash
npm run lint:all
npm run test
npm run build
```

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, branch deleted, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

## Run comments

<!-- Agents write here. REPLACED every run — old content deleted, not appended. -->
<!-- This section feeds directly into the Coordinator Response in docs/PM.md.   -->

**Run 2026-06-17**
- Issue: null — new ticket, awaiting PM AC confirmation.
- Changed: docs/tickets/TICK-013.md created (draft status).
- How to test: n/a until AC confirmed and agents dispatched.
- Playwright: not applicable.
- Status: pending PM confirmation of AC.
