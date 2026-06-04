namespace Nova.RevitAddin;

internal static class NovaConnectSettings
{
    public const int HubPort = 8765;
    public const int WebPort = 8080;
    public const string HubUrl = "ws://127.0.0.1:8765";
    // Production web app. Open Nova targets this by default (override with
    // NOVA_WEB_URL). It is non-localhost, so NovaWebProcess.ShouldStartLocalServer
    // returns false — no local dev server is ever spawned for the default flow.
    public const string DefaultNovaUrl = "https://hi-nova.work/";
    public const string PairingToken = "nova-local";
}
