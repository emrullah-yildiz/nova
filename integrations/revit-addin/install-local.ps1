param(
  [string]$RevitVersion = "2025",
  [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectPath = Join-Path $ProjectDir "Nova.RevitAddin.csproj"

dotnet build $ProjectPath -p:RevitVersion=$RevitVersion -c $Configuration

$AssemblyPath = Join-Path $ProjectDir "bin\$Configuration\net48\Nova.RevitAddin.dll"
if (!(Test-Path -LiteralPath $AssemblyPath)) {
  throw "Build output not found: $AssemblyPath"
}

$AddinDir = Join-Path $env:APPDATA "Autodesk\Revit\Addins\$RevitVersion"
New-Item -ItemType Directory -Force -Path $AddinDir | Out-Null

$TemplatePath = Join-Path $ProjectDir "Nova.addin.template"
$AddinPath = Join-Path $AddinDir "Nova.addin"
$Content = Get-Content -LiteralPath $TemplatePath -Raw
$Content = $Content.Replace("{{ASSEMBLY_PATH}}", $AssemblyPath)
Set-Content -LiteralPath $AddinPath -Value $Content -Encoding UTF8

Write-Host "Installed Nova Revit add-in manifest:"
Write-Host $AddinPath
Write-Host "Assembly:"
Write-Host $AssemblyPath
