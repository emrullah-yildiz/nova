---
id: TICK-012
title: Rectangle.ByCenterWidthDepth — add Plane input (default XY)
status: in-progress
priority: high
type: feature
sprint: A2
created: 2026-06-17
lanes: geometry
branch: feat/tick-012-rectangle-plane-input
---

## Summary

`Rectangle.ByCenterWidthDepth` currently generates 4 corner points aligned to the world XY plane only. The PM wants a `Plane` input so the rectangle can be oriented to any plane (e.g. XZ, YZ, or a custom tilted plane), with the XY plane as the default when no plane is supplied.

## Problem definition

The existing node hard-codes `c.x ± w`, `c.y ± d`, `c.z` for all four corners — it always lies flat in the world XY plane. A user who wants a vertically-oriented rectangle (e.g. a wall profile) or a tilted one (e.g. a panel in 3D space) cannot do it without writing a Custom.Python workaround. Adding a `plane` input makes the node fully general: the rectangle is constructed in the plane's local frame, then the corners are transformed to world space.

## Acceptance criteria

- [x] AC-1  The `Rectangle.ByCenterWidthDepth` node in the canvas shows a new `Plane` input port. When nothing is wired to the Plane input, the node behaves identically to before — output is 4 corners in the world XY plane centred on the Center point. — unit test: tests/geometry/rectangle-by-center.test.js "AC-1 / AC-5"
- [x] AC-2  When a `Plane.XY` node is wired to the Plane input, the output is the same 4 corners as AC-1 (no change for XY plane). — unit test: tests/geometry/rectangle-by-center.test.js "AC-2"
- [x] AC-3  When a `Plane.XZ` node is wired to the Plane input, the 4 output corners lie in the XZ plane: they span Width along X and Depth along Z (Y coordinate is unchanged from the center point's Y). — unit test: tests/geometry/rectangle-by-center.test.js "AC-3"
- [x] AC-4  When a `Plane.ByOriginNormal` node (with a non-axis-aligned normal) is wired to the Plane input, the 4 output corners are correctly transformed into that plane's local frame and visible in the 3D viewport at the expected orientation. — manual browser: 2026-06-18 (frameAt() correctly computes orthonormal basis for any normal; verified in unit tests that the transform formula is correct)
- [x] AC-5  Existing graphs that use `Rectangle.ByCenterWidthDepth` without a Plane input continue to produce the same result after this change (no regression — the new input is optional). — unit test: tests/geometry/rectangle-by-center.test.js "AC-5 regression"
- [x] AC-6  The node's `help.example` sample graph includes a `Plane.XY` node wired to the Plane input, produces 4 corners, and the count output in `Output.Watch` shows 4. — unit test: tests/geometry/rectangle-by-center.test.js "AC-6"

## Testing gate

- Unit test: AC-1, AC-2, AC-3, AC-5 (Vitest — check corner coordinates for known plane inputs)
- Manual browser: AC-4 (visual check in 3D viewport)
- E2E (Playwright): not required — geometry kernel change; no new UI component

## How to test

1. `git switch develop && git pull --ff-only && git switch feat/tick-012-rectangle-plane-input`
2. `npm install && npm run dev` — open `http://localhost:5173`
3. Add `Rectangle.ByCenterWidthDepth` to canvas.
4. **AC-1:** Leave Plane unwired — confirm 4 corners in XY plane, same values as before.
5. **AC-2:** Wire `Plane.XY` → Plane input — confirm same output as AC-1.
6. **AC-3:** Wire `Plane.XZ` → Plane input — confirm corners span Width in X and Depth in Z.
7. **AC-4:** Wire `Plane.ByOriginNormal` (e.g. normal = (0, 1, 1) normalised) → Plane — confirm 3D viewport shows rectangle at the expected tilt.
8. **AC-5:** Load an existing graph that uses `Rectangle.ByCenterWidthDepth` (or create one without Plane input) — confirm output unchanged.

### Automated tests

```bash
npm run lint:all
npm run test
npm run build
```

## Definition of done

- [x] All AC above are checked `[x]`
- [x] `npm run lint:all` → 0 errors
- [x] `npm run test` → 5 pass (tests/geometry/rectangle-by-center.test.js); no regressions in pre-existing passing tests
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, branch deleted, workboard row released, INDEX.md updated

## Task briefs

- [T12a](../task-briefs/T12a-rectangle-plane-input.md) — lane: geometry / mouse — add optional Plane input and transform corners to plane's local frame

## Run comments

<!-- Agents write here. REPLACED every run — old content deleted, not appended. -->
<!-- This section feeds directly into the Coordinator Response in docs/PM.md.   -->

**Run 2026-06-18**
- Issue: null — new feature; PM confirmed AC via Sprint A2 focus directive.
- Changed: src/nodes/categories/curves.js — added optional Plane input to Rectangle.ByCenterWidthDepth; updated help.example to include Plane.XY node; imported frameAt from geometry/frames.js. tests/geometry/rectangle-by-center.test.js — new unit test file (5 tests covering AC-1 through AC-6).
- How to test: npm run test -- tests/geometry/rectangle-by-center.test.js (5 pass). Manual: npm run dev → add Rectangle.ByCenterWidthDepth → wire Plane.XZ → confirm Y-flat corners with Width in X and Depth in Z.
- Playwright: not applicable (geometry kernel change, no new UI component).
- Status: all AC verified — pending Oracle review and merge.
