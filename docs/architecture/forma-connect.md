# Nova Forma Connect — Architecture (FM-M0 skeleton)

> ↑ Big picture: [`../NOVA.md`](../NOVA.md). Sibling transport:
> [`revit-connect.md`](revit-connect.md) (Revit's localhost-hub variant).
> Node plan + the FM-M0 decision: [`revit-forma-node-plan.md`](revit-forma-node-plan.md)
> §4 (Forma nodes) and §7 (the Option B DECISION).
>
> Status: **FM-M0 skeleton (design + inert stubs)**. No live relay, no live Forma
> SDK calls, no `forma`-category nodes — those are FM-M1. Created 2026-06-04.

## Purpose

Define how Nova exchanges geometry and analysis data with **Autodesk Forma** so a
user can pull Forma geometry into Nova, analyze/evaluate it in the Nova graph, and
push results back — a **Nova-centric geometry round-trip**.

## The decision (Option B, owner 2026-06-04)

Per [`revit-forma-node-plan.md`](revit-forma-node-plan.md) §7 DECISION:

- A **thin Nova extension lives inside Forma** (a web app Forma loads in an
  **iframe**, using the **Forma Embedded View SDK** — `Forma.*` async calls over
  postMessage to the Forma host). This is required because **Forma has no public
  server-to-server REST API for mutating a proposal**; the only mutation surface
  is the SDK, which only runs inside a Forma extension.
- That extension **bridges data to the standalone Nova web app** (hi-nova.work).
  Nova stays the **full standalone home**; Forma is one data source.
- The **user activates the connection** with a **pairing code**, mirroring Revit
  Connect's user-activated Connect toggle / pairing token UX.

### Why a cloud relay, not a localhost hub

This is the key difference from Revit Connect. Revit's bridge is a **localhost
hub** because Revit is a *desktop* app on the same machine as the browser. Forma's
two ends are **both browser contexts** — the Forma extension iframe and the Nova
tab — typically on different origins and possibly different machines/sessions.
They **cannot talk directly** and there is no localhost process to broker them.

So the Forma transport is a **cloud relay**: a **Cloudflare Durable Object pairing
room** (reusing Nova's existing realtime/collab DO infrastructure — see
[`accounts-collaboration.md`](accounts-collaboration.md)). Both the Forma
extension and the Nova client **join the same room by pairing code** and relay
JSON envelopes through it.

```
  Autodesk Forma (host app)
     │  Embedded View SDK (postMessage)
     ▼
  Nova Forma extension  ── thin iframe web app (integrations/forma-extension/)
     │   WebSocket
     ▼
  Cloudflare Durable Object — Forma pairing room (1 per pairing code)   ← Link (FM-M1)
     ▲
     │   WebSocket
  Standalone Nova app (hi-nova.work) ── NovaFormaBridge (src/integrations/forma/)
     │
     ▼
  Nova graph engine · forma-category nodes (FM-M1)
```

Contrast with Revit:

| | Revit Connect | Forma Connect |
|---|---|---|
| Far end | Revit desktop add-in (C#) | Forma extension iframe (web, Embedded View SDK) |
| Transport | **localhost** WebSocket hub (`scripts/connect-hub.cjs`) | **cloud relay** — Cloudflare Durable Object pairing room |
| Why | both ends on one machine | both ends are browser contexts, can't talk directly |
| Activation | Connect toggle + pairing token | Connect-style activation + **pairing code** |
| Write gate | SEC-013 server-issued single-use approval token + user approval dialog | **none** (acts in the user's own Forma session) — but pairing-scoped + audited |

## Components

1. **Forma extension** (`integrations/forma-extension/`) — a minimal iframe web
   app registered as a Forma extension. It owns all `Forma.*` Embedded View SDK
   calls and relays request/response envelopes to/from the pairing room. FM-M0
   ships a scaffold only (README + stub manifest/entry); FM-M1 wires the SDK.
2. **Durable Object pairing room** (Link's deliverable, FM-M1) — one room per
   pairing code; both peers join it and the room relays validated envelopes
   between them. Lifecycle + interface handed off in
   [`../agent-handoff.md`](../agent-handoff.md).
3. **`NovaFormaBridge`** (`src/integrations/forma/forma-bridge.js`) — the Nova-side
   async handle. Mirrors `revit-bridge`'s shape: each method builds + validates a
   Forma protocol envelope and (in FM-M1) sends it over the injected relay client.

## Pairing / activation flow (Option B)

Mirrors Revit's user-activated pairing, but with a cloud relay and pairing code:

1. User signs in to Nova (standalone tab) and clicks **Connect to Forma**.
2. Nova requests a short-lived **pairing code** for a new Durable Object pairing
   room from the backend (FM-M1). The pairing code is the room key.
3. Nova displays the pairing code (and/or a deep link) and joins the room as the
   `nova-app` peer.
4. The user opens the Nova Forma extension panel inside Forma and enters/accepts
   the pairing code; the extension joins the same room as the `forma-extension`
   peer.
5. The room reports both peers connected; the bridge transitions to **paired**
   (`NovaFormaBridge.isPaired()` → true). Until then every bridge method rejects
   with `FORMA_NOT_PAIRED`.

### Pairing code lifecycle (mirrors Revit token policy, adapted)

The pairing code is the Forma analogue of Revit's pairing token
([`revit-connect.md`](revit-connect.md) security requirements). FM-M1 (Link) owns
the authoritative implementation; the policy intent:

- **High entropy** — at least 128 bits of randomness (same bar as the Revit
  pairing token).
- **Short-lived** — expires (default 24h, configurable) and is **one-time** for
  joining a room (a second join with a stale/used code is rejected).
- **Revocable** — the room can be torn down / the code revoked via the backend
  admin path.
- **Scope** — the pairing code authorizes joining exactly one room; it carries no
  Forma credentials and no Nova enterprise secrets.

## The `NovaFormaBridge` surface

Defined in `src/integrations/forma/forma-bridge.js`. Async-handle shape mirroring
`revit-bridge`. Methods (all reject with `FORMA_NOT_PAIRED` until paired, then with
`NOT_IMPLEMENTED_FM1` in FM-M0):

| Method | Forma message type | R/W | Returns (FM-M1 contract) |
|---|---|---|---|
| `getProposal()` | `forma.proposal.get` | R | `{ proposal, name, id }` |
| `getSelection()` | `forma.selection.get` | R | `{ paths, count }` |
| `getGeometry(paths?)` | `forma.geometry.get` | R | `{ meshes, count }` — **single consolidated getter** |
| `getTerrain()` | `forma.terrain.get` | R | `{ mesh, bbox }` |
| `getSiteLimits()` | `forma.siteLimits.get` | R | `{ curve }` |
| `pickElement()` | `forma.pick.element` | R | `{ path }` |
| `sendGeometry({geometry,name?})` | `forma.geometry.send` | W | `{ path, success }` |
| `buildingByFootprint({footprint,height})` | `forma.building.create` | W | `{ path, success }` |
| `updateBuilding({path,mesh?,height?})` | `forma.building.update` | W | `{ success }` |
| `areaMetrics(paths?)` | `forma.metrics.area` | R | `{ gfa, footprintArea, count }` |
| `sunAnalysis(paths?)` | `forma.analysis.sun` | R | `{ values, summary }` |
| `daylightResult(paths?)` | `forma.analysis.daylight` | R | `{ values }` |
| `georeference()` | `forma.georeference.get` | R | `{ lat, lon, frame }` |
| `units()` | `forma.units.get` | R | `{ units }` |

**Consolidated geometry getter (owner decision):** `getGeometry(paths)` is the
**single** geometry getter and **replaces** the plan's earlier split
`Forma.GetTriangleMesh` + `Forma.GetBuildingElements`. FM-M1 `forma`-category node
defs map onto this one method.

### Protocol (mirrors connect/protocol.js)

`forma-bridge.js` exports `FORMA_MESSAGE_TYPES`, a
`FORMA_MESSAGE_PAYLOAD_VALIDATORS` registry, `createFormaEnvelope`,
`validateFormaEnvelope`, and `validateFormaMessage` — the same message-class /
validator shape as `connect/protocol.js`. Every envelope carries
`{ version, id, type, source, target, pairingCode, timestamp, payload, error }`
(pairing-code-scoped rather than localhost session-scoped). Every request is
**validated before it leaves the browser**; a malformed payload throws a
structured `FormaValidationError` (carrying `.errors`) instead of hitting the
relay.

## Security

- **No write-approval prompt** (owner decision, 2026-06-04). Unlike Revit
  (SEC-013), Forma write nodes (`sendGeometry`, `buildingByFootprint`,
  `updateBuilding`) act **inside the user's own authenticated Forma session**, so
  they need no Nova-side approval token or confirmation dialog.
- **Pairing-scoped.** Writes (and reads) are only possible while a valid pairing
  is active; the pairing code is high-entropy, short-lived, one-time-join, and
  revocable (above). An unpaired bridge is inert (every method rejects).
- **Auditable.** Forma operations still flow through the relay and are auditable
  there (the relay can emit per-operation audit events keyed by pairing room).
  Schema validation runs **before routing** on both peers; a validation failure
  is rejected and logged rather than relayed.
- **No secrets through the relay.** No provider API keys or Nova enterprise
  secrets pass through the relay; the pairing code carries no Forma credentials.
  Forma auth lives entirely in the user's Forma session inside the extension
  iframe (same boundary principle as the Revit hub: "no provider API keys or
  enterprise secrets pass through" the transport).

## What FM-M0 ships vs defers

**Ships (this milestone):**
- `NovaFormaBridge` interface + inert stubs (`src/integrations/forma/forma-bridge.js`).
- The Forma protocol message types + validators (same file).
- This design doc.
- The Forma extension scaffold (`integrations/forma-extension/`).
- The Durable Object pairing-room platform handoff (to Link).

**Deferred to FM-M1+:**
- Live Durable Object pairing room (Link).
- Live Forma Embedded View SDK calls inside the extension.
- Wiring `NovaFormaBridge._dispatch` to a real `relay.request(envelope)` send.
- The `forma`-category node defs (§4 of the node plan).
- The Connect/pairing panel UI (Switch, FM-Mx).
