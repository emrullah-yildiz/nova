# Merge Readiness Checklist

Use this checklist before an AI agent or contributor merges a branch. The goal is to keep code, tests, and documentation moving together.

## Branch And Scope

- [ ] Confirm the branch starts from the intended base branch.
- [ ] Check `git status --short` and identify all changed, deleted, and untracked files.
- [ ] Make sure generated files, build artifacts, logs, and local machine files are not included.
- [ ] Make sure unrelated user changes are not reverted or mixed into the merge.

## Documentation Freshness

- [ ] Update `README.md` when setup, project structure, scripts, or major product behavior changes.
- [ ] Update relevant docs when API routes, service boundaries, security assumptions, integrations, or data models change.
- [ ] Remove or update stale roadmap docs when they contradict current behavior.
- [ ] Search for broken references after deleting or renaming docs.

Suggested reference search:

```powershell
rg "old-doc-name|old-heading|old-path" README.md docs src .github package.json
```

## Test Coverage

- [ ] Add or update unit tests for changed pure logic, data transformations, protocol helpers, and validation rules.
- [ ] Add or update browser workflow tests when user-visible behavior changes.
- [ ] Add or update integration tests when API, Connect, Revit, or backend boundaries change.
- [ ] If tests are not added, document why the change is docs-only, config-only, or otherwise low risk.
- [ ] Do not leave skipped tests unless the reason is explicit and temporary.

## Security And Enterprise Checks

- [ ] Confirm no secrets, API keys, tokens, or local credentials are committed.
- [ ] Confirm user-provided or AI-provided content is treated as untrusted.
- [ ] Confirm backend/API changes enforce authorization and tenant scoping.
- [ ] Confirm Revit or Connect write paths require explicit approval and audit logging.
- [ ] Confirm new dependencies are necessary and pass audit.

## Validation Commands

Run the smallest relevant checks first. For runtime or backend changes, run the full gate before merge.

```powershell
npm.cmd run lint:all
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd audit --audit-level=moderate
```

Minimum expectations:

- Docs-only change: reference search plus a clear status summary.
- Test-only change: relevant test command.
- Frontend runtime change: lint, unit tests, browser workflow tests, build.
- Backend/API change: lint, unit tests, integration tests when present, build, audit.
- Dependency change: audit and lockfile review.

## Final Diff Review

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

## Merge Blockers

Do not merge when any of these are true:

- Required validation commands fail.
- Documentation contradicts the implemented behavior.
- Tests are missing for a risky behavior change.
- Secrets or generated artifacts are present in the diff.
- A Revit/Connect write path lacks approval or audit planning.
- The branch contains unrelated changes that cannot be explained.
