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
%LOCALAPPDATA%\Programs\Nova Connect\NovaConnect-Setup.exe

The installer also creates a per-user Windows uninstall entry under HKCU so
Nova Connect appears in Apps & features / installed app inventory.

UNINSTALL
---------
Use Windows Apps & features, or run NovaConnect-Setup.exe /uninstall, then
restart Revit.

MAINTAINER NOTES
----------------
The downloadable installer is a single-file .exe built from
NovaConnect.Installer.csproj. It runs as the current user, does not request
administrator rights, and does not use cmd.exe, .bat files, or PowerShell
execution-policy bypasses.

Build it from the repo root with:
  npm run build:connect-installer

The outputs are:
  public\downloads\NovaConnect-Setup.exe
  public\downloads\NovaConnect-Setup.exe.sha256

To Authenticode-sign during packaging, install Windows SDK signtool.exe and set:
  NOVA_CODESIGN_THUMBPRINT=<certificate thumbprint>

Optional timestamp override:
  NOVA_CODESIGN_TIMESTAMP_URL=<RFC3161 timestamp URL>
