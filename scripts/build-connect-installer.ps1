# Builds the downloadable Nova Connect installer EXE.
#
# Publishes a single-file, self-contained Windows installer executable to
# public/downloads/NovaConnect-Setup.exe. Vite copies public/ into dist/ at
# build time, so the result is served at /downloads/NovaConnect-Setup.exe.
#
# It builds the C# add-in in Release first, so the installer always embeds a
# fresh Payload.Nova.RevitAddin.dll (not a stale copy), then publishes the
# single-file installer.
#
# Run from the repo root (Windows):  pwsh scripts/build-connect-installer.ps1
# or:  npm run build:connect-installer
#
# Code signing (optional): set NOVA_SIGN_METHOD=trusted-signing|pfx (plus the
# matching env vars -- see scripts/sign-revit-addin.ps1 / docs/revit-addin-build.md)
# to sign the add-in DLL and the installer EXE. Without it the build is a clean
# unsigned no-op.

$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$installer  = Join-Path $repoRoot 'installer\nova-connect'
$addinDir   = Join-Path $repoRoot 'integrations\revit-addin'
$addinProj  = Join-Path $addinDir 'Nova.RevitAddin.csproj'
$buildOut   = Join-Path $addinDir 'bin\Release\net10.0-windows'
$template   = Join-Path $addinDir 'Nova.addin.template'
$project    = Join-Path $installer 'NovaConnect.Installer.csproj'
$outDir     = Join-Path $repoRoot 'public\downloads'
$exePath    = Join-Path $outDir 'NovaConnect-Setup.exe'
$hashPath   = Join-Path $outDir 'NovaConnect-Setup.exe.sha256'

$dll  = Join-Path $buildOut 'Nova.RevitAddin.dll'
$deps = Join-Path $buildOut 'Nova.RevitAddin.deps.json'

# Signing flags forwarded to dotnet build/publish (no-op unless NOVA_SIGN_METHOD
# is set or -p:Sign=true is already in the environment).
$signProps = @()
if ($env:NOVA_SIGN_METHOD) { $signProps += '-p:Sign=true' }
if ($env:NOVA_SIGN_DRYRUN -and $env:NOVA_SIGN_DRYRUN -ne '0') { $signProps += '-p:SignDryRun=true' }

Write-Host "Building Nova Connect add-in (Release)..." -ForegroundColor Cyan
dotnet build $addinProj -c Release @signProps
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: add-in build failed (exit $LASTEXITCODE)." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Building Nova Connect installer EXE..." -ForegroundColor Cyan

if (-not (Test-Path $dll)) {
  Write-Host "ERROR: $dll not found." -ForegroundColor Red
  Write-Host "Build the add-in first: dotnet build integrations/revit-addin/Nova.RevitAddin.csproj -c Release" -ForegroundColor Yellow
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
  # Signing (if configured) happens inside the installer project's
  # SignNovaArtifactAfterPublish MSBuild target, so the published EXE is already
  # signed before we copy + checksum it.
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
    @signProps `
    -o $publishDir

  $publishedExe = Join-Path $publishDir 'NovaConnect-Setup.exe'
  if (-not (Test-Path $publishedExe)) {
    Write-Host "ERROR: dotnet publish did not produce $publishedExe" -ForegroundColor Red
    exit 1
  }

  Copy-Item $publishedExe $exePath -Force

  if (-not $env:NOVA_SIGN_METHOD) {
    Write-Host "Code signing skipped. Set NOVA_SIGN_METHOD=trusted-signing|pfx to sign (see docs/revit-addin-build.md)." -ForegroundColor Yellow
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
