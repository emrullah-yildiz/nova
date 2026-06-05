# T04c — Pattern on Surface: Node Registry Updates

**Parent ticket:** [TICK-004](../tickets/TICK-004.md)
**Lane:** core (agent: neo)
**Branch:** `feat/pattern-on-surface-registry`
**Status:** queued
**Dependency:** Should merge after T04a (`feat/pattern-on-surface-geo`) merges, because the new `Panel.Points` and renamed `Pattern.PanelPlane` type strings are defined in `patterns.js` first. If `node-library.js` only imports the category file at runtime (no static type lists), T04c can run in parallel — verify first.

---

## Goal

Update the Nova node registry (`src/core/node-library.js`) to reflect three scope
changes made by the PM on 2026-06-05:

1. **Remove `Panel.ByPoints`** from the registered node list.
2. **Add `Panel.Points`** to the registered node list (replaces `Panel.ByPoints`).
3. **Register `Pattern.PanelPlane`** and deregister `Pattern.PanelFrames` — the node
   was renamed; the registry must reflect the new type string.

---

## Owned paths

```
src/core/node-library.js    (hot file — update registrations only)
```

**Do NOT touch:**
- `src/nodes/categories/patterns.js` — owned by T04a
- `src/geometry/**` — owned by T04a
- `src/viewer/**` — owned by T04b
- `src/ui/**`, `src/app/**`, `worker/**`, `api/**`
- Any test file outside of what is listed below

If unit tests for node-library registration exist, update them:
```
tests/node-library.test.js   (if it exists — update type lists)
```

---

## AC coverage

| AC | Type | What this task does |
|---|---|---|
| AC-5 | Unit | `Panel.Points` is registered; `Panel.ByPoints` is absent from registry |
| AC-7 | Unit | `Pattern.PanelPlane` is registered; `Pattern.PanelFrames` is absent from registry |

---

## Implementation checklist

1. Open `src/core/node-library.js`. Search for `'Panel.ByPoints'` — remove the
   registration entry entirely.
2. Add `'Panel.Points'` registration, pointing to the same category file
   (`patterns.js`) and the same subGroup (`'Panels'`).
3. Search for `'Pattern.PanelFrames'` — update the type string to `'Pattern.PanelPlane'`.
   If there is a display-name or label field separate from the type, update that too
   to "Panel Plane".
4. Run `npm run test` — confirm no test references `Panel.ByPoints` or
   `Pattern.PanelFrames` by the old type string (fix any that do).
5. Run `npm run lint:all` — 0 errors.

---

## Merge checklist

- [ ] `Panel.ByPoints` removed from node-library.js
- [ ] `Panel.Points` added to node-library.js
- [ ] `Pattern.PanelFrames` renamed to `Pattern.PanelPlane` in node-library.js
- [ ] No stale references to old type strings in node-library.js or its tests
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass
- [ ] TICK-004 AC-5 and AC-7 registry checkboxes noted in ticket
- [ ] Workboard row released on merge

---

## Notes

- `src/core/node-library.js` is a **hot file** — claim it exclusively. Do not
  let T04a or T04b touch it.
- If `node-library.js` auto-discovers nodes from `patterns.js` at runtime (no
  explicit type list), this task reduces to: verify the discovery works for the
  new type strings, and update any static allowlists or deny-lists. Report back
  to the tech lead if the file is auto-discovery only.
- Do not change anything in `patterns.js` — that is T04a's domain.
- Keep the change minimal: three registry entries. Do not refactor node-library.js.
