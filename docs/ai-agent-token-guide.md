# AI Agent Token Guide

Use this guide when working in Nova with an AI coding agent. The goal is to keep
context small, reduce repeated analysis, and leave enough breadcrumbs for the
next agent to continue safely.

## Default Workflow

1. Read `docs/README.md` first to identify the few documents relevant to the task.
2. Read `docs/architecture-decisions.md` before changing architecture, deployment, auth, storage, AI proxying, collaboration, or Connect/Revit behavior.
3. Use `rg` for targeted searches instead of opening broad folders.
4. Inspect only the files directly involved in the requested change.
5. Prefer small diffs over full-file rewrites.
6. Run the smallest useful validation command first, then broader checks when risk increases.
7. Update the decision log or handoff notes before merging.

## Context Budget Rules

- Do not paste full logs, generated bundles, screenshots, or session JSON into the prompt unless the task requires exact content.
- Summarize long command output and keep only error lines, filenames, and relevant stack traces.
- Prefer `rg -n "term" path` over reading whole files.
- Prefer `Get-Content -TotalCount` or focused line reads over full-file reads.
- Reuse earlier findings from the active thread when they are still current.
- Avoid re-reading docs that are unrelated to the task category.

## Search Patterns

Use focused searches:

```powershell
rg -n "Cloudflare|wrangler|deploy|NOVA_CORS_ORIGIN" wrangler.toml .github docs worker
rg -n "ProjectRoom|WebSocket|collab|room" worker src tests docs
rg -n "GROQ_API_KEY|proxy/chat|rate limit" api worker src tests
rg -n "TODO|FIXME|skip\\(|\\.only\\(" src tests docs
```

Avoid broad searches unless cleaning docs or auditing stale references:

```powershell
rg -n "old-term" .
```

## File Reading Rules

- Read the nearby code before editing.
- For docs, read the table of contents or first 120 lines first.
- For large modules, search for function names and read the smallest containing section.
- For generated or user-uploaded logs, extract counts, errors, and the few fields relevant to the task.

## Output Rules

When handing off or finishing, report only:

- Files changed.
- Decisions made or confirmed.
- Validation commands run.
- Known gaps or follow-ups.
- Branch/merge status.

Do not repeat unchanged code or dump full diffs in chat.

## When To Update Docs

Update `docs/architecture-decisions.md` when a decision changes one of these:

- Deployment platform, branches, domains, secrets, storage, or CI.
- Auth/session model, CORS/CSRF assumptions, RBAC, or tenant isolation.
- Data model, persistence strategy, object storage, or retention policy.
- AI provider routing, proxy limits, BYOK behavior, or code-to-node architecture.
- Realtime collaboration protocol or Durable Object behavior.
- Nova Connect/Revit write safety or pairing model.

Update `docs/agent-handoff.md` when a task produces context another agent needs
but does not warrant a permanent architecture decision.
