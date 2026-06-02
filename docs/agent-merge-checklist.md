# AI Agent Task Checklist

Use this checklist as the start and end point for every AI-agent task. It is
both an instruction sheet for the agent and a technical GitHub checklist for the
branch.

The expected flow is:

1. Start from `develop`.
2. Read the token guide.
3. Create one branch for one task.
4. Make the smallest useful change.
5. Validate and update docs.
6. Merge the task branch into `develop`.
7. Delete the task branch.
8. Push `develop`.

## Start

- [ ] Read `docs/ai-agent-token-guide.md` before opening broad files or coding.
- [ ] Read `docs/README.md` to find the few docs relevant to the task.
- [ ] Read `docs/architecture-decisions.md` before changing architecture, deployment, auth, storage, AI proxying, collaboration, or Connect/Revit behavior.
- [ ] Confirm the worktree is clean or identify unrelated user changes:

```powershell
git status --short --branch
```

- [ ] Switch to the integration branch and update it:

```powershell
git switch develop
git pull --ff-only origin develop
```

- [ ] Create a task branch from `develop`:

```powershell
git switch -c type/short-task-name
```

- [ ] Branch name matches the task.
- [ ] One branch contains one task only.

## Work

- [ ] Use targeted `rg` searches before reading large files.
- [ ] Inspect only files directly involved in the task.
- [ ] Keep the diff small and avoid unrelated refactors.
- [ ] Do not revert unrelated user work.
- [ ] Do not commit generated files, logs, local exports, screenshots, build artifacts, secrets, or private URLs.
- [ ] If requirements are unclear, make a conservative assumption and record it in the handoff or decision log.

## Branch Review

- [ ] Branch started from `develop`.
- [ ] `git status --short --branch` shows only expected changes.
- [ ] No unrelated user work was reverted or mixed in.
- [ ] `git diff --stat` has an expected scope.
- [ ] Deleted files are intentional.

## Documentation

- [ ] `docs/README.md` reflects any added, removed, or renamed docs.
- [ ] `README.md` reflects setup, scripts, deployment, or product behavior changes.
- [ ] `docs/architecture-decisions.md` has a new entry for durable architecture decisions.
- [ ] `docs/agent-handoff.md` has a handoff entry when useful context should survive the chat.
- [ ] Stale references were searched after renames/deletions.

Suggested search:

```powershell
rg -n "old-doc|old-term|Vercel|Cloudflare Pages|TODO|FIXME" README.md docs src worker .github
```

## Code And Security

- [ ] Secrets, API keys, tokens, local credentials, and private URLs are not committed.
- [ ] User/AI-provided content is treated as untrusted.
- [ ] API changes enforce authentication, authorization, and tenant scoping.
- [ ] Revit/Connect write paths require explicit user approval and audit planning.
- [ ] New dependencies are necessary and reviewed.

## Validation

Run the smallest relevant checks first, then broader checks when risk increases.

Docs-only:

```powershell
rg -n "deleted-doc|old-term" README.md docs src worker .github package.json
git diff --check
```

Runtime/frontend:

```powershell
npm run lint:all
npm test
npm run build
```

Worker/deployment:

```powershell
npm run build
npx wrangler deploy --dry-run --env dev
npx wrangler deploy --dry-run --env=""
```

Browser workflows:

```powershell
npx playwright install chromium
npm run test:e2e
```

## Commit

- [ ] Review changed docs for contradictions.
- [ ] Review tests for meaningful assertions when tests changed.
- [ ] Record unrun checks and why in the handoff or final response.
- [ ] Stage only intended files:

```powershell
git add path/to/file docs/relevant-doc.md
```

- [ ] Commit with a concise task-focused message:

```powershell
git commit -m "type: short task summary"
```

## End

- [ ] Switch back to `develop`:

```powershell
git switch develop
```

- [ ] Merge the task branch into `develop`:

```powershell
git merge --no-ff type/short-task-name -m "merge: short task summary"
```

- [ ] Delete the completed task branch locally:

```powershell
git branch -d type/short-task-name
```

- [ ] Push `develop`:

```powershell
git push origin develop
```

- [ ] Confirm the final state:

```powershell
git status --short --branch
```

- [ ] Final response includes files changed, validation run, known gaps, and branch/merge status.

## Merge Blockers

Do not merge if:

- Required checks fail.
- Docs contradict implemented behavior.
- A risky behavior change has no test or explicit reason.
- Secrets or generated artifacts are present.
- Deployment config points production domains at dev environments.
- The branch contains unexplained unrelated changes.
