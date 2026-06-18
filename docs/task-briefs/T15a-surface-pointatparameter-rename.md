# T15a — Rename Surface.PointAtUV → Surface.PointAtParameter (+ backward compat)

**Parent ticket:** [TICK-015](../tickets/TICK-015.md) — Surface.PointAtParameter (rename).
**Lane / owner:** geometry — **mouse**.
**Branch:** `feat/tick-015-surface-pointatparameter` (off `develop`, one branch per ticket).
**Covers AC:** AC-1, AC-2, AC-3, AC-4 (and AC-6 lint/test/build for your slice).

## Goal

Rename the existing `Surface.PointAtUV` node to `Surface.PointAtParameter` as the **single
canonical node**, with full backward compatibility for graphs saved against the old type. Do NOT
create a parallel/duplicate node — this is a rename of the one existing node.

## Context — the proven pattern in this repo

There is already a battle-tested rename pattern: `Custom.Formula` → `Custom.CodeBlock`
(`src/nodes/categories/custom.js`). Follow it exactly. The generic load-time migration hook
already exists in `src/app/save-load.js` (it calls `isDeprecatedType` + `migrateNodeType` from
`src/core/node-versions.js`) — **you do not need to touch save-load.js or node-versions.js**; the
mechanism is generic and will pick up your `metadata.migrateTo` automatically.

The current node is at `src/nodes/categories/surfaces.js` (~line 1047):
- `type: 'Surface.PointAtUV'`, `name: 'Surface.PointAtUV'`, icon `•`,
  `aliases: ['surface-pointatuv', 'surface-pointat']`,
  inputs `surface` + `u` + `v` → output `point`, backed by `pointAtUV(...)` from
  `src/geometry/surface-eval.js`. Just touched by commit `accb60e` (polar UV spread) — keep that
  kernel behavior, only the def name/type changes.

## What to do (in `src/nodes/categories/surfaces.js`)

1. **Rename the canonical def** to `type: 'Surface.PointAtParameter'`, `name:
   'Surface.PointAtParameter'`. Keep inputs (`surface`, `u`, `v`), output (`point`), controls,
   `execute` (still `pointAtUV(...)`), icon (a Unicode symbol — keep `•` or similar; never a text
   abbreviation), subGroup `Evaluate`, and codegen unchanged.
2. **Preserve search + old node-ids via aliases.** On the renamed def, set
   `aliases: ['surface-pointatuv', 'surface-pointat', 'Surface.PointAtUV', 'surface-pointatparameter']`
   so searching "PointAtUV" still finds it and the old persisted alias-ids resolve.
3. **Add a deprecated migration stub** for the old type so saved graphs migrate, exactly like
   `Custom.Formula`:
   ```js
   {
     type: 'Surface.PointAtUV',
     name: 'Surface.PointAtUV',
     category: 'surfaces',
     subGroup: 'Evaluate',
     icon: '•',
     description: 'Deprecated — renamed to Surface.PointAtParameter. Retained so existing graphs keep working.',
     inputs: [ /* same surface/u/v */ ],
     outputs: [ /* same point */ ],
     controls: [ /* same u/v */ ],
     metadata: {
       deprecated: true,
       migrateTo: { type: 'Surface.PointAtParameter', portMap: { surface: 'surface', u: 'u', v: 'v', point: 'point' } }
     },
     execute(context, inputs) { /* same pointAtUV fallback so an un-migrated instance still computes */ }
   }
   ```
   Note: the stub's `aliases` must NOT collide with the canonical def's aliases (the registry throws
   on a duplicate alias). Do not give the stub `surface-pointatuv`/`surface-pointat` aliases — those
   now live on the canonical def. The stub resolves by its own `type` string for migration only.
4. **help.example must be a full producer → focal → consumer workflow** on the renamed node:
   `Surface.ByPatch` (or keep Dini) → `Surface.PointAtParameter` → `Output.Watch`, wired so Watch
   shows a real readable Point3 (not `[object Object]`/`NaN`). Prefer `Surface.ByPatch` per the PM
   request; if ByPatch is awkward as an example producer, Dini is acceptable — but verify it runs.

## Tests to add/adjust

- Update any existing references to `Surface.PointAtUV` as a *library node* in unit tests to the new
  type (search `tests/` — `tests/library-reorg.test.js`, `tests/geometry/surface-eval.test.js`
  reference the kernel `pointAtUV` which is unchanged; only library-type references change).
- **AC-3 migration test (required):** a Vitest that takes a saved-graph instance of
  `{ type: 'Surface.PointAtUV', controlValues: { u, v } }`, runs it through the load-time
  migration path (`isDeprecatedType` + `migrateNodeType`, or load a fixture through save-load), and
  asserts it becomes `Surface.PointAtParameter` with u/v preserved and ports remapped.
- **AC-4 (required):** assert the node's `execute` returns a real `Geo.Point3` with finite x/y/z
  (not `[object Object]`/`NaN`) for a known surface.
- **AC-1/AC-2:** registry assertion that exactly one selectable node exists and that "PointAtUV"
  resolves to `Surface.PointAtParameter` via alias.

## Owned paths

- `src/nodes/categories/surfaces.js`
- `tests/geometry/surface-pointatparameter.test.js` (new) and/or edits to
  `tests/library-reorg.test.js`, `tests/geometry/surface-eval.test.js` (library-type references only)

## Do NOT touch

- `src/geometry/surface-eval.js` kernel (`pointAtUV` stays as-is — accb60e behavior is correct).
- `src/core/node-versions.js`, `src/app/save-load.js`, `src/nodes/registry.js` (generic mechanism,
  no change needed — if you think you need to, STOP and report instead).
- `tests/e2e/**` (that is T15b/switch).
- `src/nodes/categories/input.js`, `src/geometry/nodes/**` (those are TICK-014/mouse-T14a).
- Any viewer/UI file.

## Interface contract (with T15b)

- Canonical node `type` is exactly **`Surface.PointAtParameter`**.
- Inputs: `surface` (mesh), `u` (number), `v` (number). Output: `point` (point → a `Geo.Point3`).
- The output `point` must be a real `Geo.Point3` that the viewport's `Geo.addToScene` renders as a
  visible point. T15b's E2E depends on this exact type id and output port id.

## Merge checklist

- [ ] AC-1 verified: exactly one selectable surface point-at-parameter node, named `Surface.PointAtParameter`.
- [ ] AC-2 verified: search "PointAtUV" and "PointAtParameter" both resolve to the one node (alias test).
- [ ] AC-3 verified: a saved `Surface.PointAtUV` instance migrates to `Surface.PointAtParameter` (unit test).
- [ ] AC-4 verified: output is a real `Geo.Point3` (finite x/y/z); help.example ByPatch/Dini → node → Watch runs.
- [ ] `npm run lint:all` → 0 errors; `npm run test` → all pass; `npm run build` → green.
- [ ] Return the structured JSON from RULES.md §10.

## Conflict warning

`src/nodes/categories/surfaces.js` is also edited on `feat/tick-014-surface-paneling` (TICK-014,
awaiting dozer merge). You are on a SEPARATE branch — edit freely; dozer reconciles the two at merge
time. Note your changes clearly in your JSON so dozer knows what to expect.
