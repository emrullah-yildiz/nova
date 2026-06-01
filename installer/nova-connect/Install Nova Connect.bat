@echo off
REM Double-click entry point for the Nova Connect Revit add-in installer.
REM Launches the PowerShell installer with an execution-policy bypass so the
REM user doesn't have to change system settings.
echo Starting the Nova Connect installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-NovaConnect.ps1"
