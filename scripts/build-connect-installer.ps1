# Builds the downloadable Nova Connect installer EXE.
#
# Publishes a single-file, self-contained Windows installer executable to
# public/downloads/NovaConnect-Setup.exe. Vite copies public/ into dist/ at
# build time, so the result is served at /downloads/NovaConnect-Setup.exe.
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
$project    = Join-Path $installer 'NovaConnect.Installer.csproj'
$outDir     = Join-Path $repoRoot 'public\downloads'
$exePath    = Join-Path $outDir 'NovaConnect-Setup.exe'

$dll  = Join-Path $buildOut 'Nova.RevitAddin.dll'
$deps = Join-Path $buildOut 'Nova.RevitAddin.deps.json'

Write-Host "Building Nova Connect installer EXE..." -ForegroundColor Cyan

if (-not (Test-Path $dll)) {
  Write-Host "ERROR: $dll not found." -ForegroundColor Red
  Write-Host "Build the add-in first: dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Debug" -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path $template)) {
  Write-Host "ERROR: manifest template not found at $template" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $project)) {
  Write-Host "ERROR: installer project not found at $project" -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
if (Test-Path $exePath) { Remove-Item $exePath -Force }

$publishDir = Join-Path ([System.IO.Path]::GetTempPath()) ("nova-connect-publish-" + [System.Guid]::NewGuid().ToString('N'))
try {
  dotnet publish $project `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:PublishTrimmed=true `
    -p:TrimMode=full `
    -p:EnableCompressionInSingleFile=true `
    -p:DebugType=None `
    -p:DebugSymbols=false `
    -o $publishDir

  $publishedExe = Join-Path $publishDir 'NovaConnect-Setup.exe'
  if (-not (Test-Path $publishedExe)) {
    Write-Host "ERROR: dotnet publish did not produce $publishedExe" -ForegroundColor Red
    exit 1
  }

  Copy-Item $publishedExe $exePath -Force
  $sizeMb = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
  Write-Host "Wrote $exePath ($sizeMb MB)" -ForegroundColor Green
  Write-Host "It will be served at /downloads/NovaConnect-Setup.exe after a build/deploy." -ForegroundColor White
}
finally {
  Remove-Item $publishDir -Recurse -Force -ErrorAction SilentlyContinue
}
