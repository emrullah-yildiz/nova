# T05a — Remove Pattern nodes: source files, geometry kernel, TICK-004 briefs

**Parent ticket:** [TICK-005](../tickets/TICK-005.md)
**Lane:** geometry (agent: mouse) + core (agent: neo) — single task, fully disjoint
**Branch:** `chore/remove-pattern-nodes`
**Status:** queued
**Dependency:** none — can start immediately once the T04a and T04c workboard rows are released (see Blocker note below)

---

## Blocker — coordinate before starting

The workboard currently shows:

- `feat/pattern-on-surface-geo` (T04a, agent: mouse) — **active** — owns `src/geometry/geo-facade-panels.js`, `src/geometry/geo-voronoi.js`, `src/nodes/categories/patterns.js`
- `feat/pattern-on-surface-registry` (T04c, agent: neo) — **queued** — hot-locks `src/core/node-library.js`

Both branches own files this task must delete. TICK-004 has been cancelled and superseded by TICK-005. Before starting T05a:

1. Confirm neither T04a nor T04c branch has been pushed/merged to `develop`.
2. If those branches are local-only and dead, the orchestrator (morpheus/dozer) should release their workboard rows and close those branches.
3. Only claim the T05a workboard row after T04a and T04c rows are cleared.

---

## Goal

Delete the entire Pattern category from Nova's source tree:

1. Delete `src/nodes/categories/patterns.js`.
2. Delete `src/geometry/geo-facade-panels.js` and `src/geometry/geo-voronoi.js`.
3. Remove every import/registration of the above from the node registry and any other importer in `src/`.
4. Delete the stale TICK-004 task brief files under `docs/task-briefs/`.
5. Verify zero `Pattern.*` references survive in `src/`, `tests/`, or `docs/`.

---

## Owned paths

```
src/nodes/categories/patterns.js           (DELETE)
src/geometry/geo-facade-panels.js          (DELETE)
src/geometry/geo-voronoi.js                (DELETE)
src/core/node-library.js                   (MODIFY — remove patterns import + registrations)
docs/task-briefs/T04a-pattern-geometry.md  (DELETE)
docs/task-briefs/T04b-pattern-viewer.md    (DELETE)
docs/task-briefs/T04c-pattern-registry.md  (DELETE)
```

Secondary: any other file in `src/` found by grep to import `patterns.js`, `geo-facade-panels.js`, or `geo-voronoi.js` (expected: none beyond node-library.js, but must verify).

**Do NOT touch:**
- `tests/` — owned by T05b
- `src/viewer/**` — not involved in this cleanup
- `src/ui/**` — not involved
- `src/app/app.js` — hot file; only touch if grep proves it imports a Pattern file, and only to remove that one import line
- Any `src/nodes/categories/*.js` file other than `patterns.js`
- `docs/tickets/**` — ticket files are updated by morpheus, not by this task

---

## Step-by-step

### 1. Pre-flight grep

Before deleting anything, run the following and record the output:

```bash
grep -r "patterns" src/ --include="*.js" -l
grep -r "geo-facade-panels" src/ --include="*.js" -l
grep -r "geo-voronoi" src/ --include="*.js" -l
grep -r "Pattern\." src/ --include="*.js" -l
```

This identifies every importer beyond `node-library.js`.

### 2. Delete geometry kernel files

```bash
git rm src/geometry/geo-facade-panels.js
git rm src/geometry/geo-voronoi.js
```

### 3. Delete node category file

```bash
git rm src/nodes/categories/patterns.js
```

### 4. Remove all imports from node-library.js

Open `src/core/node-library.js`. Find and remove:
- The `import ... from '.../categories/patterns.js'` line (or `require`).
- Any `registerNodes(patternNodes)` call or equivalent registration block that references patterns.
- Any `Pattern.*` type strings in an explicit allow-list or export map.

If any other file in `src/` was found by the step-1 grep, remove the import line from that file too.

### 5. Delete TICK-004 task brief files

```bash
git rm docs/task-briefs/T04a-pattern-geometry.md
git rm docs/task-briefs/T04b-pattern-viewer.md
git rm docs/task-briefs/T04c-pattern-registry.md
```

### 6. Post-deletion grep (must return zero results)

```bash
grep -r "Pattern\." src/ tests/ docs/
grep -r "patterns\.js" src/
grep -r "geo-facade-panels" src/ tests/
grep -r "geo-voronoi" src/ tests/
```

If any result appears, fix it before proceeding.

### 7. Run the full gate

```bash
npm run lint:all
npm run test
npm run build
```

All must pass with 0 errors / 0 failures.

---

## AC coverage (this task)

| AC | What this task does |
|---|---|
| AC-2 | Deletes `src/nodes/categories/patterns.js` |
| AC-3 | Removes all Pattern imports from `src/core/node-library.js`; `npm run test` passes |
| AC-4 | Deletes `src/geometry/geo-facade-panels.js` and `src/geometry/geo-voronoi.js` |
| AC-7 | Post-deletion grep returns zero results across src/ tests/ docs/ |
| AC-8 | `npm run lint:all && npm run test && npm run build` all pass |

AC-1 (no Patterns category in browser) is a downstream consequence of AC-2 + AC-3 and is verified manually.
AC-5 and AC-6 (test file deletions) are covered by T05b.

---

## Testing gate

- Unit test: `npm run test` must pass after deletions (AC-3, AC-8).
- Build: `npm run build` must produce a bundle with no Pattern code (AC-8).
- Manual browser: open `http://localhost:5173`, open node library panel, confirm no Patterns category (AC-1).
- No E2E spec needed from this task (AC-6 E2E spec deletion is handled by T05b).

---

## Merge checklist

- [ ] AC-2 verified: `git ls-files src/nodes/categories/patterns.js` returns nothing
- [ ] AC-3 verified: `npm run test` passes; no Pattern import in node-library.js
- [ ] AC-4 verified: `git ls-files src/geometry/geo-facade-panels.js src/geometry/geo-voronoi.js` returns nothing
- [ ] AC-7 verified: `grep -r "Pattern\." src/ tests/ docs/` returns zero results
- [ ] AC-8 verified: `npm run lint:all && npm run test && npm run build` all pass
- [ ] T04a, T04b, T04c brief files deleted
- [ ] Workboard row released on merge

---

## Notes

- `src/core/node-library.js` is a hot file. Claim the hot lock in the workboard row for this task.
- T05b runs in parallel on the test-file deletions. T05b does not touch any file in `src/` — paths are fully disjoint.
- If any node's `help.example` sample graph in other category files (e.g., `src/nodes/categories/*.js`) references a Pattern node type, update that sample to remove the Pattern node reference. These are expected to be rare; the step-1 grep will surface them.
