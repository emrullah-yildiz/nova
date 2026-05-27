# Merge Readiness Checklist

Use this checklist before an AI agent or contributor merges a branch. The goal is to keep code, tests, and documentation moving together so the repository does not accumulate stale plans or unverified behavior.

## 1. Branch And Scope

- [ ] Confirm the branch starts from the intended base branch.
- [ ] Confirm the branch name matches the work being merged.
- [ ] Check `git status --short` and identify all changed, deleted, and untracked files.
- [ ] Make sure generated files, build artifacts, logs, and local machine files are not included.
- [ ] Make sure unrelated user changes are not reverted or mixed into the merge.

## 2. Documentation Freshness

- [ ] Update `README.md` when setup, project structure, scripts, or major product behavior changes.
- [ ] Update `docs/README.md` when adding, removing, or renaming documentation.
- [ ] Update architecture docs when service boundaries, security assumptions, integrations, or data models change.
- [ ] Remove historical roadmap docs once they are superseded by current docs.
- [ ] Search for broken references after deleting or renaming docs.

Suggested reference search:

```powershell
rg "old-doc-name|old-heading|old-path" README.md docs src .github package.json
```

## 3. Test Coverage

- [ ] Add or update unit tests for changed pure logic, data transformations, protocol helpers, and validation rules.
- [ ] Add or update browser workflow tests when user-visible behavior changes.
- [ ] Add or update integration tests when API, Connect, Revit, or backend boundaries change.
- [ ] If tests are not added, document why the change is docs-only, config-only, or otherwise low risk.
- [ ] Do not leave skipped tests unless the reason is explicit and temporary.

## 4. Security And Enterprise Checks

- [ ] Confirm no secrets, API keys, tokens, or local credentials are committed.
- [ ] Confirm user-provided or AI-provided content is treated as untrusted.
- [ ] Confirm backend/API changes enforce authorization and tenant scoping.
- [ ] Confirm Revit or Connect write paths require explicit approval and audit logging.
- [ ] Confirm new dependencies are necessary and pass audit.

## 5. Validation Commands

Run the smallest relevant checks first. For runtime or backend changes, run the full gate before merge.

Common Windows commands:

```powershell
npm.cmd run lint:all
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd audit --audit-level=moderate
```

Browser workflow tests require Chromium once per machine:

```powershell
npx.cmd playwright install chromium
```

Minimum expectations:

- Docs-only change: reference search plus a clear status summary.
- Test-only change: relevant test command.
- Frontend runtime change: lint, unit tests, browser workflow tests, build.
- Backend/API change: lint, unit tests, integration tests when present, build, audit.
- Dependency change: audit and lockfile review.

## 6. Final Diff Review

- [ ] Review `git diff --stat`.
- [ ] Review changed docs for outdated wording, old branch names, and dead links.
- [ ] Review changed tests to ensure they assert behavior, not only implementation details.
- [ ] Review deleted files and confirm each deletion is intentional.
- [ ] Confirm final status only includes expected files.

Helpful commands:

```powershell
git diff --stat
git status --short
rg "TODO|FIXME|skip\\(|\\.only\\(" src tests docs
```

## 7. PR Or Merge Summary

Before merge, summarize:

- What changed.
- Which docs were updated or intentionally left unchanged.
- Which tests were added or updated.
- Which validation commands were run.
- Any known gaps, follow-up issues, or unrun checks.

## Merge Blockers

Do not merge when any of these are true:

- Required validation commands fail.
- Documentation contradicts the implemented behavior.
- Tests are missing for a risky behavior change.
- Secrets or generated artifacts are present in the diff.
- A Revit/Connect write path lacks approval or audit planning.
- The branch contains unrelated changes that cannot be explained.
