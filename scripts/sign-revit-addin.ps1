<#
.SYNOPSIS
  Parameterized Authenticode code-signing helper for Nova Connect artifacts
  (the Revit add-in DLL and the installer EXE).

.DESCRIPTION
  Signs one or more files when signing credentials are configured, and is a
  clean NO-OP (logs and exits 0) when they are not -- so unsigned dev builds
  still succeed. It is invoked by the MSBuild SignNovaArtifact target in
  Nova.RevitAddin.csproj / NovaConnect.Installer.csproj (gated behind
  /p:Sign=true or the presence of NOVA_SIGN_METHOD), and can also be run
  standalone from a release pipeline.

  Two signing methods, selected by the NOVA_SIGN_METHOD env var:

    trusted-signing   Azure Trusted Signing via the `dotnet sign` CLI
                      (Microsoft.Sign.Cli). This is the recommended path:
                      certificates are short-lived / issued per-operation and
                      Trusted Signing builds Microsoft SmartScreen / Smart App
                      Control reputation.
                      Required env:
                        NOVA_SIGN_TS_ENDPOINT   e.g. https://eus.codesigning.azure.net
                        NOVA_SIGN_TS_ACCOUNT    Trusted Signing account name
                        NOVA_SIGN_TS_PROFILE    certificate profile name
                      Auth uses the ambient Azure credential (az login, a
                      managed identity, or AZURE_* service-principal env vars).

    pfx               Generic PFX + signtool.exe fallback for environments that
                      hold a traditional code-signing certificate file.
                      Required env:
                        NOVA_SIGN_PFX           path to the .pfx file
                      Optional env:
                        NOVA_SIGN_PFX_PASSWORD  PFX password (if protected)

  Common optional env:
    NOVA_SIGN_TIMESTAMP_URL   RFC-3161 timestamp authority
                              (default http://timestamp.acs.microsoft.com)
    NOVA_SIGN_DESCRIPTION     signature description (default "Nova Connect")

.PARAMETER Path
  One or more files to sign.

.PARAMETER DryRun
  Print the exact signing command that WOULD run instead of running it. Used by
  CI / tests to prove the signing branch is reachable without a real cert.

.NOTES
  Never commit a .pfx, a password, or any Azure secret. All inputs are read from
  the environment so nothing sensitive is stored in the repo. ASCII-only on
  purpose so Windows PowerShell 5.1 (the MSBuild Exec host) parses it cleanly.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
  [string[]] $Path,

  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

function Write-SignInfo([string] $m) { Write-Host "[sign] $m" -ForegroundColor Cyan }
function Write-SignSkip([string] $m) { Write-Host "[sign] $m" -ForegroundColor Yellow }

# Allow the dry-run to be forced via env too (handy from MSBuild/tests).
if ($env:NOVA_SIGN_DRYRUN -and $env:NOVA_SIGN_DRYRUN -ne '0') { $DryRun = $true }

$method = $env:NOVA_SIGN_METHOD
if ([string]::IsNullOrWhiteSpace($method)) {
  Write-SignSkip "NOVA_SIGN_METHOD not set - skipping code signing (unsigned build). Set NOVA_SIGN_METHOD=trusted-signing|pfx to enable."
  exit 0
}
$method = $method.Trim().ToLowerInvariant()

# Resolve + validate the target files (skip anything missing rather than fail
# the whole build - the caller passes both the DLL and the EXE).
$targets = @()
foreach ($p in $Path) {
  if ([string]::IsNullOrWhiteSpace($p)) { continue }
  if (Test-Path -LiteralPath $p) {
    $targets += (Resolve-Path -LiteralPath $p).Path
  } else {
    Write-SignSkip "Target not found, skipping: $p"
  }
}
if ($targets.Count -eq 0) {
  Write-SignSkip "No existing files to sign - nothing to do."
  exit 0
}

$timestampUrl = if ($env:NOVA_SIGN_TIMESTAMP_URL) { $env:NOVA_SIGN_TIMESTAMP_URL } else { 'http://timestamp.acs.microsoft.com' }
$description  = if ($env:NOVA_SIGN_DESCRIPTION)   { $env:NOVA_SIGN_DESCRIPTION }   else { 'Nova Connect' }

switch ($method) {

  'trusted-signing' {
    foreach ($v in 'NOVA_SIGN_TS_ENDPOINT', 'NOVA_SIGN_TS_ACCOUNT', 'NOVA_SIGN_TS_PROFILE') {
      $val = [Environment]::GetEnvironmentVariable($v)
      if ([string]::IsNullOrWhiteSpace($val)) {
        throw "NOVA_SIGN_METHOD=trusted-signing but $v is not set. Set NOVA_SIGN_TS_ENDPOINT, NOVA_SIGN_TS_ACCOUNT, and NOVA_SIGN_TS_PROFILE."
      }
    }

    # `dotnet sign` (Microsoft.Sign.Cli) drives Azure Trusted Signing. Install
    # once with:  dotnet tool install --global sign
    # It authenticates with the ambient Azure credential (az login / managed
    # identity / AZURE_* service principal).
    foreach ($file in $targets) {
      $signArgs = @(
        'sign', 'code', 'trusted-signing',
        '--trusted-signing-endpoint', $env:NOVA_SIGN_TS_ENDPOINT,
        '--trusted-signing-account',  $env:NOVA_SIGN_TS_ACCOUNT,
        '--trusted-signing-certificate-profile', $env:NOVA_SIGN_TS_PROFILE,
        '--timestamp-url', $timestampUrl,
        '--description', $description,
        $file
      )
      if ($DryRun) {
        Write-SignInfo "DRYRUN dotnet $($signArgs -join ' ')"
        continue
      }
      Write-SignInfo "Trusted Signing: $file"
      & dotnet @signArgs
      if ($LASTEXITCODE -ne 0) { throw "dotnet sign failed for $file (exit $LASTEXITCODE)." }
    }
  }

  'pfx' {
    if ([string]::IsNullOrWhiteSpace($env:NOVA_SIGN_PFX)) {
      throw "NOVA_SIGN_METHOD=pfx but NOVA_SIGN_PFX is not set. Point it at your .pfx file."
    }
    if (-not $DryRun -and -not (Test-Path -LiteralPath $env:NOVA_SIGN_PFX)) {
      throw "NOVA_SIGN_PFX does not exist: $($env:NOVA_SIGN_PFX)"
    }

    $signtool = $null
    if (-not $DryRun) {
      $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
      if ($cmd) { $signtool = $cmd.Source }
      if (-not $signtool) {
        # signtool ships with the Windows SDK; probe the usual install root.
        $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' -ErrorAction SilentlyContinue |
          Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
      }
      if (-not $signtool) { throw "signtool.exe not found. Install the Windows SDK or add signtool to PATH." }
    }

    foreach ($file in $targets) {
      # Build args; redact the password when echoing.
      $stArgs = @('sign', '/fd', 'SHA256', '/tr', $timestampUrl, '/td', 'SHA256', '/d', $description, '/f', $env:NOVA_SIGN_PFX)
      $echoArgs = @('sign', '/fd', 'SHA256', '/tr', $timestampUrl, '/td', 'SHA256', '/d', $description, '/f', $env:NOVA_SIGN_PFX)
      if ($env:NOVA_SIGN_PFX_PASSWORD) {
        $stArgs   += @('/p', $env:NOVA_SIGN_PFX_PASSWORD)
        $echoArgs += @('/p', '***')
      }
      $stArgs   += $file
      $echoArgs += $file

      if ($DryRun) {
        Write-SignInfo "DRYRUN signtool.exe $($echoArgs -join ' ')"
        continue
      }
      Write-SignInfo "signtool (PFX): $file"
      & $signtool @stArgs
      if ($LASTEXITCODE -ne 0) { throw "signtool failed for $file (exit $LASTEXITCODE)." }
    }
  }

  default {
    throw "Unknown NOVA_SIGN_METHOD '$method'. Use 'trusted-signing' or 'pfx'."
  }
}

Write-SignInfo "Signing complete ($method): $($targets.Count) file(s)."
exit 0
