# Nova Forma extension (FM-M0 scaffold)

> Architecture: [`../../docs/architecture/forma-connect.md`](../../docs/architecture/forma-connect.md).
> Node plan + decision: [`../../docs/architecture/revit-forma-node-plan.md`](../../docs/architecture/revit-forma-node-plan.md) §7.

This is the **thin Nova extension that runs inside Autodesk Forma** for Option B
(the FM-M0 decision). Forma loads it as a web app in an **iframe** and exposes the
**Embedded View SDK** (`Forma.*` async calls over postMessage). This extension is
the only place Nova-controlled code can call the Forma SDK.

It does **not** run the Nova graph engine. It is a relay endpoint: it makes
`Forma.*` SDK calls on behalf of the standalone Nova app and relays
request/response envelopes between Forma and the **Cloudflare Durable Object
pairing room** (see the platform handoff in
[`../../docs/agent-handoff.md`](../../docs/agent-handoff.md)). The standalone Nova
app talks to the same pairing room via `NovaFormaBridge`
(`src/integrations/forma/forma-bridge.js`).

```
Forma host ─SDK(postMessage)→ [this extension] ─WebSocket→ DO pairing room ←WebSocket─ Nova app (NovaFormaBridge)
```

## Status: SKELETON ONLY

FM-M0 ships the scaffold below. **No live Forma SDK calls and no live relay
connection are wired** — the entry point logs intent and renders a placeholder.

- `manifest.json` — stub Forma extension manifest (id, name, entry, requested
  scopes). Placeholder values; finalized when the extension is registered with
  the Autodesk Forma Developer Platform in FM-M1.
- `index.html` — iframe entry document.
- `src/main.js` — stub entry point describing the FM-M1 wiring (SDK init,
  pairing-code join, envelope relay loop). Inert: no SDK/network calls.

## FM-M1 will implement

1. **Forma SDK init** — import the Embedded View SDK and confirm the extension is
   running inside a Forma host (handshake).
2. **Pairing** — read the pairing code (entered by the user / passed by Nova),
   connect to the Durable Object pairing room as the `forma-extension` peer.
3. **Relay loop** — for each request envelope from the room, validate it
   (`validateFormaMessage` from the shared protocol), dispatch the matching
   `Forma.*` SDK call, and relay the response back. Writes
   (`forma.geometry.send`, `forma.building.create`, `forma.building.update`)
   require **no approval prompt** but are pairing-scoped + audited.
4. **Geometry mapping** — map Forma meshes/footprints to Nova's geometry shapes
   (Mouse's lane) for the consolidated `forma.geometry.get` getter.

## Build / deploy

Not built or deployed in FM-M0. The extension is a separate small web bundle
(its own deploy target on the Forma Developer Platform), kept out of the main
Nova SPA build. Tooling is added in FM-M1.
