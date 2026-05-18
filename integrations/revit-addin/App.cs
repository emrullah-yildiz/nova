using System;
using System.Diagnostics;
using System.Reflection;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

public class App : IExternalApplication
{
    private const string TabName = "Nova";
    private const string PanelName = "Connect";

    // Static reference so the host client persists across commands
    internal static NovaHostClient? HostClient;

    public Result OnStartup(UIControlledApplication application)
    {
        try
        {
            System.Diagnostics.Debug.WriteLine("[Nova] App.OnStartup called");
            System.Diagnostics.Debug.WriteLine("[Nova] Assembly location: " + Assembly.GetExecutingAssembly().Location);

            try
            {
                application.CreateRibbonTab(TabName);
            }
            catch (Autodesk.Revit.Exceptions.ArgumentException)
            {
                // The tab already exists, which is fine when multiple Nova commands are registered.
                System.Diagnostics.Debug.WriteLine("[Nova] Ribbon tab already exists, continuing.");
            }

            RibbonPanel panel = GetOrCreatePanel(application);
            string assemblyPath = Assembly.GetExecutingAssembly().Location;
            var buttonData = new PushButtonData(
                "NovaOpenConnect",
                "Open\nNova",
                assemblyPath,
                typeof(OpenNovaCommand).FullName);

            PushButton? button = panel.AddItem(buttonData) as PushButton;
            if (button == null)
            {
                string errorMsg = "Failed to create Nova ribbon button: panel.AddItem returned null or non-PushButton.";
                System.Diagnostics.Debug.WriteLine("[Nova] " + errorMsg);
                TaskDialog.Show("Nova Add-In Error", errorMsg);
                return Result.Failed;
            }

            button.ToolTip = "Open Nova in the browser with a local Revit pairing token.";
            button.LongDescription = "Launches the Nova web app and pre-fills Nova Connect settings for the local Revit session.";

            System.Diagnostics.Debug.WriteLine("[Nova] App.OnStartup completed successfully");
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            string errorMsg = "Nova add-in failed to load:\n" + ex.GetType().FullName + "\n" + ex.Message + "\n\nStack:\n" + ex.StackTrace;
            System.Diagnostics.Debug.WriteLine("[Nova] FATAL: " + errorMsg);
            try
            {
                TaskDialog.Show("Nova Add-In Error", errorMsg);
            }
            catch
            {
                // Silently ignore if TaskDialog fails (Revit may not be fully initialized)
            }
            return Result.Failed;
        }
    }

    public Result OnShutdown(UIControlledApplication application)
    {
        HostClient?.Dispose();
        HostClient = null;
        return Result.Succeeded;
    }

    /// <summary>
    /// Start the WebSocket host client that connects to the Connect Hub.
    /// Called from OpenNovaCommand after the document is available.
    /// </summary>
    internal static void EnsureHostClient(UIApplication uiApp, string hubUrl, string pairingToken)
    {
        if (HostClient != null) return; // Already running

        HostClient = new NovaHostClient(uiApp, hubUrl, pairingToken);
        HostClient.Start();
    }

    private static RibbonPanel GetOrCreatePanel(UIControlledApplication application)
    {
        foreach (RibbonPanel panel in application.GetRibbonPanels(TabName))
        {
            if (panel.Name == PanelName) return panel;
        }

        return application.CreateRibbonPanel(TabName, PanelName);
    }
}
