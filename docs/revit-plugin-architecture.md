# Nova Connect And Revit Architecture

## Purpose

Define the architecture for connecting Nova to local desktop design tools, starting with Revit. This document replaces the older pre-implementation plugin plan and reflects the current repository direction: Nova already has browser-side Connect modules, a local WebSocket hub prototype, and a Revit add-in folder.

## Current Baseline

Relevant code today:

- `scripts/connect-hub.cjs` - local WebSocket routing hub prototype.
- `src/integrations/connect/client.js` - browser Connect client.
- `src/integrations/connect/protocol.js` - shared message envelope and geometry serialization helpers.
- `src/integrations/connect/connect-panel.js` - browser connection UI.
- `src/integrations/revit/revit-nodes.js` - Revit-facing graph nodes.
- `integrations/revit-addin/` - C# Revit add-in source.

The prototype is useful, but enterprise use requires a more explicit trust boundary, pairing flow, schema validation, and audit trail.

## Target Topology

Nova should use four cooperating components:

- Browser app: graph editor, geometry viewer, and user approval UI.
- Nova backend: identity, project storage, policy, pairing challenges, and audit events.
- Local Connect hub: localhost broker between browser/backend and desktop host.
- Revit add-in: Revit API bridge for project queries and approved write operations.

The backend is the enterprise control plane. The local hub is the desktop transport layer.

## Connection Flow

1. User signs in to Nova and opens a project.
2. Browser asks the backend to create a short-lived Connect pairing session.
3. Backend returns a pairing challenge and expiry time.
4. User starts or pairs the local Connect hub.
5. Revit add-in connects to the local hub and presents/accepts the pairing challenge.
6. Browser connects to the local hub using the paired session.
7. Backend receives an audit event for session creation and pairing result.

## Required Message Classes

The Connect protocol should continue to use JSON envelopes, with schemas for:

- `hello`
- `connection.established`
- `peer.connected`
- `peer.disconnected`
- `project.snapshot`
- `elements.query`
- `geometry.get`
- `geometry.create`
- `parameter.get`
- `parameter.set`
- `project.changed`
- `operation.error`
- `ping`
- `pong`

Every message should include:

- protocol version
- message id
- source
- target
- session id
- project id when available
- timestamp
- payload
- error when applicable

## Security Requirements

Required for enterprise MVP:

- Pairing token required by default.
- Short-lived session IDs.
- Browser origin validation.
- Backend-issued pairing challenge.
- Message schema validation before routing.
- Revit write operations require explicit user approval.
- Revit write operations generate backend audit events.
- No provider API keys or enterprise secrets pass through the local hub.
- Local hub binds to `127.0.0.1` by default.

## Revit Write Policy

Read operations may execute after pairing and authorization. Write operations require a stronger policy:

- Show the requested operation to the user.
- Include affected element count or geometry summary.
- Require approval in the browser or Revit add-in UI.
- Send approval metadata with the operation.
- Record an audit event with actor, project, graph version, operation type, result, and timestamp.

MVP write operations:

- Create DirectShape geometry from Nova geometry envelopes.
- Set parameter values on selected/queried elements.

## Data And Geometry Rules

Element records should use the normalized shape from `src/integrations/connect/protocol.js`:

- id
- name
- category
- type name
- level name
- params
- source identity

Geometry envelopes should include:

- kind
- units
- coordinate system
- transform
- source identity
- geometry data
- metadata

Large element and geometry responses must be paginated or chunked before enterprise pilot.

## Implementation Milestones

### Milestone 1: Harden Local Hub

- Move or wrap `scripts/connect-hub.cjs` as a production-owned Connect package.
- Require pairing token by default.
- Add schema validation for envelopes.
- Add session expiry.
- Add tests for routing, invalid messages, pairing failure, and disconnects.

### Milestone 2: Backend Pairing

- Add backend Connect session endpoints.
- Issue pairing challenges.
- Store active sessions in Redis.
- Write audit events for session lifecycle.

### Milestone 3: Revit Read Pilot

- Return project snapshot from Revit.
- Query elements by category.
- Fetch selected element metadata.
- Add browser UI states for connected, stale, disconnected, and error.

### Milestone 4: Approved Revit Writes

- Add explicit approval flow.
- Create DirectShape geometry.
- Set parameter values.
- Record every write in the audit log.

## Non-Goals For MVP

- Cloud-hosted direct Revit API access.
- Real-time multiplayer graph editing.
- Continuous live model sync.
- Bulk unattended Revit writes.
- Rhino support beyond keeping the protocol extensible.

## Validation

Before enterprise pilot:

- Unit tests cover protocol validation and hub routing.
- Browser workflow tests cover pairing UI states.
- Manual Revit smoke test covers snapshot, element query, and one approved write.
- Load test covers 100 concurrent local Connect sessions.
- Security review covers pairing, origin validation, write approval, and audit events.

## Installing the add-in (downloadable installer)

The Connect panel has a **Download Nova Connect** button that serves a packaged
installer at `/downloads/NovaConnect-Setup.exe`. It targets **Autodesk Revit
2027** (the version the add-in is built against - see
`integrations/revit-addin/Nova.RevitAddin.csproj`) and is **Windows-only**.

End-user flow:

1. Click **Download Nova Connect** in the Connect panel -> `NovaConnect-Setup.exe`.
2. Double-click **`NovaConnect-Setup.exe`**.
3. The installer detects Revit 2027 (Program Files install or the per-user
   `%APPDATA%\Autodesk\Revit\Addins\2027` folder) and **warns + asks to confirm**
   if it isn't found.
4. It copies `Nova.RevitAddin.dll` into `%APPDATA%\Autodesk\Revit\Addins\2027\Nova\`
   and writes `Nova.addin` (from `Nova.addin.template`, filling `{{ASSEMBLY_PATH}}`).
5. Restart Revit -> **Add-Ins -> External Tools -> Nova Connect**.

Run `NovaConnect-Setup.exe /uninstall` to remove it.

Building/refreshing the installer (maintainers):

- Build the add-in: `dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Debug`
- Package it: `npm run build:connect-installer` (PowerShell; runs
  `scripts/build-connect-installer.ps1`) -> writes
  `public/downloads/NovaConnect-Setup.exe` and
  `public/downloads/NovaConnect-Setup.exe.sha256`, which Vite copies into
  `dist/` on `npm run build`. Commit the regenerated files so the download stays
  current.

The installer is a single-file, self-contained `.exe` built from
`installer/nova-connect/NovaConnect.Installer.csproj`. It runs as the current
user, writes only to Revit's per-user Addins folder, does not request admin
rights, and does not use `.bat` files or PowerShell execution-policy bypasses.
It also copies a stable uninstaller to
`%LOCALAPPDATA%\Programs\Nova Connect\NovaConnect-Setup.exe` and registers a
per-user Windows uninstall entry under HKCU for Apps & features / endpoint
inventory.

If `NOVA_CODESIGN_THUMBPRINT` is set, the packaging script signs the EXE with
`signtool.exe` before writing the SHA-256 checksum. Without a code-signing
certificate, Windows SmartScreen may still show a publisher warning. To target
another Revit release, update `RevitVersion` in the installer program and
rebuild the add-in against that Revit's API.
