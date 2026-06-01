# Nova Connect - Revit add-in uninstaller
#
# Removes the Nova Connect add-in: deletes the .addin manifest and the Nova
# folder containing the add-in DLL from Revit's per-user Addins folder.
#
# Legacy manual uninstaller. The downloadable installer now supports:
#   NovaConnect-Setup.exe /uninstall

$ErrorActionPreference = 'Stop'

$RevitVersion = '2027'

$addinsDir = Join-Path $env:APPDATA "Autodesk\Revit\Addins\$RevitVersion"
$addinPath = Join-Path $addinsDir 'Nova.addin'
$novaDir   = Join-Path $addinsDir 'Nova'

Write-Host "Uninstalling Nova Connect for Revit $RevitVersion..." -ForegroundColor White

$removed = $false
if (Test-Path $addinPath) {
  Remove-Item -Path $addinPath -Force
  Write-Host "  Removed $addinPath" -ForegroundColor Green
  $removed = $true
}
if (Test-Path $novaDir) {
  Remove-Item -Path $novaDir -Recurse -Force
  Write-Host "  Removed $novaDir" -ForegroundColor Green
  $removed = $true
}

if ($removed) {
  Write-Host ""
  Write-Host "Nova Connect was removed. Restart Revit to complete." -ForegroundColor Green
} else {
  Write-Host "  Nothing to remove - Nova Connect was not installed for Revit $RevitVersion." -ForegroundColor Yellow
}
Read-Host "Press Enter to exit"
