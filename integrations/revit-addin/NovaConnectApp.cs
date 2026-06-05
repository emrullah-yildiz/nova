using System;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

/// <summary>
/// Nova Connect ribbon entry point. Replaces the old single
/// "Add-Ins &gt; External Tools &gt; Nova Connect" command: on startup it builds a
/// dedicated "Nova" ribbon tab with a "Nova Connect" panel holding two buttons —
/// a connection On/Off toggle and an "Open Nova" launcher.
///
/// This class also owns the shared connection state and the
/// <see cref="NovaHostClient"/> lifecycle so the toggle command can flip it and
/// <see cref="OnShutdown"/> can tear it down cleanly when Revit closes.
/// </summary>
public class NovaConnectApp : IExternalApplication
{
    private const string TabName = "Nova";
    private const string PanelName = "Nova Connect";

    /// <summary>The toggle's PushButton, captured at startup so the toggle
    /// command can update its OWN icon + text at runtime.</summary>
    internal static PushButton? ToggleButton { get; private set; }

    /// <summary>True while the Revit↔hub connection is on.</summary>
    internal static bool IsConnected { get; private set; }

    private static NovaHostClient? _hostClient;

    public Result OnStartup(UIControlledApplication application)
    {
        try
        {
            var assemblyPath = typeof(NovaConnectApp).Assembly.Location;

            // ── Dedicated "Nova" ribbon tab (top-level, not under the Add-Ins tab) ──
            try { application.CreateRibbonTab(TabName); }
            catch (Autodesk.Revit.Exceptions.ArgumentException) { /* tab already exists on re-init */ }
            var panel = application.CreateRibbonPanel(TabName, PanelName);

            // ── Button 1: connection On/Off toggle (starts red / disconnected) ──
            var toggleData = new PushButtonData(
                "NovaConnectToggle",
                "Connect",
                assemblyPath,
                typeof(ConnectionToggleCommand).FullName)
            {
                ToolTip = "Connect Revit to Nova (start the local hub).",
                LongDescription =
                    "Toggles the Revit↔Nova connection. When on, Revit serves project " +
                    "data to the Nova web app through the local hub on " +
                    NovaConnectSettings.HubUrl + "."
            };

            if (panel.AddItem(toggleData) is PushButton toggleButton)
            {
                ToggleButton = toggleButton;
                ApplyDisconnectedAppearance(toggleButton);
            }

            // ── Button 2: Open Nova (launches the production web app) ──
            var openData = new PushButtonData(
                "NovaConnectOpen",
                "Open Nova",
                assemblyPath,
                typeof(OpenNovaCommand).FullName)
            {
                ToolTip = "Open the Nova web app in your browser.",
                LongDescription =
                    "Opens " + NovaConnectSettings.DefaultNovaUrl + " in your default browser. " +
                    "If the connection is on, the page auto-connects to your local Revit hub. " +
                    "This does not require the connection to be on."
            };

            if (panel.AddItem(openData) is PushButton openButton)
            {
                openButton.LargeImage = DotIcons.NovaLarge;
                openButton.Image = DotIcons.NovaSmall;
            }

            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            // Never block Revit startup if the ribbon fails to build.
            System.Diagnostics.Debug.WriteLine("[Nova Connect] OnStartup failed: " + ex.Message);
            return Result.Succeeded;
        }
    }

    public Result OnShutdown(UIControlledApplication application)
    {
        try
        {
            TurnOff(stopHub: true);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[Nova Connect] OnShutdown failed: " + ex.Message);
        }
        return Result.Succeeded;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Connection lifecycle — called by ConnectionToggleCommand.
    // ──────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Starts the in-process hub (<see cref="NovaHub"/>, no Node/repo) and a
    /// <see cref="NovaHostClient"/> against it. On success the connection flips on
    /// and the toggle button turns green. Throws on failure (e.g. the port is
    /// busy) so the caller can keep the button red and report the reason; the
    /// connection stays off.
    /// </summary>
    internal static void TurnOn(UIApplication uiApp)
    {
        if (IsConnected) return;

        var pairingToken = NovaConnectSettings.PairingToken;

        // May throw (no repo / no Node) — let it propagate so the toggle stays red.
        NovaConnectHubProcess.EnsureStarted(pairingToken);

        _hostClient?.Dispose();
        _hostClient = new NovaHostClient(uiApp, NovaConnectSettings.HubUrl, pairingToken);
        _hostClient.Start();

        IsConnected = true;
        if (ToggleButton != null) ApplyConnectedAppearance(ToggleButton);
    }

    /// <summary>
    /// Disposes the host client and flips the connection off (button back to red).
    /// When <paramref name="stopHub"/> is true the hub process this add-in started
    /// is also stopped (used on shutdown).
    /// </summary>
    internal static void TurnOff(bool stopHub)
    {
        _hostClient?.Dispose();
        _hostClient = null;

        if (stopHub)
        {
            NovaConnectHubProcess.StopIfStarted();
        }

        IsConnected = false;
        if (ToggleButton != null) ApplyDisconnectedAppearance(ToggleButton);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Button appearance.
    // ──────────────────────────────────────────────────────────────────────

    private static void ApplyConnectedAppearance(PushButton button)
    {
        button.ItemText = "Connected";
        button.ToolTip = "Connected to Nova. Click to disconnect.";
        button.LargeImage = DotIcons.GreenLarge;
        button.Image = DotIcons.GreenSmall;
    }

    private static void ApplyDisconnectedAppearance(PushButton button)
    {
        button.ItemText = "Connect";
        button.ToolTip = "Connect Revit to Nova (start the local hub).";
        button.LargeImage = DotIcons.RedLarge;
        button.Image = DotIcons.RedSmall;
    }
}
