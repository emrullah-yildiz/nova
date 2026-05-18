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
            NovaLauncher.OpenNova(launchInfo);

            TaskDialog.Show(
                "Nova",
                "Nova opened in your browser.\n\n" +
                "Pairing token:\n" + launchInfo.PairingToken + "\n\n" +
                "Start the local hub with the same token if it is not already running.");

            return Result.Succeeded;
        }
        catch (System.Exception ex)
        {
            message = ex.Message;
            return Result.Failed;
        }
    }
}
