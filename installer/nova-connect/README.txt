Nova Connect - Revit add-in
===========================

This installs the Nova Connect add-in, which lets the Nova web app read from and
write to Autodesk Revit on your computer.

REQUIREMENTS
------------
- Windows
- Autodesk Revit 2027  (the add-in is built for Revit 2027)

INSTALL
-------
1. Extract this whole ZIP to a folder (keep all the files together).
2. Double-click  "Install Nova Connect.bat".
   - If Windows shows a SmartScreen prompt, click "More info" -> "Run anyway".
     (The installer is a plain script; it is not code-signed.)
3. The installer checks for Revit 2027 and warns you if it is not found.
   It then copies the add-in into Revit's Addins folder and registers it.
4. Restart Revit 2027. Open the "Add-Ins" tab -> "External Tools" -> "Nova Connect".
5. In the Nova web app, open "Connect" and click "Connect".

WHERE IT INSTALLS
-----------------
%APPDATA%\Autodesk\Revit\Addins\2027\Nova.addin
%APPDATA%\Autodesk\Revit\Addins\2027\Nova\Nova.RevitAddin.dll

UNINSTALL
---------
Double-click "Uninstall Nova Connect.bat" (or delete the two paths above), then
restart Revit.

FILES IN THIS PACKAGE
---------------------
Install Nova Connect.bat       - double-click to install
Install-NovaConnect.ps1        - the installer logic
Uninstall Nova Connect.bat     - double-click to uninstall
Uninstall-NovaConnect.ps1      - the uninstaller logic
Nova.RevitAddin.dll            - the Revit add-in
Nova.RevitAddin.deps.json      - add-in dependency metadata
Nova.addin.template            - manifest template used during install
README.txt                     - this file
