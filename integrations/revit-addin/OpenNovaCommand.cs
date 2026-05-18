using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

[Transaction(TransactionMode.Manual)]
public class OpenNovaCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        try
        {
            UIApplication uiApplication = commandData.Application;
            NovaLaunchInfo launchInfo = NovaLauncher.CreateLaunchInfo(uiApplication);
            NovaLauncher.WriteLaunchInfo(launchInfo);

            // Start the WebSocket host client to connect to Connect Hub
            // This must happen BEFORE opening the browser so the hub
            // sees a host when the viewer connects.
            App.EnsureHostClient(uiApplication, launchInfo.HubUrl, launchInfo.PairingToken);

            // Open the web app in the browser
            NovaLauncher.OpenNova(launchInfo);

            TaskDialog.Show(
                "Nova",
                "Nova opened in your browser.\n\n" +
                "Pairing token:\n" + launchInfo.PairingToken + "\n\n" +
                "Make sure the Connect Hub is running with the same token:\n" +
                "node scripts/connect-hub.cjs --token=" + launchInfo.PairingToken);

            return Result.Succeeded;
        }
        catch (System.Exception ex)
        {
            message = ex.Message;
            return Result.Failed;
        }
    }
}
