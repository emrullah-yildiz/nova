using System;
using System.Net.Sockets;

namespace Nova.RevitAddin;

/// <summary>
/// Owns the lifecycle of the local Connect hub. As of Approach C (see
/// docs/architecture/decisions.md "In-process C# WebSocket hub") this is an
/// <see cref="NovaHub"/> running IN-PROCESS on a background thread — no external
/// <c>nova-hub.exe</c>, no Node, and no Nova source checkout. The Connect toggle
/// starts it (<see cref="EnsureStarted"/>) and stops it
/// (<see cref="StopIfStarted"/>) on toggle-off / Revit shutdown.
///
/// The name is retained (it used to launch a Node child process) so the toggle
/// wiring in <see cref="NovaConnectApp"/> is unchanged, but there is no longer a
/// child process anywhere — the hub lives in the add-in's own AppDomain.
/// </summary>
internal static class NovaConnectHubProcess
{
    private static NovaHub? _hub;

    /// <summary>
    /// Starts the in-process hub bound to <c>ws://127.0.0.1:8765</c> with the
    /// given pairing token. If something is already listening on the port (e.g. a
    /// dev <c>node scripts/connect-hub.cjs</c> the user started by hand), that is
    /// left untouched and no in-process hub is started — the host client connects
    /// to whatever is on the port. Throws if the in-process hub fails to bind.
    /// </summary>
    public static void EnsureStarted(string pairingToken)
    {
        if (_hub != null) return;

        // Respect a hub already on the port (e.g. a manually-started dev hub).
        if (IsPortOpen("127.0.0.1", NovaConnectSettings.HubPort)) return;

        var hub = new NovaHub(pairingToken, NovaConnectSettings.HubPort);
        try
        {
            hub.Start();
        }
        catch (Exception ex)
        {
            hub.Dispose();
            throw new InvalidOperationException(
                "Nova Connect could not start the local hub on " + NovaConnectSettings.HubUrl + ". " + ex.Message, ex);
        }

        _hub = hub;
    }

    /// <summary>
    /// Stops and disposes the in-process hub this add-in started, if any. Safe to
    /// call when no hub was started and idempotent. A hub the add-in did NOT start
    /// (an external dev hub detected via the open port) is left untouched because
    /// <see cref="_hub"/> is null in that case.
    /// </summary>
    public static void StopIfStarted()
    {
        var hub = _hub;
        _hub = null;
        if (hub == null) return;

        try
        {
            hub.Stop();
        }
        catch
        {
            // Best-effort teardown; never throw on shutdown.
        }
        finally
        {
            hub.Dispose();
        }
    }

    private static bool IsPortOpen(string host, int port)
    {
        try
        {
            using var client = new TcpClient();
            var result = client.BeginConnect(host, port, null, null);
            var ok = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(200));
            if (!ok) return false;
            client.EndConnect(result);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
