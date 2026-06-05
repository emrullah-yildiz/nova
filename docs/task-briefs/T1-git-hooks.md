# T1 — Git Hooks (chore/git-hooks)

**Lane:** platform-engineer  
**Branch:** `chore/git-hooks`  
**Started from:** `develop` (clean)

## Goal
Install Husky + lint-staged. Wire two Git hooks:
- `pre-commit`: run ESLint on staged `src/**/*.js` and `tests/**/*.js` (lint-staged).
- `pre-push`: run `vitest run` (full unit suite).

Also add a `prepare` script to `package.json` so Husky installs on `npm install`.

After wiring, **run the hooks** to discover any existing ESLint errors or failing tests, then **fix every error found** in the same branch.

## Owned paths (do not touch anything outside these)
- `package.json`
- `.husky/` (new directory)
- `.lintstagedrc.json` or inline lint-staged config in `package.json`
- `tests/**/*.js` — only to fix lint/test errors the hook run exposes
- `src/**/*.js` — only to fix lint/test errors the hook run exposes

## Do NOT touch
- `src/ui/node-renderer.js` (hot — owned by T4)
- `src/core/node-library.js` (hot — owned by T4)
- Any file outside the owned paths above

## Steps
1. `git switch develop && git pull --ff-only origin develop`
2. `git switch -c chore/git-hooks`
3. `npm install --save-dev husky lint-staged` (use `npm.cmd` on Windows)
4. `npx husky init` (creates `.husky/` skeleton)
5. Write `.husky/pre-commit`:
   ```sh
   npx lint-staged
   ```
6. Write `.husky/pre-push`:
   ```sh
   npm run test
   ```
7. Add lint-staged config (in `package.json` or `.lintstagedrc.json`):
   ```json
   { "src/**/*.js": ["eslint --fix"], "tests/**/*.js": ["eslint --fix"] }
   ```
8. Add `"prepare": "husky"` to `package.json` scripts.
9. Stage ALL `src/` and `tests/` JS files, run `npx lint-staged` manually to surface every ESLint error. Fix them all.
10. Run `npm run test` (vitest run). Fix every failing test.
11. Run `npm run build`. Confirm it passes.
12. Commit, merge to develop, push.

## Validation
- `npm run lint:all` — zero errors.
- `npm run test` — all pass.
- `npm run build` — succeeds.
- `git commit` on a dirty staged file actually runs the pre-commit hook (test it).

## Merge checklist
- [ ] Add row to `docs/agent-workboard.md` with status `active` before starting.
- [ ] Release the row (delete it) on merge.
- [ ] No secrets, generated artifacts, or unrelated changes.
