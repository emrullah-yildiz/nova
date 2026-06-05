using System;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Nova.RevitAddin;
using Xunit;

namespace Nova.RevitAddin.Tests;

/// <summary>
/// Protocol-parity tests for the in-process C# hub (<see cref="NovaHub"/>)
/// against the behaviour of scripts/connect-hub.cjs:
///   * right token  → connection.established
///   * wrong token  → operation.error / INVALID_PAIRING_TOKEN
///   * ping         → pong
///   * a host↔viewer relay between two live WebSocket clients
///
/// Each test binds the hub on an ephemeral loopback port so they can run in
/// parallel without colliding and without needing Revit.
/// </summary>
public class NovaHubTests
{
    private const string Token = "test-pair-token";

    private static int FreePort()
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        var port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static async Task<ClientWebSocket> ConnectAsync(int port)
    {
        var ws = new ClientWebSocket();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await ws.ConnectAsync(new Uri($"ws://127.0.0.1:{port}/"), cts.Token);
        return ws;
    }

    private static async Task SendAsync(ClientWebSocket ws, object envelope)
    {
        var json = JsonSerializer.Serialize(envelope);
        var bytes = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static async Task<JsonDocument> ReceiveAsync(ClientWebSocket ws)
    {
        var buffer = new byte[65536];
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var sb = new StringBuilder();
        WebSocketReceiveResult result;
        do
        {
            result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
            sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
        }
        while (!result.EndOfMessage);
        return JsonDocument.Parse(sb.ToString());
    }

    private static object Hello(string role, string? token, string source) => new
    {
        version = 1,
        id = Guid.NewGuid().ToString("N"),
        type = "hello",
        source,
        target = "hub",
        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        payload = new { role, pairingToken = token }
    };

    [Fact]
    public async Task Hello_WithCorrectToken_ReturnsConnectionEstablished()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        using var ws = await ConnectAsync(port);
        await SendAsync(ws, Hello("viewer", Token, "browser-app"));

        using var reply = await ReceiveAsync(ws);
        var root = reply.RootElement;

        Assert.Equal("connection.established", root.GetProperty("type").GetString());
        Assert.Equal("nova-connect-hub", root.GetProperty("source").GetString());
        Assert.Equal("browser-app", root.GetProperty("target").GetString());
        Assert.True(root.GetProperty("payload").GetProperty("pairingTokenRequired").GetBoolean());
        Assert.False(root.GetProperty("payload").GetProperty("peerConnected").GetBoolean());
    }

    [Fact]
    public async Task Hello_WithWrongToken_ReturnsInvalidPairingTokenError()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        using var ws = await ConnectAsync(port);
        await SendAsync(ws, Hello("viewer", "WRONG", "browser-app"));

        using var reply = await ReceiveAsync(ws);
        var root = reply.RootElement;

        Assert.Equal("operation.error", root.GetProperty("type").GetString());
        Assert.Equal("INVALID_PAIRING_TOKEN", root.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal("INVALID_PAIRING_TOKEN", root.GetProperty("payload").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Hello_NoTokenConfigured_AcceptsAnyClient()
    {
        var port = FreePort();
        // No token configured → pairingTokenRequired is false, any client accepted.
        using var hub = new NovaHub(pairingToken: "", port);
        hub.Start();

        using var ws = await ConnectAsync(port);
        await SendAsync(ws, Hello("viewer", null, "browser-app"));

        using var reply = await ReceiveAsync(ws);
        var root = reply.RootElement;

        Assert.Equal("connection.established", root.GetProperty("type").GetString());
        Assert.False(root.GetProperty("payload").GetProperty("pairingTokenRequired").GetBoolean());
    }

    [Fact]
    public async Task Ping_ToHub_ReturnsPong()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        using var ws = await ConnectAsync(port);
        await SendAsync(ws, Hello("viewer", Token, "browser-app"));
        using (await ReceiveAsync(ws)) { } // drain connection.established

        var pingId = Guid.NewGuid().ToString("N");
        await SendAsync(ws, new
        {
            version = 1,
            id = pingId,
            type = "ping",
            source = "browser-app",
            target = "hub",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            payload = new { }
        });

        using var reply = await ReceiveAsync(ws);
        var root = reply.RootElement;

        Assert.Equal("pong", root.GetProperty("type").GetString());
        Assert.Equal("nova-connect-hub", root.GetProperty("source").GetString());
        Assert.Equal("browser-app", root.GetProperty("target").GetString());
        Assert.Equal(pingId, root.GetProperty("replyTo").GetString());
    }

    [Fact]
    public async Task PreHello_PingToHub_ReturnsHelloRequiredError()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        using var ws = await ConnectAsync(port);
        var pingId = Guid.NewGuid().ToString("N");
        await SendAsync(ws, new
        {
            version = 1,
            id = pingId,
            type = "ping",
            source = "browser-app",
            target = "hub",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            payload = new { }
        });

        using var reply = await ReceiveAsync(ws);
        var root = reply.RootElement;

        Assert.Equal("operation.error", root.GetProperty("type").GetString());
        Assert.Equal("HELLO_REQUIRED", root.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal(pingId, root.GetProperty("replyTo").GetString());
    }

    [Fact]
    public async Task PreHello_RelayToHost_ReturnsHelloRequiredBeforeRouting()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        using var ws = await ConnectAsync(port);
        var reqId = Guid.NewGuid().ToString("N");
        await SendAsync(ws, new
        {
            version = 1,
            id = reqId,
            type = "project.snapshot",
            source = "browser-app",
            target = "host",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            payload = new { }
        });

        using var reply = await ReceiveAsync(ws);
        var root = reply.RootElement;

        Assert.Equal("operation.error", root.GetProperty("type").GetString());
        Assert.Equal("HELLO_REQUIRED", root.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal(reqId, root.GetProperty("replyTo").GetString());
    }

    [Fact]
    public async Task Relay_ViewerMessage_ReachesHost()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        // Host joins first.
        using var host = await ConnectAsync(port);
        await SendAsync(host, Hello("host", Token, "revit-plugin"));
        using (await ReceiveAsync(host)) { } // connection.established for host

        // Viewer joins; host receives a peer.connected.
        using var viewer = await ConnectAsync(port);
        await SendAsync(viewer, Hello("viewer", Token, "browser-app"));
        using (await ReceiveAsync(viewer)) { } // connection.established for viewer

        using (var hostPeer = await ReceiveAsync(host))
        {
            Assert.Equal("peer.connected", hostPeer.RootElement.GetProperty("type").GetString());
        }

        // Viewer sends a request targeted at the host; the host should receive it.
        var reqId = Guid.NewGuid().ToString("N");
        await SendAsync(viewer, new
        {
            version = 1,
            id = reqId,
            type = "project.snapshot",
            source = "browser-app",
            target = "host",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            payload = new { }
        });

        using var relayed = await ReceiveAsync(host);
        var root = relayed.RootElement;
        Assert.Equal("project.snapshot", root.GetProperty("type").GetString());
        Assert.Equal(reqId, root.GetProperty("id").GetString());
        Assert.Equal("browser-app", root.GetProperty("source").GetString());
    }

    [Fact]
    public async Task Relay_HostMessage_ReachesViewer()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        using var host = await ConnectAsync(port);
        await SendAsync(host, Hello("host", Token, "revit-plugin"));
        using (await ReceiveAsync(host)) { }

        using var viewer = await ConnectAsync(port);
        await SendAsync(viewer, Hello("viewer", Token, "browser-app"));
        using (await ReceiveAsync(viewer)) { } // connection.established
        using (await ReceiveAsync(host)) { }   // peer.connected on host

        // Host replies back to the viewer (default target for a host is "viewer").
        var replyId = Guid.NewGuid().ToString("N");
        await SendAsync(host, new
        {
            version = 1,
            id = replyId,
            type = "project.snapshot",
            source = "revit-plugin",
            target = "viewer",
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            payload = new { projectName = "Demo" }
        });

        using var relayed = await ReceiveAsync(viewer);
        var root = relayed.RootElement;
        Assert.Equal("project.snapshot", root.GetProperty("type").GetString());
        Assert.Equal(replyId, root.GetProperty("id").GetString());
        Assert.Equal("Demo", root.GetProperty("payload").GetProperty("projectName").GetString());
    }

    [Fact]
    public async Task MissingEnvelopeFields_ReturnsInvalidEnvelopeError()
    {
        var port = FreePort();
        using var hub = new NovaHub(Token, port);
        hub.Start();

        using var ws = await ConnectAsync(port);
        // No id/source/type — should be rejected before routing.
        await SendAsync(ws, new { payload = new { } });

        using var reply = await ReceiveAsync(ws);
        Assert.Equal("INVALID_ENVELOPE", reply.RootElement.GetProperty("error").GetProperty("code").GetString());
    }
}
