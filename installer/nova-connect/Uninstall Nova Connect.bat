@echo off
REM Double-click entry point for removing the Nova Connect Revit add-in.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-NovaConnect.ps1"
