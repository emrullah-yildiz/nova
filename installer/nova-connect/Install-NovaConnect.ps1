# Nova Connect - Revit add-in installer
#
# Installs the Nova Connect add-in for Autodesk Revit by copying the add-in DLL
# into Revit's per-user Addins folder and writing the .addin manifest that
# points at it. Detects whether the target Revit version is installed and warns
# before proceeding if it is not.
#
# Run by double-clicking "Install Nova Connect.bat" (which launches this with an
# execution-policy bypass), or directly:
#   powershell -ExecutionPolicy Bypass -File Install-NovaConnect.ps1

$ErrorActionPreference = 'Stop'

# The Revit version this add-in is built for. Bump this (and rebuild the add-in
# against that Revit's API) to target a different release.
$RevitVersion = '2027'

$here       = $PSScriptRoot
$dllSource  = Join-Path $here 'Nova.RevitAddin.dll'
$depsSource = Join-Path $here 'Nova.RevitAddin.deps.json'
$template   = Join-Path $here 'Nova.addin.template'

function Write-Step($msg)  { Write-Host ""; Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "  $msg" -ForegroundColor Red }

Write-Host "=====================================================" -ForegroundColor White
Write-Host " Nova Connect - Revit $RevitVersion add-in installer" -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor White

# --- Sanity: the files we ship must sit next to this script -------------------
if (-not (Test-Path $dllSource)) {
  Write-Err "Nova.RevitAddin.dll was not found next to this installer."
  Write-Err "Make sure you extracted the whole ZIP before running it."
  Read-Host "Press Enter to exit"
  exit 1
}

# --- Step 1: detect Revit -----------------------------------------------------
Write-Step "Checking for Autodesk Revit $RevitVersion..."
$revitExe    = "C:\Program Files\Autodesk\Revit $RevitVersion\Revit.exe"
$addinsDir   = Join-Path $env:APPDATA "Autodesk\Revit\Addins\$RevitVersion"
$revitFound  = (Test-Path $revitExe) -or (Test-Path $addinsDir)

if ($revitFound) {
  Write-Ok "Revit $RevitVersion detected."
} else {
  Write-Warn2 "Autodesk Revit $RevitVersion was not detected on this PC."
  Write-Warn2 "Nova Connect is built for Revit $RevitVersion. Installing without it"
  Write-Warn2 "means the add-in won't load until Revit $RevitVersion is installed."
  $answer = Read-Host "Continue installing anyway? [y/N]"
  if ($answer -notmatch '^(y|yes)$') {
    Write-Host ""
    Write-Host "Installation cancelled. Install Revit $RevitVersion, then run this again." -ForegroundColor White
    Read-Host "Press Enter to exit"
    exit 0
  }
}

# --- Step 2: copy the add-in --------------------------------------------------
Write-Step "Installing the add-in..."
$novaDir = Join-Path $addinsDir 'Nova'
New-Item -ItemType Directory -Path $novaDir -Force | Out-Null

$dllTarget = Join-Path $novaDir 'Nova.RevitAddin.dll'
Copy-Item -Path $dllSource -Destination $dllTarget -Force
Write-Ok "Copied add-in to $dllTarget"
if (Test-Path $depsSource) {
  Copy-Item -Path $depsSource -Destination (Join-Path $novaDir 'Nova.RevitAddin.deps.json') -Force
}

# --- Step 3: write the .addin manifest ---------------------------------------
Write-Step "Registering the add-in with Revit $RevitVersion..."
if (-not (Test-Path $template)) {
  Write-Err "Nova.addin.template is missing from the installer. Cannot register."
  Read-Host "Press Enter to exit"
  exit 1
}
$manifest = (Get-Content -Path $template -Raw).Replace('{{ASSEMBLY_PATH}}', $dllTarget)
$addinPath = Join-Path $addinsDir 'Nova.addin'
# Write UTF-8 without BOM so Revit's XML parser is happy.
[System.IO.File]::WriteAllText($addinPath, $manifest, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "Wrote manifest to $addinPath"

# --- Done --------------------------------------------------------------------
Write-Host ""
Write-Host "Nova Connect was installed successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. (Re)start Autodesk Revit $RevitVersion." -ForegroundColor White
Write-Host "  2. Go to the Add-Ins tab -> External Tools -> Nova Connect." -ForegroundColor White
Write-Host "  3. Back in the Nova web app, open Connect and click Connect." -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
