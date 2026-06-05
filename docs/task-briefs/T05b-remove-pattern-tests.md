# T05b — Remove Pattern nodes: test files

**Parent ticket:** [TICK-005](../tickets/TICK-005.md)
**Lane:** core (agent: neo)
**Branch:** `chore/remove-pattern-nodes`
**Status:** queued
**Dependency:** none — runs in parallel with T05a on the same branch (paths are fully disjoint). Coordinate branch ownership with T05a agent (both work on `chore/remove-pattern-nodes`; T05b owns only test paths, T05a owns only src/ and docs/task-briefs/).

> Note: Because T05a and T05b share a branch, they may be executed sequentially by a single agent or by two agents coordinating commits. Either is acceptable — the path sets are disjoint so there are no merge conflicts.

---

## Goal

Delete all Pattern-related test files (unit and E2E), then confirm `npm run test` and `npm run test:e2e` pass with zero failures.

---

## Owned paths

Check each file exists before attempting `git rm`. Files that do not exist are silently skipped.

```
tests/voronoi-bounds.test.js
tests/facade-panels-on-surface.test.js
tests/panel-frames-node.test.js
tests/geometry/geo-facade-panels.test.js
tests/e2e/pattern-on-surface.spec.js
```

**Do NOT touch:**
- `src/**` — owned by T05a
- `docs/task-briefs/T04*.md` — owned by T05a
- Any test file not in the list above
- `playwright.config.js`, `package.json`, `vite.config.js`

---

## Step-by-step

### 1. Confirm which files exist

```bash
git ls-files tests/voronoi-bounds.test.js tests/facade-panels-on-surface.test.js tests/panel-frames-node.test.js tests/geometry/geo-facade-panels.test.js tests/e2e/pattern-on-surface.spec.js
```

Record which files are tracked. Delete only those that appear in the output.

### 2. Delete unit test files (whichever exist)

```bash
git rm tests/voronoi-bounds.test.js
git rm tests/facade-panels-on-surface.test.js
git rm tests/panel-frames-node.test.js
git rm tests/geometry/geo-facade-panels.test.js
```

Skip any file not returned in step 1.

### 3. Delete E2E spec

```bash
git rm tests/e2e/pattern-on-surface.spec.js
```

Skip if not returned in step 1.

### 4. Run the full gate

```bash
npm run test
npm run test:e2e
npm run lint:all
```

All must pass with 0 errors / 0 failures. If any test outside the deleted files is newly failing (e.g., a test that imported from a deleted Pattern source file), that import must be removed from that test file. Report if this occurs — it means an additional file was missed in the step-1 grep of T05a.

---

## AC coverage (this task)

| AC | What this task does |
|---|---|
| AC-5 | Deletes the four unit test files; `npm run test` passes |
| AC-6 | Deletes `tests/e2e/pattern-on-surface.spec.js`; `npm run test:e2e` passes |
| AC-8 | `npm run lint:all` passes (no dangling import in remaining test files) |

---

## Testing gate

- Unit test: `npm run test` must pass after deletions (AC-5).
- E2E: `npm run test:e2e` must pass after E2E spec deletion (AC-6).
- No new tests need to be written — this task only deletes.

---

## Merge checklist

- [ ] AC-5 verified: `git ls-files tests/voronoi-bounds.test.js tests/facade-panels-on-surface.test.js tests/panel-frames-node.test.js tests/geometry/geo-facade-panels.test.js` all return nothing; `npm run test` passes
- [ ] AC-6 verified: `git ls-files tests/e2e/pattern-on-surface.spec.js` returns nothing; `npm run test:e2e` passes
- [ ] AC-8 verified: `npm run lint:all` passes
- [ ] Workboard row released on merge (shared with T05a)

---

## Notes

- This task writes no new code — it is deletions only.
- If `npm run test:e2e` was passing before this deletion by virtue of the spec being skipped or already absent, confirm that explicitly in the merge checklist note.
- Coordinate with T05a agent on commit order if both work on the same branch in sequence. T05b commits can come before or after T05a commits — no ordering dependency.
