using System;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

/// <summary>
/// Button 1 — the Revit↔Nova connection On/Off toggle.
///
/// OFF (default): the ribbon button shows a red dot and reads "Connect".
/// Clicking turns the connection ON: it starts the local hub and a
/// <see cref="NovaHostClient"/> (see <see cref="NovaConnectApp.TurnOn"/>); on
/// success the button flips to a green dot reading "Connected". Clicking again
/// turns it OFF and reverts to the red dot.
///
/// The actual button-appearance update lives in <see cref="NovaConnectApp"/>,
/// which holds the captured <see cref="PushButton"/> reference and the connection
/// state. The hub now runs IN-PROCESS (no Node, no repo), so the only realistic
/// failure is the port being busy; if turning on fails the command leaves the
/// connection off, keeps the red dot, and shows the reason — it never crashes Revit.
/// </summary>
[Transaction(TransactionMode.Manual)]
public class ConnectionToggleCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var uiApp = commandData.Application;

        if (NovaConnectApp.IsConnected)
        {
            // Turn off. The hub is left running (cheap localhost process); it is
            // stopped on Revit shutdown. Disconnecting must never fail loudly.
            try
            {
                NovaConnectApp.TurnOff(stopHub: false);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("[Nova Connect] Disconnect error: " + ex.Message);
            }
            return Result.Succeeded;
        }

        try
        {
            NovaConnectApp.TurnOn(uiApp);
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            // Stay OFF (button stays red) and explain why. Do NOT return
            // Result.Failed for an expected "no hub here yet" condition — that
            // would surface a generic Revit error dialog on top of ours.
            ShowConnectFailure(ex);
            return Result.Succeeded;
        }
    }

    private static void ShowConnectFailure(Exception ex)
    {
        var dialog = new TaskDialog("Nova Connect")
        {
            MainInstruction = "Could not start the Nova connection.",
            MainContent =
                ex.Message + "\n\n" +
                "The local hub runs inside Revit on " + NovaConnectSettings.HubUrl +
                " — it needs no Node.js or Nova checkout. The most likely cause is " +
                "another program already using that port, or that the connection was " +
                "blocked. Close anything bound to the port and try again.",
            TitleAutoPrefix = false
        };
        dialog.Show();
    }
}
