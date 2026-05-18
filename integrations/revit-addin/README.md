# Nova Revit Add-In

This is the first Revit-side launcher skeleton for Nova Connect.

## What It Does

- Adds a **Nova** ribbon tab in Revit.
- Adds an **Open Nova** button.
- Generates a local pairing token.
- Opens the Nova web app in the default browser with the Connect panel prefilled.
- Writes launch metadata to `%APPDATA%\Nova\Revit\nova-connect-launch.json`.

This branch does not yet implement the persistent Revit WebSocket host or native element creation. It creates the product entry point users will click inside Revit.

## Build

From this folder:

```powershell
dotnet build .\Nova.RevitAddin.csproj -p:RevitVersion=2025
```

If Revit is installed somewhere else:

```powershell
dotnet build .\Nova.RevitAddin.csproj -p:RevitInstallDir="C:\Program Files\Autodesk\Revit 2025"
```

## Local Install

1. Build the project.
2. Copy `Nova.addin.template` to:

```text
%APPDATA%\Autodesk\Revit\Addins\2025\Nova.addin
```

3. Replace `{{ASSEMBLY_PATH}}` with the full path to:

```text
integrations\revit-addin\bin\Debug\net48\Nova.RevitAddin.dll
```

4. Start Revit.
5. Click **Nova > Connect > Open Nova**.

## Manual Test

1. Start Nova:

```powershell
npm run dev
```

2. In Revit, click **Open Nova**.
3. Nova should open in the browser with the Connect panel visible.
4. The hub URL, pairing token, and project ID should be prefilled.
5. Start the hub with the shown token:

```powershell
npm run connect:hub -- --token=<token-from-panel>
```

The next Revit add-in branch should replace the mock host with a real host connection that uses this same token.
