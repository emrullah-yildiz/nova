using System;
using System.Diagnostics;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

[Transaction(TransactionMode.Manual)]
public class OpenNovaCommand : IExternalCommand
{
    private static NovaHostClient? _hostClient;

    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        try
        {
            var uiApp = commandData.Application;
            var pairingToken = NovaConnectSettings.PairingToken;
            var projectId = GetProjectId(uiApp);

            NovaConnectHubProcess.EnsureStarted(pairingToken);

            _hostClient?.Dispose();
            _hostClient = new NovaHostClient(uiApp, NovaConnectSettings.HubUrl, pairingToken);
            _hostClient.Start();

            var novaUrl = Environment.GetEnvironmentVariable("NOVA_WEB_URL") ?? NovaConnectSettings.DefaultNovaUrl;
            NovaWebProcess.EnsureStarted(novaUrl);
            OpenNovaInBrowser(novaUrl, pairingToken, projectId);
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            TaskDialog.Show("Nova Connect", ex.Message);
            return Result.Failed;
        }
    }

    private static string GetProjectId(UIApplication uiApp)
    {
        var doc = uiApp.ActiveUIDocument?.Document;
        if (doc == null) return "revit-local";
        if (!string.IsNullOrWhiteSpace(doc.PathName)) return doc.PathName;
        return doc.Title;
    }

    private static void OpenNovaInBrowser(string baseUrl, string pairingToken, string projectId)
    {
        var separator = baseUrl.Contains("?") ? "&" : "?";
        var url = baseUrl + separator +
            "novaConnectOpen=1" +
            "&novaConnectAuto=1" +
            "&novaConnectUrl=" + Uri.EscapeDataString(NovaConnectSettings.HubUrl) +
            "&novaConnectToken=" + Uri.EscapeDataString(pairingToken) +
            "&novaConnectProject=" + Uri.EscapeDataString(projectId);

        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true
        });
    }
}
