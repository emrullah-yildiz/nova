using System;

namespace Nova.RevitAddin;

/// <summary>
/// Pure, Revit-free URL builder for the "Open Nova" button. Kept in its own type
/// (no Revit API references) so the query-param assembly is unit-testable without
/// loading the Revit API.
/// </summary>
internal static class NovaWebUrl
{
    /// <summary>
    /// Appends the Connect auto-connect query params to <paramref name="baseUrl"/>
    /// so a freshly opened Nova tab can pair with the local hub:
    /// novaConnectOpen, novaConnectAuto, novaConnectUrl (the hub ws URL),
    /// novaConnectToken (pairing token) and novaConnectProject (the project id).
    /// Honors an existing query string on the base URL.
    /// </summary>
    public static string Build(string baseUrl, string hubUrl, string pairingToken, string projectId)
    {
        if (string.IsNullOrEmpty(baseUrl)) baseUrl = "";
        var separator = baseUrl.Contains("?") ? "&" : "?";
        return baseUrl + separator +
            "novaConnectOpen=1" +
            "&novaConnectAuto=1" +
            "&novaConnectUrl=" + Uri.EscapeDataString(hubUrl ?? "") +
            "&novaConnectToken=" + Uri.EscapeDataString(pairingToken ?? "") +
            "&novaConnectProject=" + Uri.EscapeDataString(projectId ?? "");
    }
}
