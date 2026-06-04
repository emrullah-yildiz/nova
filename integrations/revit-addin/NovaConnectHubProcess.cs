using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;

namespace Nova.RevitAddin;

internal static class NovaConnectHubProcess
{
    private static Process? _hubProcess;

    public static void EnsureStarted(string pairingToken)
    {
        if (IsPortOpen("127.0.0.1", NovaConnectSettings.HubPort)) return;

        var repoRoot = NovaLocalPaths.FindRepoRoot();
        var hubScript = Path.Combine(repoRoot, "scripts", "connect-hub.cjs");
        if (!File.Exists(hubScript))
        {
            throw new FileNotFoundException("Nova Connect hub script was not found.", hubScript);
        }

        var nodeExe = NovaLocalPaths.FindNodeExecutable();
        var args = "\"" + hubScript + "\" --port=" + NovaConnectSettings.HubPort + " --token=" + pairingToken;
        var startInfo = new ProcessStartInfo
        {
            FileName = nodeExe,
            Arguments = args,
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        _hubProcess = Process.Start(startInfo);
        if (_hubProcess == null) throw new InvalidOperationException("Nova Connect hub process did not start.");

        if (!WaitForHub())
        {
            var error = SafeRead(_hubProcess.StandardError);
            throw new InvalidOperationException("Nova Connect hub did not become ready." + (string.IsNullOrWhiteSpace(error) ? "" : " " + error));
        }
    }

    /// <summary>
    /// Stops the hub process this add-in started, if any. A hub that was already
    /// running before the add-in turned the connection on (detected via the open
    /// port, so <see cref="_hubProcess"/> is null) is left untouched. Used on
    /// shutdown; safe to call when no hub was started.
    /// </summary>
    public static void StopIfStarted()
    {
        var process = _hubProcess;
        _hubProcess = null;
        if (process == null) return;

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(2000);
            }
        }
        catch
        {
            // Best-effort: the hub is a localhost dev process; ignore teardown races.
        }
        finally
        {
            process.Dispose();
        }
    }

    private static bool WaitForHub()
    {
        var deadline = DateTime.UtcNow.AddSeconds(6);
        while (DateTime.UtcNow < deadline)
        {
            if (IsPortOpen("127.0.0.1", NovaConnectSettings.HubPort)) return true;
            System.Threading.Thread.Sleep(150);
        }
        return false;
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

    private static string SafeRead(StreamReader reader)
    {
        try
        {
            return reader.ReadToEnd();
        }
        catch
        {
            return "";
        }
    }
}
