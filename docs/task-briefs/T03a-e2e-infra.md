# T03a — E2E Infrastructure: playwright.config.js + CI job + pre-push hook + README

**Parent ticket:** [TICK-003](../tickets/TICK-003.md)
**Lane:** platform (agent: link)
**Branch:** `chore/e2e-infra`
**Status:** queued
**Dependency:** none — independent, can start immediately

---

## Goal

Put the E2E infrastructure in place so that `npm run test:e2e` is a documented,
CI-enforced command. Concretely:

1. Ensure `playwright.config.js` exists at repo root with `timeout: 30000` and
   points at `tests/e2e/`.
2. Add (or update) a `e2e` CI job in `.github/workflows/ci.yml` that installs
   Playwright browsers and runs `npm run test:e2e` on every PR touching `src/`
   or `tests/`.
3. Add (or update) a Husky `pre-push` hook that warns — does NOT hard-block —
   when a staged diff touches `src/ui/**` or `src/viewer/**` but no corresponding
   file changed in `tests/e2e/`. The warning must name the src file(s) missing a
   spec counterpart.
4. Document `npm run test:e2e` in root `README.md` under a "Testing" section.

---

## Owned paths

```
playwright.config.js                        (create or update at repo root)
.github/workflows/ci.yml                    (add e2e job — hot file)
.husky/pre-push                             (update hook script)
README.md                                   (add Testing section — hot file)
package.json                                (add/confirm test:e2e script — hot file)
```

**Do NOT touch:**
- Any file under `src/`, `tests/e2e/`, `worker/`, `api/`, `server/`
- `docs/` files other than as instructed by the task brief
- `wrangler.toml`

---

## Hot-file locks required

This task needs locks on: `.github/workflows/ci.yml`, `README.md`, `package.json`.
Check `docs/agent-workboard.md` before starting — claim all three simultaneously in
a single row. If any are locked by another active task, wait or coordinate.

---

## Interface / contract

The `npm run test:e2e` script in `package.json` must invoke:
```
playwright test --config=playwright.config.js
```
or equivalent. The CI job must set `working-directory` to repo root and run:
```
npx playwright install --with-deps chromium
npm run test:e2e
```

The pre-push hook reads `git diff --name-only HEAD @{upstream}` (or equivalent) and
emits a warning line for each `src/ui/*.js` / `src/viewer/*.js` file that has no
corresponding changed file in `tests/e2e/`. It must exit 0 (warn-only).

---

## AC coverage

| AC | Type | What this task does |
|---|---|---|
| AC-1 | E2E infra | `playwright.config.js` with `timeout: 30000`; `npm run test:e2e` runs specs |
| AC-2 | CI | `.github/workflows/ci.yml` e2e job on PR filter `src/**`, `tests/**` |
| AC-3 | Hook | Husky pre-push warns (exit 0) when ui/viewer src file has no spec counterpart |
| AC-5 | Config | `playwright.config.js` committed; `npx playwright install` documented in CI |

AC-4 (spec audit pass) is covered by T03b, not this task.

---

## Testing gate

- Manual verification: confirm `playwright.config.js` contains `timeout: 30000`.
- CI: `.github/workflows/ci.yml` diff review — job name, trigger path filter, install + run steps.
- Hook: stage a `src/ui/` file change (no spec) and attempt `git push` — confirm warning, no hard block.

---

## Merge checklist

- [ ] AC-1 verified: `playwright.config.js` exists at repo root with `timeout: 30000`; `npm run test:e2e` runs (even if zero specs — just must not error)
- [ ] AC-2 verified: `.github/workflows/ci.yml` has an e2e job that triggers on PR diffs in `src/` or `tests/`; includes `npx playwright install` step
- [ ] AC-3 verified: pre-push hook warns (exit 0) with file name when `src/ui/` or `src/viewer/` file has no `tests/e2e/` counterpart in the diff
- [ ] AC-5 verified: `playwright.config.js` committed; CI job includes `npx playwright install` step
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all pass
- [ ] `README.md` Testing section documents `npm run test:e2e` and `npx playwright install chromium`
- [ ] TICK-003 AC-1/2/3/5 checkboxes updated in ticket file
- [ ] Workboard row released on merge

---

## Notes

- If `playwright.config.js` already exists, read it first — do not duplicate or
  overwrite correct settings; only add missing `timeout` and path config.
- The Husky hook is warn-only. It must exit 0. A hard-block would break non-UI PRs.
- The CI job filter (`paths:`) should use `['src/**', 'tests/**']` so it only runs
  when code or tests change, not on docs-only PRs.
- T03b (spec audit pass, AC-4) depends on this task AND on TICK-002 merging. Do not
  start T03b until both this branch and TICK-002's branch are merged to `develop`.
