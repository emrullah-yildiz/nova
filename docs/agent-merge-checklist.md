# AI Agent Merge Checklist

Use this checklist before merging any task branch into `develop`.

## Branch

- [ ] Branch starts from `develop`.
- [ ] Branch name matches the task.
- [ ] `git status --short --branch` shows only expected changes.
- [ ] No unrelated user work was reverted or mixed in.
- [ ] Generated files, logs, local exports, screenshots, and build artifacts are excluded.

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

Run the smallest relevant checks first.

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

## Final Review

- [ ] Review `git diff --stat`.
- [ ] Review deleted files intentionally.
- [ ] Review changed docs for contradictions.
- [ ] Review tests for meaningful assertions.
- [ ] Record unrun checks and why.
- [ ] Merge to `develop`.
- [ ] Delete the task branch.
- [ ] Push `develop`.

## Merge Blockers

Do not merge if:

- Required checks fail.
- Docs contradict implemented behavior.
- A risky behavior change has no test or explicit reason.
- Secrets or generated artifacts are present.
- Deployment config points production domains at dev environments.
- The branch contains unexplained unrelated changes.
