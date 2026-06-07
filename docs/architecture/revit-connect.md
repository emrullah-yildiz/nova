# Nova Connect And Revit Architecture

> ↑ Big picture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — detailed spec for the Connect/Revit subsystem.

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
- Revit write operations require explicit user approval AND a single-use,
  server-issued approval token (see "Server-issued write-approval tokens").
- Revit write operations generate backend audit events (the audit row is a
  precondition/side-effect of the write, including a denial row when refused).
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

### Server-issued write-approval tokens (authoritative gate, SEC-013)

Write approval is **enforced server-side**, not client-asserted. The browser may
*request* a write, but it cannot mint its own approval; the only thing that lets a
write reach Revit is a **single-use, server-issued approval token**.

Flow:

1. **Consent (UX).** The browser shows the operation (type, affected element
   count / geometry summary) and the user approves it in the Connect panel.
   This is a usability gate only — approving here does not by itself authorize
   the write.
2. **Issue (authoritative).** The browser asks the backend over
   **`POST /api/host-write-approvals`** (handled by
   `EnterpriseStore.issueHostWriteApproval` via the cloud client
   `issueHostWriteApproval(...)`, wired through
   `window.__revitWriteApproval.issueWriteToken`). The server first verifies the
   caller holds **project-write access**, then mints a token with ≥256 bits of
   entropy (`crypto.randomBytes(32)`), bound to the
   `{operation, projectId, graphVersion}` scope and given a short TTL (default
   2 minutes). Issuance is itself audited as `host.write.approved` (carrying the
   `approvalId`). The raw token is returned **once** (HTTP 201) and never
   persisted in cleartext — only its hash (`hashToken`) is stored.
3. **Carry.** `RevitBridge` forwards the token to the hub/add-in inside
   `payload.approval = { token, approvalId, operation, graphVersion }`
   (`client.js` `normalizeWriteApproval` preserves exactly those fields and
   strips everything else). There is no `{ approved: true }` boolean anywhere on
   the wire. The hub is a **transport**; the add-in checks token *presence* only
   (defense in depth).
4. **Consume (authoritative).** After the write lands in Revit, the browser
   **reports the completed operation** to the backend over
   **`POST /api/host-operations`** (cloud client `recordHostOperation(...)`,
   wired through `window.__revitWriteApproval.recordHostAuditEvent`, called by
   `RevitBridge` after each write). That endpoint is the authoritative consumer:
   it calls `EnterpriseStore.consumeHostWriteApproval(context, token, scope)`.
   The token must be **present, known, owned by the same caller, unconsumed,
   unexpired, and scope-matching**. The token is **burned (single-use) before**
   the write is recorded, defeating replay. Project-write access is re-checked at
   consume time (authorization may have been revoked since issuance). A report
   with a missing/invalid/expired/replayed/out-of-scope token is **rejected at
   the server boundary** (HTTP 403) and audited as a denial — the recorded write
   never lands in the audit log.
5. **Audit as a precondition.** `consumeHostWriteApproval` *always* writes an
   audit row: an accepted write as `host.operation` (with `ok` + `approvalId`), a
   rejected one as `host.write.denied` (with a structured `reason`:
   `missing_token`, `invalid_token`, `token_owner_mismatch`, `token_replayed`,
   `token_expired`, or `token_scope_mismatch`). The audit record is therefore a
   side-effect of the consume path, not an optional client call — there is no
   route that records a host write without consuming a token.

**Where authoritative enforcement lives.** The server (enterprise backend) is
the only authoritative gate: it mints the token (step 2) and consumes+audits it
(steps 4–5). The local hub is purely a transport and the add-in's token-presence
check is defense-in-depth — neither can cryptographically verify a token. When
there is **no cloud session** (pure local, signed-out use against a paired local
hub), `issueWriteToken` degrades gracefully: it returns a clearly-marked
**local token** (`local:` prefix, `local: true`) so the local read/write pilot
stays usable offline. A local token satisfies the add-in presence-check but is
**never** sent to `POST /api/host-operations` and is therefore never
server-consumed or audited; authoritative governance is only active when the
enterprise backend is present and the user is signed in.

**Token format & verification.** The raw token is a 64-character hex string
(256 bits). The server stores only `hashToken(token)` keyed to an approval record
`{ approvalId, organizationId, userId, projectId, host, operation, graphVersion,
issuedAt, expiresAt, consumed }`. Verification is exact-match on the hash plus the
checks in step 4.

**Add-in (defense in depth).** The C# add-in (`NovaHostClient`) trusts the hub —
the hub/backend is the authoritative gate that minted and verified the token — but
the add-in still **refuses any write whose `payload.approval.token` is missing or
empty** (`HasWriteApprovalToken`). This removes the old, trivially-forgeable
`{ approved: true }` boolean as a path to a write; it does not (and cannot)
cryptographically re-verify the token.

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

## Revit add-in UI: the Nova Connect ribbon

The add-in's entry point is an `IExternalApplication`
(`integrations/revit-addin/NovaConnectApp.cs`) registered in the `.addin` manifest
as `<AddIn Type="Application">`. On `OnStartup` it builds a **"Nova Connect" ribbon
panel** (on the built-in Add-Ins tab) with two independent buttons. This replaces the
old single `Add-Ins > External Tools > Nova Connect` command, which tried to start a
local dev server + hub from a git checkout and never opened the web app on an
installed machine.

**Button 1 — connection On/Off toggle (`ConnectionToggleCommand`).**
- **OFF (default):** a **red dot** icon, label "Connect".
- Click to turn **ON:** starts the **in-process** hub
  (`NovaConnectHubProcess.EnsureStarted` → `NovaHub`, see below) and a
  `NovaHostClient` against `ws://127.0.0.1:8765`. On success the button flips to
  a **green dot**, label "Connected", tooltip "Connected to Nova".
- Click again to turn **OFF:** disposes the host client and reverts to the red dot.
- The command updates **its own** button: `NovaConnectApp` captures the created
  `PushButton` at startup (`NovaConnectApp.ToggleButton`) and sets `.LargeImage` /
  `.Image` / `.ItemText` on each toggle. Connection state and the `NovaHostClient`
  lifecycle live in `NovaConnectApp` (static) so `OnShutdown` can dispose the client
  and stop the in-process hub the add-in started.
- If turning on fails (e.g. the port is already in use), the command does **not**
  crash: it stays OFF (red dot) and shows a `TaskDialog` with the reason. The hub
  needs no Node.js / Nova checkout, so the old `NOVA_REPO_ROOT` failure mode is gone.

**Button 2 — Open Nova (`OpenNovaCommand`).** Opens the **production** web app
`https://hi-nova.work/` (`NovaConnectSettings.DefaultNovaUrl`, overridable via the
`NOVA_WEB_URL` env var) in the default browser with `UseShellExecute=true`. It appends
the Connect auto-connect query params (`novaConnectOpen=1`, `novaConnectAuto=1`,
`novaConnectUrl=<HubUrl>`, `novaConnectToken=<token>`, `novaConnectProject=<id>`;
built by the Revit-free `NovaWebUrl.Build`) so a freshly opened tab auto-pairs with the
local hub. This button is **independent of the connection toggle**: it never starts the
hub or a local web server (the default URL is non-localhost, so
`NovaWebProcess.ShouldStartLocalServer` returns false) and always opens the browser.
Equally, turning the connection on does not require opening the site — if the web app is
already open, flipping the toggle on is enough to connect.

**Icons (no committed binaries).** `DotIcons.cs` renders the red / green / Nova-blue
dots programmatically as frozen `BitmapSource`es (a filled circle via `DrawingVisual` +
`RenderTargetBitmap`) at 32x32 (`LargeImage`) and 16x16 (`Image`), so no image assets
are committed to the repo. The toggle swaps the dot color visibly on each On/Off.

### The in-process C# hub (`NovaHub`) — Approach C

The connection toggle's "On" path runs the hub **in-process**, inside the Revit
add-in's own process (no external `nova-hub.exe`, no Node, no Nova checkout). This
fixed the clean-install failure where the toggle could not go green because the
old path launched `node scripts/connect-hub.cjs` from a git checkout.

`NovaHub` (`integrations/revit-addin/NovaHub.cs`) is a deliberately **Revit-free**
WebSocket server bound to `ws://127.0.0.1:8765` via `System.Net.HttpListener` (the
WS upgrade) + `System.Net.WebSockets`, running on a background thread so it never
blocks the Revit UI thread. It is a faithful port of `scripts/connect-hub.cjs`:

- same JSON envelope shape (`version`, `id`, `type`, `source`, `target`,
  `sessionId`, `projectId`, `timestamp`, `payload`, `error`, `replyTo`);
- `hello` → `connection.established` (with `pairingTokenRequired` + `peerConnected`);
- the host↔viewer **peer relay**, with `peer.connected` / `peer.disconnected`;
- `ping` → `pong` (clone, flip type, `source=nova-connect-hub`, `replyTo=id`);
- the **pairing-token check** — only enforced when a token is configured; a
  mismatch is rejected with `operation.error` / `INVALID_PAIRING_TOKEN` (compared
  in constant time);
- the same envelope-validation rejections (`INVALID_JSON`, `INVALID_ENVELOPE`,
  `NO_HOST`, `UNKNOWN_TARGET`).

`NovaConnectHubProcess.EnsureStarted`/`StopIfStarted` keep their names (so the
toggle wiring in `NovaConnectApp` is unchanged) but now start/stop the in-process
`NovaHub`. A hub already listening on the port (a hand-started dev `node` hub) is
detected and left untouched. Clean shutdown on `OnShutdown` / toggle-off aborts the
listener and closes every open socket. SEC-013 (the server-issued write-approval
token + the add-in's token-presence check) is unchanged — the hub is still a pure
transport.

The headless xUnit suite (`tests/revit-addin/NovaHubTests.cs`) compiles `NovaHub.cs`
directly (no Revit API) and exercises the protocol: right/wrong token, ping→pong,
host↔viewer relay between two live WebSocket clients, no-token-accepts-any, and
invalid-envelope rejection.

## Installing the add-in (downloadable WiX MSI)

The Connect panel has a **Download Nova Connect** button that serves a WiX **MSI**
at `/downloads/NovaConnect-Setup.msi`. It targets **Autodesk Revit 2027** (the
version the add-in is built against - see
`integrations/revit-addin/Nova.RevitAddin.csproj`) and is **Windows-only**.
Because the hub runs in-process (Approach C), the MSI ships only the add-in DLL +
`deps.json` + `Nova.addin` — **no bundled hub exe, no Node** — so it is just a few
**MB** (≈ 0.44 MB) and commits cleanly (no >50MB push break).

End-user flow:

1. Click **Download Nova Connect** in the Connect panel -> `NovaConnect-Setup.msi`.
2. Double-click **`NovaConnect-Setup.msi`** to launch the wizard:
   Welcome -> License (accept the **Terms of Service**) -> Install location ->
   Progress -> Finish. It is a **per-user** install (no admin / no elevation).
3. The MSI deploys `Nova.RevitAddin.dll` (+ `deps.json`) into
   `%APPDATA%\Autodesk\Revit\Addins\2027\Nova\` and writes `Nova.addin` (from
   `Nova.addin.template`, with `{{ASSEMBLY_PATH}}` resolved to the installed DLL) in
   `%APPDATA%\Autodesk\Revit\Addins\2027\`, and registers a per-user Add/Remove
   Programs (Apps & features) entry.
4. Restart Revit -> the **Add-Ins** tab shows a **Nova Connect** ribbon panel with two
   buttons: **Connect** (the On/Off connection toggle) and **Open Nova**.

Uninstall via Windows **Apps & features**, or `msiexec /x NovaConnect-Setup.msi`;
uninstall removes all installed files + the manifest.

Building/refreshing the installer (maintainers): see the full runbook in
[`../revit-addin-build.md`](../revit-addin-build.md). In short, `npm run
build:connect-installer` (PowerShell; runs `scripts/build-connect-installer.ps1`)
builds the add-in in **Release** first — so the MSI always embeds a **fresh**
`Nova.RevitAddin.dll`, not a stale copy — generates `License.rtf` from
`docs/legal/terms-of-service.md` (`scripts/build-license-rtf.ps1`), restores the
pinned WiX tool (`.config/dotnet-tools.json`), then builds the MSI and writes
`public/downloads/NovaConnect-Setup.msi` + `.msi.sha256`, which Vite copies into
`dist/` on `npm run build`. Commit the regenerated files so the download stays
current.

The installer is a per-user (`Scope="perUser"`, no admin) WiX v5 MSI built from
`installer/nova-connect/NovaConnect.Installer.wixproj` + `Package.wxs`, with a
`WixUI_InstallDir` wizard whose license page shows the Terms of Service. It writes
only to Revit's per-user Addins folder.

Code signing is parameterized and **opt-in** (a clean no-op for unsigned dev
builds). Set `NOVA_SIGN_METHOD=trusted-signing|pfx` (plus the matching env vars)
to sign **both** `Nova.RevitAddin.dll` and the **MSI** via the shared MSBuild
target (`integrations/revit-addin/NovaSigning.targets`) +
`scripts/sign-revit-addin.ps1`. (There is no separate hub exe to sign now.) Azure
Trusted Signing is preferred (builds Smart App Control / SmartScreen reputation); a
PFX + `signtool.exe` fallback is supported. No certs/secrets are committed — all
inputs come from the environment. Full details, env-var table, and the Smart App
Control note are in [`../revit-addin-build.md`](../revit-addin-build.md). Without a
signing cert, Windows SmartScreen / Smart App Control may warn on the unsigned MSI.
To target another Revit release, update the `2027` folder name in `Package.wxs` and
rebuild the add-in against that Revit's API.
