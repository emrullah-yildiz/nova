using System;
using System.Diagnostics;
using System.Net.Sockets;

namespace Nova.RevitAddin;

internal static class NovaWebProcess
{
    private static Process? _webProcess;

    public static void EnsureStarted(string novaUrl)
    {
        if (!ShouldStartLocalServer(novaUrl)) return;
        if (IsPortOpen("127.0.0.1", NovaConnectSettings.WebPort)) return;

        var repoRoot = NovaLocalPaths.FindRepoRoot();
        var npmExe = NovaLocalPaths.FindNpmExecutable();
        var startInfo = new ProcessStartInfo
        {
            FileName = npmExe,
            Arguments = "run dev -- --host 127.0.0.1",
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        _webProcess = Process.Start(startInfo);
        if (_webProcess == null) throw new InvalidOperationException("Nova web server process did not start.");

        if (!WaitForWebServer())
        {
            throw new InvalidOperationException("Nova web server did not become ready on http://127.0.0.1:8080.");
        }
    }

    private static bool ShouldStartLocalServer(string novaUrl)
    {
        if (!Uri.TryCreate(novaUrl, UriKind.Absolute, out var uri)) return false;
        return (uri.Host == "127.0.0.1" || uri.Host == "localhost") && uri.Port == NovaConnectSettings.WebPort;
    }

    private static bool WaitForWebServer()
    {
        var deadline = DateTime.UtcNow.AddSeconds(12);
        while (DateTime.UtcNow < deadline)
        {
            if (IsPortOpen("127.0.0.1", NovaConnectSettings.WebPort)) return true;
            System.Threading.Thread.Sleep(200);
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
}
