using System;
using System.Diagnostics;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

/// <summary>
/// Button 2 — "Open Nova". Opens the Nova web app in the default browser.
///
/// This is a pure convenience launcher and is intentionally INDEPENDENT of the
/// connection toggle: it never starts the hub or a local web-server process, and
/// it always opens the browser. The default target is the PRODUCTION site
/// (<see cref="NovaConnectSettings.DefaultNovaUrl"/> = https://hi-nova.work/),
/// overridable via the NOVA_WEB_URL environment variable.
///
/// The connect query params are appended so that, if the connection is on (or the
/// user turns it on after), the freshly opened tab auto-connects to the local hub.
/// </summary>
[Transaction(TransactionMode.Manual)]
public class OpenNovaCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        try
        {
            var projectId = GetProjectId(commandData.Application);
            var baseUrl = Environment.GetEnvironmentVariable("NOVA_WEB_URL");
            if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = NovaConnectSettings.DefaultNovaUrl;

            var url = BuildNovaUrl(baseUrl, NovaConnectSettings.HubUrl, NovaConnectSettings.PairingToken, projectId);

            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            TaskDialog.Show("Nova Connect", "Could not open the Nova web app.\n\n" + ex.Message);
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

    /// <summary>
    /// Builds the Nova web URL with the Connect auto-connect query params so a
    /// freshly opened tab can pair with the local hub. Delegates to the Revit-free
    /// <see cref="NovaWebUrl.Build"/> so the assembly logic is unit-testable.
    /// </summary>
    internal static string BuildNovaUrl(string baseUrl, string hubUrl, string pairingToken, string projectId)
        => NovaWebUrl.Build(baseUrl, hubUrl, pairingToken, projectId);
}
