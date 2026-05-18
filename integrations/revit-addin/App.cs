using System;
using System.Reflection;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

public class App : IExternalApplication
{
    private const string TabName = "Nova";
    private const string PanelName = "Connect";

    public Result OnStartup(UIControlledApplication application)
    {
        try
        {
            application.CreateRibbonTab(TabName);
        }
        catch (Autodesk.Revit.Exceptions.ArgumentException)
        {
            // The tab already exists, which is fine when multiple Nova commands are registered.
        }

        RibbonPanel panel = GetOrCreatePanel(application);
        string assemblyPath = Assembly.GetExecutingAssembly().Location;
        var buttonData = new PushButtonData(
            "NovaOpenConnect",
            "Open\nNova",
            assemblyPath,
            typeof(OpenNovaCommand).FullName);

        PushButton button = panel.AddItem(buttonData) as PushButton
            ?? throw new InvalidOperationException("Failed to create Nova ribbon button.");
        button.ToolTip = "Open Nova in the browser with a local Revit pairing token.";
        button.LongDescription = "Launches the Nova web app and pre-fills Nova Connect settings for the local Revit session.";

        return Result.Succeeded;
    }

    public Result OnShutdown(UIControlledApplication application)
    {
        return Result.Succeeded;
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
