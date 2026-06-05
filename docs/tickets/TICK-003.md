---
id: TICK-003
title: Testing infrastructure — Playwright E2E coverage gate for all UI features
status: ready
priority: high
type: chore
sprint: 2026-06-05
created: 2026-06-05
lanes: platform
branch: chore/e2e-testing-gate
---

## User story

As an engineer, I can run `npm run test:e2e` and know that every merged UI feature is covered by at least one Playwright spec — so regressions in any UI feature are caught before they reach production.

## Context

The Stop hook in ENGINEERING.md requires a Playwright E2E spec for every UI/viewer change before merge, but there is no automated enforcement that actually blocks a merge when the spec is missing. Recent features (selection mode, learning-page examples) were merged with partial or no E2E coverage. This ticket establishes the infrastructure so the rule is enforced automatically and every current gap is documented.

## Acceptance criteria

- [ ] AC-1  Running `npm run test:e2e` locally against the dev server succeeds (all existing specs in `tests/e2e/` pass green). The command is documented in the repo's root README under a "Testing" section.
- [ ] AC-2  A CI job (`.github/workflows/ci.yml`) runs `npm run test:e2e` on every pull request that touches `src/` or `tests/`. The job fails the PR when any spec fails.
- [ ] AC-3  A pre-push git hook (Husky / lint-staged) warns (does not hard-block) when a staged diff in `src/ui/**` or `src/viewer/**` has no corresponding changed file in `tests/e2e/`. The warning message names which src file has no spec counterpart.
- [ ] AC-4  Each of the following currently-merged UI features has at least one passing Playwright spec that exercises its primary user action:
    - The Nova workspace canvas loads and the node library is visible (`nova-workflows.spec.js` — already exists; confirm it passes).
    - Learning page opens and a chapter can be selected (`nova-learning.spec.js` — already exists; confirm it passes).
    - CodeBlock node can be added and evaluated (`codeblock-node.spec.js` — already exists; confirm it passes).
    - Run-mode toggle switches between Automatic and Manual (`run-modes.spec.js` — already exists; confirm it passes).
    - Select.Faces pick-and-approve flow (`geometry-selection.spec.js` — created by TICK-002).
- [ ] AC-5  The `playwright.config.js` (or equivalent) sets a reasonable timeout (30 s per test) and is checked in. Running `npx playwright install` installs the required browsers; this step is included in the CI job.

## Testing gate

- E2E (Playwright): AC-1, AC-4 (these are the self-validating specs)
- Unit test: none required
- Manual browser: none required for this ticket (it is pure infrastructure)

## How to test

### Local dev verification

1. `git switch develop && git pull --ff-only && git switch chore/e2e-testing-gate`
2. `npm install`
3. **AC-5:** Confirm `playwright.config.js` exists at repo root with `timeout: 30000`.
4. `npx playwright install chromium` — should complete without error.
5. `npm run dev` in one terminal. In a second terminal:
6. **AC-1:** `npm run test:e2e` — all specs in `tests/e2e/` must pass. Record pass/fail counts.
7. **AC-4:** Confirm each named spec file exists and is included in the run output:
   - `nova-workflows.spec.js` ✓/✗
   - `nova-learning.spec.js` ✓/✗
   - `codeblock-node.spec.js` ✓/✗
   - `run-modes.spec.js` ✓/✗
   - `geometry-selection.spec.js` ✓/✗ *(requires TICK-002 merged first)*
8. **AC-2:** Open `.github/workflows/ci.yml`. Confirm an `e2e` or `playwright` job exists that runs on PRs touching `src/` or `tests/`. Verify the job has a `npx playwright install` step.
9. **AC-3:** Stage a change to `src/ui/some-file.js` (do not stage any `tests/e2e/` file). Attempt `git push` — confirm a warning appears naming the src file with no spec, but the push is not hard-blocked.

### Automated tests

```bash
npm run lint:all
npm run test
npm run test:e2e          # all specs must pass (self-validates AC-1 and AC-4)
```

### How to mark an AC done

Change `- [ ] AC-N` → `- [x] AC-N` with a note:
- Automated: `— npm run test:e2e PASSED YYYY-MM-DD`
- Manual: `— manual verification YYYY-MM-DD: [what you observed]`

## Definition of done

- [ ] All AC above are checked `[x]`
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] E2E spec covers AC marked above
- [ ] Oracle has reviewed and issued APPROVE verdict
- [ ] Merged to `develop`, workboard row released, INDEX.md updated

## Task briefs

Links added by morpheus after PM confirms AC.

- [T03a](../task-briefs/T03a-e2e-infra.md) — lane: platform (link) — playwright.config.js + CI e2e job + pre-push hook + README Testing section (AC-1, AC-2, AC-3, AC-5). No dependency; start immediately.
- [T03b](../task-briefs/T03b-e2e-spec-audit.md) — lane: platform (link) — Audit pass: confirm all 5 E2E specs pass and record results (AC-4). BLOCKED until TICK-002 + T03a both merged.

## Notes

- TICK-002 (geometry-selection spec) is a dependency of AC-4. TICK-003 should not be marked done until TICK-002's spec is merged.
- AC-3 (pre-push hook warning) is a warn-only gate — it must not hard-block pushes for non-UI changes or for the first commit in a branch before the spec is written.
- If `playwright.config.js` already exists, confirm it is correct rather than creating a second config.
