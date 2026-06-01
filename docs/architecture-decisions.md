# Architecture Decisions

This log records durable decisions so another agent can understand why the repo
looks the way it does without reconstructing the original conversation.

Newest decisions go first.

## 2026-06-01 - Deployments Expose Commit Metadata

**Status:** Accepted

**Context:** The production Worker routes page can be confused with the
develop deployment because `hi-nova.work` and `nova.e-y-myacc.workers.dev`
belong to the top-level `nova` Worker. Develop branch updates deploy to the
separate `nova-dev` Worker and were not easy to verify visually.

**Decision:** GitHub Actions writes `dist/nova-deployment.json` immediately
before each Worker deploy and verifies that the public deployment URL serves the
current GitHub commit SHA. The dev metadata URL is
`https://nova-dev.e-y-myacc.workers.dev/nova-deployment.json`; production is
`https://hi-nova.work/nova-deployment.json`.

**Consequences:**

- A `develop` push fails CI if the dev URL does not expose the pushed commit.
- Humans can verify dev before merging/promoting to `main`.
- The metadata file is generated in CI and should not be committed.

## 2026-06-01 - Worker Deploy CI Pins Wrangler 4

**Status:** Accepted

**Context:** GitHub Actions used `cloudflare/wrangler-action@v3` without an
explicit Wrangler version, and a dev deploy run used Wrangler `3.90.0` while the
repo depends on Wrangler `4.95.0`. This made deploy behavior depend on the
action runner installation instead of the repository.

**Decision:** Dev and production deploy jobs pin `wranglerVersion: '4.95.0'`.
Dev deploys with `wrangler deploy --env dev`. Production deploys with
`wrangler deploy --env=""` to explicitly target the top-level Worker
configuration.

**Consequences:**

- CI deploys use the same Wrangler major/minor as local validation.
- The default production Worker environment is explicit despite having a named
  `dev` environment in `wrangler.toml`.
- When upgrading Wrangler, update `package.json`, `.github/workflows/ci.yml`,
  and this decision together.

## 2026-06-01 - Documentation Is Decision-Oriented And Agent-Friendly

**Status:** Accepted

**Decision:** Nova keeps a small current documentation set focused on agent
coordination, deployment, architecture decisions, collaboration/accounts, and
Revit/Connect. Superseded roadmap and duplicate planning docs should be deleted
instead of left stale.

**Rationale:** Multiple AI agents need compact sources of truth. A smaller doc
set reduces token usage, avoids contradictory guidance, and lets one agent
understand another agent's completed work through a decision log and handoff log.

**Consequences:**

- `docs/README.md` is the doc index.
- `docs/architecture-decisions.md` records durable decisions.
- `docs/agent-handoff.md` records short-lived task context.
- `docs/agent-merge-checklist.md` is the start-to-end checklist for task branches.
- `docs/ai-agent-token-guide.md` is the token-usage guide.
- Do not add new roadmap docs when an existing current doc can be updated.

## 2026-06-01 - Cloudflare Worker Is The Only Deployment Target

**Status:** Accepted

**Decision:** Nova deploys as a Cloudflare Worker that serves both the Vite SPA
and `/api/*` backend routes. Cloudflare Pages and Vercel are not deployment
targets.

**Branch/domain mapping:**

| Branch | Worker | URL |
|---|---|---|
| `develop` | `nova-dev` via `wrangler deploy --env dev` | `https://nova-dev.e-y-myacc.workers.dev` |
| `main` | `nova` via `wrangler deploy --env=""` | `https://hi-nova.work` |

**Rationale:** One Worker origin simplifies cookies, CORS, API routing, static
asset serving, and Durable Object collaboration rooms.

**Consequences:**

- `wrangler.toml` is the deployment source of truth.
- GitHub Actions deploys Workers directly.
- `hi-nova.work` must only point at the production `nova` Worker.
- Dev should use separate Neon data and separate KV namespaces when available.
- Stale Vercel/Pages docs and serverless entrypoints should not be reintroduced.

## 2026-06-01 - Keep AI Provider Helpers Shared, Put Deployed Rate Limits In Worker

**Status:** Accepted

**Decision:** `api/proxy/chat.mjs` remains as shared provider-chain logic for
tests and local dev. The deployed `/api/proxy/chat` route lives in
`worker/index.mjs` and uses Cloudflare KV for rate limiting.

**Rationale:** Tests can continue to exercise provider routing without requiring
`workerd`, while production rate limits use shared edge state instead of
per-instance memory.

**Consequences:**

- Do not treat every file under `api/` as a deploy target.
- Worker routes are authoritative for production behavior.
- If provider logic moves, update proxy tests and Worker imports together.

## 2026-06-01 - Feedback Refusal Endpoint Runs Through Worker

**Status:** Accepted

**Decision:** `/api/feedback/refusals` is mounted in the Worker. The feedback
module supports both Fetch `Request` handling and the older Node-style handler
used by tests.

**Rationale:** The browser still posts feedback to the same endpoint, but the
deployment target is now Worker-only.

**Consequences:**

- Keep `FEEDBACK_GITHUB_TOKEN` as a Worker secret.
- Keep tests for payload validation, rate limiting, and GitHub issue creation.

## 2026-06-01 - Collaboration Uses Durable Objects

**Status:** Accepted direction

**Decision:** Realtime project rooms use Cloudflare Durable Objects, one room per
project/session, with role checks before WebSocket handoff.

**Rationale:** Durable Objects provide stateful WebSocket coordination close to
the Worker deployment and avoid a separate realtime host.

**Consequences:**

- The Worker must bind `PROJECT_ROOM` in every environment.
- Rooms must enforce viewer/editor permissions server-side.
- Snapshot cadence to Neon must be controlled to avoid unnecessary write load.

## 2026-06-01 - Neon Stores Relational Data, Large Artifacts Belong Outside Postgres

**Status:** Accepted direction

**Decision:** Neon Postgres stores users, orgs, projects, versions, members,
runs, and audit data. Large exports, screenshots, generated meshes, logs, and
binary artifacts should move to object storage.

**Rationale:** The current Neon storage budget is small; storing large blobs or
unbounded version history in Postgres will exhaust it quickly.

**Consequences:**

- Add R2 or another object store before storing large assets.
- Add project/version quotas and retention rules before broad public usage.
- Keep project snapshots compact and avoid base64 payloads in Postgres.

## Decision Entry Template

```markdown
## YYYY-MM-DD - Title

**Status:** Proposed | Accepted | Superseded

**Decision:** What changed or what rule is now true.

**Rationale:** Why this was chosen.

**Consequences:** What future agents must preserve or update.
```
