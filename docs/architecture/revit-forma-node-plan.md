# Revit 2027 & Forma Node Libraries — Implementation Plan (PLAN ONLY)

> Status: **proposal / plan only**. No node code is built by this document. It
> exists to be reviewed: the node-name lists, phasing, and lane assignments below
> are the thing to approve before any milestone branch is opened.
>
> Companions: [`../NOVA.md`](../NOVA.md) (node rules + the fit gate, §4),
> [`revit-connect.md`](revit-connect.md) (Connect/Revit transport, SEC-013 write
> gate). Source of node truth today: `src/core/nodes.js` (`revit`/`host`/`rhino`
> categories) and `src/nodes/categories/*.js` (modern producers/consumers).
>
> Created: 2026-06-04. Branch: `docs/node-libraries-plan`.

---

## 0. Reality framing — why this is NOT "wrap the entire API"

The literal Revit 2027 API (https://www.revitapidocs.com/2027/) exposes **thousands**
of public members across hundreds of classes; the Forma Developer Platform / Embedded
View SDK exposes a smaller but still broad async surface. A 1:1 node-per-member wrap
is infeasible and, more importantly, **fails Nova's fit gate** (NOVA.md §4 "Adding a
node — the fit gate"): most members would be thin wrappers with no real producer for
their inputs, no real consumer for their outputs, and no demonstrable sample graph.

Instead this plan proposes **comprehensive, domain-organized coverage of the high-value
API surface**, phased into milestones, with the fit gate as the gate at every node.
Quality over raw count. The target is "every common parametric round-trip workflow an
architect/engineer actually runs" — not API completeness.

**The fit gate (applied to every node below):** a node ships only if it (1) unlocks a
valuable workflow, (2) does not duplicate an existing node, (3) has usable inputs with
real producer nodes, (4) has usable outputs with real consumer nodes, (5) is
demonstrable with a working sample graph. Nodes that fail are marked **SKIP/FOLD** with
the reason.

### Category placement (hard rule)
- **All Revit nodes fold into the EXISTING `revit` category** (`src/core/nodes.js`),
  sub-grouped by domain via naming + section comments. **Never** create parallel
  Revit categories (NOVA.md §4 "No duplicate categories").
- **Forma is a genuinely new domain** with no existing home → propose a **new `forma`
  category**. This is the one new category in this plan.
- `host`, `rhino` stay legacy and are being hidden (per memory: Host is the generic
  abstraction, Rhino+Host hidden). We do not extend them.

---

## 1. What already exists (the dedup baseline)

Before proposing anything, the existing surface (enumerate-first rule, NOVA.md §4):

**`revit` category (`src/core/nodes.js`) — already shipped:**
- `Revit.AllElementsInActiveView` — all elements in active view → `elements`, `count`
- `Revit.AllElementsOfCategory` — elements by category (dropdown) → `elements`, `count`
- `Element.Geometries` — extract meshes from elements → `meshes`, `count`
- `Revit.GetParameterValues` — read a named param across elements → `values`, `count`
- `Revit.SetParameterValues` — write a named param (SEC-013 gated) → `results`, `success`
- `Revit.SendGeometry` — push Nova geometry as DirectShape → `result`, `elementId`
- `Revit.PlaceAdaptiveComponent` — adaptive component by points (SEC-013 gated)
- `Revit.PlaceFamilyInstance` — family instance by points / host face (SEC-013 gated)
- `Revit.SelectElements` — interactive pick → `elements`, `ids`, `count`
- `Revit.SelectFaces` — interactive face pick → `elements`, `faceIds`, `count`

**`host` category (legacy, hidden):** `Host.GetElements/GetGeometry/Get|SetParameterValues/SendGeometry`.

**Modern producers/consumers available to wire into new Revit/Forma nodes**
(`src/nodes/categories/*.js`):
- Points/Vectors: `Point.ByCoordinates`, `Point.Origin`, `Vector.*`
- Planes/Frames: `Plane.ByOriginNormal`, `Plane.ByThreePoints`, `Plane.ByOriginXAxisYAxis` (M1 frames/orient)
- Curves: `Line.ByStartPointEndPoint`, `Polyline.ByPoints`, `Rectangle.ByCenterWidthDepth`,
  `Circle.ByCenterRadius`, `Arc.ByCenterRadiusAngles`, `Curve.Offset/Divide/PointAtParameter`
- Surfaces/Solids: `Surface.ByPatch/ByLoft/ByPointGrid`, `Solid.ByLoft/BySweep/Boolean*`
- Lists: full `List.*` (Create, Map, GroupBy, Chunk, Transpose, Flatten, Zip …)
- Numbers/Strings: input + math + string categories; output-watch as a universal consumer.

This is the producer/consumer pool every new node below must wire into to pass fit-gate
points 3 & 4.

---

## 2. Functional duplicates to AVOID (explicit SKIP list)

These are the traps an "entire API" wrap would fall into. Logged so a reviewer can check:

| Proposed-but-rejected | Why SKIP/FOLD |
|---|---|
| `Revit.GetParameters` / `Revit.SetParameters` | Already removed once as dups of `Revit.Get/SetParameterValues` (2026-06-04). Do not re-add. |
| `Revit.GetGeometry` (generic) | `Element.Geometries` already extracts meshes. Extend it, don't fork. |
| `Revit.CreateDirectShape` | `Revit.SendGeometry` already does DirectShape push. Fold extra options into it. |
| A separate `revit-collectors` category | Folds into `revit` (no parallel categories). |
| 1:1 wrappers for `Transaction`, `Document`, `Application` | Transactions are implicit in the bridge write protocol; no user-facing node. |
| Per-BuiltInCategory nodes (one node per category) | `Revit.AllElementsOfCategory` dropdown already covers this; do not explode into N nodes. |
| `Vector`/`XYZ`/`Transform` math nodes "for Revit" | Nova's `Point/Vector/Plane` + M1 frames already produce these. Reuse, never re-wrap. |

---

## 3. REVIT 2027 — proposed nodes by domain

Naming: `ParentName.NodeName`; creation = `By` + input names (NOVA.md §4.6). All fold
into the **existing `revit` category**, sub-grouped by the section comments below.
`[R]` = read-only. `[W]` = WRITE (requires SEC-013 server-issued approval token +
the hub-bundling / Model A↔B unification follow-ups — see §6 prerequisites).

### 3.1 Collectors / Filtering `[R]` — extend, do not duplicate
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Revit.ElementsByCategory` | **FOLD into existing** `Revit.AllElementsOfCategory` — add a free-text category input so it is not dropdown-locked | — | already exists; upgrade only |
| `Revit.FilterByParameter` | filter an element list by a parameter value/comparison | `elements`, `name`(str), `op`(dropdown =/≠/</>), `value` → `elements`, `count` | in: `Revit.AllElementsOfCategory`; out: `Element.Geometries`, output-watch |
| `Revit.FilterByLevel` | keep elements on a given level | `elements`, `level`(str/elem) → `elements`, `count` | in: collectors + `Level.ByElevation`; out: param/geometry nodes |
| `Revit.ElementsByType` | collect by family/type name (class-ish) | `typeName`(str) → `elements`, `count` | out: geometry/param nodes |
| `Revit.ElementById` | resolve element id(s) → element handle(s) | `ids`(list) → `elements`, `count` | in: `Revit.SelectElements.ids`; out: anything element-consuming |

### 3.2 Elements & Parameters `[R]`/`[W]` — extend only where valuable
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Element.Info` `[R]` | id, category, family, type, level for elements | `elements` → `ids`, `categories`, `types`, `levels` (parallel lists) | in: any collector; out: `List.*`, output-watch |
| `Element.ParameterByBuiltIn` `[R]` | read a value by **BuiltInParameter** enum (dropdown of high-value BIPs) | `elements`, `bip`(dropdown) → `values`, `count` | complements name-based `Revit.GetParameterValues` (different key space — NOT a dup) |
| `Element.TypeParameters` `[R]` | read **type** params (vs instance) | `elements`, `name` → `values` | distinguishes type vs instance; out: output-watch |
| `Element.Rename` `[W]` | set element/type Name | `elements`, `name` → `success`, `count` | SEC-013 gated; out: output-watch |

> Note: generic instance get/set already exist; the above add *keying by BuiltInParameter*
> and *type vs instance* — distinct workflows, not duplicates.

### 3.3 Geometry extraction `[R]` — extend `Element.Geometries`
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Element.Solids` | extract solids (not just display mesh) | `elements` → `solids`, `count` | out: `Solid.Boolean*`, `Element.Geometries` |
| `Element.Faces` | faces of elements (for hosting/analysis) | `elements` → `faces`, `faceIds`, `count` | out: `Surface.*`, `Revit.PlaceFamilyInstance.hostFaceId` |
| `Element.BoundingBox` | min/max box | `elements` → `min`(pts), `max`(pts) | out: `Point.*`, `Rectangle.*` |
| `Element.Location` | element location — **curve** for line-based (walls/beams), **point** for point-based families; returns whichever applies | `elements` → `curves`, `points`, `count` | out: `Curve.*`, `Point.*`, `Wall.ByCurve`, placement nodes |

### 3.4 Element creation `[W]` — the high-value write surface
All `[W]`: SEC-013 token + write prerequisites (§6). All take Nova-native curves/points
already produced by the modern categories.
| Node | Purpose | Inputs → Outputs | Feeds (producer) |
|---|---|---|---|
| `Revit.FamilyTypes` `[R]` | **dropdown of the live document's family types & element types** (optionally filtered by category) — the producer that feeds every `*Type`/`familyType` input below, so creation nodes have real, valid types to pick (fit-gate rule 3) | `category`(opt) → `familyType`, `types`(list) | out: every creation node's type input, `Revit.PlaceFamilyInstance` |
| `Wall.ByCurve` | wall from a curve + level + type | `curve`, `level`, `wallType`(from `Revit.FamilyTypes`), `height` → `elementIds`, `success` | `Line.ByStartPointEndPoint`, `Polyline.ByPoints`, `Level.ByElevation`, `Revit.FamilyTypes` |
| `Wall.ByProfile` | wall from a closed profile | `profile`(closed curve), `wallType` → `elementIds` | `Polyline.ByPoints`, `Rectangle.ByCenterWidthDepth` |
| `Floor.ByOutline` | floor slab from closed outline | `outline`(curve), `level`, `floorType` → `elementIds` | `Rectangle.*`, `Polyline.ByPoints` |
| `Roof.ByOutline` | footprint roof | `outline`, `level`, `roofType` → `elementIds` | `Polyline.ByPoints` |
| `Column.ByLine` | structural/architectural column on a line | `line`, `baseLevel`, `topLevel`, `type` → `elementIds` | `Line.ByStartPointEndPoint`, `Level.*` |
| `Beam.ByLine` | structural framing on a line | `line`, `level`, `type` → `elementIds` | `Line.*` |
| `FamilyInstance.ByPoint` | **FOLD** into existing `Revit.PlaceFamilyInstance` (already point-based) | — | exists; upgrade input names only |
| `FamilyInstance.OnLevel` | hosted instance by point + level | `familyType`, `point`, `level` → `elementIds` | `Point.*`, `Level.*` |
| `DirectShape.ByGeometry` | **FOLD** into existing `Revit.SendGeometry` | — | exists; add category/material options |
| `Room.ByPoint` | place a room at a point on a level | `point`, `level`, `name` → `elementIds` | `Point.*` |

### 3.5 Datums & references `[W]`
| Node | Purpose | Inputs → Outputs | Feeds |
|---|---|---|---|
| `Level.ByElevation` | create a level at Z | `elevation`(num), `name` → `level`, `elementId` | `input` number; out: all level-consuming creation nodes |
| `Grid.ByLine` | grid line | `line`, `name` → `elementId` | `Line.ByStartPointEndPoint` |
| `ReferencePlane.ByLine` | reference plane from a line + normal | `line`, `normal` → `elementId` | `Line.*`, `Vector.*` |

### 3.6 Views / Sheets / Schedules `[R]`/`[W]` — only the valuable ones
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `View.Collect` `[R]` | list views (filter by type) | `viewType`(dropdown) → `views`, `names`, `count` | out: output-watch, `View.PlaceOnSheet` |
| `Sheet.Collect` `[R]` | list sheets | — → `sheets`, `numbers`, `count` | out: output-watch |
| `Schedule.Data` `[R]` | read a schedule as rows (nested lists) | `scheduleName` → `rows`(list of lists), `headers` | out: `List.*`, output-watch — high value for QTO |
| `View.PlaceOnSheet` `[W]` | place a view on a sheet | `view`, `sheet`, `point` → `success` | in: `View.Collect`, `Sheet.Collect`, `Point.*` |

> SKIP for now: `View.ByName`, `Viewport.*`, per-view-type creators — low workflow value
> until a real "documentation automation" use case is requested (fit-gate point 1).

### 3.7 Materials / Categories / Phases / Worksets `[R]`/`[W]`
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Material.Collect` `[R]` | list materials by name | — → `materials`, `names`, `count` | out: `Element.AssignMaterial`, output-watch |
| `Material.ByColor` `[W]` | **create a material** by name + color (the producer for `Element.AssignMaterial`, so a graph can make-then-assign in one workflow) | `name`, `color`, `transparency`(opt) → `material`, `success` | in: `Color.*`/`String.*`; out: `Element.AssignMaterial` |
| `Element.AssignMaterial` `[W]` | set material on elements | `elements`, `material` → `success`, `count` | in: collectors + `Material.Collect` + `Material.ByColor` |
| `Element.Phase` `[R]` | read created/demolished phase | `elements` → `created`, `demolished` | out: output-watch |
| `Element.Workset` `[R]` | read workset name | `elements` → `worksets` | out: output-watch |

> SKIP: workset *creation*, phase *creation*, material *creation* — niche, no demonstrable
> sample without deep setup (fit-gate points 1 & 5).

### 3.8 Selection `[R]` — extend existing
| Node | Purpose | Inputs → Outputs | Feeds |
|---|---|---|---|
| `Revit.SelectByCategory` | **FOLD** into existing `Revit.SelectElements` (already takes categories) | — | exists |
| `Revit.PickPoint` | interactive pick a point in Revit | — → `point` | out: any creation node taking a point |

### 3.9 Transforms / placement — reuse, do NOT re-wrap
Nova's M1 frames/orient (`Plane.ByOriginXAxisYAxis`, orient nodes) already produce the
transforms Revit placement needs. **No new transform nodes.** Placement nodes consume
Nova points/planes directly.

---

## 4. FORMA — proposed `forma` category (new domain)

Forma extensions run as an **embedded iframe SDK** (Forma Embedded View SDK / Developer
Platform), fundamentally different from Revit's localhost-hub transport. See §7 for the
integration-model design question. Node I/O below assumes a **Forma SDK bridge** analogous
to `revit-bridge` (a `NovaFormaBridge` async handle) — to be designed, not built here.

`[R]` read · `[W]` write (create/update in the Forma proposal).

### 4.1 Proposal / Project read `[R]`
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Forma.GetProposal` | current proposal/project metadata | — → `proposal`(obj), `name`, `id` | out: output-watch, downstream Forma nodes |
| `Forma.GetSelection` | currently-selected elements in Forma | — → `paths`(list), `count` | out: `Forma.GetFootprints`, geometry getters |

### 4.2 Geometry `[R]`
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Forma.GetFootprints` | building/parcel footprints as polygons | `paths`(opt) → `curves`, `count` | out: `Curve.*`, `Surface.ByPatch`, `Floor.ByOutline`-style |
| `Forma.GetBuildingElements` | building volumes as meshes | `paths` → `meshes`, `count` | out: `Element.Geometries`-style consumers, viewer |
| `Forma.GetTriangleMesh` | triangulated mesh for a path | `path` → `mesh` | out: viewer, `Mesh.*` |

### 4.3 Terrain / Site `[R]`
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Forma.GetTerrain` | terrain mesh for the site | — → `mesh`, `bbox` | out: viewer, `Surface.*` |
| `Forma.GetSiteLimits` | site boundary polygon | — → `curve` | out: `Curve.*`, area metrics |

### 4.4 Selection `[R]`
| Node | Purpose | Inputs → Outputs | Feeds |
|---|---|---|---|
| `Forma.PickElement` | interactive pick in the Forma canvas | — → `path` | out: geometry getters, update nodes |

### 4.5 Element create / update `[W]`
| Node | Purpose | Inputs → Outputs | Feeds |
|---|---|---|---|
| `Forma.BuildingByFootprint` | create a building volume from footprint + height | `footprint`(curve), `height` → `path`, `success` | `Polyline.ByPoints`, `Rectangle.*` |
| `Forma.UpdateBuilding` | update an existing volume's geometry | `path`, `mesh`/`height` → `success` | `Forma.GetBuildingElements`, `Solid.*` |
| `Forma.SendGeometry` | **send** a Nova mesh/solid/surface into the Forma proposal — the **Nova→Forma half of the geometry round-trip** (parity with `Revit.SendGeometry`) | `geometry`/`mesh`, `name` → `path`, `success` | in: `Solid.*`, `Surface.*`, `Mesh.*`, Revit `Element.Geometries` |

### 4.6 Metrics / Analysis `[R]`
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Forma.AreaMetrics` | GFA / footprint / count metrics for selection | `paths` → `gfa`, `footprintArea`, `count` | out: output-watch, `List.*` (dashboards) |
| `Forma.SunAnalysis` | run/read sun-hours analysis result | `paths` → `values`, `summary` | out: output-watch, color-by |
| `Forma.DaylightResult` | read daylight analysis result | `paths` → `values` | out: output-watch |

### 4.7 Render / Units / Georeference `[R]`
| Node | Purpose | Inputs → Outputs | Feeds / Consumes |
|---|---|---|---|
| `Forma.Georeference` | project lat/lon + reference frame | — → `lat`, `lon`, `frame` | out: `Plane.*`, coordinate transforms |
| `Forma.Units` | project unit system | — → `units`(str) | out: output-watch, scaling math |

> SKIP for now (fit-gate 1/5, no demonstrable sample without deep API context):
> render-settings mutation, camera control, fine-grained library-element instancing.
> Add when a concrete workflow is requested.

---

## 5. Phasing, milestones, lanes (Matrix codenames)

Codenames (per owner, 2026-06-04): **The Architect** (tech-lead), **Neo**
(core-engineer), **Mouse** (geometry-engineer), **Trinity** (connect-engineer),
**Switch** (ui-engineer), **Link** (platform-engineer), **Dozer** (integrator),
**Oracle** (reviewer), **Tank** (ai-engineer).

### Revit track

| Milestone | Scope | Owner lane(s) | New/changed nodes | Est. |
|---|---|---|---|---|
| **RV-M1** Read & Filter | §3.1 collectors/filters + §3.3 geometry extraction (read-only, no write gate) | **Neo** (node defs in `src/core/nodes.js`) + **Mouse** (geometry mapping for Solids/Faces/BBox) | ~9 nodes | 2–3 dev-days |
| **RV-M2** Params & Info | §3.2 Element.Info / BuiltIn / type params + `Revit.FamilyTypes` + §3.7 material/phase read | **Neo** (defs) + **Trinity** (bridge handlers for BIP + type params + type enumeration) | ~7 nodes | 2 dev-days |
| **RV-M3** Datums & Creation core | §3.5 Level/Grid/RefPlane + §3.4 Wall/Floor/Roof/Column/Beam **[W]** | **Mouse** (curve→Revit creation geometry) + **Trinity** (C# add-in create handlers + SEC-013 wiring) + **Neo** (defs) | ~10 nodes | 4–5 dev-days |
| **RV-M4** Views/Sheets/Schedules | §3.6 (Schedule.Data read is the priority) | **Neo** (defs) + **Trinity** (schedule/view handlers) | ~4 nodes | 2 dev-days |
| **RV-M5** Selection & misc write | §3.8 PickPoint + §3.7 `Material.ByColor`/AssignMaterial **[W]** | **Switch** (picker UX) + **Trinity** (handlers) + **Neo** (defs) | ~4 nodes | 1–2 dev-days |

### Forma track

| Milestone | Scope | Owner lane(s) | New/changed nodes | Est. |
|---|---|---|---|---|
| **FM-M0** Integration-model decision + bridge skeleton | §7 design doc → decide extension-host + `NovaFormaBridge` shape (NO nodes) | **The Architect** (decision) + **Trinity** (bridge skeleton) + **Link** (iframe/extension hosting) | 0 nodes (design) | 2–3 dev-days |
| **FM-M1** Read: proposal/geometry/terrain | §4.1–4.4 read + selection | **Trinity** (SDK bridge) + **Neo** (`forma` category defs) + **Mouse** (mesh/footprint mapping) | ~9 nodes | 4 dev-days |
| **FM-M2** Metrics & analysis | §4.6 + §4.7 georeference/units | **Neo** (defs) + **Trinity** (analysis calls) | ~5 nodes | 2–3 dev-days |
| **FM-M3** Write: `Forma.SendGeometry` + building create/update | §4.5 **[W]** (no user-approval gate — see §6) | **Mouse** (geometry→Forma) + **Trinity** (write bridge) + **Neo** (defs) | ~3 nodes | 3 dev-days |
| **FM-Mx** Pickers/panel | Forma connect panel + picker UI | **Switch** (panel/picker) | UI only | 2 dev-days |

**Reviewer (Oracle)** gates every PR (per-PR security pass, ENGINEERING §7).
**Integrator (Dozer)** merges branches into `develop`; lane engineers never self-merge.
**ai-engineer (Tank)** is consulted once nodes land, to add Revit/Forma nodes to the AI
node-catalog prompt so the copilot can use them (separate follow-up, not in these milestones).

### Dependency sequence
```
RV-M1 (read) ─┬─→ RV-M2 (params) ─┐
              └─→ RV-M3 (creation, [W]) requires SEC-013 write prereqs (§6)
                                   └─→ RV-M4 ─→ RV-M5
FM-M0 (decision/bridge) ─→ FM-M1 (read) ─→ FM-M2 (metrics)
                                        └─→ FM-M3 (write)  (parallel after FM-M1)
FM-Mx (panel) runs parallel to FM-M1.
```
- Revit read milestones (RV-M1/M2) have **no write dependency** and can start immediately.
- All `[W]` milestones (RV-M3+, FM-M3) are **blocked on §6 prerequisites**.
- FM-M0 is a **hard gate** for the whole Forma track — no Forma node ships before the
  integration model is decided.

---

## 6. Prerequisites & risks

- **Hide Rhino/Host — DONE** (per project memory). No work here; new nodes target `revit`/`forma` only.
- **Revit write enablement is blocked** on, and these `[W]` milestones depend on:
  - **SEC-013** server-issued single-use write-approval token gate (already the law for
    existing `[W]` nodes — see NOVA.md §4 "Server is the authority" and revit-connect.md).
    Every new `[W]` node reuses the existing approval/`POST /api/host-operations` path.
  - **Hub-bundling** follow-up (Connect hub shipped/paired with the add-in).
  - **Model A ↔ Model B unification** follow-up (one element/geometry data shape across
    the bridge so creation nodes round-trip cleanly).
- **Forma integration-model decision (FM-M0) is an open design question** — Forma runs as
  an embedded iframe SDK, NOT the localhost hub. Two options are weighed in §7
  (Nova-as-extension vs thin-extension-bridge); must be decided before FM-M1.
- **Forma writes need NO user-approval gate** (owner decision, 2026-06-04). Unlike Revit
  (SEC-013), Forma write nodes (`Forma.SendGeometry`, building create/update) act inside
  the user's own authenticated Forma session, so they require no Nova-side approval token.
  They still flow through the bridge and remain auditable — they just don't prompt.
- **Fit-gate risk:** several proposed nodes (analysis results, schedules) depend on the
  bridge actually returning usable, consumable shapes; if a getter can't produce a real,
  readable result it must be dropped, not shipped as a dead port (fit-gate 3/4/5).
- **No-duplicate risk:** §2 logs the functional dups to avoid; Oracle must check functional
  (not just `type`-string) duplication at review.

---

## 7. Forma integration model — the FM-M0 decision (trade-offs)

**Goal (owner, 2026-06-04):** let users **get and send geometry between Forma and Nova**
to run analysis/evaluation in Nova and push results back — a Nova-centric geometry
round-trip. No user-approval gate on Forma writes (§6).

**Constraint:** Autodesk Forma has no public server-to-server REST API for mutating a
proposal; the integration surface is the **Embedded View SDK**, which only runs inside a
**Forma extension** (a web app Forma loads in an **iframe**, calling async `Forma.*` via
postMessage to the Forma host). So *some* Nova-controlled code MUST run as a Forma
extension. The decision is **where the Nova graph engine lives** relative to that iframe.

### Option A — Nova runs **as** the Forma extension (embed Nova in Forma)
Nova (a "Nova for Forma" build) is registered as a Forma extension and loads in Forma's
iframe panel; the Forma SDK is directly in scope, so `Forma.*` nodes call it inline.

| | |
|---|---|
| ➕ Pros | Direct SDK access (lowest latency, simplest data path, no relay); one auth context (Forma's session — dovetails with "no approval"); zero extra infra; fastest path to a working geometry round-trip. |
| ➖ Cons | Nova runs inside Forma's iframe sandbox — panel-size/CSP constraints, the full editor feels cramped in a side panel; needs a separate Forma-extension manifest + deployment; the user works *inside Forma*, not standalone Nova; iframe lifecycle tied to Forma. |
| Best when | The workflow is **Forma-centric** ("use Nova while in Forma"). |

### Option B — **Thin** Forma extension + bridge to standalone Nova (the Revit-hub analogy)
A minimal Forma extension iframe uses the SDK and **relays** geometry to/from the
standalone Nova app (hi-nova.work) over a `NovaFormaBridge` (postMessage / small relay),
mirroring Revit Connect's browser ⇄ hub ⇄ add-in shape.

| | |
|---|---|
| ➕ Pros | Nova stays the **full standalone app** (full screen, full editor); reuses the proven Connect bridge pattern (architectural consistency with Revit); Nova evolves independently of the Forma panel. |
| ➖ Cons | More moving parts — a relay/transport between the Forma iframe and the Nova tab (cross-origin postMessage or a hosted relay), added latency, two windows to manage, a new security surface; the extension is still non-trivial (SDK calls must originate there). |
| Best when | The workflow is **Nova-centric** ("Nova is home base, Forma is one data source") — which matches the stated goal. |

### Recommendation
The stated goal is Nova-centric (pull Forma geometry → analyze/evaluate in Nova → push
back), which favors **Option B** architecturally and keeps parity with Revit Connect.
**But Option A ships a working round-trip far sooner** with the least infra. Pragmatic
path: **prototype on Option A** (embed a minimal Nova-for-Forma panel to validate the SDK
+ the get/send-geometry nodes quickly), then graduate to **Option B**'s bridge once the
node set proves out and a standalone-Nova flow is wanted. FM-M0 deliverable: pick A or B
(or the A→B path), define the `NovaFormaBridge` surface (mirror `revit-bridge`'s async
handle), and stand up the extension skeleton. Owners: **The Architect** + **Trinity** +
**Link**. **Decision still needs the owner's pick before FM-M1.**

---

## 8. Counts / estimates summary

| Track | Milestones | New nodes (approx) | Folds/upgrades | Est. dev-days |
|---|---|---|---|---|
| Revit 2027 | RV-M1…M5 | ~28 new | ~4 folds (into existing `Revit.*`) | ~11–14 |
| Forma | FM-M0…M3 + Mx | ~17 new (+ new `forma` category) | 0 (new domain) | ~13–17 (incl. FM-M0 design) |
| **Total** | 10 milestones | **~45 fit-gated nodes** | 4 folds | **~24–31 dev-days** |

Counts are deliberately curated, not maximal: every node above names its producer and
consumer and a workflow. Anything that could not name all three was moved to a SKIP/FOLD
list (§2, and per-section SKIP notes), per the fit gate.
