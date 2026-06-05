# Nova Connect — Self-Contained Hub Bundling Plan

> Tier-3 implementation plan for the Connect/Revit lane. Architecture context:
> [`revit-connect.md`](revit-connect.md) (see "The in-process C# hub (`NovaHub`)").
> Build/runbook: [`../revit-addin-build.md`](../revit-addin-build.md).
>
> Status: **SUPERSEDED (2026-06-05) by Approach C — the in-process C# WebSocket
> hub.** This doc evaluated bundling a self-contained hub *next to* the add-in
> (Approach A: a Node SEA `nova-hub.exe`); that shipped on `feat/installer-msi-hub`
> but produced a ~115MB MSI that broke the git push and carried Node-22/SEA
> caveats. The accepted resolution runs the hub **in-process inside the add-in
> DLL** (`NovaHub`) — no separate exe, no Node, no checkout — making the MSI a few
> MB. See the dated decision "In-process C# WebSocket hub (Approach C)" in
> [`decisions.md`](decisions.md) and the `NovaHub` section in
> [`revit-connect.md`](revit-connect.md). The analysis below is retained for
> context only; the Node-22 / SEA caveats it raises are now moot.

---

## 1. The failure we are fixing

Clicking **Connect** on the Nova Connect ribbon in Revit shows:

> Could not start the Nova connection — Could not locate Nova repository root.
> Set NOVA_REPO_ROOT to the repository folder.

**Root cause.** `ConnectionToggleCommand` → `NovaConnectApp.TurnOn` →
`NovaConnectHubProcess.EnsureStarted(pairingToken)` launches the hub as:

```
node  <repoRoot>\scripts\connect-hub.cjs  --port=8765 --token=<pairingToken>
```

`<repoRoot>` comes from `NovaLocalPaths.FindRepoRoot()`, which walks up looking
for a folder that contains **both** `package.json` and `scripts/connect-hub.cjs`,
and `node` comes from `NovaLocalPaths.FindNodeExecutable()`. On an **installed
(non-dev) machine** there is neither a Nova source checkout nor a Node runtime,
so `FindRepoRoot()` throws and the toggle stays red. It only works today on a
developer machine, or wherever `NOVA_REPO_ROOT` points at a real checkout with
Node on the box.

**Goal.** Make **Connect** work with **no repo checkout and no Node install** —
ship a self-contained hub inside the installer and launch it from the install
directory. Keep the hub wire protocol unchanged (the browser connects to
`ws://127.0.0.1:8765`) and keep the SEC-013 server-issued write-approval model
intact (the hub is a transport only; this change does not touch the approval
path).

---

## 2. Approach decision

### Recommended: **A — Node SEA single-exe (`nova-hub.exe`)**

Compile `scripts/connect-hub.cjs` (plus its only dependency, `ws`) into one
self-contained `nova-hub.exe` using **Node.js Single Executable Applications**
(SEA, stable enough on Node 20+/22 LTS). Ship that exe in the installer payload,
copy it next to the add-in DLL in `%APPDATA%\Autodesk\Revit\Addins\2027\Nova\`,
and have `NovaConnectHubProcess` launch it directly. No Node, no repo required.

**Why A wins for Nova specifically:**

- **Reuses the existing hub JS unchanged.** `connect-hub.cjs` *is* the protocol
  (envelope routing, `hello`/`connection.established`/`peer.*`/`ping`/`pong`,
  pairing-token check). SEA bundles that exact code, so the wire protocol the
  browser and add-in speak is **byte-for-byte unchanged** — the lowest-risk way
  to satisfy "keep the hub protocol unchanged." Option C re-implements the
  protocol in C# and risks subtle divergence.
- **Tiny, closed dependency surface.** The hub imports only `crypto` (Node
  built-in) and `ws` (one pure-JS npm dep, `^8.20.1`). No native addons → SEA
  bundling is straightforward (`ws` is pure JS; no `.node` binaries to ship).
- **One signable artifact** that drops cleanly into the **existing**
  `NovaSigning.targets` / `scripts/sign-revit-addin.ps1` scaffold — sign
  `nova-hub.exe` exactly the way we already sign `Nova.RevitAddin.dll` and
  `NovaConnect-Setup.exe`.
- **Payload size** is moderate: a Node SEA is the Node runtime + the script blob,
  roughly **40–70 MB** before compression. Acceptable for a desktop installer
  that already publishes a self-contained .NET single-file exe.

### Trade-off table

| Criterion | A) Node SEA `nova-hub.exe` | B) Portable Node + script | C) C# in-process hub |
|---|---|---|---|
| Protocol unchanged | **Yes — same JS** | **Yes — same JS** | Risk: re-implemented in C# |
| Reuses `connect-hub.cjs` | **Yes** | **Yes** | No (rewrite) |
| Node on machine | Not needed | Not needed | Not needed |
| Repo on machine | Not needed | Not needed | Not needed |
| Payload size added | ~40–70 MB (1 exe) | ~50–90 MB (node + node_modules + script) | **~0 (in-DLL)** |
| Build complexity | Moderate (SEA blob + inject) | Low (copy node + script) | **High (rewrite + tests)** |
| Files to ship | 1 (`nova-hub.exe`) | Many (node.exe + `node_modules/ws/**` + script) | 0 extra |
| Signable via existing scaffold | **Yes — 1 exe** | Awkward (sign node.exe we didn't build; many files) | N/A (DLL already signed) |
| AV / SAC / SmartScreen surface | 1 new exe to gain reputation | Ships an unsigned upstream `node.exe` (reputation/AV concerns) | **Smallest — no new exe** |
| Startup reliability | Single process, fast | Single process, fast | In-proc; must not block Revit UI thread |
| Long-term robustness | Good | Fair (loose files, drift) | **Best** (no Node at all) |
| Rewrite risk | Low | Low | **High** (protocol parity, threading, lifecycle) |

**Why not B:** functionally equivalent to A but ships a **loose tree** (an
upstream `node.exe` we didn't build + `node_modules/ws/**` + the script). That
upstream `node.exe` is a separate AV/SAC/SmartScreen reputation problem we don't
control and can't cleanly fold into our one-artifact signing flow, and the
many-files layout is more brittle (partial copies, path drift). A collapses all
of that into one signable artifact.

**Why not C (now):** the most robust *end state* — no Node, smallest payload, no
new exe to sign — but it is a **full rewrite** of the hub in C#
(`System.Net.WebSockets` / `HttpListener`) that must reproduce the envelope
routing and pairing semantics in `connect-hub.cjs` exactly, run on a background
thread without blocking Revit's UI thread, and be re-tested for protocol parity.
That is a much larger change with real divergence risk. **Recommendation: ship A
now to unblock distribution; keep C on the roadmap** as the eventual
zero-dependency hub once the protocol is otherwise stable. Record this as a
decision in `architecture/decisions.md`.

> **Open decision for the owner (O1):** confirm A vs. fast-tracking C. Default =
> **A**. Choosing C instead trades a bigger, riskier change now for no bundled
> exe and no Node ever.

---

## 3. Exact changes (Approach A)

All paths are repo-relative. Owned by **Trinity (connect-engineer)** unless noted.

### 3.1 Build `nova-hub.exe` from the existing hub (new, owned)

Add a build script + npm script that produces the SEA. New files (no edits to the
hub JS itself):

- **`scripts/build-connect-hub-exe.ps1`** (new) — produces
  `integrations/revit-addin/hub/nova-hub.exe`:
  1. Bundle `scripts/connect-hub.cjs` + `ws` into a single CJS file (esbuild
     `--bundle --platform=node --format=cjs`, or `ncc`). This collapses the
     `require('ws')` into the blob so the SEA has **no external `node_modules`**.
     The hub's `if (require.main === module)` entry block already parses
     `--port`/`--token`, so the bundled entry behaves identically when run as an
     exe.
  2. Generate the SEA blob: `node --experimental-sea-config sea-config.json`
     (new `scripts/sea-config.json`, `"main"` = the bundled file,
     `"disableExperimentalSEAWarning": true`).
  3. Copy the host `node.exe`, inject the blob with `postject` under the
     `NODE_SEA_BLOB` resource, producing `nova-hub.exe`. Pin the Node major used
     for the copy (document it — Node **22 LTS** recommended).
- **`scripts/sea-config.json`** (new).
- **`package.json`** (hot file — see §6): add one script
  `"build:connect-hub-exe": "powershell -NoProfile -File scripts/build-connect-hub-exe.ps1"`.
  Add `esbuild` (or `@vercel/ncc`) and `postject` to `devDependencies` if not
  present.

> The output lands in a new **`integrations/revit-addin/hub/`** folder that the
> installer project embeds (§3.3). Add `integrations/revit-addin/hub/` to
> `.gitignore` (it is a build artifact, like `bin/`/`obj/`) — do **not** commit
> `nova-hub.exe`.

### 3.2 Launch the bundled hub; drop the repo requirement (edit, owned)

**`integrations/revit-addin/NovaConnectHubProcess.cs`** — change `EnsureStarted`
to prefer the bundled hub and fall back to the dev (repo+Node) path:

- New private `ResolveHubLauncher()` returns either:
  - **bundled** (default): `FileName = <bundledHubExe>`, `Arguments =
    "--port=<HubPort> --token=<pairingToken>"`, `WorkingDirectory =
    <install dir>` — no Node, no repo; **or**
  - **dev fallback**: the current `node scripts\connect-hub.cjs …` path, used
    only when the bundled exe is absent (source checkouts) or `NOVA_REPO_ROOT` /
    a new `NOVA_HUB_EXE` override is set.
- Resolution order: `NOVA_HUB_EXE` env override → `nova-hub.exe` next to the
  executing assembly (the install dir) → dev fallback (`FindRepoRoot` + Node).
  Only if **all** fail does it throw — and the message should name both the
  missing bundled exe and the `NOVA_REPO_ROOT` dev hint.

**`integrations/revit-addin/NovaLocalPaths.cs`** — add a
`FindBundledHubExe()` helper: look for `nova-hub.exe` next to
`Assembly.GetExecutingAssembly().Location` (i.e. the `Nova\` install folder),
honoring a `NOVA_HUB_EXE` override. Keep `FindRepoRoot()`/`FindNodeExecutable()`
**unchanged** — they remain the dev override path (`NOVA_REPO_ROOT` stays a
first-class dev escape hatch). No behavior change to the existing methods, so no
risk to dev workflows.

**`integrations/revit-addin/ConnectionToggleCommand.cs`** — update
`ShowConnectFailure` copy: on a bundled install the failure is no longer "needs a
checkout"; reword to a generic "could not start the local hub" with the bundled
path tried, keeping the `NOVA_REPO_ROOT` hint only as the *developer* fallback
note. (Cosmetic, but the current text is now misleading.)

> SEC-013 is untouched: the bundled `nova-hub.exe` runs the same
> `connect-hub.cjs` transport, still binds `127.0.0.1`, still enforces the
> pairing token, and still carries (never mints) `payload.approval`. No
> change to `NovaHostClient`'s `HasWriteApprovalToken` presence check or the
> server issue/consume flow.

### 3.3 Embed + install the hub exe (edit, owned)

**`installer/nova-connect/NovaConnect.Installer.csproj`** — add the hub exe as an
embedded resource alongside the DLL:

```xml
<EmbeddedResource Include="..\..\integrations\revit-addin\hub\nova-hub.exe"
                  LogicalName="Payload.nova-hub.exe"
                  Condition="Exists('..\..\integrations\revit-addin\hub\nova-hub.exe')" />
```

Extend the `EnsureAddinPayload` target to also assert `nova-hub.exe` exists, so
the installer never ships without the hub.

**`installer/nova-connect/Program.cs`** — add
`const string HubResource = "Payload.nova-hub.exe";` and, after the DLL extract,
`ExtractResource(HubResource, Path.Combine(novaDir, "nova-hub.exe"), required: true)`
so it lands at `%APPDATA%\Autodesk\Revit\Addins\2027\Nova\nova-hub.exe` — exactly
where `FindBundledHubExe()` looks (next to the DLL). The existing uninstall path
already deletes `novaDir` recursively, so the hub exe is removed on uninstall
with no extra code.

### 3.4 Build wiring + signing (edit, owned — may pull in **Link/platform**)

**`scripts/build-connect-installer.ps1`** — before the add-in build, invoke
`scripts/build-connect-hub-exe.ps1` to produce `nova-hub.exe`, and bail with an
actionable message if it's missing (mirrors the existing `dll`/`template`
guards). Forward `@signProps` so the hub exe is signed when signing is on.

**Signing** — reuse the existing scaffold. Two viable wirings (pick one; O2):
- **(a)** Sign `nova-hub.exe` inside the installer project via a new
  `AfterTargets` hook in `NovaSigning.targets` / the installer csproj, just like
  `SignNovaArtifactAfterPublish` signs the EXE; or
- **(b)** Sign it standalone in `build-connect-hub-exe.ps1` by calling
  `scripts/sign-revit-addin.ps1 <nova-hub.exe>` when `NOVA_SIGN_METHOD` is set
  (that script already accepts a file path and is a no-op when unsigned).

> **Open decision for the owner (O2):** (a) MSBuild target vs. (b) standalone
> script call for signing the hub exe. Default = **(b)** — smallest change,
> reuses `sign-revit-addin.ps1` as-is, keeps signing logic in one PowerShell
> helper.

### 3.5 Docs (edit, owned)

- **`docs/revit-addin-build.md`** — add a "Bundled hub (`nova-hub.exe`)" section:
  how to build it (`npm run build:connect-hub-exe`), the pinned Node version, that
  it's a gitignored artifact, and that the installer now ships four payloads
  (DLL, deps, manifest **+ hub exe**).
- **`docs/architecture/revit-connect.md`** — update the "Connection toggle and
  the hub-bundling follow-up" section: the follow-up is now **done via Approach
  A**; the toggle launches the bundled hub; `NOVA_REPO_ROOT`/`NOVA_HUB_EXE` are
  dev overrides; note C remains the eventual zero-dependency end state.
- **`docs/architecture/decisions.md`** — append a dated decision entry: *Bundle a
  Node SEA hub exe for Connect distribution (A over B/C)*.
- **`docs/NOVA.md`** (hot file — §6) — one-line status update under §5 (Connect
  prototype → "Connect works on a clean install via a bundled hub exe").

---

## 4. Release impact (re-repackage + release)

This change alters the **served installer**, so it follows the existing repackage
flow (the same one used for the prior add-in repackage/signing work):

1. Build the hub exe → build the add-in (Release) → publish the installer with
   the new payload, via `npm run build:connect-installer` (now also running
   `build:connect-hub-exe`).
2. That regenerates **`public/downloads/NovaConnect-Setup.exe`** (+ `.sha256`) —
   a committed binary, larger now (it embeds `nova-hub.exe`). Commit the
   regenerated installer + sidecar.
3. For a trusted download, build with `NOVA_SIGN_METHOD=trusted-signing` so the
   hub exe **and** the installer are signed; let SmartScreen/SAC reputation
   accrue before announcing.
4. **Release:** merge to `develop` → `nova-dev` (verify), then merge `develop` →
   `main` so `hi-nova.work` serves the new installer (matches the release
   pattern: dev and main move together; main push = production deploy).

> **Payload note for the owner (O3):** the served installer grows by roughly the
> compressed Node SEA size (tens of MB). Confirm that's acceptable for the
> public download, or gate the hub behind a separate optional download. Default =
> bundle it (one-click Connect is the whole point).

---

## 5. Test / verify plan

Trinity must record results per ENGINEERING.md §4. The decisive test is a
**clean machine** (no repo, no Node):

1. **Hub exe smoke (no Node, no repo).** On a box without Node and without a
   checkout (or simulate: rename Node off `PATH`, unset `NOVA_REPO_ROOT`), run
   `nova-hub.exe --port=8765 --token=nova-local`; confirm it logs
   `Hub listening on ws://127.0.0.1:8765` and accepts a WS connection.
2. **Protocol-parity unit test.** Run the existing hub routing tests against the
   bundled exe's code (the bundle is the same `createConnectHub`), and add a
   smoke test that a `hello` with the right pairing token gets
   `connection.established`, a wrong token gets `INVALID_PAIRING_TOKEN`, and
   `ping`→`pong`. Asserts the protocol is byte-for-byte unchanged.
3. **Toggle goes green (end-to-end, clean install).** Install via the repackaged
   `NovaConnect-Setup.exe` on a machine with **no repo and no Node**, restart
   Revit, click **Connect** → the dot turns **green / "Connected"**, no
   `NOVA_REPO_ROOT` TaskDialog. Open `https://hi-nova.work/` and confirm the
   browser auto-connects to `ws://127.0.0.1:8765`.
4. **Dev fallback still works.** On a dev box, delete/rename the bundled exe and
   set `NOVA_REPO_ROOT`; confirm the `node scripts/connect-hub.cjs` fallback
   still starts (no regression to the developer workflow).
5. **SEC-013 intact.** Confirm a write still requires `payload.approval.token`
   presence at the add-in and the server issue/consume/audit path is unchanged
   (no code touched there — verify by inspection + the existing approval tests).
6. **Signing dry-run.** `NOVA_SIGN_DRYRUN=1` build prints the exact sign command
   for `nova-hub.exe` and the installer; a real signed build leaves both signed.
7. **Uninstall.** `NovaConnect-Setup.exe /uninstall` removes `nova-hub.exe` with
   the `Nova\` folder (no orphan).
8. **Build ladder.** `dotnet build` add-in (Release, 0 errors + expected
   MSB3277), installer publish succeeds, `npm run build:connect-installer`
   produces a larger signed installer + fresh `.sha256`.

---

## 6. Ownership, hot files, workboard

- **Single lane.** Every change above is in the **Connect/Revit** slice
  (`integrations/revit-addin/**`, `installer/nova-connect/**`, `scripts/*connect-hub*`,
  `scripts/build-connect-installer.ps1`, the Connect docs) — one owner, **Trinity
  (connect-engineer)**. The one build/signing decision (§3.4) may consult
  **Link (platform)** but stays inside Trinity's files.
- **Hot files touched:** `package.json` (add a script + 2 devDeps) and
  `docs/NOVA.md` (one-line status). Both are serialized hot files — Trinity must
  lock them on the workboard. They are tiny, additive touches.
- **No overlap** with the current active claim (`feat/run-modes`, UI files only).

---

## 7. Open decisions for the owner (recap)

- **O1 — Approach:** A (Node SEA, default) vs. fast-track C (C# in-process).
- **O2 — Hub signing wiring:** (a) MSBuild target vs. (b) standalone script call
  (default (b)).
- **O3 — Payload size:** bundle the hub into the served installer (default) vs.
  separate optional download.
- **O4 — Node version pin:** which Node LTS to build the SEA from (recommend
  **22 LTS**); document it so rebuilds are reproducible.
