Nova Connect - Revit add-in (WiX MSI installer)
===============================================

This installs the Nova Connect add-in, which lets the Nova web app read from and
write to Autodesk Revit on your computer. The local Connect hub runs IN-PROCESS
inside the add-in (Approach C), so Connect works with NO Nova source checkout,
NO Node.js, and NO separate hub executable on the machine.

REQUIREMENTS
------------
- Windows x64
- Autodesk Revit 2027 (the add-in is built for Revit 2027)

INSTALL
-------
1. Download NovaConnect-Setup.msi.
2. Double-click it to launch the wizard:
     Welcome -> License (accept the Terms of Service) -> Install location ->
     Install -> Finish.
   It is a PER-USER install and needs NO administrator rights.
3. Restart Revit 2027. Open the Add-Ins tab -> Nova Connect panel
   (Connect / Open Nova).
4. In the Nova web app, open Connect and click Connect.

WHERE IT INSTALLS
-----------------
%APPDATA%\Autodesk\Revit\Addins\2027\Nova.addin
%APPDATA%\Autodesk\Revit\Addins\2027\Nova\Nova.RevitAddin.dll
%APPDATA%\Autodesk\Revit\Addins\2027\Nova\Nova.RevitAddin.deps.json

The MSI registers a per-user Add/Remove Programs (Apps & features) entry, so
Nova Connect appears in the installed-app inventory.

UNINSTALL
---------
Use Windows Apps & features (Add/Remove Programs), or run:
  msiexec /x NovaConnect-Setup.msi
then restart Revit. Uninstall removes all installed files + the manifest.

MAINTAINER NOTES
----------------
The installer is a WiX v5 MSI built from NovaConnect.Installer.wixproj +
Package.wxs. The WiX tool is pinned in .config/dotnet-tools.json (dotnet tool
restore). The wizard uses WixUI_InstallDir; the license page shows License.rtf,
which is generated from docs/legal/terms-of-service.md by
scripts/build-license-rtf.ps1.

Build everything from the repo root with:
  npm run build:connect-installer

That builds the add-in (Release), the License RTF, then the MSI, and publishes:
  public\downloads\NovaConnect-Setup.msi
  public\downloads\NovaConnect-Setup.msi.sha256

There is NO bundled hub exe: the hub runs in-process in the add-in DLL, so the
MSI is only a few MB.

Code signing (optional): set NOVA_SIGN_METHOD=trusted-signing|pfx (+ the matching
NOVA_SIGN_* vars) to sign the add-in DLL AND the MSI. See docs/revit-addin-build.md.
