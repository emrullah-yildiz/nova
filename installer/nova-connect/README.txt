Nova Connect - Revit add-in
===========================

This installs the Nova Connect add-in, which lets the Nova web app read from and
write to Autodesk Revit on your computer.

REQUIREMENTS
------------
- Windows x64
- Autodesk Revit 2027 (the add-in is built for Revit 2027)

INSTALL
-------
1. Download NovaConnect-Setup.exe.
2. Double-click NovaConnect-Setup.exe.
3. The installer checks for Revit 2027 and warns you if it is not found.
   It then copies the add-in into Revit's per-user Addins folder and registers it.
4. Restart Revit 2027. Open the Add-Ins tab -> External Tools -> Nova Connect.
5. In the Nova web app, open Connect and click Connect.

WHERE IT INSTALLS
-----------------
%APPDATA%\Autodesk\Revit\Addins\2027\Nova.addin
%APPDATA%\Autodesk\Revit\Addins\2027\Nova\Nova.RevitAddin.dll

UNINSTALL
---------
Run NovaConnect-Setup.exe /uninstall, or delete the two paths above, then
restart Revit.

MAINTAINER NOTES
----------------
The downloadable installer is a single-file .exe built from
NovaConnect.Installer.csproj. It runs as the current user, does not request
administrator rights, and does not use cmd.exe, .bat files, or PowerShell
execution-policy bypasses.

Build it from the repo root with:
  npm run build:connect-installer

The output is:
  public\downloads\NovaConnect-Setup.exe
