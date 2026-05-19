namespace Nova.RevitAddin;

internal static class NovaConnectSettings
{
    public const int HubPort = 8765;
    public const int WebPort = 8080;
    public const string HubUrl = "ws://127.0.0.1:8765";
    public const string DefaultNovaUrl = "http://127.0.0.1:8080/";
    public const string PairingToken = "nova-local";
}
