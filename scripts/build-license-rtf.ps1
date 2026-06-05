<#
.SYNOPSIS
  Generates the WiX license RTF (installer/nova-connect/License.rtf) from the
  canonical Terms of Service (docs/legal/terms-of-service.md).

.DESCRIPTION
  The WiX WixUI license/accept-terms page requires an RTF document. To keep the
  shown EULA in lockstep with the source of truth, this script converts the
  Markdown ToS into a minimal, self-contained RTF (headings bold, paragraphs
  wrapped) rather than maintaining a second hand-edited copy.

  It is a plain text -> RTF transform (no Word/Office dependency) so it runs in
  CI and on any Windows box. Re-run it whenever docs/legal/terms-of-service.md
  changes:  pwsh scripts/build-license-rtf.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$src      = Join-Path $repoRoot 'docs\legal\terms-of-service.md'
$dst      = Join-Path $repoRoot 'installer\nova-connect\License.rtf'

if (-not (Test-Path $src)) { throw "Terms of Service not found: $src" }

# --- RTF escaping ------------------------------------------------------------
function ConvertTo-RtfText([string] $s) {
  # Escape RTF control chars, then map a few common non-ASCII glyphs the ToS uses
  # to RTF unicode escapes so the document stays ASCII-clean.
  $s = $s -replace '\\', '\\\\'
  $s = $s -replace '\{', '\{'
  $s = $s -replace '\}', '\}'
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) {
    $code = [int][char]$ch
    if ($code -gt 127) {
      # \uN? with a '?' ASCII fallback (signed 16-bit per RTF spec).
      $signed = if ($code -gt 32767) { $code - 65536 } else { $code }
      [void]$sb.Append('\u' + $signed + '?')
    } else {
      [void]$sb.Append($ch)
    }
  }
  return $sb.ToString()
}

# Read as UTF-8 so the ToS's non-ASCII glyphs (-, ·, ", etc.) decode correctly
# before being re-encoded as \uN? RTF escapes.
$lines = [System.IO.File]::ReadAllLines($src, [System.Text.Encoding]::UTF8)

# Strip inline Markdown emphasis/link syntax, leaving plain text.
function Remove-Md([string] $s) {
  $s = $s -replace '\*\*([^*]+)\*\*', '$1'
  $s = $s -replace '\*([^*]+)\*', '$1'
  $s = $s -replace '`([^`]+)`', '$1'
  $s = $s -replace '\[([^\]]+)\]\([^)]+\)', '$1'
  return $s
}

$rtf = New-Object System.Text.StringBuilder
[void]$rtf.Append('{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fswiss\fcharset0 Segoe UI;}}')
[void]$rtf.Append("`r`n\fs18`r`n")  # ~9pt base

foreach ($raw in $lines) {
  $line = $raw.TrimEnd()
  if ($line -eq '') { [void]$rtf.Append('\par' + "`r`n"); continue }

  # Markdown table rows / separators -> skip the pipe scaffolding, keep content.
  if ($line -match '^\s*\|') {
    $cells = ($line.Trim('|') -split '\|') | ForEach-Object { $_.Trim() }
    if (($cells -join '') -match '^[-:\s]*$') { continue }   # separator row
    $text = (Remove-Md (($cells | Where-Object { $_ -ne '' }) -join ' : '))
    if ($text -eq '') { continue }
    [void]$rtf.Append((ConvertTo-RtfText $text) + '\par' + "`r`n")
    continue
  }

  # Blockquote marker -> italic note line.
  $italic = $false
  if ($line -match '^\s*>\s?') { $line = $line -replace '^\s*>\s?', ''; $italic = $true }

  # Headings.
  if ($line -match '^(#{1,6})\s+(.*)$') {
    $text = ConvertTo-RtfText (Remove-Md $Matches[2])
    [void]$rtf.Append('\par\b ' + $text + '\b0\par' + "`r`n")
    continue
  }

  $text = ConvertTo-RtfText (Remove-Md $line)
  if ($italic) { [void]$rtf.Append('\i ' + $text + '\i0\par' + "`r`n") }
  else { [void]$rtf.Append($text + '\par' + "`r`n") }
}

[void]$rtf.Append('}')

New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
Set-Content -LiteralPath $dst -Value $rtf.ToString() -Encoding ascii -NoNewline
Write-Host "Wrote $dst" -ForegroundColor Green
