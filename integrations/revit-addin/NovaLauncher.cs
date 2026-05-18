using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

public static class NovaLauncher
{
    public const string DefaultHubUrl = "ws://127.0.0.1:8765";
    public const string DefaultNovaUrl = "http://127.0.0.1:5173";

    public static NovaLaunchInfo CreateLaunchInfo(UIApplication application)
    {
        string projectName = application.ActiveUIDocument?.Document?.Title ?? "Untitled Revit Project";
        string pairingToken = CreatePairingToken();

        return new NovaLaunchInfo
        {
            NovaUrl = Environment.GetEnvironmentVariable("NOVA_WEB_URL") ?? DefaultNovaUrl,
            HubUrl = Environment.GetEnvironmentVariable("NOVA_CONNECT_URL") ?? DefaultHubUrl,
            PairingToken = pairingToken,
            ProjectId = SanitizeProjectId(projectName),
            ProjectName = projectName,
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    public static void OpenNova(NovaLaunchInfo launchInfo)
    {
        string url = BuildNovaUrl(launchInfo);
        var startInfo = new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true
        };
        Process.Start(startInfo);
    }

    public static string BuildNovaUrl(NovaLaunchInfo launchInfo)
    {
        string separator = launchInfo.NovaUrl.Contains("?") ? "&" : "?";
        return launchInfo.NovaUrl +
               separator +
               "novaConnectOpen=1" +
               "&novaConnectUrl=" + Uri.EscapeDataString(launchInfo.HubUrl) +
               "&novaConnectToken=" + Uri.EscapeDataString(launchInfo.PairingToken) +
               "&novaConnectProject=" + Uri.EscapeDataString(launchInfo.ProjectId);
    }

    public static void WriteLaunchInfo(NovaLaunchInfo launchInfo)
    {
        string directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Nova",
            "Revit");
        Directory.CreateDirectory(directory);

        string path = Path.Combine(directory, "nova-connect-launch.json");
        File.WriteAllText(path, ToJson(launchInfo));
    }

    private static string CreatePairingToken()
    {
        byte[] bytes = new byte[24];
        RandomNumberGenerator.Fill(bytes);
        return BitConverter.ToString(bytes).Replace("-", string.Empty).ToLowerInvariant();
    }

    private static string SanitizeProjectId(string projectName)
    {
        foreach (char invalid in Path.GetInvalidFileNameChars())
        {
            projectName = projectName.Replace(invalid, '-');
        }

        return string.IsNullOrWhiteSpace(projectName) ? "revit-project" : projectName.Trim();
    }

    private static string ToJson(NovaLaunchInfo launchInfo)
    {
        return "{\n" +
               "  \"novaUrl\": \"" + JsonEscape(launchInfo.NovaUrl) + "\",\n" +
               "  \"hubUrl\": \"" + JsonEscape(launchInfo.HubUrl) + "\",\n" +
               "  \"pairingToken\": \"" + JsonEscape(launchInfo.PairingToken) + "\",\n" +
               "  \"projectId\": \"" + JsonEscape(launchInfo.ProjectId) + "\",\n" +
               "  \"projectName\": \"" + JsonEscape(launchInfo.ProjectName) + "\",\n" +
               "  \"createdAtUtc\": \"" + launchInfo.CreatedAtUtc.ToString("O") + "\"\n" +
               "}\n";
    }

    private static string JsonEscape(string value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n");
    }
}

public class NovaLaunchInfo
{
    public string NovaUrl { get; set; } = NovaLauncher.DefaultNovaUrl;
    public string HubUrl { get; set; } = NovaLauncher.DefaultHubUrl;
    public string PairingToken { get; set; } = string.Empty;
    public string ProjectId { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
}
