using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Nova.RevitAddin;

/// <summary>
/// In-process Nova Connect hub (Approach C — see
/// docs/architecture/decisions.md "In-process C# WebSocket hub").
///
/// A self-contained WebSocket broker that runs on a background thread inside the
/// Revit add-in: no external <c>nova-hub.exe</c>, no Node, no Nova checkout. It
/// binds <c>ws://127.0.0.1:8765</c> via <see cref="HttpListener"/> (the WS
/// upgrade) + <see cref="WebSocket"/>, and replicates the wire protocol of
/// <c>scripts/connect-hub.cjs</c> byte-for-byte: the JSON envelope shape, the
/// pairing-token check (reject with <c>INVALID_PAIRING_TOKEN</c>),
/// <c>hello</c> → <c>connection.established</c>, the host↔viewer peer relay
/// (+ <c>peer.connected</c>/<c>peer.disconnected</c>), and <c>ping</c> →
/// <c>pong</c>.
///
/// This type is deliberately Revit-free so it can be compiled and exercised by
/// the headless xUnit test project (tests/revit-addin) without the Revit API.
/// </summary>
public sealed class NovaHub : IDisposable
{
    private readonly string _host;
    private readonly int _port;
    private readonly string _pairingToken;
    private readonly bool _pairingTokenRequired;
    private readonly string _defaultSessionId;

    private HttpListener? _listener;
    private CancellationTokenSource? _cts;
    private Task? _acceptTask;

    // sessionId -> session (host socket + viewer sockets).
    private readonly ConcurrentDictionary<string, Session> _sessions = new();
    // socket -> per-client info (role + sessionId).
    private readonly ConcurrentDictionary<WebSocket, ClientInfo> _clients = new();
    // socket -> send lock (a WebSocket allows only one concurrent SendAsync).
    private readonly ConcurrentDictionary<WebSocket, SemaphoreSlim> _sendLocks = new();

    private sealed class Session
    {
        public string Id = "";
        public WebSocket? Host;
        public readonly HashSet<WebSocket> Viewers = new();
        public string ProjectId = "";
        public readonly object Gate = new();
    }

    private sealed class ClientInfo
    {
        public string Role = "viewer";
        public string SessionId = "";
    }

    /// <param name="pairingToken">
    /// When non-empty, a <c>hello</c> must carry a matching
    /// <c>payload.pairingToken</c> or it is rejected with
    /// <c>INVALID_PAIRING_TOKEN</c>. When null/empty, any client is accepted —
    /// mirroring connect-hub.cjs (<c>pairingTokenRequired</c>).
    /// </param>
    public NovaHub(string? pairingToken, int port = 8765, string host = "127.0.0.1", string? defaultSessionId = null)
    {
        _host = string.IsNullOrWhiteSpace(host) ? "127.0.0.1" : host;
        _port = port;
        _pairingToken = pairingToken ?? "";
        _pairingTokenRequired = !string.IsNullOrEmpty(_pairingToken);
        _defaultSessionId = string.IsNullOrWhiteSpace(defaultSessionId) ? "local-revit-session" : defaultSessionId!;
    }

    public bool IsRunning => _listener?.IsListening == true;

    /// <summary>
    /// Binds the listener and starts accepting connections on a background
    /// thread. Returns once the socket is bound (so the toggle can flip green
    /// only after the port is live). Never blocks the calling (Revit UI) thread
    /// beyond the bind.
    /// </summary>
    public void Start()
    {
        if (_listener != null) return;

        var listener = new HttpListener();
        // HttpListener prefixes are http(s); the WebSocket upgrade rides on it.
        listener.Prefixes.Add($"http://{_host}:{_port}/");
        listener.Start();

        _listener = listener;
        _cts = new CancellationTokenSource();
        _acceptTask = Task.Run(() => AcceptLoopAsync(_cts.Token));
    }

    /// <summary>
    /// Stops accepting, closes every open socket, and releases the port. Safe to
    /// call when not started and idempotent. Clean shutdown for OnShutdown /
    /// toggle-off.
    /// </summary>
    public void Stop()
    {
        var listener = _listener;
        var cts = _cts;
        var acceptTask = _acceptTask;
        _listener = null;
        _cts = null;
        _acceptTask = null;
        if (listener == null) return;

        try { cts?.Cancel(); } catch { /* ignore */ }
        // Abort (not just Stop) so a parked GetContextAsync unblocks immediately
        // and the accept loop can exit — otherwise its background task lingers and
        // keeps a test host / process from exiting cleanly.
        try { listener.Abort(); } catch { /* ignore */ }

        foreach (var socket in _clients.Keys.ToArray())
        {
            try
            {
                if (socket.State == WebSocketState.Open || socket.State == WebSocketState.CloseReceived)
                {
                    socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Hub shutdown", CancellationToken.None)
                        .GetAwaiter().GetResult();
                }
            }
            catch { /* best effort */ }
            finally { try { socket.Dispose(); } catch { /* ignore */ } }
        }

        _clients.Clear();
        _sessions.Clear();
        foreach (var gate in _sendLocks.Values.ToArray())
        {
            try { gate.Dispose(); } catch { /* ignore */ }
        }
        _sendLocks.Clear();

        try { listener.Close(); } catch { /* ignore */ }

        // Give the accept loop a moment to observe the abort and unwind.
        try { acceptTask?.Wait(TimeSpan.FromSeconds(2)); } catch { /* ignore */ }

        try { cts?.Dispose(); } catch { /* ignore */ }
    }

    public void Dispose() => Stop();

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        var listener = _listener;
        if (listener == null) return;

        while (!ct.IsCancellationRequested && listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync().ConfigureAwait(false);
            }
            catch (Exception)
            {
                // Listener stopped/disposed during shutdown.
                break;
            }

            if (!context.Request.IsWebSocketRequest)
            {
                context.Response.StatusCode = 426; // Upgrade Required
                try { context.Response.Close(); } catch { /* ignore */ }
                continue;
            }

            _ = Task.Run(() => HandleClientAsync(context, ct));
        }
    }

    private async Task HandleClientAsync(HttpListenerContext context, CancellationToken ct)
    {
        WebSocket socket;
        try
        {
            var wsContext = await context.AcceptWebSocketAsync(subProtocol: null).ConfigureAwait(false);
            socket = wsContext.WebSocket;
        }
        catch
        {
            try { context.Response.Abort(); } catch { /* ignore */ }
            return;
        }

        var buffer = new byte[65536];
        try
        {
            while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var (json, closed) = await ReceiveTextAsync(socket, buffer, ct).ConfigureAwait(false);
                if (closed) break;
                if (json == null) continue;
                await HandleRawAsync(socket, json).ConfigureAwait(false);
            }
        }
        catch
        {
            // Drop on any transport error; cleanup runs in finally.
        }
        finally
        {
            await OnSocketClosedAsync(socket).ConfigureAwait(false);
            try
            {
                if (socket.State == WebSocketState.Open || socket.State == WebSocketState.CloseReceived)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None)
                        .ConfigureAwait(false);
                }
            }
            catch { /* ignore */ }
            try { socket.Dispose(); } catch { /* ignore */ }
        }
    }

    /// <summary>Reads a full (possibly multi-frame) text message; returns (json, closed).</summary>
    private static async Task<(string? json, bool closed)> ReceiveTextAsync(WebSocket socket, byte[] buffer, CancellationToken ct)
    {
        WebSocketReceiveResult result;
        var sb = new StringBuilder();
        do
        {
            result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return (null, true);
            }
            if (result.MessageType == WebSocketMessageType.Text)
            {
                sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            }
        }
        while (!result.EndOfMessage);

        return (sb.Length == 0 ? null : sb.ToString(), false);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Protocol — a faithful port of scripts/connect-hub.cjs.
    // ──────────────────────────────────────────────────────────────────────

    private async Task HandleRawAsync(WebSocket socket, string raw)
    {
        JsonElement envelope;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            envelope = doc.RootElement.Clone();
        }
        catch
        {
            await SendErrorAsync(socket, null, "Invalid JSON message", "INVALID_JSON").ConfigureAwait(false);
            return;
        }

        var type = GetString(envelope, "type");
        var source = GetString(envelope, "source");
        var id = GetString(envelope, "id");
        if (string.IsNullOrEmpty(type) || string.IsNullOrEmpty(source) || string.IsNullOrEmpty(id))
        {
            await SendErrorAsync(socket, envelope, "Envelope requires id, type, and source", "INVALID_ENVELOPE").ConfigureAwait(false);
            return;
        }

        await RouteAsync(socket, envelope).ConfigureAwait(false);
    }

    private async Task RouteAsync(WebSocket sender, JsonElement envelope)
    {
        _clients.TryGetValue(sender, out var clientInfo);
        var envSessionId = GetString(envelope, "sessionId");
        var session = GetOrCreateSession(!string.IsNullOrEmpty(envSessionId) ? envSessionId : clientInfo?.SessionId);

        var target = GetString(envelope, "target");
        if (string.IsNullOrEmpty(target))
        {
            target = clientInfo?.Role == "host" ? "viewer" : "host";
        }

        if (target == "hub")
        {
            await HandleHubMessageAsync(sender, envelope, session).ConfigureAwait(false);
            return;
        }

        if (target == "host")
        {
            WebSocket? host;
            lock (session.Gate) { host = session.Host; }
            if (host == null)
            {
                await SendErrorAsync(sender, envelope, "No host is connected for this session", "NO_HOST").ConfigureAwait(false);
                return;
            }
            await SendAsync(host, WithSessionId(envelope, session.Id)).ConfigureAwait(false);
            return;
        }

        if (target == "viewer" || target == "browser")
        {
            WebSocket[] viewers;
            lock (session.Gate) { viewers = session.Viewers.ToArray(); }
            var relayed = WithSessionId(envelope, session.Id);
            foreach (var viewer in viewers)
            {
                if (viewer != sender) await SendAsync(viewer, relayed).ConfigureAwait(false);
            }
            return;
        }

        await SendErrorAsync(sender, envelope, "Unknown target: " + target, "UNKNOWN_TARGET").ConfigureAwait(false);
    }

    private async Task HandleHubMessageAsync(WebSocket socket, JsonElement envelope, Session session)
    {
        var type = GetString(envelope, "type");

        if (type == "ping")
        {
            // Mirror connect-hub.cjs: clone the envelope, flip type→pong, set
            // source=hub, target=original source, replyTo=original id.
            var pong = CloneWith(envelope, overrides =>
            {
                overrides["type"] = "pong";
                overrides["source"] = "nova-connect-hub";
                overrides["target"] = GetString(envelope, "source") ?? "";
                overrides["replyTo"] = GetString(envelope, "id") ?? "";
            });
            await SendAsync(socket, pong).ConfigureAwait(false);
            return;
        }

        if (type != "hello") return;

        var payload = envelope.TryGetProperty("payload", out var p) && p.ValueKind == JsonValueKind.Object
            ? p
            : default;

        // Pairing-token check: only enforced when the hub was configured with a
        // token. (connect-hub.cjs: pairingTokenRequired.)
        if (_pairingTokenRequired)
        {
            var supplied = payload.ValueKind == JsonValueKind.Object ? GetString(payload, "pairingToken") : null;
            if (!FixedTimeEquals(supplied, _pairingToken))
            {
                await SendErrorAsync(socket, envelope, "Invalid pairing token", "INVALID_PAIRING_TOKEN").ConfigureAwait(false);
                return;
            }
        }

        var roleRaw = payload.ValueKind == JsonValueKind.Object ? GetString(payload, "role") : null;
        var role = roleRaw == "host" ? "host" : "viewer";

        var envProjectId = GetString(envelope, "projectId");
        var payloadProjectId = payload.ValueKind == JsonValueKind.Object ? GetString(payload, "projectId") : null;

        lock (session.Gate)
        {
            if (role == "host") session.Host = socket;
            else session.Viewers.Add(socket);

            if (!string.IsNullOrEmpty(envProjectId)) session.ProjectId = envProjectId!;
            else if (!string.IsNullOrEmpty(payloadProjectId)) session.ProjectId = payloadProjectId!;
        }

        _clients[socket] = new ClientInfo { Role = role, SessionId = session.Id };

        // peer.connected relay (host announces to viewers; viewer announces to host).
        if (role == "host")
        {
            WebSocket[] viewers;
            string projectId;
            lock (session.Gate) { viewers = session.Viewers.ToArray(); projectId = session.ProjectId; }
            foreach (var viewer in viewers)
            {
                await SendAsync(viewer, PeerEvent("peer.connected", "viewer", session.Id, projectId, "host")).ConfigureAwait(false);
            }
        }
        else
        {
            WebSocket? host;
            string projectId;
            lock (session.Gate) { host = session.Host; projectId = session.ProjectId; }
            if (host != null)
            {
                await SendAsync(host, PeerEvent("peer.connected", "host", session.Id, projectId, "viewer")).ConfigureAwait(false);
            }
        }

        // connection.established back to the joining socket.
        bool peerConnected;
        string sessionProjectId;
        lock (session.Gate)
        {
            peerConnected = role == "host" ? session.Viewers.Count > 0 : session.Host != null;
            sessionProjectId = session.ProjectId;
        }

        var established = new Dictionary<string, object?>
        {
            ["version"] = 1,
            ["id"] = CreateId("conn"),
            ["type"] = "connection.established",
            ["source"] = "nova-connect-hub",
            ["target"] = GetString(envelope, "source") ?? "",
            ["sessionId"] = session.Id,
            ["projectId"] = sessionProjectId,
            ["timestamp"] = NowMs(),
            ["payload"] = new Dictionary<string, object?>
            {
                ["sessionId"] = session.Id,
                // Mirror connect-hub.cjs: !!pairingToken (truthy when a token is set).
                ["pairingTokenRequired"] = _pairingTokenRequired,
                ["peerConnected"] = peerConnected
            },
            ["error"] = null,
            ["replyTo"] = GetString(envelope, "id") ?? ""
        };
        await SendAsync(socket, Serialize(established)).ConfigureAwait(false);
    }

    private async Task OnSocketClosedAsync(WebSocket socket)
    {
        if (_sendLocks.TryRemove(socket, out var gate))
        {
            try { gate.Dispose(); } catch { /* ignore */ }
        }
        if (!_clients.TryRemove(socket, out var info)) return;
        if (!_sessions.TryGetValue(info.SessionId, out var session)) return;

        bool wasHost;
        WebSocket[] viewers;
        string projectId;
        lock (session.Gate)
        {
            wasHost = session.Host == socket;
            if (wasHost) session.Host = null;
            session.Viewers.Remove(socket);
            viewers = session.Viewers.ToArray();
            projectId = session.ProjectId;
        }

        if (wasHost)
        {
            foreach (var viewer in viewers)
            {
                await SendAsync(viewer, PeerEvent("peer.disconnected", "viewer", session.Id, projectId, "host")).ConfigureAwait(false);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helpers.
    // ──────────────────────────────────────────────────────────────────────

    private Session GetOrCreateSession(string? sessionId)
    {
        var id = string.IsNullOrEmpty(sessionId) ? _defaultSessionId : sessionId!;
        return _sessions.GetOrAdd(id, key => new Session { Id = key });
    }

    private string PeerEvent(string type, string target, string sessionId, string projectId, string role)
    {
        var env = new Dictionary<string, object?>
        {
            ["version"] = 1,
            ["id"] = CreateId("peer"),
            ["type"] = type,
            ["source"] = "nova-connect-hub",
            ["target"] = target,
            ["sessionId"] = sessionId,
            ["projectId"] = projectId,
            ["timestamp"] = NowMs(),
            ["payload"] = new Dictionary<string, object?> { ["role"] = role },
            ["error"] = null
        };
        return Serialize(env);
    }

    private async Task SendErrorAsync(WebSocket socket, JsonElement? envelope, string message, string code)
    {
        var env = new Dictionary<string, object?>
        {
            ["version"] = 1,
            ["id"] = CreateId("err"),
            ["type"] = "operation.error",
            ["source"] = "nova-connect-hub",
            ["target"] = envelope.HasValue ? GetString(envelope.Value, "source") : null,
            ["sessionId"] = envelope.HasValue ? GetString(envelope.Value, "sessionId") : null,
            ["projectId"] = envelope.HasValue ? GetString(envelope.Value, "projectId") : null,
            ["timestamp"] = NowMs(),
            ["payload"] = new Dictionary<string, object?> { ["ok"] = false, ["message"] = message, ["code"] = code },
            ["error"] = new Dictionary<string, object?> { ["message"] = message, ["code"] = code },
            ["replyTo"] = envelope.HasValue ? GetString(envelope.Value, "id") : null
        };
        await SendAsync(socket, Serialize(env)).ConfigureAwait(false);
    }

    /// <summary>
    /// Sends one text frame. A WebSocket permits only one concurrent SendAsync, so
    /// relays/replies to the same socket are serialized through a per-socket lock.
    /// </summary>
    private async Task SendAsync(WebSocket socket, string message)
    {
        if (socket.State != WebSocketState.Open) return;
        var gate = _sendLocks.GetOrAdd(socket, _ => new SemaphoreSlim(1, 1));
        var bytes = Encoding.UTF8.GetBytes(message);
        await gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (socket.State != WebSocketState.Open) return;
            await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None)
                .ConfigureAwait(false);
        }
        catch
        {
            // Best effort — a dropped peer is reaped by the receive loop.
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Re-serializes an inbound envelope with an overridden sessionId (relay).</summary>
    private static string WithSessionId(JsonElement envelope, string sessionId)
    {
        return CloneWith(envelope, overrides => overrides["sessionId"] = sessionId);
    }

    /// <summary>
    /// Clones an inbound envelope's top-level properties into a fresh map and
    /// applies overrides, matching connect-hub.cjs's spread (<c>{ ...envelope }</c>).
    /// </summary>
    private static string CloneWith(JsonElement envelope, Action<Dictionary<string, object?>> mutate)
    {
        var map = new Dictionary<string, object?>();
        if (envelope.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in envelope.EnumerateObject())
            {
                map[prop.Name] = JsonElementToObject(prop.Value);
            }
        }
        mutate(map);
        return Serialize(map);
    }

    private static object? JsonElementToObject(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                var obj = new Dictionary<string, object?>();
                foreach (var prop in el.EnumerateObject()) obj[prop.Name] = JsonElementToObject(prop.Value);
                return obj;
            case JsonValueKind.Array:
                var list = new List<object?>();
                foreach (var item in el.EnumerateArray()) list.Add(JsonElementToObject(item));
                return list;
            case JsonValueKind.String:
                return el.GetString();
            case JsonValueKind.Number:
                if (el.TryGetInt64(out var l)) return l;
                return el.GetDouble();
            case JsonValueKind.True:
                return true;
            case JsonValueKind.False:
                return false;
            case JsonValueKind.Null:
            case JsonValueKind.Undefined:
            default:
                return null;
        }
    }

    private static string? GetString(JsonElement el, string name)
    {
        if (el.ValueKind == JsonValueKind.Object &&
            el.TryGetProperty(name, out var prop) &&
            prop.ValueKind == JsonValueKind.String)
        {
            return prop.GetString();
        }
        return null;
    }

    private static bool FixedTimeEquals(string? a, string? b)
    {
        if (a == null || b == null) return false;
        var ba = Encoding.UTF8.GetBytes(a);
        var bb = Encoding.UTF8.GetBytes(b);
        if (ba.Length != bb.Length) return false;
        return CryptographicOperations.FixedTimeEquals(ba, bb);
    }

    private static string Serialize(object value) => JsonSerializer.Serialize(value, _jsonOptions);

    private static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private static string CreateId(string prefix)
    {
        Span<byte> bytes = stackalloc byte[6];
        RandomNumberGenerator.Fill(bytes);
        return prefix + "_" + Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = false
    };
}
