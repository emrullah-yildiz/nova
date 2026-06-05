# NOVA — Source of Truth

> **This is the living, always-current big-picture file for Nova.** It is the one
> place that answers: *what is Nova, how is it built, where is it going, and does
> my change fit?* Read it before deciding anything architectural. **Update it in
> the same branch as any change that affects architecture, design patterns, the
> module map, or the roadmap.** A change that contradicts this file is wrong until
> either the change or this file is fixed.
>
> Companion: [`ENGINEERING.md`](ENGINEERING.md) — *how* we work (rules, branching,
> testing, multi-agent). This file is *what & why & where*; that one is *how*.
>
> Last updated: **2026-06-03**.

---

## 1. Product / Vision

Nova is a **browser-based visual-scripting workspace for parametric design**. A
user builds a node graph on a canvas; the graph drives a custom **geometry
kernel**; results render live in a **3D viewport**. An **AI copilot** can read the
graph, explain it, generate geometry, and act on the canvas. **Nova Connect**
bridges the browser to desktop tools (Revit first, Rhino later) for real
project/geometry exchange.

The product bet: parametric design as approachable as a web app, with an AI that
produces **academically-defensible** geometry (real mathematical forms, facades,
form-finding) rather than toy boxes — see [`design/ai-system-prompt.md`](design/ai-system-prompt.md).

Target users: computational designers, architects, and AEC engineers who want
Grasshopper/Dynamo-class parametric power without desktop lock-in.

---

## 2. Architecture at a glance

```
 Browser (Vite SPA, src/)
   canvas graph editor · 3D viewport · AI copilot · Connect panel
        │  https (same origin)
        ▼
 Cloudflare Worker (worker/index.mjs)  ── the single deployment target
   • serves the SPA from dist/ via the ASSETS binding
   • /api/*  REST (auth, projects, versions, feedback)
   • /api/proxy/chat  AI proxy (BYOK + shared free tier, KV rate-limited)
   • Durable Object: ProjectRoom (1 per project) — realtime collab rooms
   • KV: sessions, email-verification tokens, AI rate-limit buckets
        │  @neondatabase/serverless (Hyperdrive planned)
        ▼
 Neon Postgres — users, orgs, projects, versions, members, runs, audit
 R2 (planned) — large artifacts / exports / meshes

 Nova Connect (separate, desktop): browser ⇄ localhost hub ⇄ Revit add-in (C#)
```

Subsystems (each links to its detailed Tier-2 spec):

- **Deployment & platform** — Cloudflare Worker only; `develop`→`nova-dev`,
  `main`→`hi-nova.work`. `wrangler.toml` is the deploy source of truth. See
  [`architecture/deployment.md`](architecture/deployment.md).
- **Accounts & realtime collaboration** — OIDC (Google/SSO) → httpOnly cookie
  session; personal + org workspaces; Yjs CRDT over Durable Objects; spectate
  then co-edit. **Design/proposal — Phase 0 not started.** See
  [`architecture/accounts-collaboration.md`](architecture/accounts-collaboration.md).
- **Nova Connect / Revit** — paired localhost hub + Revit add-in; read pilot then
  approved writes; every write audited. See [`architecture/revit-connect.md`](architecture/revit-connect.md).
- **AI copilot** — content-aware (live graph snapshot + problem report), grounded
  knowledge base, fenced action protocol, expert geometry prompt. See
  [`design/ai-chat-experience.md`](design/ai-chat-experience.md) and
  [`design/ai-system-prompt.md`](design/ai-system-prompt.md).
- **Decisions** — the full chronological record of *why* the repo looks this way:
  [`architecture/decisions.md`](architecture/decisions.md).

---

## 3. Source layout & module ownership

This map is also the **ownership partition** for parallel agents
([`ENGINEERING.md`](ENGINEERING.md) §3): each agent owns a disjoint slice.

| Path | Role | Default owner (agent) |
|---|---|---|
| `src/main.js` | browser bootstrap | (shared — hot file) |
| `src/app/` | app state, persistence, save/load, auto-bug-reporter | UI/app |
| `src/core/` | graph execution, compute engine, node registry, versioning, parser/runtime | Core/Runtime |
| `src/geometry/` | geometry kernel + math | Geometry/Kernel |
| `src/ai/` | AI client, prompt building, codegen, knowledge base, graph context | AI Copilot |
| `src/ui/` | node editor, library, renderer, ports, canvas, help | UI/Viewport |
| `src/viewer/` | 3D viewport + geometry selection | UI/Viewport |
| `src/integrations/` | Nova Connect + Revit browser modules | Connect/Revit |
| `src/enterprise/` | auth, cloud client, api-server (domain logic) | Platform/Backend |
| `worker/` | Cloudflare Worker entry, routes, ProjectRoom DO | Platform/Backend |
| `api/` | shared provider/feedback helpers (imported by Worker + tests) | Platform/Backend |
| `server/` | jwks verifier, postgres persistence | Platform/Backend |
| `integrations/revit-addin/` | C# Revit add-in | Connect/Revit |
| `installer/nova-connect/` | WiX MSI installer (Connect add-in) | Connect/Revit |
| `tests/` | Vitest + Playwright | QA (or each owner for their slice) |
| `docs/` | documentation | Orchestrator (NOVA.md) / any (their spec) |

Worker routes are authoritative for **deployed** behavior; `api/` helpers exist
for local dev + tests (see decision *Keep AI Provider Helpers Shared*).

---

## 4. Design patterns & principles

Durable patterns distilled from the decision log — follow them so new code looks
like the code around it. (Each links to the decision that owns the detail.)

- **Pure helper + thin wiring.** Logic lives in a small, unit-tested pure module
  (`ai/graph-context.js`, `ai/graph-problems.js`, `ai/graph-actions.js`,
  `core/node-versions.js`, `runtime/python-port-decl.js`); the app wires it in with
  a thin, defensive call. *This is also the multi-agent default — new behavior →
  new owned file, not an edit to a shared one.*
- **Defensive, never-throw wiring.** Code folded into hot paths (chat turns, error
  handlers) is wrapped so it can never break the surrounding feature — e.g. the
  auto-bug-reporter always swallows its own failures.
- **Token-bounded prompt blocks.** Anything injected into the AI prompt is capped
  with an explicit "+N not shown" — never silently truncated; a guard test caps the
  build-intent prompt size.
- **Placeholder-splice for dynamic prompt sections** — build the literal, then
  `.replace('__NOVA_NODE_CATALOG__', …)`; never interpolate inside the template
  (a past bug shipped the literal text). See [`design/ai-system-prompt.md`](design/ai-system-prompt.md).
- **Fenced action protocol with an allow-list.** The AI acts on the canvas via a
  ` ```nova-action ` block validated against a `SHOW_OPS` allow-list; mutating ops
  are gated behind explicit Apply.
- **Node versioning & migration.** Node defs carry an optional `version`; instances
  pin and persist it; old graphs keep old behavior. Rules in the pure
  `core/node-versions.js`.
- **Single value → one-item list.** A scalar wired into a `list` input is auto-
  promoted to a one-item list (Grasshopper/Dynamo parity); list-consuming nodes
  are not auto-laceable.
- **Wire-boundary value coercion.** The port boundary normalizes a few value/type
  mismatches so producers and consumers interoperate without a converter node —
  same place + spirit as single→list (`resolveInputs`, `src/nodes/runtimeAdapter.js`):
  a `number` into a `boolean` input → `0`=false / non-zero=true; a `boolean` into a
  `number` input → `1`/`0`. `any` ports are never coerced; this is a value
  normalization at the wire, **not** a language-level redefinition.
- **Data is values + nested lists — there is no tree type.** Branching, grouping,
  and nesting are modeled as **lists of lists**, not a bespoke tree/`DataTree`
  object. Every "tree" operation is a `List.*` node on nested lists: `List.Chunk`
  (size 1) grafts each item into its own sub-list, `List.Chunk` (size N) partitions,
  `List.Transpose` flips a matrix (rows↔columns), `List.Flatten` flattens. Do **not**
  add a parallel tree type or a node category that duplicates `List.*`; fold new
  list/nesting behavior into the existing `List.*` category. (A `DataTree` type was
  built and removed — see the 2026-06-04 decision.)
- **No duplicate nodes — enumerate the existing library FIRST.** Before adding ANY
  node, list the nodes already in its target category (`src/nodes/categories/*.js`
  for modern nodes, `src/core/nodes.js` for legacy/host) and confirm none already
  does the job. Never ship two nodes for the same purpose under different `type`s or
  names — the registry's duplicate-`type` guard does **not** catch *functional*
  duplicates (same purpose, different `type`). Fold into / upgrade the existing node
  instead. (2026-06-04: M4 shipped `Revit.GetParameters`/`Revit.SetParameters`
  duplicating the existing `Revit.GetParameterValues`/`Revit.SetParameterValues` —
  exactly this trap; the type-collision check passed because the `type` strings
  differed.) Reviewers must check for functional duplicates, not just collisions.
- **Adding a node — the fit gate (run BEFORE writing any node; the reviewer
  re-checks every point).** A node earns its place only if it passes ALL of these:
  1. **Valuable workflow.** It unlocks a real workflow users want — not a thin,
     rarely-used API wrapper added for completeness. If you can't name the workflow
     it enables, don't add it.
  2. **Not a duplicate.** No existing library node already does it (see "No duplicate
     nodes" above). Fold into / upgrade the existing node instead of shipping a
     parallel one.
  3. **Usable inputs, with real producers.** Each input is a type other nodes can
     actually produce — confirm existing node(s) emit it, so a user can wire it up.
     An input nothing can feed is a dead port.
  4. **Usable outputs, with real consumers.** Each output is a type other nodes can
     actually consume — confirm existing node(s) take it, so the result flows
     onward. An output nothing can read is a dead end.
  5. **Working, meaningful sample.** Its `help.example` is a complete
     producer → focal node → consumer graph that RUNS and produces a defined,
     readable, correct result — never `[object Object]`, `NaN`, or undefined.
     Verify it, don't assume it.
  6. **Naming & presentation.** Name `ParentName.NodeName` (e.g. `Wall.ByCurve`);
     creation nodes use `By` + the input names (`Surface.ByPatch`,
     `AdaptiveComponent.ByPoints`). Fold into the EXISTING category it belongs to
     (no parallel categories). Icons are Unicode glyphs/symbols, never text
     abbreviations (`max`, `1st`). Describe the node on its own terms — never "like
     Dynamo/Grasshopper".
- **Expose Properties where it makes sense.** If a node produces or operates on an
  object that carries inspectable attributes — a Revit/Forma element, a material, a
  type, an analysis result — surface those attributes as readable **Properties** rather
  than leaving them locked inside an opaque object: give the node a `properties` output
  (a name→value map) and/or a companion `*.Properties`/`*.Info` getter, so the data is
  visible in the inspector and consumable downstream (`List.*`, watch, filters). A node
  whose output is an opaque handle nobody can read fails the "usable outputs" gate.
- **Code-driven ports (Python / CodeBlock).** A code cell's code is the source of
  truth for its ports. **`Custom.Python`** (full-script escape hatch): inferred free
  vars in, **last** assignment out (`resolvePythonPorts`). **`Custom.CodeBlock`**
  (lightweight inline block, v2 of the former `Custom.Code`): free vars in, **ALL**
  top-level assignments out (`resolveCodeBlockPorts`), plus a `..`/`#` series
  shorthand that **desugars** to a number-list literal (`desugarSeries`) — it is not
  a `List.Range`/`List.Sequence` clone. The two share the inference engine
  (`runtime/python-port-decl.js`) but stay distinct nodes with a capability boundary
  (Python = imports/bridge/typed headers/terminal; CodeBlock = expressions/series/
  literals/inline). Codegen tracks *live* ports, not the static def. `Custom.Formula`
  was folded into CodeBlock (`Result = <expr>`) and retired.
- **Graph run modes are app-level policy over the engine mechanism.** The graph
  recomputes per `app.runMode`: **Automatic** (default — recompute on every edit,
  the legacy behavior) or **Manual** (defer to an explicit Run). The *mechanism*
  lives in the engine (`_manualRunMode` gates `computeNodeValue` to the last-Run
  snapshot; `runGraph()` is the single on-demand recompute); the *policy* (mode
  state, toggle, Run-button stale affordance, persistence in the saved graph,
  Manual→Automatic catch-up) lives in the owned UI module `src/ui/run-mode.js` —
  don't fold run-mode policy back into `src/core`. Old graphs default to Automatic.
- **Server is the authority.** Realtime roles (viewer RO / editor RW) and Connect
  write approvals are enforced server-side; clients are never trusted. A Connect/
  Revit write must present a **single-use, server-issued approval token**: the
  browser obtains one over **`POST /api/host-write-approvals`**
  (`EnterpriseStore.issueHostWriteApproval`, after a project-write check), carries
  it to the hub/add-in inside `payload.approval`, and reports the completed write
  over **`POST /api/host-operations`** — the authoritative consumer that calls
  `consumeHostWriteApproval` to **burn the token (single-use) and write the audit
  row as a precondition** (accepted → `host.operation`, rejected → `host.write.denied`).
  No client-set `{ approved: true }` boolean exists on the wire. The local hub is a
  transport and the add-in token-presence check is defense-in-depth; authoritative
  enforcement requires the enterprise backend (signed out → graceful local degrade).
  See [`architecture/revit-connect.md`](architecture/revit-connect.md) (SEC-013).

---

## 5. Current status (shipped vs in-flight)

**Shipped / live:**
- Vite SPA with explicit `src/` module imports; graph engine, geometry kernel,
  node registry, AI workflow, UI.
- Cloudflare Worker-only deployment; `develop`→`nova-dev`, `main`→`hi-nova.work`;
  CI gates lint + unit + e2e + build + audit + Worker deploy.
- AI copilot phases P1–P4: live-graph awareness, problem report, grounded
  knowledge base, read-only canvas actions, persistent thinking/answer/artifacts,
  Stop/Copy/Retry, attachments + images, expert geometry prompt + golden examples.
- Auto-bug-reporter (unhandled errors → GitHub issue, consented).
- Node versioning infrastructure (`Math.Round` is the reference v1/v2).
- Nova Connect prototype + downloadable Revit 2027 add-in installer (per-user WiX
  MSI). The local hub runs **in-process** in the C# add-in (`NovaHub`) — no Node,
  no checkout, no separate hub exe — so a clean install can Connect.

**In-flight / not started:**
- **Accounts & collaboration: Phase 0 not started** — the `src/enterprise/` domain
  logic exists but is frontend-dormant and Node-bound; the Worker port is pending.
- AI prompt Phase 3 (library hardening: real boolean CSG, paneling, Voronoi) and
  Phase 4 (architectural validation in the fix loop) not done.
- CI deploy needs a valid `CF_API_TOKEN`/`CF_ACCOUNT_ID` (see deployment doc).

---

## 6. Roadmap / future plans

Consolidated forward view. Detail lives in the linked specs — don't duplicate it here.

- **Accounts → Collaboration** (5 phases): Platform port (Node→workerd, pg→neon,
  crypto→WebCrypto) → Accounts (login, cookie session, workspaces) → Cloud profile
  → Sharing (members + share links) → Spectate (ProjectRoom + Yjs presence) →
  Co-edit. See [`architecture/accounts-collaboration.md`](architecture/accounts-collaboration.md) §9.
- **AI copilot**: P2 remaining (structured turn model + step timeline for non-
  Anthropic providers), P5 (Apply-gated edit actions), then prompt Phases 3–4.
  Durable codegen fix: have the AI emit a **structured node+wire list** instead of
  free-form Python (retires the parser's fragility class).
- **Nova Connect**: Milestones 1–4 — harden hub → backend pairing → Revit read
  pilot → approved writes. See [`architecture/revit-connect.md`](architecture/revit-connect.md).
- **Storage**: add R2 for large artifacts; add project/version quotas + retention
  before broad public use (keep blobs out of Postgres).

---

## 7. Decision & document index

**Full decision log:** [`architecture/decisions.md`](architecture/decisions.md) (newest first, append-only).

| Doc | Tier | Purpose |
|---|---|---|
| [`NOVA.md`](NOVA.md) | 1 | This file — living source of truth |
| [`ENGINEERING.md`](ENGINEERING.md) | 1 | Coding + multi-agent operating rules |
| [`README.md`](README.md) | index | Doc map + maintenance policy |
| [`agent-workboard.md`](agent-workboard.md) | live | Concurrency claim board (who owns what *right now*) |
| [`agent-handoff.md`](agent-handoff.md) | live | Short-lived task handoffs between agents |
| [`architecture/decisions.md`](architecture/decisions.md) | 2 | Durable decision log |
| [`architecture/deployment.md`](architecture/deployment.md) | 2 | Cloudflare Worker deploy, domains, secrets |
| [`architecture/accounts-collaboration.md`](architecture/accounts-collaboration.md) | 2 | Accounts + realtime collab design |
| [`architecture/revit-connect.md`](architecture/revit-connect.md) | 2 | Nova Connect + Revit architecture |
| [`design/ai-chat-experience.md`](design/ai-chat-experience.md) | 2 | AI chat UX architecture |
| [`design/ai-system-prompt.md`](design/ai-system-prompt.md) | 2 | AI expert-design prompt |
| `enterprise-api.env.example` | ref | Env-var reference |

---

## Maintenance contract

- **NOVA.md (this file)** — update when architecture, a design pattern, the module
  map, current status, or the roadmap changes. Keep it distilled; push detail down
  into the Tier-2 spec and link to it.
- **`architecture/decisions.md`** — append a dated entry (newest first) for any
  durable decision; mark superseded entries rather than deleting them.
- **`agent-handoff.md`** — add an entry when a task leaves context the next agent
  needs but that isn't a permanent decision.
- **`agent-workboard.md`** — claim/release your owned paths as you start/finish.

If two of these ever disagree, NOVA.md + decisions.md win; fix the others.


## Rules for Agents

- Before every merge, make sure that tests are passing
- Think that multiple agents are working together and everything should be documented so that another agent can continue to the work from where it is left. 
- Every new node is tested like a real user, meaningful results and usable actions.
- The learning system must be as detailed and interactive as Dynamo Primer (https://primer2.dynamobim.org): each lesson has concept explanation, step-by-step exercises, and at least one interactive question the user must answer correctly before advancing.
- Every sample file of nodes will be checked carefully. The agents will check not only if there is an output but also if the output is usable for another nodes input and if the output appears correctly when the sampel file is run. 