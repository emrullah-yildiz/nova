# Builds the downloadable Nova Connect installer (WiX MSI).
#
# Approach C (in-process C# hub): the Connect hub runs INSIDE the add-in DLL, so
# the MSI ships only the add-in DLL + deps.json + Nova.addin manifest — a few MB,
# no bundled hub exe, no Node. It is served at /downloads/NovaConnect-Setup.msi
# (Vite copies public/ into dist/ at build time).
#
# Steps:
#   1. Build the C# add-in in Release (so the MSI embeds a fresh DLL).
#   2. Generate License.rtf from docs/legal/terms-of-service.md.
#   3. Restore the pinned WiX tool (.config/dotnet-tools.json).
#   4. Build the MSI (WiX) and publish it + its .sha256 to public/downloads/.
#
# Run from the repo root (Windows):  pwsh scripts/build-connect-installer.ps1
# or:  npm run build:connect-installer
#
# Code signing (optional): set NOVA_SIGN_METHOD=trusted-signing|pfx (plus the
# matching env vars -- see scripts/sign-revit-addin.ps1 / docs/revit-addin-build.md)
# to sign the add-in DLL and the MSI. Without it the build is a clean unsigned no-op.

$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$installer  = Join-Path $repoRoot 'installer\nova-connect'
$addinDir   = Join-Path $repoRoot 'integrations\revit-addin'
$addinProj  = Join-Path $addinDir 'Nova.RevitAddin.csproj'
$buildOut   = Join-Path $addinDir 'bin\Release\net10.0-windows'
$wixProj    = Join-Path $installer 'NovaConnect.Installer.wixproj'
$licenseScript = Join-Path $repoRoot 'scripts\build-license-rtf.ps1'
$outDir     = Join-Path $repoRoot 'public\downloads'
$msiPath    = Join-Path $outDir 'NovaConnect-Setup.msi'
$hashPath   = Join-Path $outDir 'NovaConnect-Setup.msi.sha256'

$dll = Join-Path $buildOut 'Nova.RevitAddin.dll'

# Signing flags forwarded to dotnet build (no-op unless NOVA_SIGN_METHOD is set
# or -p:Sign=true is already in the environment).
$signProps = @()
if ($env:NOVA_SIGN_METHOD) { $signProps += '-p:Sign=true' }
if ($env:NOVA_SIGN_DRYRUN -and $env:NOVA_SIGN_DRYRUN -ne '0') { $signProps += '-p:SignDryRun=true' }

Write-Host "Building Nova Connect add-in (Release)..." -ForegroundColor Cyan
dotnet build $addinProj -c Release @signProps
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: add-in build failed (exit $LASTEXITCODE)." -ForegroundColor Red
  exit $LASTEXITCODE
}
if (-not (Test-Path $dll)) {
  Write-Host "ERROR: $dll not found after build." -ForegroundColor Red
  exit 1
}

Write-Host "Generating License.rtf from the Terms of Service..." -ForegroundColor Cyan
& $licenseScript
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: License.rtf generation failed (exit $LASTEXITCODE)." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Restoring the pinned WiX tool..." -ForegroundColor Cyan
Push-Location $repoRoot
try {
  dotnet tool restore
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: 'dotnet tool restore' failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
if (Test-Path $msiPath) { Remove-Item $msiPath -Force }
if (Test-Path $hashPath) { Remove-Item $hashPath -Force }

$publishDir = Join-Path ([System.IO.Path]::GetTempPath()) ("nova-connect-msi-" + [System.Guid]::NewGuid().ToString('N'))
try {
  Write-Host "Building Nova Connect MSI (WiX)..." -ForegroundColor Cyan
  # Signing (if configured) happens inside the WiX project's SignNovaArtifact
  # MSBuild target, so the produced MSI is already signed before we copy it.
  dotnet build $wixProj -c Release -o $publishDir @signProps
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: MSI build failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
  }

  $publishedMsi = Join-Path $publishDir 'NovaConnect-Setup.msi'
  if (-not (Test-Path $publishedMsi)) {
    Write-Host "ERROR: MSI build did not produce $publishedMsi" -ForegroundColor Red
    exit 1
  }

  Copy-Item $publishedMsi $msiPath -Force

  if (-not $env:NOVA_SIGN_METHOD) {
    Write-Host "Code signing skipped. Set NOVA_SIGN_METHOD=trusted-signing|pfx to sign (see docs/revit-addin-build.md)." -ForegroundColor Yellow
  }

  $hash = (Get-FileHash -Path $msiPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -Path $hashPath -Value "$hash  NovaConnect-Setup.msi" -Encoding ascii

  $sizeMb = [math]::Round((Get-Item $msiPath).Length / 1MB, 2)
  Write-Host "Wrote $msiPath ($sizeMb MB)" -ForegroundColor Green
  Write-Host "Wrote $hashPath" -ForegroundColor Green
  Write-Host "It will be served at /downloads/NovaConnect-Setup.msi after a build/deploy." -ForegroundColor White
}
finally {
  Remove-Item $publishDir -Recurse -Force -ErrorAction SilentlyContinue
}
