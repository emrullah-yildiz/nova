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
$hashPath   = Join-Path $outDir 'NovaConnect-Setup.exe.sha256'

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
if (Test-Path $hashPath) { Remove-Item $hashPath -Force }

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

  if ($env:NOVA_CODESIGN_THUMBPRINT) {
    $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if (-not $signtool) {
      Write-Host "ERROR: NOVA_CODESIGN_THUMBPRINT is set, but signtool.exe was not found." -ForegroundColor Red
      exit 1
    }

    $timestampUrl = if ($env:NOVA_CODESIGN_TIMESTAMP_URL) { $env:NOVA_CODESIGN_TIMESTAMP_URL } else { 'http://timestamp.digicert.com' }
    Write-Host "Signing installer with certificate thumbprint $env:NOVA_CODESIGN_THUMBPRINT..." -ForegroundColor Cyan
    & $signtool.Source sign /fd SHA256 /tr $timestampUrl /td SHA256 /sha1 $env:NOVA_CODESIGN_THUMBPRINT $exePath
    if ($LASTEXITCODE -ne 0) {
      Write-Host "ERROR: signtool failed with exit code $LASTEXITCODE" -ForegroundColor Red
      exit $LASTEXITCODE
    }
  } else {
    Write-Host "Code signing skipped. Set NOVA_CODESIGN_THUMBPRINT to sign the installer." -ForegroundColor Yellow
  }

  $hash = (Get-FileHash -Path $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -Path $hashPath -Value "$hash  NovaConnect-Setup.exe" -Encoding ascii

  $sizeMb = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
  Write-Host "Wrote $exePath ($sizeMb MB)" -ForegroundColor Green
  Write-Host "Wrote $hashPath" -ForegroundColor Green
  Write-Host "It will be served at /downloads/NovaConnect-Setup.exe after a build/deploy." -ForegroundColor White
}
finally {
  Remove-Item $publishDir -Recurse -Force -ErrorAction SilentlyContinue
}
