# Architecture Decisions

This log records durable decisions so another agent can understand why the repo
looks the way it does without reconstructing the original conversation.

Newest decisions go first.

## 2026-06-02 - AI Assistant Can Show Things On The Canvas (Action Protocol, P3)

**Context:** The assistant could describe the graph (P1/P2) but not act on it. The
first, safest step toward an interactive agent is read-only "show" actions —
point the user at a node, open its inspector, reveal a node type in the library —
which can auto-run because they mutate nothing.

**Decision:** A fenced ` ```nova-action ` block carries `{"ops":[...]}`. A pure
`ai/graph-actions.js` (`parseNovaActions`) extracts + validates the block against
a `SHOW_OPS` allow-list (`focusNode`, `highlightNodes`, `openInspector`,
`revealLibraryNode`), strips it from the reply (never shown raw), and returns the
ops. The response handler auto-runs them via `app.runShowActions` on the workspace
channel only; each op is isolated so a bad one can't break the chat. The protocol
is taught in the prompt only when a graph exists (kept out of the build-intent
size budget), and the model is told to always also explain in prose. Edit ops
(add/remove wire, set version, add node) are deliberately NOT in the allow-list —
they are the Apply-gated P5 phase. `node-lib-item` gained a `data-node-type`
attribute so the library reveal has a stable selector.

## 2026-06-02 - AI Assistant Gets A Local Problem Report (P2)

**Context:** With the live-graph snapshot (P1) the assistant could see the graph
but not reason reliably about what was wrong or unfinished — it would guess at
issues. "How do I finish this workflow?" needs a concrete, locally-verified
worklist, not the model's invention.

**Decision:** A pure `ai/graph-problems.js` (`analyzeGraphProblems(graph, typeMap,
{nodeErrors})`) computes a low-noise, actionable set: `orphan-wire` (endpoint
references a missing node/port), `type-mismatch` (reuses `isWireTypeCompatible`
from `core/wire-type-check.js`), `unconnected-input` (an input with no wire AND no
control fallback), `node-error` (errored last run, from `app._nodeErrors`), and
`no-output-sink` (graph has nodes but nothing reaches an `Output.*`). It is folded
into the live-graph section of `buildSystemPrompt` as a `### Problems` block,
appearing only when the graph has issues (so it costs nothing on a clean or empty
graph), and the model is told to address them by node id and not invent problems
beyond the list. Noise was deliberately bounded — per-node "dangling output" was
dropped in favour of the single graph-level `no-output-sink`, and inputs with a
control default are not flagged.

## 2026-06-02 - AI Assistant Has A Grounded Knowledge Base (Learn-Intent, P1b)

**Context:** The assistant should be one place to learn Nova — "how does it
work?", "which node does X?" — without hallucinating product facts or inventing
nodes. The prompt had a signature catalog (for codegen) but no product primer and
no per-node descriptions, and dumping all of that on every turn blew the prompt
size budget (a guard test caps the build-intent prompt at <20 KB).

**Decision:** A pure `ai/knowledge-base.js` provides an authored `NOVA_PRIMER`
(how Nova works / how to use it) and `buildNodeKnowledge()` (a "NodeName — what it
does" guide built from each node's own description, cached). `GPTClient` attaches
both **only on learn-intent turns** — gated by `isLearnIntent(userMessage)`
(question marks + how/what/which/explain phrasing), threaded from the call sites —
so build/edit prompts stay lean and the size budget holds. The primer instructs
the model to answer only from the primer, node guide, and live graph, and to say
it is not certain otherwise (mirrors the UNKNOWN METHODS PROTOCOL). Follow-up:
trim the node guide to a question-relevant subset (retrieval) for large registries.

## 2026-06-02 - AI Assistant Sees A Live Graph Snapshot (Content-Awareness, P1)

**Context:** The assistant only received the generated "code on canvas"
(`existingCode`, and only when the code terminal was populated). It had no
structured view of the actual graph — node ids, types, versions, ports,
positions, control values, or wiring — so it guessed structure from code and was
blind when the terminal was empty. This blocked "what should I wire next to
finish this?" and precise, node-id-referenced edits.

**Decision:** First phase of the AI copilot. A pure `ai/graph-context.js`
(`buildGraphContext(graph, typeMap, opts)`) turns `app.serializeGraph()` into a
compact, token-bounded block (nodes with type/version/ports/position/controls,
then `from.port → to.port` wires; capped with explicit "+N not shown" notes — no
silent truncation). `GPTClient.buildSystemPrompt` injects it as a `### Live Graph`
section, read from the global app/registry and wrapped defensively so it can
never break a chat turn. It is naturally gated to projects with nodes (empty on
the landing screen). Later phases build on this: a problem report (P2), an action
protocol to show/edit the graph (P3/P5), and a grounded knowledge base (P1b).

## 2026-06-02 - Node Definitions Are Versioned So New Releases Don't Break Old Graphs

**Context:** A node's behavior may change in a future release. With one def per
type, shipping that change would silently alter every existing graph that uses
the node — there was no way to keep old behavior.

**Decision:** Node defs gain an optional `version` (integer ≥ 1; absent ⇒ v1, so
the change is additive and inert until a type ships a second version). A type can
register multiple versions — a def carries its predecessors in
`priorVersions: [...]`. The registry builds `NODE_VERSION_MAP` (type → {version →
def}) alongside `NODE_TYPE_MAP` (latest). Each node instance pins `nd.version`,
set to the latest at creation and **persisted in the saved graph**; on load the
def is resolved for that pinned version (`resolveVersionedDef`), falling back to
the latest with a logged warning only if the pinned version was retired. The user
switches a node's version via a header picker (rendered only when a type has >1
version) → `app.setNodeVersion`, which re-resolves the def and migrates control
values (`migrateControlValues`, honoring a def's optional `migrateFrom[v]`). The
resolution/migration rules live in the pure, unit-tested `core/node-versions.js`.

Modern nodes are normalized through `defineNode` and resolve `execute` by type via
the registry, so versioning is threaded through that pipeline: `defineNode` and
`toLegacyNodeDefinition` preserve `version`/`priorVersions`/`migrateFrom` (and
carry `execute`), every registered version is stamped with its `categoryColor`,
and the compute path runs a pinned **non-latest** version's own `execute` (a no-op
for the common latest-pinned case). A node saved without a version predates
versioning and pins to **v1** (the original behavior), not the latest. `Math.Round`
is the reference example: v1 rounds to nearest; v2 adds a `Mode` (nearest/up/down)
defaulting to nearest, with a `migrateFrom[1]` — so adopting v2 is behavior-
preserving until the user changes Mode.

## 2026-06-02 - Custom.Python Codegen Tracks Live Ports, Not The Static Def

**Context:** A `Custom.Python` node has two port lists: the static definition
(`nd.def.inputs/outputs` — for the type, e.g. `elements`/`options`/`result`) and
the live ports (`nd._dynInputs/_dynOutputs`), which track renames and `# in:`/
`# out:` header edits. The renderer, the runtime, and the rename/sync logic all
use the live ports; the **code generator** keyed off the static def. The moment a
port was renamed (e.g. `elements`→`Ele`) the two diverged: codegen looked for a
wire to `elements`, never found the actual `Ele` wire, and never bound the
upstream value to the cell's `Ele` variable. Outputs broke symmetrically.

**Decision:** `generateNodeCode` (the active override in `node-library.js`)
generates the `Custom.Python` cell from the **live** ports. A pure helper
`wrapPythonNodeCode(code, { inputBindings, outputBindings })` in
`python-port-decl.js` binds each wired input to the cell's input variable before
the cell (`name = <upstreamVar>`) and exports each output under its canonical
downstream name after it (`<canonicalVar> = name`), so the generated full script
feeds the cell exactly like the live runtime. The static def remains the fallback
only when a node has no live ports yet.

## 2026-06-02 - AI Code→Node Pipeline Hardened Against Silent Geometry Failures

**Context:** AI-generated Python that builds geometry failed silently. Examples:
`Geo.pipe(p1, p2, r)` (the real signature is `pipe(curve, radius)`) and
`Geo.loft(point[][])` rendered nothing with no error; the parser also shredded
multi-line list literals and inline list arguments into orphan Custom.Python nodes.

**Decision:** The code→node path is hardened end to end:
- The codegen system prompt documents exact `Geo.*` signatures and naming
  conventions (solid primitives use `create*`; operations like `loft`/`pipe` do not).
- A definite argument-type mismatch now gates approval and triggers the (capped)
  fix-retry loop instead of only logging a warning — the runtime swallows bad geometry
  without erroring, so a silent mismatch must be treated as a failure.
- The parser keeps a multi-line list/dict/tuple literal as one block, and wires an
  inline list-literal argument (`Geo.combineAll([a, b])`) through a synthesized
  `List.Create` node instead of leaving the consumer's port dangling.

## 2026-06-02 - Custom.Python Is Code-Driven And Edited In The Terminal

**Context:** The Python node used a single-line text control, and its enhanced
renderer was not reliably applied (the `renderNode` wrapper was clobbered by
startup load order), so it fell back to the basic control.

**Decision:** `node-renderer` renders the Python body directly (order-independent).
The body shows only named input/output ports plus a "double-click to edit" hint — no
inline editor. The code is the source of truth for ports: inputs come from a `# in:`
header, the output from the last top-level assignment. Add/remove input uses the same
`+/-` control as `List.Create` and writes the `# in:` header — NOT a `name = None`
assignment, because the runtime injects each wired input as `let name = ...` before the
cell runs, so an assignment would clobber the wired value. Editing happens in the code
terminal, which is tabbed (Full Script + the node); the node tab is staged and committed
with **Save**, which re-derives ports and rewires. Port labels are renamable in place.

## 2026-06-02 - 3D Viewer Previews Only Terminal Geometry By Default

**Context:** A lofted twisted tower appeared as a "coil." The loft mesh was correct;
the coil was the intermediate profile rings (consumed by the loft) being previewed
alongside the result.

**Decision:** `_renderFromCompute` hides a node's preview when its geometry feeds a
downstream geometry/transform node (a non-sink consumer). Nodes wired only to
`Output.*` sinks, or wired nowhere, stay visible. A per-node preview toggle
(`_preview3d === true`) or a prior panel toggle still force-shows it; auto-hidden items
are marked (`_autoHidden`) so the visibility snapshot does not mistake an auto-hide for
a user "hide" on the next run.

## 2026-06-02 - CI Deploy Tolerates Missing And Dirty Cloudflare Secrets

**Context:** With `CF_API_TOKEN`/`CF_ACCOUNT_ID` unset, the workflow still passed an
empty `CLOUDFLARE_API_TOKEN`, failing every push with `Authentication error [code: 10000]`;
a token pasted with a trailing newline failed with `Headers.set: "***" is an invalid
header value`.

**Decision:** The `deploy-dev` / `deploy-production` steps skip with a `::warning::`
(exit 0) when the secrets are absent, and sanitize `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` to the `[A-Za-z0-9_.-]` charset before use (stripping stray
newlines/whitespace), re-masking the cleaned values. The verify step is gated on the
deploy actually running. The two CI secrets and the required token permissions are
documented in `docs/deployment-guide.md`.

## 2026-06-01 - Dev Worker Must Not Inherit Production Routes

**Status:** Accepted

**Context:** Bootstrapping the `nova-dev` environment showed that Wrangler
created the dev Worker at `https://nova-dev.ey-myacc.workers.dev`, while docs
and CI used the wrong hostname `nova-dev.e-y-myacc.workers.dev`. The dev deploy
also inherited the top-level `hi-nova.work` custom domain route.

**Decision:** `[env.dev]` sets `routes = []` and `workers_dev = true`.
Develop branch previews use only
`https://nova-dev.ey-myacc.workers.dev`. The `hi-nova.work` custom domain
belongs only to the top-level production `nova` Worker.

**Consequences:**

- Dev deploys cannot overwrite the production custom domain route.
- CI verifies dev using `nova-dev.ey-myacc.workers.dev`.
- Any future custom dev domain must be added explicitly under `[env.dev]`.

## 2026-06-01 - Deployments Expose Commit Metadata

**Status:** Accepted

**Context:** The production Worker routes page can be confused with the
develop deployment because `hi-nova.work` and `nova.ey-myacc.workers.dev`
belong to the top-level `nova` Worker. Develop branch updates deploy to the
separate `nova-dev` Worker and were not easy to verify visually.

**Decision:** GitHub Actions writes `dist/nova-deployment.json` immediately
before each Worker deploy and verifies that the public deployment URL serves the
current GitHub commit SHA. The dev metadata URL is
`https://nova-dev.ey-myacc.workers.dev/nova-deployment.json`; production is
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

**Decision:** Dev and production deploy jobs run explicit shell commands with
`npx wrangler@4.95.0` instead of the action wrapper. Dev deploys with
`wrangler deploy --env dev`. Production deploys with `wrangler deploy --env=""`
to explicitly target the top-level Worker configuration.

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
| `develop` | `nova-dev` via `wrangler deploy --env dev` | `https://nova-dev.ey-myacc.workers.dev` |
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
