# Nova Connect Hybrid Bridge

## Current Status

The first implementation slice of the risk-mitigated Nova Connect plan is active in `feature/nova-connect-hybrid-bridge`.

Completed:

- Added a neutral Nova Connect protocol with `NovaEnvelope`, `ElementRecord`, `GeometryEnvelope`, source identity, units, transforms, and coordinate-system metadata.
- Added a browser-side `NovaConnectClient` for localhost WebSocket sessions, request/reply routing, cached project snapshots, element queries, geometry reads, and DirectShape-ready geometry sends.
- Added a local `connect:hub` script backed by `ws`, bound to `127.0.0.1` by default with session pairing tokens.
- Added APS adapter foundations for Autodesk Docs/Data Management, Model Derivative translation/metadata, and Design Automation work items.
- Wired Nova Connect into `src/main.js` without auto-connecting on app startup.
- Extended `RevitBridge` so existing nodes can keep using mock/exported Revit data while live sessions can supply cached elements, query the host, read geometry envelopes, and send geometry.
- Added tests for protocol normalization, client request routing, local hub routing, APS adapter request shape, and RevitBridge live-cache behavior.
- Added a mock Revit host adapter and CLI so the browser client can exercise the full local bridge loop before the compiled Revit add-in exists.

## Architecture

Nova Connect uses a hybrid transport model:

- `local-revit`: live localhost WebSocket bridge for desktop Revit authoring.
- `aps-docs`: Autodesk Docs/ACC/BIM 360 file and version discovery.
- `aps-derivative`: model translation, metadata, properties, and viewable extraction.
- `aps-design-automation`: cloud Revit batch jobs.
- `ifc`: future open BIM import/export adapter.
- `rhino-local`: future Rhino/Rhino.Inside adapter.

All transports map data into the same neutral protocol:

- `source`: `revit-local`, `aps`, `ifc`, or `rhino`.
- `sourceId`: host-native object identity such as Revit `ElementId`, APS object/dbId, IFC `GlobalId`, or Rhino GUID.
- `versionId`: local document version marker or APS version URN.
- `units`, `transform`, and `coordinateSystem`: included from day one to avoid silent geometry drift.

## Local Bridge Usage

Start the hub:

```powershell
npm run connect:hub -- --token=your-pairing-token
```

In a second terminal, start the mock Revit host:

```powershell
npm run connect:mock-revit -- --token=your-pairing-token
```

In the browser console or future connection UI:

```js
NodeFlow.NovaConnect.pairingToken = 'your-pairing-token';
await NodeFlow.NovaConnect.connect();
const walls = await NodeFlow.RevitBridge.queryElements('Walls');
const meshes = await NodeFlow.RevitBridge.getLiveGeometries(walls);
```

You can also use the in-app **Connect** button in the top menu:

1. Enter `ws://127.0.0.1:8765`.
2. Enter the same pairing token used by the hub and mock Revit host.
3. Click **Connect**.
4. Click **Query Walls**, **Get Geometry**, or **Send Test Point** to verify the local bridge loop.

The Revit plugin side should connect as a `host`, validate the pairing token, and handle write operations through Revit External Events. WebSocket handlers must only enqueue work.

## APS Scope

APS is implemented as an adapter foundation, not the live-edit transport:

- Use Data Management for shared cloud model files and version identity.
- Use Model Derivative for translated geometry, viewable metadata, and property extraction.
- Use Design Automation for async Revit jobs such as batch export/import, IFC export, and overnight checks.

Low-latency live editing remains the responsibility of `local-revit`.

## Next Implementation Slices

1. Build the compiled Revit add-in host that mirrors the mock host contract and uses External Events for all model writes.
2. Add explicit write approval controls before enabling real Revit writes.
3. Implement DirectShape mesh write acceptance in the compiled Revit host.
4. Add APS OAuth and project/version browser UI.
5. Add IFC mapping once the local and APS identity contract is stable.
