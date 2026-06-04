# Task brief: Fix false-positive inspector input-type warnings (all nodes)

- **Branch:** `fix/inspector-type-warnings` off `develop` (worktree isolation)
- **Lane:** ui (ui-engineer)
- **Owned paths:** `src/ui/node-renderer.js`, `tests/inspector-type-warnings.test.js` (new)
- **Do NOT touch:** any `src/nodes/**`, `src/geometry/**`, `src/core/**`, any other test file.
- **Hot lock:** `src/ui/node-renderer.js` (held by this task).

## Bug (root-caused — do not re-investigate)
In `_collectInspectorWarnings` (src/ui/node-renderer.js, ~line 717), the helpers
`typeOfValue(value)` (~724) and `matches(expected, actual, value)` (~743) produce
false-positive warnings. Wiring `Plane.XY`/`Plane.XZ` into `Geometry.Orient`'s
`fromPlane`/`toPlane` ports shows "expects plane but received object" even though
compute is correct. `Plane` and `DataTree` fall through to `'object'`; a `Circle3`
infers `'curve'` but a `circle` port expects `'circle'`, so both warn falsely.

## Required fix
Replace the ad-hoc if-branches with a small **data-driven type/compat table** so
future kernel types are one-line additions.

### 1. Kernel `_type` → inferred port-type (used by `typeOfValue`)
```
Point3        -> point
Vector3       -> vector
Line3         -> line       (curve family)
Polyline3     -> curve      (curve family)
Arc3          -> curve      (curve family)
Circle3       -> circle     (curve family)
Ellipse3      -> curve      (curve family)
Curve3        -> curve      (curve family)
NurbsCurve    -> curve      (curve family)
Surface       -> surface    (mesh family)
NurbsSurface  -> surface    (mesh family)
Mesh3         -> mesh       (mesh family)
CompressedMesh-> mesh       (mesh family)
Plane         -> plane
DataTree      -> datatree
```
Keep existing non-`_type` cases: number, boolean, string, list, `GeometryRef`->geometry,
`ElementRef`->element, missing/null.

### 2. Port-type compatibility (used by `matches(expected, actual, value)`)
- `expected === 'any'` or actual missing/null -> true (keep).
- exact match -> true (keep).
- `number` expected, `string` actual that is a finite number -> true (keep).
- **Curve family** — ports `curve`, `line`, `circle`, `arc`, `ellipse` accept any
  inferred actual in {`line`, `curve`, `circle`, `arc`, `ellipse`}. Bidirectional:
  circle->curve, curve->circle, line->curve, etc. all true.
- **Mesh family** — ports `mesh`, `surface`, `solid` accept actual in
  {`mesh`, `surface`, `solid`, `geometry`}. Verify completeness.
- `plane` expected accepts `plane`.
- `datatree` expected accepts `datatree` (proactive for M2/T6).
- Everything else -> false (KEEP genuine mismatch detection: number->mesh,
  string->point, etc. MUST still warn).

### 3. Preserve the existing exceptions (lines ~777-780)
- auto-lace: list at scalar port when `isAutoLaceable(nd.def)` -> no warning.
- list-promotion: single value at a `list` port -> no warning.
Do not alter these.

## Implementation note
Extract `typeOfValue` and `matches` (and the compat table) into **pure, exported
helpers** so they're unit-testable without app state. Re-export from node-renderer
(e.g. named exports `inferValueType`, `portAcceptsType`, or attach to a small
exported object). `_collectInspectorWarnings` calls the extracted helpers.

## Required regression test — `tests/inspector-type-warnings.test.js`
Cover EVERY port value-type used in the library:
`number, list, mesh, vector, point, plane, curve, line, string, circle, boolean`.
Must assert ZERO false positives for legitimate pairings, especially:
- `Plane` value -> `plane` port (the reported bug)
- `Circle3` value -> `circle` port AND -> `curve` port
- `Line3` -> `line` and `Line3` -> `curve`
- `DataTree` value -> `datatree` port
- `Mesh3`/`CompressedMesh`/`Surface`/`NurbsSurface` -> `mesh`/`surface` ports
And must STILL flag genuine mismatches (at least):
- `number` -> `mesh` port (warns)
- `string` -> `point` port (warns)
Build kernel-shaped value stubs as `{ _type: 'Plane' }` etc. (the helper only reads
`_type`). Check `tests/wire-type-check.test.js`, `tests/type-validator.test.js`,
`tests/warning-after-run.test.js` for existing patterns/fixtures to reuse.

## Done = 
- `npm test` green (whole suite; the 1st-run vitest worker hiccup is spurious — re-run once if a worker error appears).
- New test exists and is meaningful.
- Workboard row already added (status active). Push the branch locally; do NOT push to remote.
