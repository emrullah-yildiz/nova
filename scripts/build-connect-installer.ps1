# Builds the downloadable Nova Connect installer ZIP.
#
# Stages the installer scripts (installer/nova-connect/), the Revit add-in
# manifest template, and the compiled add-in DLL into a temp folder, then zips
# them to public/downloads/NovaConnect-Setup.zip. Vite copies public/ into dist/
# at build time, so the result is served at /downloads/NovaConnect-Setup.zip.
#
# Run from the repo root (Windows):  pwsh scripts/build-connect-installer.ps1
# or:  npm run build:connect-installer
#
# Rebuild the C# add-in first if it changed:
#   dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Debug

$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$installer  = Join-Path $repoRoot 'installer\nova-connect'
$addinDir   = Join-Path $repoRoot 'integrations\revit-addin'
$buildOut   = Join-Path $addinDir 'bin\Debug\net10.0-windows'
$template   = Join-Path $addinDir 'Nova.addin.template'
$outDir     = Join-Path $repoRoot 'public\downloads'
$zipPath    = Join-Path $outDir 'NovaConnect-Setup.zip'

$dll  = Join-Path $buildOut 'Nova.RevitAddin.dll'
$deps = Join-Path $buildOut 'Nova.RevitAddin.deps.json'

Write-Host "Building Nova Connect installer ZIP..." -ForegroundColor Cyan

if (-not (Test-Path $dll)) {
  Write-Host "ERROR: $dll not found." -ForegroundColor Red
  Write-Host "Build the add-in first: dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Debug" -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path $template)) {
  Write-Host "ERROR: manifest template not found at $template" -ForegroundColor Red
  exit 1
}

# Stage everything in a clean temp folder so the ZIP has a flat, predictable layout.
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("nova-connect-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
  Copy-Item (Join-Path $installer 'Install Nova Connect.bat')   $stage
  Copy-Item (Join-Path $installer 'Install-NovaConnect.ps1')    $stage
  Copy-Item (Join-Path $installer 'Uninstall Nova Connect.bat') $stage
  Copy-Item (Join-Path $installer 'Uninstall-NovaConnect.ps1')  $stage
  Copy-Item (Join-Path $installer 'README.txt')                 $stage
  Copy-Item $template (Join-Path $stage 'Nova.addin.template')
  Copy-Item $dll  $stage
  if (Test-Path $deps) { Copy-Item $deps $stage }

  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -Force

  $sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
  Write-Host "Wrote $zipPath ($sizeKb KB)" -ForegroundColor Green
  Write-Host "It will be served at /downloads/NovaConnect-Setup.zip after a build/deploy." -ForegroundColor White
}
finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
