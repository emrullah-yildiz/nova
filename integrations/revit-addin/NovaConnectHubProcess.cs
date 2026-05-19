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
