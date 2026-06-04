# Agent Handoff Log

> ↑ Big picture: [`NOVA.md`](NOVA.md). Live ownership: [`agent-workboard.md`](agent-workboard.md).

Use this file for short-lived task handoffs between agents. Permanent
architecture choices belong in `docs/architecture/decisions.md`.

Add a new entry at the top when a task leaves context the next agent needs.
Keep entries compact and delete or archive stale entries when they are no
longer useful.

> Note: entries dated before 2026-06-03 reference the old doc paths
> (`docs/architecture-decisions.md`, `docs/deployment-guide.md`, etc.). Those docs
> now live under `docs/architecture/` — see [`NOVA.md`](NOVA.md) §7 for the map.

## 2026-06-04 - FM-M0: Forma bridge skeleton (feat/fm-m0-forma-bridge-skeleton)

**Agent/branch:** Trinity (connect-engineer) — `feat/fm-m0-forma-bridge-skeleton` (off `develop`; do not merge/push)

**Goal:** Build the FM-M0 skeleton for the Forma track (Option B, per
`docs/architecture/revit-forma-node-plan.md` §7 DECISION): a `NovaFormaBridge`
client interface mirroring `revit-bridge`'s async-handle shape, with inert
method STUBS (no live SDK, no live relay); the Option B design doc; the Forma
extension scaffold; and a platform handoff for the Durable Object pairing room.
NO `forma`-category nodes (that is FM-M1).

**Claimed files (owned, EDIT/NEW only these):**
- NEW `src/integrations/forma/forma-bridge.js` (NovaFormaBridge stubs + protocol message types)
- NEW `docs/architecture/forma-connect.md` (Option B design doc)
- NEW `integrations/forma-extension/README.md` (extension scaffold)
- NEW `integrations/forma-extension/manifest.json` (stub manifest)
- NEW `integrations/forma-extension/index.html` + `src/main.js` (stub entry, no live SDK)
- NEW `tests/forma-bridge.test.js` (interface + unpaired-reject test)
- EDIT `docs/agent-handoff.md` (this entry + the Link platform DO handoff below)

**Decisions referenced:** `revit-forma-node-plan.md` §7 DECISION (Option B, cloud
relay not localhost, no Forma write-approval gate). No new `decisions.md` entry —
the decision was already recorded on develop (commit 254b383).

**Known gaps (FM-M1 owners):** stubs reject with `FORMA_NOT_PAIRED` /
`NOT_IMPLEMENTED_FM1`; no live Forma SDK calls, no live relay, no nodes. The
Durable Object pairing room is a handoff to Link (see entry below).

**Merge status:** Open branch (committed, not pushed/merged).

---

## 2026-06-04 - PLATFORM HANDOFF → Link: Forma DO pairing room (FM-M1)

**From:** Trinity (connect-engineer), branch `feat/fm-m0-forma-bridge-skeleton`.
**To:** Link (platform-engineer), to implement in **FM-M1**. **Do not build here.**

**Goal:** A Cloudflare **Durable Object pairing room** that relays JSON envelopes
between the Nova Forma extension iframe (`forma-extension` peer) and the standalone
Nova app (`nova-app` peer), joined by a **pairing code**. This is the Forma transport
(cloud relay), the analogue of Revit's localhost hub — see
[`architecture/forma-connect.md`](architecture/forma-connect.md). Reuse the existing
ProjectRoom DO infra/patterns ([`architecture/accounts-collaboration.md`](architecture/accounts-collaboration.md)).

**Interface (proposed — refine in FM-M1):**
- **Room key = pairing code.** One DO instance per pairing code (idFromName).
- **Join:** `GET /forma-room/:code` → WebSocket upgrade. Peer announces role in a
  `hello` frame (`source: 'nova-app' | 'forma-extension'`). Room accepts at most one
  peer per role; a third/duplicate join is rejected.
- **Relay:** the room forwards a request envelope from one peer to the other and the
  reply back, keyed by envelope `id` (mirror NovaConnectClient's pending-by-id model).
  Run `validateFormaMessage` (from `src/integrations/forma/forma-bridge.js`) **before
  routing**; reject + audit on validation failure (do not relay).
- **Presence:** emit `peer.connected` / `peer.disconnected`; the Nova bridge flips
  `isPaired()` on both-peers-present.
- **Lifecycle:** room is created on first join; torn down when the pairing code expires
  or is revoked, or after both peers disconnect + an idle timeout.

**Pairing code (backend, authoritative — Link owns):** ≥128 bits entropy; default 24h
expiry; **one-time join** (a stale/used code is rejected); **revocable** via an admin
path. Carries no Forma credentials and no Nova enterprise secrets.

**Security:** no provider API keys / enterprise secrets transit the room; Forma writes
need NO approval gate (owner decision) but are pairing-scoped + auditable at the room
(emit per-operation audit events keyed by pairing room/code).

**Owned files (Link, FM-M1):** `worker/` (the DO + route), backend pairing-code issuance
in `src/enterprise/` + worker routes. Trinity owns the Nova-side relay client wiring into
`NovaFormaBridge` (injected `options.relay`) and the extension relay loop
(`integrations/forma-extension/`).

**Not in FM-M0:** the room itself, the relay client, the pairing-code backend.

---

## 2026-06-04 - Revit add-in ribbon: two-button On/Off + Open Nova (feat/revit-connect-ribbon)

**Agent/branch:** Connect/Revit Engineer — `feat/revit-connect-ribbon` (off `develop`; do not merge/push)

**Goal:** Replace the single "Add-Ins > External Tools > Nova Connect" command with a
Revit ribbon panel ("Nova Connect" on the built-in Add-Ins tab) created by a new
`IExternalApplication`. Two buttons: (1) a connection On/Off toggle (red dot →
green dot) that starts the hub + `NovaHostClient`; (2) "Open Nova" that launches the
PRODUCTION web app (https://hi-nova.work/) in the browser with the connect auto-params.

**Claimed files (owned, EDIT/NEW only these):**
- NEW `integrations/revit-addin/NovaConnectApp.cs` (IExternalApplication, ribbon)
- NEW `integrations/revit-addin/ConnectionToggleCommand.cs` (toggle command)
- NEW `integrations/revit-addin/DotIcons.cs` (programmatic red/green dot ImageSources)
- EDIT `integrations/revit-addin/OpenNovaCommand.cs` (now just opens the prod site)
- EDIT `integrations/revit-addin/NovaConnectSettings.cs` (DefaultNovaUrl → prod)
- EDIT `integrations/revit-addin/Nova.addin.template` (register the Application)
- EDIT `docs/architecture/revit-connect.md`, `docs/agent-handoff.md` (this entry)

**Follow-up flagged (hub bundling):** the hub still requires a Nova git checkout + Node
(via `NovaLocalPaths.FindRepoRoot` / `NOVA_REPO_ROOT`) until the installer bundles a
self-contained hub — so the connection toggle only goes green on a dev machine (or with
`NOVA_REPO_ROOT` set). The toggle fails gracefully (stays red + TaskDialog) otherwise.
See the "Connection toggle and the hub-bundling follow-up" section in revit-connect.md.

**Merge status:** Open branch `feat/revit-connect-ribbon` — IN PROGRESS, do not merge.

## 2026-06-04 - FIX: Revit parameter-node duplicates consolidated (fix/revit-node-dedup)

**Agent/branch:** Core/Runtime Engineer — `fix/revit-node-dedup` (do not merge/push)

**Bug (user-reported):** the Revit category shipped two functional duplicates that
passed the type-collision check only because their `type` strings differed:
- get-params: `revit-get-parameters` (Revit.GetParameters, M4) duplicated
  `revit-get-parameter-values` (Revit.GetParameterValues).
- set-params: `revit-set-parameters` (Revit.SetParameters, M4) duplicated
  `revit-set-parameter-values` (Revit.SetParameterValues).

**Which way we consolidated (and why it INVERTS the brief's recommendation):**
kept the `*-parameter-values` nodes, removed the M4 `*-parameters` nodes. The brief
guessed the M4 `execute()` nodes were the live/intended path, but the evidence is the
opposite:
- The M4 param nodes resolve `globalThis/window.NovaRevitBridge`, which is **never wired
  into the running app** (`src/main.js` only installs `window.RevitBridge`). They worked
  only in unit tests with an injected `context.revitBridge`.
- The `*-parameter-values` nodes ARE the app-wired live path: `engine.js`
  `_prepareLiveRevitGeometries()` runs them against `window.RevitBridge.getLiveParameterValues
  / setLiveParameterValues`, and `setLiveParameterValues` carries the **full SEC-013
  server-issued-token flow** (`acquireWriteApproval` + `reportHostWrite`) — strictly stronger
  than the M4 node, which only passed approval *metadata* through.
- They also take a **batch list** of elements (the more useful form), vs the M4
  single-element contract.

So the survivors satisfy the brief's required traits: codegen fallback (yes), SEC-013
write gate (server-side, the authoritative form), batch/list API (yes), one clear
canonical name each. The one trait they don't have is a def-level `execute()` — they run
live via the engine async pre-pass instead (see architectural note below).

**Edits (Core/Runtime owned only):**
- `src/core/nodes.js`: removed `revit-get-parameters` + `revit-set-parameters` defs and the
  now-unused `toElementId` helper; updated the header comment. Kept the M4 select/place
  nodes (they share `resolveRevitBridge`/`buildApprovalMeta`/`splitNames`/`extractElementIds`).
- `src/core/node-metadata.js`: added Revit NODE_META so the genuinely-distinct nodes don't
  read as duplicates — interactive SelectElements/SelectFaces vs programmatic
  AllElementsInActiveView/AllElementsOfCategory; family-instance/adaptive PLACE vs DirectShape
  SendGeometry; plus canonical get/set-parameter-values entries.
- `tests/revit-host-nodes.test.js`: trimmed the M4 node lists from six to four, removed the
  GetParameters/SetParameters describe blocks, swapped the WRITE dispatch guard to
  `revit-place-family-instance`, and added a dedup guard (removed types are undefined, exactly
  one get/one set param node, full canonical Revit inventory asserted).

**Architectural concern flagged (TWO execution models still coexist):** live Revit nodes run
through two different bridges/dispatch paths — (1) the engine async pre-pass against
`window.RevitBridge` (the app-wired, SEC-013-bearing path used by element-geometries,
parameter-values, send-geometry), and (2) the registry `execute()` dispatch against
`NovaRevitBridge` (used by select/place; NovaRevitBridge is not wired in the app yet). This
dedup removed the duplicate param NODES but did not unify the two MODELS. Follow-up: either
wire `NovaRevitBridge` into the app and migrate the pre-pass nodes to `execute()`, or retire
the `execute()`/NovaRevitBridge path in favor of the pre-pass + `window.RevitBridge`. Until
then, NEW live Revit nodes should follow the pre-pass + `window.RevitBridge` model (it is the
one actually running in production and the one carrying the SEC-013 gate).

## 2026-06-04 - FIX M4-T4: legacy→registry bridge dropped `execute` (F-001/F-002)

**Agent/branch:** Core/Runtime Engineer — `feat/m4-host-node-defs` (fix in place, do not merge/push)

**Bug (reviewer F-001/F-002):** The 6 M4 Revit host nodes in `src/core/nodes.js` define
an async `execute`, but they reach the live engine only via the registry: the engine's
`default:` branch runs `getLiveCoreRegistry().getNode(type)` and dispatches only when
`typeof registryNode.execute === 'function'`. Legacy nodes flow into the registry through
`legacyCoreNodes` → `legacyNodeToRegistryDefinition` (`src/nodes/legacyBridge.js`), which
did NOT copy `execute`; `defineNode` then stored `execute: null`. So execute was reachable
only via `NODE_TYPE_MAP` (what the unit tests called) — never via the engine. The nodes
were inert in the app (output undefined).

**Fix (in scope: legacyBridge + tests only):**
- `src/nodes/legacyBridge.js`: `legacyNodeToRegistryDefinition` now carries
  `execute: node.execute || undefined` through to the registry definition, mirroring how
  `toLegacyNodeDefinition` (registry.js) already preserves execute. `defineNode` keeps its
  `execute: definition.execute || null` rule, so pure-codegen legacy nodes (the vast
  majority — `revit-element-geometries`, `host-get-elements`, `rhino-objects-by-layer`,
  etc.) stay `execute: null`: ZERO behavior change for them. Only nodes that DEFINE an
  execute (the 6 M4 nodes) become engine-reachable.
- `tests/revit-host-nodes.test.js`: added an "engine registry path (F-001/F-002 wiring
  guard)" block that asserts each M4 node's `execute` is a function on
  `getLiveCoreRegistry().getNode(type)` (the exact predicate the engine gates on) AND on a
  fresh `createCoreNodeRegistry()`, asserts pure-codegen legacy nodes still have NO execute,
  and drives two nodes through `executeRegistryNodeUnlaced` (the engine's dispatch helper)
  with a mocked bridge. This guard fails if the bridge ever drops execute again.

**Registry execute is now reachable — proven by the new guard test.** Without this fix
execute was never called by the engine; with it, the engine's `default:` branch invokes
`executeRegistryNodeUnlaced(registryNode, …)`.

**RESIDUAL — app/engine async pre-pass (NOT done here, out of scope):** the engine's
`computeNodeValue` is SYNCHRONOUS. These M4 nodes' execute is `async`, so the registry-path
dispatch returns an unresolved Promise; the sync compute path does not await it, so a LIVE
round-trip still won't surface the resolved selection/place/param values yet. The OLDER
legacy Revit nodes solve this with `app._prepareLiveRevitGeometries` (`src/core/engine.js`,
awaited in `runGraph` before the sync compute) which resolves the bridge calls and caches
results onto `nd._liveXxxResult`; a sync `case` then reads the cache. The 6 M4 nodes are
NOT yet wired into that pre-pass. Completing the live round-trip needs either (a) extending
the pre-pass to resolve these nodes' execute and cache the result, or (b) an
await-aware compute for async registry nodes. That touches the app-layer run loop / pre-pass
wiring beyond the legacyBridge fix and was intentionally left as a follow-up.

## 2026-06-04 - SEC-013: wire the server-side write-approval token end-to-end

**Agent/branch:** Connect/Revit Engineer — `feat/sec-013-revit-write-gate`

**Goal:** the domain token gate (issue/consume) was sound but NOT wired at runtime.
Wire it: add `POST /api/host-write-approvals` (issue) and make
`POST /api/host-operations` REQUIRE+CONSUME a server token (authoritative
consumer + audit-as-precondition); implement `issueWriteToken` in
revit-write-approval.js and expose it on `window.__revitWriteApproval`; make
client.js `normalizeWriteApproval` preserve `token/approvalId/operation/graphVersion`
and stop defaulting `{approved:true}`.

**Claimed files (owned):** `src/integrations/connect/revit-write-approval.js`,
`src/integrations/connect/client.js`, `src/integrations/revit/revit-nodes.js`,
`src/enterprise/api-dispatch.mjs`, `src/enterprise/validation.mjs`,
`src/enterprise/cloud-client.js`, `src/main.js` (hot file, minimal touch),
`docs/architecture/revit-connect.md`, `docs/NOVA.md`, SEC-013 ticket + INDEX, tests.

## 2026-06-04 - M4-T2: C# Revit add-in handlers for the round-trip

**Agent/branch:** Connect/Revit Engineer — `feat/m4-revit-addin-handlers` (off `develop` @ 25763c7)

**Goal:** Implement the C# Revit add-in handlers for the M4 round-trip, pinned to the
M4-T1 contract in `src/integrations/connect/protocol.js`: `selection.query` →
`selection.result` (elements + optional planar faces), `geometry.place`
(FamilyInstance via `NewFamilyInstance`, AdaptiveComponent via
`AdaptiveComponentInstanceUtils`) under the existing write-approval gate, and the
contract-shaped `parameter.get` / `parameter.set` (singular `elementId` + `params`
map; set honors the approval gate).

**Claimed files (owned):** EDIT `integrations/revit-addin/NovaHostClient.cs` only.
READ-only on `src/integrations/connect/protocol.js`. NOT touching any `src/**` or
`worker/**`.

**Merge status:** Open branch `feat/m4-revit-addin-handlers` — IN PROGRESS, do not merge.

## 2026-06-04 - M4-T3: Browser-side RevitBridge to the M4 protocol

**Agent/branch:** Connect/Revit Engineer — `feat/m4-browser-bridge` (off `develop` @ 25763c7)

**Goal:** Browser bridge that builds M4-T1-contract envelopes and pushes them over
NovaConnectClient for the Revit round-trip (selection.query / geometry.place /
parameter.get / parameter.set), validating every request client-side.

**Claimed files (owned):** NEW `src/integrations/revit/revit-bridge.js`, NEW
`tests/m4-bridge.test.js`, EDIT `src/integrations/connect/client.js` (added FOUR new
M4 send methods only). READ-only on `protocol.js` (M4-T1), `revit-nodes.js`
(SEC-013/M4-T4), `connect-panel.js` (M4-T5), `integrations/revit-addin/**` (M4-T2),
`src/core/nodes.js`. None of those were touched.

**Bridge API surface (M4-T4/T5 pin to this):**
- `requestSelection(opts, deps?) -> { elements: ContractElement[] }` — sends
  `selection.query` ({ categories?, includeFaces? }); parses `selection.result` into
  the contract element shape (id coerced to string, params flat-scalar, optional faces).
- `placeInstance(spec, deps?) -> placeResultPayload` — sends `geometry.place`
  ({ kind, familyType, points, hostFaceId?, params? }); normalizes {x,y,z}/single point
  to [x,y,z] tuples; forwards optional `spec.approval` metadata (WRITE).
- `getParameters(elementId, names, deps?) -> { elementId, params:{name:value} }` — sends
  `parameter.get` with the NEW contract ({ elementId, params } mirror, null placeholders).
- `setParameters(elementId, params, deps?) -> setResultPayload` — sends `parameter.set`
  ({ elementId, params }); forwards optional `deps.approval` metadata (WRITE).
- `BridgeValidationError` (carries `.type` + structured `.errors`) — thrown when a
  request fails client-side `validateMessage`, BEFORE anything leaves the browser.
- `deps.client` injects a client (tests); default is `window.NovaConnect`.

**Legacy coexistence (reviewer flag from M4-T1) — how the legacy path stays intact:**
- The M4 parameter contract `{ elementId, params:{name:value} }` DIVERGES from the
  legacy client methods `getParameterValues/setParameterValues({elementIds,
  parameterName, values})` that `revit-nodes.js` (RevitBridge.getLive/setLive…) still
  calls. I did NOT remove or repurpose those legacy methods.
- Added FOUR NEW, separate client methods instead — `sendSelectionQuery`,
  `sendGeometryPlace`, `sendParameterGet`, `sendParameterSet` — each just sends the
  typed envelope and returns the raw response payload. They are documented in-file as
  intentionally separate from the legacy methods.
- A test asserts the bridge never calls `client.getParameterValues/setParameterValues`.
  Full suite (incl. `connect-panel.test.js` and the revit-nodes path) stays green.

**Migration note (M4-T4's concern):** the legacy `{elementIds, parameterName, values}`
parameter path (client.js `getParameterValues`/`setParameterValues` + revit-nodes.js
`getLiveParameterValues`/`setLiveParameterValues`) should later migrate to the M4
`{elementId, params}` contract — e.g. revit-nodes.js delegating per-element to the new
bridge `getParameters`/`setParameters`, then the legacy client methods can be retired.
That edit touches `revit-nodes.js` (SEC-013/M4-T4-owned), so it is deliberately out of
scope here. Until then both shapes coexist.

**Validation:** `node node_modules/eslint/bin/eslint.js .` → exit 0 (clean). Full
`node node_modules/vitest/vitest.mjs run` → 125 files passed, 1 skipped; 1586 passed,
1 skipped (the spurious invite-redeem-landing teardown error did not surface this run).
New `tests/m4-bridge.test.js` → 21 passed. Fully testable without Revit (mock transport).

**Known gaps:** No live Revit smoke test (the round-trip needs M4-T2's add-in + the
hub's approval UI). Bridge passes approval METADATA through; the interactive approval
dialog + approval_id are the hub's responsibility (server is the authority).

**Merge status:** Open branch `feat/m4-browser-bridge` — committed, NOT merged/pushed.

## 2026-06-04 - M4-T1: Connect protocol/contract for the Revit round-trip

**Agent/branch:** Connect/Revit Engineer — `feat/m4-connect-protocol` (off `develop` @ f9fae48)

**Goal:** Extend `src/integrations/connect/protocol.js` envelope schemas + payload
validators for the M4 round-trip message classes — `selection.query`,
`selection.result`, `geometry.place`, `parameter.set`, `parameter.get`. THIS IS THE
CONTRACT for M4-T2 (C# add-in), M4-T3 (browser bridge), M4-T4 (node defs), M4-T5
(picker UI).

**Claimed files (owned):** EDIT `src/integrations/connect/protocol.js`, NEW
`tests/m4-connect-protocol.test.js`. READ-only on `client.js`, `connect-panel.js`,
`revit-nodes.js`, `connect-hub.cjs`. NOT touching `src/core/nodes.js`,
`integrations/revit-addin/**` (later M4 tasks own those).

**Merge status:** Open branch `feat/m4-connect-protocol` — IN PROGRESS, do not merge.

## 2026-06-04 - T4 (M2): Curve/Surface frame-evaluation kernel

**Agent/branch:** Geometry/Kernel Engineer — `feat/geo-curve-surface-eval` (off `develop` @ 3ee59cc)

**Goal:** Pure kernel functions to evaluate a point, tangent/normal, and an oriented
FRAME at a normalized parameter on curves and surfaces — the substrate paneling and
adaptive-component placement consume (divide → frame per cell → orient family onto it).

**Claimed/changed files:** NEW `src/geometry/curve-eval.js`, NEW
`src/geometry/surface-eval.js`, NEW `tests/geometry/curve-eval.test.js`, NEW
`tests/geometry/surface-eval.test.js`; thin wire EDIT `src/geometry/index.js` (8
`Geo.<name>` assignments + imports). No other files touched. READ-only on
`frames.js`, `transforms.js`, `geometry-lib.js`, `geo-advanced.js`, `nurbs-math.js`.

**Exported signatures (for T5 node codegen):**
- curve-eval.js: `pointAtT(curve, t) → Point3`, `tangentAtT(curve, t) → Vector3`
  (unit), `frameAtT(curve, t) → Plane`, `divideCurve(curve, count) → {points, frames}`.
- surface-eval.js: `pointAtUV(surface, u, v) → Point3`, `normalAtUV(surface, u, v) →
  Vector3` (unit), `frameAtUV(surface, u, v) → Plane`, `divideSurface(surface, uCount,
  vCount) → {points, frames}`.

**Global Geo names added (all verified collision-free vs geometry-lib/geo-advanced/
nurbs-math before assignment):** `Geo.pointAtT`, `Geo.tangentAtT`, `Geo.frameAtT`,
`Geo.divideCurve`, `Geo.pointAtUV`, `Geo.normalAtUV`, `Geo.frameAtUV`,
`Geo.divideSurface`. A guard test asserts every one resolves as a function on the
assembled global `Geo` (mirrors `tests/transform-codegen.test.js`).

**Decisions / conventions:**
- Frames are the SAME `Geo.Plane` shape M1 produces (origin + explicit
  `{xaxis,yaxis,normal}` via `frames.frameAt`), so `Geometry.Orient` consumes
  `frameAtT`/`frameAtUV` directly.
- `frameAtT`: frame NORMAL = unit tangent (curve runs along local Z); in-plane X/Y from
  `frames.frameAt`'s stable world-axis pick (continuous, non-tumbling — avoids Frenet
  inflection flips).
- `frameAtUV`: origin = surface point, normal = surface normal, in-plane X follows dU.
- **Count conventions (Grasshopper):** `divideCurve(curve, count)` — `count` = SEGMENTS,
  so an OPEN curve → `count+1` points (both endpoints), a CLOSED curve (Circle3 / closed
  Polyline3) → exactly `count` points (the coincident final sample is dropped).
  `divideSurface(uCount, vCount)` — segment counts → `(uCount+1)×(vCount+1)` frames,
  row-major (outer u, inner v).
- Reused existing evaluators: `Curve3.pointAt/tangentAt`, `NurbsCurve.evaluate`,
  `NurbsSurface.evaluate/normalAt`, parametric `Surface.evaluate` (mapped from its
  uDomain/vDomain onto [0,1]), and `Geo.evaluateSurface` for grid/mesh (Mesh3) surfaces.
  NURBS params clamp to 0.9999 (same as the kernel's toPoints). Genuinely non-evaluable
  surfaces throw a clear "unsupported surface type" error rather than returning garbage.

**Codegen/contract note:** No `capability-ledger.js` or `golden-examples` exist in this
repo (confirmed); node-catalog/validator allow-lists are derived live from the registry,
so there is nothing to sync until T5 adds the consuming nodes.

**Validation:** `npm.cmd run lint:all` → exit 0 (clean). `npm.cmd test` → 1419 passed,
1 skipped (120 files); the lone "1 error" is the known spurious vitest worker-teardown
hiccup in unrelated `invite-redeem-landing.test.js` (re-ran in isolation → 4 passed
clean). `npm.cmd run build` → built OK. New tests: 21 passed.

**Known gaps:** T5 nodes (Curve/Surface eval + Divide + paneling) consume these next.
3D viewport rendering of frame outputs not exercised headlessly (executes verified in JS).

**Merge status:** Open branch `feat/geo-curve-surface-eval` — committed, not merged.

## 2026-06-04 - FIX: Transform-node codegen now resolves on the global Geo (BLOCKING)

**Agent/branch:** Geometry/Kernel Engineer — `feat/nodes-transform` (fix in place).

**Bug (reviewer-verified):** The four T2 transform nodes execute() against the T1
ES-module kernel, but their `codegen.python`/`codegen.csharp` emitted
`Geo.orient` / `Geo.planeFromOriginXY` (which did **not** exist on the global
`Geo`) and `Geo.arrayLinear` / `Geo.arrayPolar` (which exist on global `Geo` but
as the LEGACY spacing/full-turn implementations with different semantics). The
code-validator allow-list is derived from `codegen.python`, so static validation
falsely passed; generated Python/C# would throw or silently produce different
geometry than the preview.

**Fix:**
- `src/geometry/index.js` (the global-Geo assembly point): import frames.js /
  transforms.js and attach `Geo.orient = transforms.orient`,
  `Geo.planeFromOriginXY = frames.planeFromOriginXY`,
  `Geo.arrayLinearByVector = transforms.arrayLinear` (count + per-step vector),
  `Geo.arrayPolarByAngle = transforms.arrayPolar` (count + total-angle, radians).
  The legacy `Geo.arrayLinear`/`Geo.arrayPolar` globals are left untouched so the
  legacy `Geometry.LinearArray`/`Geometry.PolarArray` nodes keep working.
- `src/nodes/categories/transform.js` codegen (python + csharp + help.sampleCode):
  `Geometry.ArrayLinear` → `Geo.arrayLinearByVector({{geometry}}, {{direction}},
  {{count}})`; `Geometry.ArrayPolar` → `Geo.arrayPolarByAngle({{geometry}},
  {{center}}, {{axis}}, {{count}}, math.radians({{angle}}))` (csharp uses
  `{{angle}} * Math.PI / 180`). `Plane.ByOriginXAxisYAxis` and `Geometry.Orient`
  codegen were already `Geo.planeFromOriginXY` / `Geo.orient`, now resolving.
- NEW `tests/transform-codegen.test.js`: per-node guard asserting every
  `Geo.<name>` token in codegen.python AND codegen.csharp resolves to a function
  on the assembled global `Geo`, plus a check that the new globals match each
  node's execute() output. Scoped to the transform category on purpose.
- `docs/architecture/decisions.md`: recorded the two-convention coexistence.

**Library-wide scan (no fixes applied, follow-up only):** A full scan of every
node's `codegen.python` against the assembled global `Geo` found **zero**
unresolved `Geo.<name>` tokens — no pre-existing offenders elsewhere in the
library.

**Validation:** see "Validation" line in the entry below — re-run after this fix:
`npm.cmd run lint:all`, `npm.cmd test`, `npm.cmd run build` (results in PR/commit).

## 2026-06-04 - T2: Transform & Frame node category

**Agent/branch:** `feat/nodes-transform` (off `develop` @ 8f38965)

**Goal:** Expose the T1 kernel backbone (`src/geometry/frames.js`, `transforms.js`) as
modern Nova nodes in a new category.

**Claimed/changed files:** NEW `src/nodes/categories/transform.js` (owned), NEW
`tests/transform.test.js` (owned), EDITED `src/nodes/coreNodes.js` (one import + two
list pushes — the registry wire; inside owned `src/nodes/**`, not a hot file). No edits
to `src/geometry/**` (READ-only) or any other category file.

**Registry wire (for the integrator/reviewer):** the task referenced
`src/core/node-library.js`, which does not exist. The real category registration is
`src/nodes/coreNodes.js`, exactly mirroring how `plane`/`vector` are wired:
`import { transformCategory, transformNodes } from './categories/transform.js';`, add
`transformCategory` to `modernCategories` and `...transformNodes` to `coreNodes`. Done
on this branch.

**Nodes shipped (all four wired to T1 `transforms.*` / `frames.*` module exports, NOT
the legacy `Geo.array*` globals):**
- `Plane.ByOriginXAxisYAxis` (subGroup Plane) — `origin:point, xAxis:vector,
  yAxis:vector → plane` — `frames.planeFromOriginXY`.
- `Geometry.Orient` (keystone) — `geometry:any, fromPlane:plane, toPlane:plane →
  result:any` — `transforms.orient`. Verified World-XY → tilted-plane end to end.
- `Geometry.ArrayLinear` — `geometry:any, direction:vector, count:number → result:list`
  — `transforms.arrayLinear` (count + per-step vector convention).
- `Geometry.ArrayPolar` — `geometry:any, center:point, axis:vector, count:number,
  angle:number(deg, default 360) → result:list` — `transforms.arrayPolar` (count +
  total-angle, deg→rad).

**Decision / deviation (needs reviewer awareness):** the task also listed
`Geometry.Rotate` and `Geometry.Mirror`. Both **already exist** as canonical node types
in `src/nodes/categories/geometry.js`, and the node registry throws on duplicate `type`
(global key, `registry.js` `registerNode`). I do **not** own that file and must not edit
it, so I did not register colliding duplicates. The existing `Geometry.Rotate` already
takes degrees and calls `Geo.rotate`, and `Geometry.Mirror` calls `Geo.mirror` — the
exact helpers `transforms.rotate`/`transforms.mirror` compose, so T1's rotate/mirror
behavior is already exposed. Open follow-up if the desired convergence is to make
`geometry.js` delegate to `transforms.*` and/or convert its `LinearArray`/`PolarArray`
to the T1 count-based convention (that edit belongs to the geometry-category owner).

**Codegen note:** Python codegen uses `Geo.orient`, `Geo.planeFromOriginXY`,
`Geo.arrayLinear`, `Geo.arrayPolar`. These names are how the registry-driven parser
(`src/runtime/parser.js`) maps a call back to its node, and how `code-validator.js`
derives its known-method allow-list — both are derived from `codegen.python`, so they
stay in sync automatically (no `capability-ledger`/golden-example file exists in this
repo; node-catalog is built live from the registry and its byte-budget test still
passes).

**Validation:** `npm.cmd run lint:all` → exit 0 (clean). `npm.cmd test` (full vitest)
→ 1369 passed, 1 skipped (116 files). `npm.cmd run build` (vite) → built OK. No
`test:geometry` script exists; full suite covers it.

**Known gaps:** Rotate/Mirror convergence above; live 3D viewport rendering of the new
nodes' list outputs was not exercised headlessly (executes verified in JS).

**Merge status:** Open branch `feat/nodes-transform` — committed, not merged.

## 2026-06-04 - T1: Frame & Transform kernel backbone

**Agent/branch:** `feat/geo-frames-orient`

**Goal:** Add pure kernel frame/orient/transform functions (Milestone M1), no nodes/UI.

**Claimed files (NEW, owned):** `src/geometry/frames.js`, `src/geometry/transforms.js`,
`tests/geometry/frames.test.js`, `tests/geometry/transforms.test.js`. READ-only on
`geometry-lib.js`, `geo-advanced.js`, `index.js`. No edits outside owned globs.

**Decisions made:** Stock `Geo.Plane` derives `xAxis()/yAxis()` from its normal and
cannot carry an arbitrary frame; existing consumers call those as *methods*
(`src/nodes/categories/plane.js`). To keep a full orthonormal frame on a Plane
without shadowing the methods, `frames.js` attaches explicit `plane.xaxis`/`plane.yaxis`
(lowercase) own-properties; `orient()` reads those when present and falls back to the
derived axes otherwise. New module exports (`orient`, `rotate`, `mirror`, `arrayLinear`,
`arrayPolar`) carry the T1-contract signatures and compose the existing `Geo.rotate`/
`Geo.mirror` global helpers rather than reimplementing or mutating them.

**Validation:** see Merge status.

**Known gaps:** Node/UI wiring is T2's job.

**Merge status:** merged to `develop` (T1/M1).

## 2026-06-03 - Documentation Restructure + Multi-Agent Operating Model

**Agent/branch:** `docs/restructure-source-of-truth`

**Goal:** Make one living source of truth + one coding-rules file, de-duplicate the
docs, and stand up a multi-agent (worktree + ownership) operating model.

**Changed files:** NEW `docs/NOVA.md`, `docs/ENGINEERING.md`, `docs/agent-workboard.md`,
`scripts/agent-worktree.ps1`, `.claude/agents/*.md` (8 roles); MOVED
`architecture-decisions.md`→`architecture/decisions.md`, `deployment-guide.md`→
`architecture/deployment.md`, `accounts-collaboration.md`→`architecture/`,
`revit-plugin-architecture.md`→`architecture/revit-connect.md`; DELETED `AGENTS.md`,
`ai-agent-token-guide.md`, `agent-merge-checklist.md` (folded into ENGINEERING.md);
EDITED `docs/README.md`, root `README.md`, `.github/workflows/ci.yml`,
`wrangler.toml` (doc-path refs); `git rm --cached` of tracked
`integrations/revit-addin/{obj,bin}` build artifacts.

**Decisions made:** See `2026-06-03 - Two-Tier, Source-Of-Truth Documentation +
Multi-Agent Operating Model` in `docs/architecture/decisions.md` (supersedes the
2026-06-01 documentation decision).

**Content review:** Verified every moved doc against the code — deployment
table/bindings vs `wrangler.toml` + `ci.yml`, `migrate:neon -- up` arg form,
accounts-collab file refs, Revit 2027, and the decision/design code paths all still
exist and match. No stale content found beyond doc-name cross-links (fixed).

**Validation:** stale-reference `rg` sweep, `git diff --check`, `npm.cmd run lint:all`.
Docs + one CI/wrangler string + artifact untracking only — no runtime code changed.

**Known gaps / heads-up:**
- A **stray uncommitted revert** of `docs/accounts-collaboration.md` (back to
  Vercel/Pages language + deleted doc names) was found in the working tree and
  discarded — it contradicted the committed Worker-only decision. Flag if it
  reappears.
- `.claude/scheduled_tasks.lock` is tracked in git — likely shouldn't be; left as-is
  (out of scope).
- Starter worktrees (`../nova-ai`, `../nova-geometry`, `../nova-platform`) are
  created after this branch merges, off the updated `develop`.

**Merge status:** merged to `develop`.

## 2026-06-02 - Python Node Redesign, AI Codegen Fixes, 3D Preview, CI Deploy

**Agent/branch:** many one-task branches off `develop`, all merged `--no-ff` and
deleted — `fix/ai-prompt-geo-signatures`, `fix/ai-type-mismatch-triggers-fix`,
`fix/parser-arith-fallback-diagnostics`, `fix/parser-multiline-literals`,
`feat/python-node-live-ports`, `fix/parser-inline-list-args`,
`feat/python-node-render-redesign`, `feat/python-node-rename-ports`,
`feat/python-node-code-driven-ports`, `feat/python-node-terminal-tabs`,
`fix/code-editor-remove-play`, `feat/preview-terminal-geometry`,
`fix/ci-deploy-skip-without-secrets`, `fix/ci-sanitize-deploy-secrets`.

**Goal:** From three session logs, fix AI geometry-generation failures, redesign the
Custom.Python node + code terminal, fix the loft "coil," and unblock CI deploy.

**Decisions made:** See the four `2026-06-02` entries in
`docs/architecture-decisions.md`.

**Changed files (main):** `src/ai/gpt-client.js`, `src/ai/gpt-integration.js`,
`src/ai/type-validator.js`, `src/runtime/parser.js`, `src/runtime/python-port-decl.js`,
`src/runtime/pyrunner.js`, `src/ui/node-renderer.js`, `src/app/app.js`,
`src/core/engine.js`, `.github/workflows/ci.yml`, `docs/deployment-guide.md`; tests in
`tests/python-node-overhaul.test.js`, `tests/parser-python-output-ports.test.js`.

**Validation:** Full `vitest` suite green (1143 passed, 1 skipped); pure parser/port
logic is unit-tested; the node-renderer, code-terminal, and 3D-preview changes were
verified in-app with Playwright (real DOM + a WebGL 3D render).

**Known gaps / follow-ups:**
- CI deploy still needs a valid `CF_API_TOKEN` with *Workers Scripts: Edit* +
  *Workers KV Storage: Edit* on the `ey.myacc@gmail.com` account, and a matching
  `CF_ACCOUNT_ID`. The two existing dashboard tokens are not suitable as-is.
- The loft "coil" was an intermediate-preview issue, not a loft bug — `Geo.loft` is
  correct.
- Headless tests can't exercise live DOM rendering of `List.Create` item ports beyond
  the default two; the common cases were checked in-app.
- Durable next step (not done): have the AI emit a structured node+wire list instead of
  raw Python, which would retire the parser's free-form-Python fragility class.

**Merge status:** All merged to `develop` (in sync with `origin/develop`).

## 2026-06-01 - Agent Documentation Cleanup

**Agent/branch:** `docs/agent-collaboration-cleanup`

**Goal:** Reduce stale documentation and create a multi-agent collaboration doc
set with token guidance, architecture decisions, handoff notes, and merge checks.

**Changed files:** `README.md`, `docs/README.md`, `docs/AGENTS.md`,
`docs/ai-agent-token-guide.md`, `docs/architecture-decisions.md`,
`docs/agent-handoff.md`, `docs/agent-merge-checklist.md`,
`docs/enterprise-api.env.example`, `docs/accounts-collaboration.md`,
`src/ai/gpt-client.js`.

**Decisions made:** See `2026-06-01 - Documentation Is Decision-Oriented And
Agent-Friendly` in `docs/architecture-decisions.md`.

**Validation:** Stale-reference search, `git diff --check`, and
`npm run lint:all` passed. No runtime tests were run because this branch changes
docs and one code comment only.

**Known gaps:** Consider adding a machine-readable task manifest later if agents
need automated handoff discovery.

**Merge status:** Merged to `develop`.

## Entry Template

```markdown
## YYYY-MM-DD - Task Title

**Agent/branch:** `<branch-name>`

**Goal:** One sentence.

**Changed files:** `path`, `path`

**Decisions made:** Link to `docs/architecture/decisions.md` entries or summarize.

**Validation:** Commands run and result.

**Known gaps:** Follow-ups, unrun checks, or external setup needed.

**Merge status:** Open branch | merged to `develop` | blocked.
```

## 2026-06-01 - Cloudflare Worker-Only Deployment Cleanup

**Agent/branch:** `chore/cloudflare-worker-only-cleanup`

**Goal:** Remove Vercel/Cloudflare Pages deployment assumptions and make Worker
deployment the only path.

**Changed files:** `.github/workflows/ci.yml`, `wrangler.toml`,
`worker/index.mjs`, `docs/deployment-guide.md`, `docs/accounts-collaboration.md`,
`api/feedback/refusals.mjs`, `api/proxy/chat.mjs`, `vite.config.js`,
`src/ai/gpt-integration.js`, `tests/feedback-pipeline.test.js`.

**Decisions made:** See `2026-06-01 - Cloudflare Worker Is The Only Deployment
Target`, `Keep AI Provider Helpers Shared`, and `Feedback Refusal Endpoint Runs
Through Worker` in `docs/architecture-decisions.md`.

**Validation:** Targeted proxy/feedback tests, `npm run lint:all`,
`npm run build`, and Worker dry-runs for prod/dev passed.

**Known gaps:** Dev currently reuses production KV namespace IDs until separate
dev KV namespaces are created.

**Merge status:** Merged to `develop`.
