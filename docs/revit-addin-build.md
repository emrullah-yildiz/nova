# Building & Signing the Nova Connect Revit Add-in

> Tier-3 build/runbook for the Connect/Revit lane. Architecture lives in
> [`architecture/revit-connect.md`](architecture/revit-connect.md); this file is
> the *how to rebuild, sign, and ship* recipe.

Nova Connect ships as two C# artifacts:

- **`Nova.RevitAddin.dll`** — the Revit add-in (`integrations/revit-addin/`),
  built against the **Autodesk Revit 2027** API. It registers the **Nova Connect
  ribbon** (Add-Ins tab) with two buttons: **Connect** (the On/Off connection
  toggle, `ConnectionToggleCommand`) and **Open Nova** (`OpenNovaCommand`, opens
  `https://hi-nova.work/`). Entry point: `NovaConnectApp` (`IExternalApplication`).
  The local Connect hub runs **in-process** in this DLL (`NovaHub`, Approach C) —
  no Node, no separate hub exe.
- **`NovaConnect-Setup.msi`** — a per-user (no-admin) WiX v5 MSI
  (`installer/nova-connect/`, `NovaConnect.Installer.wixproj` + `Package.wxs`) with
  a `WixUI_InstallDir` wizard (Welcome → License/accept-ToS → InstallDir → Progress
  → Finish). It installs the add-in DLL, its `deps.json`, and the resolved
  `Nova.addin` manifest into `%APPDATA%\Autodesk\Revit\Addins\2027\Nova\` for the
  current user, and registers a per-user Add/Remove Programs entry. It is a few MB
  (≈ 0.44 MB) — there is no bundled hub.

The downloadable artifact the web app serves lives at
`public/downloads/NovaConnect-Setup.msi` (Vite copies `public/` into `dist/`, so
it is served at `/downloads/NovaConnect-Setup.msi`). The Connect panel's
**Download Nova Connect** button points there.

## Prerequisites

- **.NET SDK 10** (`dotnet --version` -> `10.0.x`).
- **Autodesk Revit 2027** installed at `C:\Program Files\Autodesk\Revit 2027`
  (for the `RevitAPI.dll` / `RevitAPIUI.dll` references). Override the location
  with the `REVIT_API_DIR` env var if Revit is elsewhere.
- Windows (the add-in is WPF/Revit and the installer is `win-x64`).

> The `MSB3277` "found conflicts between different versions of the same
> dependency" warnings from the Revit references are **expected** and harmless —
> the Revit assemblies are referenced with `Private=false` (not copied).

## Rebuild the add-in

```powershell
dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Release
# -> integrations/revit-addin/bin/Release/net10.0-windows/Nova.RevitAddin.dll
```

Expect `0 Error(s)` and the two `MSB3277` Revit-ref warnings.

## Rebuild the installer (and refresh the served artifact)

Use the helper — it builds the add-in in **Release** first (so the MSI always
embeds a **fresh** `Nova.RevitAddin.dll`, never a stale copy), then builds the WiX
MSI to `public/downloads/`:

```powershell
npm run build:connect-installer
# == powershell -NoProfile -File scripts/build-connect-installer.ps1
# -> public/downloads/NovaConnect-Setup.msi (+ .sha256)
```

What it does:

1. `dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Release`.
2. Generates `installer/nova-connect/License.rtf` from
   `docs/legal/terms-of-service.md` (`scripts/build-license-rtf.ps1`).
3. `dotnet tool restore` (the WiX tool is pinned in `.config/dotnet-tools.json`).
4. `dotnet build installer/nova-connect/NovaConnect.Installer.wixproj -c Release`
   (the WiX project resolves `Nova.addin` from the template, harvests the
   Release add-in DLL + `deps.json`, and emits the MSI).
5. Copies the built MSI to `public/downloads/NovaConnect-Setup.msi` and writes the
   SHA-256 sidecar.

The WiX project embeds the **Release** add-in output by default
(`AddinConfiguration=Release` in the `.wixproj`); override with
`/p:AddinConfiguration=Debug` for a debug payload. An `EnsurePayload` MSBuild
target fails fast with an actionable message if the add-in DLL or `License.rtf`
hasn't been produced yet, so the MSI can never silently embed a missing/old DLL.

> Building under a non-admin system policy emits one benign
> `WIX1105: Validation could not run due to system policy` warning (ICE validation
> is skipped). The MSI still builds with `0 Error(s)`.

> **Commit note.** The regenerated `public/downloads/NovaConnect-Setup.msi`
> (≈ 0.44 MB) is committed on purpose (it is what `hi-nova.work` serves). The
> `bin/`/`obj/` build outputs under `integrations/revit-addin/` and
> `installer/nova-connect/` are gitignored and must never be committed.

## Code signing (optional, parameterized)

Signing is **off by default** — unsigned dev builds succeed. It is a clean
no-op (log + skip) unless you opt in with `/p:Sign=true` **and** set
`NOVA_SIGN_METHOD`. The build script auto-opts-in when `NOVA_SIGN_METHOD` is
present in the environment.

Signing logic lives in one helper, `scripts/sign-revit-addin.ps1`, invoked by
the shared MSBuild target in `integrations/revit-addin/NovaSigning.targets`
(imported by both the add-in and the WiX installer projects). It signs **both** the
add-in DLL (after the add-in Build) and the **MSI** (after the WiX Build). There is
no separate hub exe to sign.

**Never commit a `.pfx`, a password, or any Azure secret.** All inputs are read
from environment variables.

### Method 1 — Azure Trusted Signing (recommended)

Trusted Signing issues short-lived, per-operation certificates and builds
Microsoft SmartScreen / Smart App Control **reputation** for the publisher. It
is driven by the `dotnet sign` CLI (`Microsoft.Sign.Cli`):

```powershell
dotnet tool install --global sign     # one-time

$env:NOVA_SIGN_METHOD      = 'trusted-signing'
$env:NOVA_SIGN_TS_ENDPOINT = 'https://eus.codesigning.azure.net'   # your region
$env:NOVA_SIGN_TS_ACCOUNT  = '<trusted-signing-account-name>'
$env:NOVA_SIGN_TS_PROFILE  = '<certificate-profile-name>'
# Auth: az login, a managed identity, or AZURE_* service-principal env vars.

npm run build:connect-installer        # signs DLL + MSI during build
```

> Trusted Signing certificates require **identity validation** (individual or
> organization) before a profile can issue. Individual validation is the
> lightest path for a solo publisher.

### Method 2 — PFX + signtool (fallback)

For environments holding a traditional code-signing certificate file:

```powershell
$env:NOVA_SIGN_METHOD       = 'pfx'
$env:NOVA_SIGN_PFX          = 'C:\secrets\nova-codesign.pfx'   # not in the repo
$env:NOVA_SIGN_PFX_PASSWORD = '<pfx-password>'                 # optional
# Optional: $env:NOVA_SIGN_TIMESTAMP_URL, $env:NOVA_SIGN_DESCRIPTION

npm run build:connect-installer
```

`signtool.exe` is resolved from `PATH` or the latest Windows Kits `bin` folder.

### Environment variables

| Var | Method | Meaning |
|---|---|---|
| `NOVA_SIGN_METHOD` | both | `trusted-signing` or `pfx`. Unset = no-op skip. |
| `NOVA_SIGN_TS_ENDPOINT` | trusted-signing | Trusted Signing region endpoint URL. |
| `NOVA_SIGN_TS_ACCOUNT` | trusted-signing | Trusted Signing account name. |
| `NOVA_SIGN_TS_PROFILE` | trusted-signing | Certificate profile name. |
| `NOVA_SIGN_PFX` | pfx | Path to the `.pfx` file. |
| `NOVA_SIGN_PFX_PASSWORD` | pfx | PFX password (optional). |
| `NOVA_SIGN_TIMESTAMP_URL` | both | RFC-3161 TSA (default `http://timestamp.acs.microsoft.com`). |
| `NOVA_SIGN_DESCRIPTION` | both | Signature description (default `Nova Connect`). |
| `NOVA_SIGN_DRYRUN` / `/p:SignDryRun=true` | both | Echo the signing command instead of running it. |

### MSBuild flags

```powershell
# Sign during a project build:
dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Release -p:Sign=true
dotnet build installer/nova-connect/NovaConnect.Installer.wixproj -c Release -p:Sign=true ...

# Prove the signing branch without a cert (echoes the exact command):
dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Release -p:Sign=true -p:SignDryRun=true
```

### Run the signer standalone

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sign-revit-addin.ps1 `
  path\to\Nova.RevitAddin.dll path\to\NovaConnect-Setup.msi [-DryRun]
```

## Installing (end user)

1. Click **Download Nova Connect** in the Connect panel ->
   `NovaConnect-Setup.msi`.
2. Double-click it to run the wizard: Welcome → License (accept the Terms of
   Service) → Install location → Progress → Finish. It is a **per-user** install
   (no admin), copies the add-in to `%APPDATA%\Autodesk\Revit\Addins\2027\Nova\`,
   writes `Nova.addin`, and registers a per-user Add/Remove Programs entry.
3. Restart Revit -> **Add-Ins** tab -> **Nova Connect** panel (Connect / Open Nova).
4. Uninstall: Windows **Apps & features**, or `msiexec /x NovaConnect-Setup.msi`.

## Smart App Control / SmartScreen note

Windows **Smart App Control (SAC)** and SmartScreen gate unknown installers:

- **Unsigned** `NovaConnect-Setup.msi`: SAC (when enforced) may **block** it
  outright, and SmartScreen shows an "unrecognized publisher" warning. This is
  expected for dev/unsigned builds.
- **Signed via Azure Trusted Signing**: the MSI earns publisher **reputation**
  over time, which is what lets SAC/SmartScreen trust it without a warning. A
  fresh signature still needs to accrue reputation; a brand-new certificate is
  not instantly trusted.
- A self-issued or low-reputation certificate satisfies "is signed" but does not
  by itself clear SAC — reputation, not merely a signature, is what SAC checks.

For public distribution, sign with **Trusted Signing** (individual or org
validation) — the add-in DLL **and** the MSI — and allow reputation to build
before announcing the download widely.

## What is NOT in this build (queued handoffs)

The Revit **read handlers** (RV-M1 project snapshot / element query; RV-M2
selected-element metadata) are **not** implemented in the C# add-in — they
remain queued handoffs (see `docs/agent-handoff.md`). This task covered only the
rebuild, repackage, served-artifact refresh, and the signing scaffold.
