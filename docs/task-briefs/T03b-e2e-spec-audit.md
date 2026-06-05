# T03b — E2E Spec Audit: Confirm All Five Specs Pass

**Parent ticket:** [TICK-003](../tickets/TICK-003.md)
**Lane:** platform (agent: link)
**Branch:** `chore/e2e-spec-audit`
**Status:** queued
**Dependency:** BLOCKED until both TICK-002 (`fix/selection-mode-e2e`) AND T03a (`chore/e2e-infra`) are merged to `develop`

---

## Goal

Run `npm run test:e2e` against the dev server and confirm all five named specs pass.
Document the pass/fail result in TICK-003 for each spec. If a spec fails, diagnose
and fix within this branch (minimal fix — do not refactor the spec or the feature).
Close AC-4 once all five are green.

---

## Owned paths

```
tests/e2e/nova-workflows.spec.js         (confirm passes; fix only if failing)
tests/e2e/nova-learning.spec.js          (confirm passes; fix only if failing)
tests/e2e/codeblock-node.spec.js         (confirm passes; fix only if failing)
tests/e2e/run-modes.spec.js              (confirm passes; fix only if failing)
tests/e2e/geometry-selection.spec.js     (created by TICK-002; confirm passes)
```

**Do NOT touch:**
- `playwright.config.js` (owned by T03a)
- `.github/workflows/ci.yml` (owned by T03a)
- `.husky/pre-push` (owned by T03a)
- `README.md` (owned by T03a)
- `package.json`
- Any `src/` file — this task is audit-and-fix of the specs only, not feature code

---

## Interface / contract

- Pulls from `develop` after TICK-002 and T03a are both merged.
- `geometry-selection.spec.js` must exist (created by T02a).
- `playwright.config.js` must exist (created by T03a) with `timeout: 30000`.

---

## AC coverage

| AC | Type | What this task does |
|---|---|---|
| AC-4 | E2E | Runs all five specs; each must be green. Records result per-spec in TICK-003. |

---

## Testing gate

Run sequentially in this order:

```powershell
# 1. Pull latest develop (must include TICK-002 + T03a merges)
git switch develop
git pull --ff-only origin develop
git switch -c chore/e2e-spec-audit

# 2. Install deps + browsers
npm install
npx playwright install chromium

# 3. Start dev server in background, then run specs
npm run dev &
npm run test:e2e
```

Record output for each spec file. All five must show `passed`.

---

## Merge checklist

- [ ] AC-4 verified: `nova-workflows.spec.js` passes — record: `PASSED YYYY-MM-DD`
- [ ] AC-4 verified: `nova-learning.spec.js` passes — record: `PASSED YYYY-MM-DD`
- [ ] AC-4 verified: `codeblock-node.spec.js` passes — record: `PASSED YYYY-MM-DD`
- [ ] AC-4 verified: `run-modes.spec.js` passes — record: `PASSED YYYY-MM-DD`
- [ ] AC-4 verified: `geometry-selection.spec.js` passes — record: `PASSED YYYY-MM-DD`
- [ ] TICK-003 AC-4 checkbox updated in ticket file with pass date and test output summary
- [ ] `npm run lint:all` — 0 errors (only if any spec files were modified)
- [ ] Workboard row released on merge

---

## Notes

- This task's only job is to run the specs and record results — or fix a spec
  that's failing due to a selector mismatch, timing issue, or missing setup.
- Do NOT fix underlying feature bugs here; open a new ticket for those.
- If `geometry-selection.spec.js` does not exist (TICK-002 not yet merged), stop
  and wait. Do not start T03b until the dependency is confirmed on `develop`.
- Record the `npm run test:e2e` output verbatim in the TICK-003 AC-4 checkbox note.
