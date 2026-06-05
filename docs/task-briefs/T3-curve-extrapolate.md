# T3 — Curve.PointAtParameter Extrapolation (fix/curve-point-extrapolate)

**Lane:** geometry-engineer  
**Branch:** `fix/curve-point-extrapolate`  
**Started from:** `develop` (clean)

## Goal
`Curve.PointAtParameter` clamps parameter t to [0,1], so values outside that range
always return the endpoint. Fix it to **extrapolate** linearly (or along the curve's
tangent) when t < 0 or t > 1, so a user can place a point *beyond* the curve end.

## Owned paths (do not touch anything outside these)
- `src/nodes/categories/curves.js` — node definition (fix the parameter handling / call)
- `src/geometry/curve-eval.js` — geometry kernel (fix or add extrapolation logic)
- `tests/curves-node-results.test.js` — add extrapolation assertions

## Do NOT touch
- `src/ui/node-renderer.js` (hot)
- `src/core/node-library.js` (hot)
- Any other file outside the owned paths

## Steps
1. `git switch develop && git pull --ff-only origin develop`
2. `git switch -c fix/curve-point-extrapolate`
3. Read `src/nodes/categories/curves.js` — locate `Curve.PointAtParameter` definition.
4. Read `src/geometry/curve-eval.js` — locate the function that maps t → point;
   confirm where clamping happens.
5. Write failing tests in `tests/curves-node-results.test.js`:
   - t = -0.5 → point extrapolated before the curve start (not the start point)
   - t = 1.5 → point extrapolated beyond the curve end (not the end point)
6. Fix the clamping: remove or conditionalize the `Math.max(0, Math.min(1, t))` clamp.
   For a polyline/linear segment: extrapolate along the first/last segment direction.
   For a NURBS/bezier curve: extrapolate along the tangent at t=0 or t=1.
7. Verify in-range t still works correctly (t=0 → start, t=0.5 → midpoint, t=1 → end).
8. Run `npm run test` — all green. Run `npm run lint:all` — zero errors.
9. Run `npm run build` — passes.
10. Commit, merge to develop, push.

## Contract
```js
// geometry kernel function signature (before/after — do not change signature)
// src/geometry/curve-eval.js
pointAtParameter(curve, t)  // t is now unbounded; returns extrapolated point for |t|>1
```

The node output type must remain `Point` (or `{x,y,z}` object). The change is
purely in the clamping logic inside the kernel, not the port type.

## Merge checklist
- [ ] Claim row in `docs/agent-workboard.md` before starting.
- [ ] Extrapolation tests pass; in-range tests still pass.
- [ ] `npm run test` all green.
- [ ] Release workboard row on merge.
