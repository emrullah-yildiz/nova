# Architecture Decisions

> ↑ Big picture: [`../NOVA.md`](../NOVA.md). This is the full, append-only decision
> log; NOVA.md distills the *current* architecture and patterns from it.

This log records durable decisions so another agent can understand why the repo
looks the way it does without reconstructing the original conversation.

Newest decisions go first.

## 2026-06-04 - Revit Parameter Nodes: Keep The Live-Bridge / Pre-Pass Model, Drop The M4 `execute()` Duplicates

**Status:** Accepted

**Context:** The Revit category shipped two functional-duplicate pairs that slipped past the
type-collision check because their `type` strings differed:
`revit-get-parameters` (Revit.GetParameters) vs `revit-get-parameter-values`
(Revit.GetParameterValues), and `revit-set-parameters` (Revit.SetParameters) vs
`revit-set-parameter-values` (Revit.SetParameterValues). Each pair does the same job through
**two different execution models**:
- **Model A — engine async pre-pass + `window.RevitBridge`** (the `*-parameter-values`,
  `revit-element-geometries`, `revit-send-geometry` nodes). `engine.js`
  `_prepareLiveRevitGeometries()` resolves `globalThis/window.RevitBridge` (installed by
  `src/integrations/revit/revit-nodes.js` via `installRevitNodes()` in `src/main.js`),
  awaits the host round-trip, caches the result on the node, and `computeNodeValue` reads
  the cache. `RevitBridge.setLiveParameterValues`/`sendGeometry` carry the **full SEC-013
  flow**: server-issued single-use approval token (`acquireWriteApproval`) + authoritative
  consume/audit (`reportHostWrite`). Takes a **batch list** of elements.
- **Model B — registry `execute()` + `NovaRevitBridge`** (the M4 `revit-get-parameters`/
  `revit-set-parameters`/`revit-select-*`/`revit-place-*` nodes). The def carries an async
  `execute()` that resolves `context.revitBridge` ‖ `globalThis/window.NovaRevitBridge`.
  But `NovaRevitBridge` is **never wired into the running app** — only injected in unit
  tests — so the M4 param nodes were inert in production. The M4 write node only passed
  approval *metadata* through (the hub/server was expected to enforce), not the full
  client-side SEC-013 token acquisition.

**Decision:** Consolidate each pair to **one** node, keeping the **Model A**
`*-parameter-values` nodes (`revit-get-parameter-values`, `revit-set-parameter-values`) and
removing the **Model B** M4 param duplicates (`revit-get-parameters`,
`revit-set-parameters`). Rationale: Model A is the path actually wired and running in the
app, carries the stronger (authoritative, client-acquired) SEC-013 token gate on writes,
and exposes the more useful batch/list API. This **inverts** the original task's
recommendation to keep the M4 `execute()` path, which was based on the assumption that the
M4 bridge was live; it is not.

The M4 **select/place** nodes (`revit-select-elements`, `revit-select-faces`,
`revit-place-family-instance`, `revit-place-adaptive-component`) are NOT duplicates of
anything and are kept; they still use Model B (`execute()` + `NovaRevitBridge`). To stop the
genuinely-distinct acquisition/write nodes from *reading* as duplicates, `NODE_META`
descriptions now spell out interactive-pick (SelectElements/SelectFaces) vs programmatic
query (AllElementsInActiveView/AllElementsOfCategory), and family-instance/adaptive PLACE vs
DirectShape SendGeometry.

**Consequence / known residual:** two live-Revit execution models still coexist (pre-pass +
`window.RevitBridge` for params/geometry; `execute()` + `NovaRevitBridge` for select/place).
This decision removed the duplicate NODES, not the duplicate MODELS. Until they are unified,
**new live Revit nodes follow Model A** (pre-pass + `window.RevitBridge`) — it is the path
running in production and the one bearing the authoritative SEC-013 gate. Unifying the two
models (either wiring `NovaRevitBridge` into the app and migrating pre-pass nodes to
`execute()`, or retiring Model B) is a follow-up.

## 2026-06-04 - Branching/Grouping Is Nested Lists, Not A Tree Type (DataTree Infra Removed)

**Status:** Accepted

**Context:** Milestone M1 work added a `DataTree` core type (`src/core/data-tree.js`,
`src/core/tree-ops.js`) and a `Tree` node category to model branch/path data. The
`Tree` category was already removed in the 2026-06-04 "Node Library Taxonomy" decision
(it duplicated `List.*`), but that decision RETAINED the underlying infra "for a future
milestone." Review concluded the type itself is the wrong abstraction for Nova: it
duplicates the nested-list model the `List.*` category already uses, and because it was
a foreign type nothing else understood, a `DataTree` value rendered as `[object Object]`
in the inspector. The infra had zero importers in `src/` — only its own tests and two
dead display affordances referenced it.

**Decision:** Nova's data model is **values + (nested) lists with lacing**.
Branching/grouping/nesting is expressed as a **list of lists** and handled by the
existing `List.*` category — `List.Chunk` (size 1 = graft; size N = partition),
`List.Transpose` (flip matrix), `List.Flatten`, `List.GroupBy`, `List.Sort`. There is
**no** tree type. The dead infra is removed: `src/core/data-tree.js`,
`src/core/tree-ops.js`, and their tests are deleted; the `DataTree` test case in
`tests/format-value.test.js`, the `DataTree` branch in `app.formatValue`/
`_formatItemInline`, the `['datatree','datatree']` row in `node-renderer.js`'s
`KERNEL_TYPE_MAP`, and its `inspector-type-warnings` assertions are removed with it.
This **supersedes** the "infra is RETAINED / DataTree exposure deferred" clause of the
2026-06-04 "Node Library Taxonomy" decision.

**Rationale:** One data model, one set of operators. A parallel tree type splits the
mental model, duplicates `List.*`, breaks rendering/interop (foreign type →
`[object Object]`), and fragments the AI's signature map. Nested lists already do
everything a tree did, with nodes the engine, inspector, and AI already understand.

**Consequences:** Do not reintroduce a `DataTree`/tree type or a node category that
duplicates `List.*`. New list/nesting behavior folds into the `List.*` category.
"Re-expose DataTree as nodes" is no longer a roadmap item.

## 2026-06-04 - Node Library Taxonomy: Fold New Nodes Into Existing Categories (No Parallel Categories)

**Status:** Accepted

**Context:** Recent milestone work (T2 Transform, T5/M2 Evaluate, T6/M2 Tree)
introduced three NEW top-level node categories — `transform`, `evaluate`, and
`tree` — that ran parallel to, and fragmented, the existing library taxonomy.
Several of their nodes were outright duplicates: `Geometry.ArrayLinear` /
`Geometry.ArrayPolar` duplicated the existing `Geometry.LinearArray` /
`Geometry.PolarArray`; the entire `tree` category (`Tree.Transpose`,
`Tree.Flatten`, `Tree.GroupByKey`, `Tree.Partition`, plus `List.SortByKey`)
duplicated existing `List.Transpose` / `List.Flatten` / `List.GroupBy` /
`List.Chunk` / `List.Sort`. Many descriptions also referenced
"Grasshopper"/"Dynamo" by name ("Mirrors Grasshopper …").

**Decision:** New nodes fold into their EXISTING home category; we do not create
parallel categories. Specifically:
- `Geometry.Orient` → `geometry`; `Plane.ByOriginXAxisYAxis` → `plane`.
- `Curve.PointAtParameter` / `TangentAtParameter` / `FrameAtParameter` /
  `Divide` → `curves`; `Surface.PointAtUV` / `NormalAtUV` / `FrameAtUV` /
  `Divide` → `surfaces`. These are kept because they are parameter/UV-based and
  distinct from the existing point-based `Curve.TangentAtPoint` and the
  patch-splitting `Surface.Subdivide`; their descriptions now state the
  difference explicitly.
- `Geometry.ArrayLinear` / `Geometry.ArrayPolar` are DELETED in favor of the
  existing `Geometry.LinearArray` / `Geometry.PolarArray`. The orphaned
  `Geo.arrayLinearByVector` / `Geo.arrayPolarByAngle` globals are removed from
  `src/geometry/index.js` (this supersedes the array-globals half of the
  2026-06-04 "T1 Count-Based Arrays Coexist…" entry below). `Geo.orient` and
  `Geo.planeFromOriginXY` stay (the moved Orient / Plane nodes still use them).
- The whole `tree` category is removed. The DataTree-only ops (`Tree.Graft`,
  `Tree.Simplify`) had no tree-aware consumers yet, so DataTree NODE exposure is
  deferred to a future milestone. The underlying infrastructure
  (`src/core/data-tree.js`, `src/core/tree-ops.js`) and its tests are RETAINED.
  **(Superseded below: the src/core/data-tree.js / tree-ops.js infra was
  subsequently removed — branching is nested lists, not a tree type.)**
- The `transform.js`, `evaluate.js`, `tree.js` category files and their tests
  are deleted; migrated coverage lives in `tests/library-reorg.test.js`.
- Node descriptions must NOT reference Dynamo or Grasshopper by name; describe
  what the node does on its own terms.

**Rationale:** One node, one home. Parallel categories and duplicate nodes
confuse discovery, split the AI's signature map, and create two ways to do the
same thing. Product/vendor names in descriptions are noise and date the library.

**Consequences:** Future node work adds to the existing category that owns the
node's noun (Curve.*→curves, Surface.*→surfaces, Geometry.*→geometry, etc.).
Re-exposing DataTree as nodes is a future milestone that must ship with
tree-aware consumers, not standalone ops that duplicate List.*.
**(Superseded — no longer planned.)** The
`tests/library-reorg.test.js` registration + codegen-resolve guard must stay
green.

## 2026-06-04 - T1 Count-Based Arrays Coexist With Legacy Arrays On The Global Geo

**Status:** Superseded in part (2026-06-04 "Node Library Taxonomy" above) — the
`Geo.arrayLinearByVector`/`Geo.arrayPolarByAngle` globals and the duplicate
`Geometry.ArrayLinear`/`Geometry.ArrayPolar` nodes were removed; `Geo.orient`
and `Geo.planeFromOriginXY` are retained.

**Context:** The modern Transform nodes (`src/nodes/categories/transform.js`)
execute() against the T1 ES-module kernel (`src/geometry/frames.js`,
`src/geometry/transforms.js`), but their `codegen.python`/`codegen.csharp` emit
`Geo.<name>(...)` calls that run against the assembled **global** `Geo` object at
runtime (pyrunner builds its `Geo` from `window.Geo`). Two problems shipped: (1)
`Geo.orient`/`Geo.planeFromOriginXY` were never attached to the global `Geo`
(frames.js/transforms.js are not part of the global-Geo assembly), so generated
code threw "undefined"; (2) `Geo.arrayLinear`/`Geo.arrayPolar` *do* exist on the
global `Geo` but as the **legacy** implementations in `geo-advanced.js` with
different semantics — legacy `arrayLinear(geometry, direction, count, spacing)`
is spacing-based and legacy `arrayPolar(geometry, center, axis, count)` is
full-turn-only (no angle arg). The T1 versions the nodes use are
count + per-step-vector and count + total-angle, so generated code silently
produced different geometry than the live preview. The static code-validator
allow-list is derived from `codegen.python`, so validation falsely passed.

**Decision:** The T1 frame/transform helpers are attached to the shared global
`Geo` in `src/geometry/index.js` (the global-Geo assembly point, alongside the
`geo-advanced.js` side-effect import and `window.Geo`). The orient/plane helpers
keep their names — `Geo.orient` = `transforms.orient`, `Geo.planeFromOriginXY` =
`frames.planeFromOriginXY`. The T1 array helpers, whose names are already taken
on the global `Geo` by the legacy implementations that the legacy
`Geometry.LinearArray`/`Geometry.PolarArray` nodes depend on, are exposed under
**new, non-colliding** names: `Geo.arrayLinearByVector` = `transforms.arrayLinear`
(count + per-step vector) and `Geo.arrayPolarByAngle` = `transforms.arrayPolar`
(count + total-angle in radians). The four transform-category nodes' codegen now
calls these resolving globals with argument order/semantics that exactly match
each node's execute() (the polar node converts degrees → radians in the emitted
call, mirroring execute()). The legacy globals are left untouched so existing
legacy nodes keep their behavior. A guard test (`tests/transform-codegen.test.js`)
asserts every `Geo.<name>` token emitted by each transform node's
codegen.python/csharp resolves to a function on the assembled global `Geo`.

**Rationale:** Generated code must produce the same geometry as the in-app
preview. Renaming or overwriting the legacy `arrayLinear`/`arrayPolar` globals
would break the legacy array nodes; introducing distinct names lets both the
spacing/full-turn convention and the count+vector/count+angle convention coexist
without ambiguity.

**Consequences:** Two array conventions now live on the global `Geo`. Future
work may converge them (e.g. retire the legacy spacing/full-turn globals once the
legacy `Geometry.LinearArray`/`Geometry.PolarArray` nodes migrate to the count
convention), at which point the `*ByVector`/`*ByAngle` names could become the
canonical `arrayLinear`/`arrayPolar`. Until then, any new node that emits a
`Geo.array*` call must pick the global whose semantics match its execute(), and
the transform-codegen guard test must stay green.

## 2026-06-03 - Two-Tier, Source-Of-Truth Documentation + Multi-Agent Operating Model

**Status:** Accepted

**Decision:** Docs are reorganized into two tiers. **Tier 1** is two top-level
files: [`../NOVA.md`](../NOVA.md) — the single living source of truth (product,
architecture, design patterns, current status, roadmap, doc index) — and
[`../ENGINEERING.md`](../ENGINEERING.md) — the coding + multi-agent operating
rules (consolidating the former `AGENTS.md`, `ai-agent-token-guide.md`, and
`agent-merge-checklist.md`, which are deleted). **Tier 2** is the detailed specs,
now under `docs/architecture/` (`decisions.md`, `deployment.md`,
`accounts-collaboration.md`, `revit-connect.md`) and `docs/design/`, plus the live
logs `agent-handoff.md` and the new `agent-workboard.md`. Every Tier-2 doc links
back up to NOVA.md.

Multiple agents work concurrently via **git-worktree isolation** (one lane folder
per agent), **module-ownership partitioning** (disjoint path globs per agent, see
NOVA.md §3), a live claim board (`agent-workboard.md`), and **hot-file
serialization**. Roles are defined as custom subagents in `.claude/agents/*.md`.

**Rationale:** One big-picture file means any change can be checked against the
whole; one rules file removes the triple-duplicated agent guidance; worktrees +
ownership let several agents code at once without touching the same bytes.

**Consequences:** Update NOVA.md in the same branch as any architecture/pattern/
roadmap change. This entry supersedes *2026-06-01 - Documentation Is
Decision-Oriented And Agent-Friendly* below (the doc set it described has moved).

## 2026-06-02 - Streaming Reasoning Block (Anthropic Extended Thinking, P2/P3)

**Context:** Users want to see "what it thought and thinks at the moment". The
Anthropic models Nova uses (Sonnet/Opus 4.x) support extended thinking, but the
SSE parser only read `text_delta` and the request never enabled thinking.

**Decision:** `callStream` requests Anthropic extended thinking
(`thinking: {type:'enabled', budget_tokens: THINKING_BUDGET}`, with temperature
forced to 1 and max_tokens bumped above the budget — both required by the API) and
parses `thinking_delta` via `extractThinkingDelta`, routed to an `onThinking`
callback. The chat renders it into a collapsible **Thinking** block (its own
message above the answer, open while streaming, auto-collapses on done). Gating:
thinking-capable Anthropic models only (`isThinkingModel`), the streaming chat path
only (utility JSON calls stay clean), and disableable via `localStorage
'nova:ai-thinking' = 'off'`. Non-Anthropic providers (incl. the free proxy) simply
show no block. See `docs/design/ai-chat-experience.md`.

## 2026-06-02 - Chat Turns Persist The Answer; Artifacts Append Below (P1)

**Context:** The assistant rendered a turn into one mutable bubble that got
overwritten — streaming collapsed to "Thinking…" once code appeared, and a
plan/code reply replaced the bubble with an artifact card, discarding the reasoning
the user watched stream ("loses track of thinking").

**Decision:** First phase of the chat response architecture (see
`docs/design/ai-chat-experience.md`). The streamed answer/reasoning is finalized
into its own bubble and persists; plan/code/approve UI now renders into a separate
`.chat-artifact` block appended *inside* that bubble (a child div, so it stacks
below the prose without disturbing the chat-msg flex row) via
`app._appendArtifactBubble`. The duplicate explanation was dropped from the
artifact headers since the prose now lives in the persistent answer. Later phases
add a collapsible Thinking disclosure (P2), real Anthropic extended-thinking
streaming or a derived step timeline (P3), and agentic affordances (P4).

## 2026-06-02 - A Single Value Wired To A List Input Is A One-Item List

**Context:** List-consuming nodes (Solid.ByLoft, List.*, Math.Sum) failed when
wired a single object instead of an array — their execute did `.map`/`.length` on
a non-array — and the inspector flagged "expects list but received object".

**Decision:** `resolveInputs` (nodes/runtimeAdapter.js) auto-promotes a single
non-null value to a one-item list for any `type: 'list'` input (arrays and
null/undefined are left as-is), matching Grasshopper/Dynamo "single → list of one"
behavior. The inspector type-check no longer warns when a non-list value arrives
at a list port. Note on lacing: nodes with a `list` input are intentionally NOT
auto-laceable (isAutoLaceable returns false) and show no lacing dropdown — lacing
("map over the incoming list per item") only applies to scalar-input nodes; a
list-consuming node takes the whole list and has nothing to fan out.

## 2026-06-02 - Custom.Python Input Ports Are Inferred From Free Variables

**Context:** Port derivation was asymmetric. A headerless Custom.Python cell's
OUTPUT followed its last assignment, but its INPUTS were always a generic
`input0` — the free variables the cell actually reads (`panels`, `extrude_dir`)
never became ports, so there was nothing to wire into them. "Type code → ports
appear" only worked for outputs.

**Decision:** `inferInputPorts(code)` in `runtime/python-port-decl.js` derives
input ports from the cell's free variables — identifiers read but never assigned,
excluding Python keywords, the runtime built-ins, the injected bridge globals
(`Geo`/`RevitBridge`/`HostRegistry`), loop vars, and def params. The runtime
already injects each input by its port name, so a `panels` free var → `panels`
port → the wired value lands in `panels`. `resolvePythonPorts`/`nextPythonPorts`
make these inferred inputs authoritative **only when free vars are detected** (so
code with no free vars preserves existing manual/wired inputs, and a `# in:`
header — which the + button writes — still overrides everything). This replaces
the earlier "without a header, preserve existing inputs" rule for the case where
the code's free variables are knowable.

## 2026-06-02 - Unhandled App Errors Auto-File Bug Tickets

**Context:** The app should surface its own bugs without relying on users to
report them. A consent-based feedback→GitHub pipeline and an authenticated
`POST /api/feedback/ticket` (→ GitHub issue, `submitTicket({title,body,category})`)
already existed; the missing piece was an automatic trigger. Product decision:
fully automatic (toast only), triggered by unhandled app errors.

**Decision:** `app/auto-bug-reporter.js` (`installAutoBugReporter`, wired in
`installAfterAppInit`) listens for `window` `error` / `unhandledrejection` and
auto-files a ticket via the existing `submitTicket`, then toasts. Pure helpers in
`ai/bug-reporter.js` decide reportability, fingerprint errors (normalizing origin
+ line/col so a bug dedups across reloads), and format the issue. It is fenced so
it cannot spam: signed-in only (the endpoint is authenticated and attaches the
verified reporter), noise-skipped (empty / bare cross-origin "Script error."),
deduped within the session and across reloads (localStorage fingerprints), capped
per session, and disableable via `localStorage 'nova:auto-bug-tickets' = 'off'`.
Failures inside the handler are always swallowed — the reporter must never throw.
Only "unhandled app errors" trigger it; node runtime errors keep the per-node
"Ask AI" path.

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
documented in `docs/architecture/deployment.md`.

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

**Status:** Superseded by *2026-06-03 - Two-Tier, Source-Of-Truth Documentation*
(the doc paths below have moved; kept for history).

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
