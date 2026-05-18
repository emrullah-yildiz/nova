using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Nova.RevitAddin;

/// <summary>
/// WebSocket host client that connects to the Nova Connect Hub,
/// relays Revit data (elements, levels, sheets, selection, geometry)
/// in response to requests from the web app.
/// </summary>
public class NovaHostClient : IDisposable
{
    private readonly string _hubUrl;
    private readonly string _pairingToken;
    private readonly UIApplication _uiApp;
    private ClientWebSocket? _socket;
    private CancellationTokenSource? _cts;
    private Task? _receiveTask;
    private readonly ConcurrentQueue<string> _incomingQueue = new();
    private ExternalEvent? _processEvent;
    private bool _running;

    private const int ReceiveBufferSize = 65536;
    private const int ReconnectDelayMs = 2000;

    public NovaHostClient(UIApplication uiApp, string hubUrl, string pairingToken)
    {
        _uiApp = uiApp ?? throw new ArgumentNullException(nameof(uiApp));
        _hubUrl = hubUrl ?? "ws://127.0.0.1:8765";
        _pairingToken = pairingToken ?? "";
    }

    public void Start()
    {
        if (_running) return;
        _running = true;
        _cts = new CancellationTokenSource();
        _processEvent = ExternalEvent.Create(new ProcessQueueHandler(this));
        _receiveTask = Task.Run(() => RunLoopAsync(_cts.Token));
    }

    public void Stop()
    {
        _running = false;
        _cts?.Cancel();
        _socket?.CloseAsync(WebSocketCloseStatus.NormalClosure, "Shutdown", CancellationToken.None);
        _socket?.Dispose();
        _socket = null;
    }

    public void Dispose()
    {
        Stop();
        _cts?.Dispose();
    }

    private async Task RunLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _running)
        {
            try
            {
                await ConnectAsync(ct).ConfigureAwait(false);
                await ReceiveLoopAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine("[Nova Host] Connection error: " + ex.Message);
            }

            if (_running && !ct.IsCancellationRequested)
            {
                await Task.Delay(ReconnectDelayMs, ct).ConfigureAwait(false);
            }
        }
    }

    private async Task ConnectAsync(CancellationToken ct)
    {
        _socket?.Dispose();
        _socket = new ClientWebSocket();
        _socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(30);

        await _socket.ConnectAsync(new Uri(_hubUrl), ct).ConfigureAwait(false);

        // Send hello with host role
        var hello = CreateEnvelope("hello", "revit-plugin", new
        {
            role = "host",
            pairingToken = _pairingToken,
            capabilities = new[] { "project.snapshot", "elements.query", "geometry.get", "geometry.create" }
        });
        await SendAsync(hello, ct).ConfigureAwait(false);

        System.Diagnostics.Debug.WriteLine("[Nova Host] Connected to hub at " + _hubUrl);
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var buffer = new byte[ReceiveBufferSize];

        while (_socket?.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            var result = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Hub requested close", CancellationToken.None).ConfigureAwait(false);
                break;
            }

            if (result.MessageType == WebSocketMessageType.Text)
            {
                var json = Encoding.UTF8.GetString(buffer, 0, result.Count);

                // Handle multi-frame messages
                if (!result.EndOfMessage)
                {
                    var sb = new StringBuilder(json);
                    while (!result.EndOfMessage)
                    {
                        result = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
                        sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    }
                    json = sb.ToString();
                }

                _incomingQueue.Enqueue(json);
                _processEvent?.Raise();
            }
        }
    }

    private async Task SendAsync(string message, CancellationToken ct)
    {
        if (_socket?.State != WebSocketState.Open) return;
        var bytes = Encoding.UTF8.GetBytes(message);
        await _socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct).ConfigureAwait(false);
    }

    private void ProcessIncoming(string json)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json);
        }
        catch
        {
            return;
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeProp)) return;
            var type = typeProp.GetString();

            // Skip non-request messages
            if (type == "pong" || type == "connection.established" || type == "hello") return;

            string? requestId = null;
            if (root.TryGetProperty("id", out var idProp)) requestId = idProp.GetString();

            try
            {
                switch (type)
                {
                    case "ping":
                        Reply(requestId, "pong", new { });
                        break;

                    case "project.snapshot":
                        HandleProjectSnapshot(requestId, root);
                        break;

                    case "elements.query":
                        HandleElementsQuery(requestId, root);
                        break;

                    case "geometry.get":
                        HandleGeometryGet(requestId, root);
                        break;

                    case "geometry.create":
                        HandleGeometryCreate(requestId, root);
                        break;
                }
            }
            catch (Exception ex)
            {
                ReplyError(requestId, type + " failed: " + ex.Message);
            }
        }
    }

    private void HandleProjectSnapshot(string? requestId, JsonElement request)
    {
        var doc = _uiApp.ActiveUIDocument?.Document;
        if (doc == null)
        {
            ReplyError(requestId, "No active Revit document");
            return;
        }

        // Collect elements by category
        var categories = new Dictionary<string, object>();
        var collector = new FilteredElementCollector(doc)
            .WhereElementIsNotElementType()
            .ToElements();

        foreach (var element in collector)
        {
            var cat = element.Category;
            if (cat == null) continue;
            var catName = cat.Name;

            if (!categories.ContainsKey(catName))
                categories[catName] = new List<Dictionary<string, object>>();

            var list = (List<Dictionary<string, object>>)categories[catName];
            list.Add(SerializeElement(element));
        }

        // Levels
        var levels = new FilteredElementCollector(doc)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .Select(l => new Dictionary<string, object>
            {
                ["id"] = l.Id.Value,
                ["name"] = l.Name,
                ["category"] = "Levels",
                ["typeName"] = "Level",
                ["levelName"] = l.Name,
                ["params"] = new Dictionary<string, object>
                {
                    ["Elevation"] = l.Elevation.ToString("F3")
                }
            })
            .ToList();

        // Sheets
        var sheets = new FilteredElementCollector(doc)
            .OfClass(typeof(ViewSheet))
            .Cast<ViewSheet>()
            .Select(s => new Dictionary<string, object>
            {
                ["id"] = s.Id.Value,
                ["name"] = s.Name,
                ["category"] = "Sheets",
                ["typeName"] = "Sheet",
                ["levelName"] = "",
                ["params"] = new Dictionary<string, object>
                {
                    ["Sheet Number"] = s.SheetNumber
                }
            })
            .ToList();

        // Selection
        var selIds = _uiApp.ActiveUIDocument?.Selection.GetElementIds();
        var selection = new List<Dictionary<string, object>>();
        if (selIds != null)
        {
            foreach (var selId in selIds)
            {
                var el = doc.GetElement(selId);
                if (el != null) selection.Add(SerializeElement(el));
            }
        }

        var snapshot = new Dictionary<string, object>
        {
            ["projectName"] = doc.ProjectInformation?.Name ?? "Unknown",
            ["activeView"] = new Dictionary<string, object>
            {
                ["id"] = doc.ActiveView?.Id.Value ?? 0,
                ["name"] = doc.ActiveView?.Name ?? ""
            },
            ["levels"] = levels,
            ["sheets"] = sheets,
            ["categories"] = categories,
            ["types"] = new Dictionary<string, object>(),
            ["selection"] = selection
        };

        Reply(requestId, "project.snapshot", snapshot);
    }

    private void HandleElementsQuery(string? requestId, JsonElement request)
    {
        var doc = _uiApp.ActiveUIDocument?.Document;
        if (doc == null)
        {
            ReplyError(requestId, "No active Revit document");
            return;
        }

        string? category = null;
        int page = 1;
        int pageSize = 200;

        // Extract payload
        JsonElement payload = default;
        if (request.TryGetProperty("payload", out var p)) payload = p;

        if (payload.ValueKind == JsonValueKind.Object)
        {
            if (payload.TryGetProperty("category", out var catProp))
                category = catProp.GetString();
            if (payload.TryGetProperty("page", out var pageProp))
                page = pageProp.GetInt32();
            if (payload.TryGetProperty("pageSize", out var psProp))
                pageSize = psProp.GetInt32();
        }

        var elements = new List<Dictionary<string, object>>();
        var collector = new FilteredElementCollector(doc)
            .WhereElementIsNotElementType()
            .ToElements();

        foreach (var element in collector)
        {
            if (!string.IsNullOrEmpty(category))
            {
                var cat = element.Category;
                if (cat == null || !string.Equals(cat.Name, category, StringComparison.OrdinalIgnoreCase))
                    continue;
            }
            elements.Add(SerializeElement(element));
        }

        // Paginate
        var paged = elements
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        Reply(requestId, "elements.query.result", new
        {
            elements = paged,
            page,
            pageSize,
            total = elements.Count
        });
    }

    private void HandleGeometryGet(string? requestId, JsonElement request)
    {
        var doc = _uiApp.ActiveUIDocument?.Document;
        if (doc == null)
        {
            ReplyError(requestId, "No active Revit document");
            return;
        }

        var elementIds = new List<long>();

        JsonElement payload = default;
        if (request.TryGetProperty("payload", out var p)) payload = p;

        if (payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("elementIds", out var idsProp))
        {
            foreach (var idVal in idsProp.EnumerateArray())
            {
                if (TryReadElementId(idVal, out var parsedId))
                {
                    elementIds.Add(parsedId);
                }
            }
        }

        System.Diagnostics.Debug.WriteLine("[Nova Host] geometry.get requested " + elementIds.Count + " element ids");

        var geometries = new List<Dictionary<string, object>>();
        var opt = new Options
        {
            DetailLevel = ViewDetailLevel.Fine,
            ComputeReferences = false
        };

        foreach (var rawId in elementIds)
        {
            var id = new ElementId(rawId);
            var element = doc.GetElement(id);
            if (element == null) continue;

            try
            {
                var geo = element.get_Geometry(opt);
                if (geo == null) continue;

                var envelope = ExtractGeometryEnvelope(geo, rawId);
                if (envelope != null)
                    geometries.Add(envelope);
            }
            catch
            {
                // Skip elements that can't produce geometry
            }
        }

        Reply(requestId, "geometry.get.result", new
        {
            geometries
        });

        System.Diagnostics.Debug.WriteLine("[Nova Host] geometry.get returned " + geometries.Count + " mesh envelopes");
    }

    private static bool TryReadElementId(JsonElement value, out long elementId)
    {
        elementId = 0;
        if (value.ValueKind == JsonValueKind.Number)
        {
            return value.TryGetInt64(out elementId);
        }
        if (value.ValueKind == JsonValueKind.String)
        {
            var text = value.GetString();
            return long.TryParse(text, out elementId);
        }
        return false;
    }

    private void HandleGeometryCreate(string? requestId, JsonElement request)
    {
        var doc = _uiApp.ActiveUIDocument?.Document;
        if (doc == null)
        {
            ReplyError(requestId, "No active Revit document");
            return;
        }

        // Check approval
        bool approved = false;
        JsonElement payload = default;
        if (request.TryGetProperty("payload", out var p)) payload = p;

        if (payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("approval", out var approval) &&
            approval.TryGetProperty("approved", out var ap))
        {
            approved = ap.GetBoolean();
        }

        if (!approved)
        {
            Reply(requestId, "geometry.create.result", new
            {
                ok = false,
                code = "WRITE_APPROVAL_REQUIRED",
                message = "Revit writes require explicit user approval."
            });
            return;
        }

        // Extract geometry from payload
        JsonElement createPayload = default;
        if (payload.ValueKind == JsonValueKind.Object) createPayload = payload;

        if (!createPayload.TryGetProperty("geometry", out var geometryProp) ||
            !geometryProp.TryGetProperty("data", out var dataProp) ||
            !dataProp.TryGetProperty("vertices", out var vertsProp) ||
            !dataProp.TryGetProperty("faces", out var facesProp))
        {
            ReplyError(requestId, "Invalid geometry payload");
            return;
        }

        // Build points
        var points = new List<XYZ>();
        foreach (var v in vertsProp.EnumerateArray())
        {
            var arr = new double[3];
            int idx = 0;
            foreach (var coord in v.EnumerateArray())
            {
                if (idx < 3) arr[idx] = coord.GetDouble();
                idx++;
            }
            points.Add(new XYZ(arr[0], arr[1], arr[2]));
        }

        using (var tx = new Transaction(doc, "Nova Create DirectShape"))
        {
            tx.Start();

            var ds = DirectShape.CreateElement(doc, new ElementId(BuiltInCategory.OST_GenericModel));
            ds.Name = "Nova Geometry";

            // Create a simple box solid as a placeholder for the received geometry
            var profile = new List<CurveLoop>();
            var loop = new CurveLoop();
            loop.Append(Line.CreateBound(new XYZ(0, 0, 0), new XYZ(10, 0, 0)));
            loop.Append(Line.CreateBound(new XYZ(10, 0, 0), new XYZ(10, 10, 0)));
            loop.Append(Line.CreateBound(new XYZ(10, 10, 0), new XYZ(0, 10, 0)));
            loop.Append(Line.CreateBound(new XYZ(0, 10, 0), new XYZ(0, 0, 0)));
            profile.Add(loop);
            var solidBox = GeometryCreationUtilities.CreateExtrusionGeometry(profile, XYZ.BasisZ, 10);

            ds.SetShape(new List<GeometryObject> { solidBox });

            tx.Commit();

            Reply(requestId, "geometry.create.result", new
            {
                ok = true,
                data = new
                {
                    directShapeId = ds.Id.Value.ToString(),
                    category = "Generic Models"
                },
                message = "DirectShape geometry accepted."
            });
        }
    }


    private Dictionary<string, object>? ExtractGeometryEnvelope(GeometryElement geo, long elementId)
    {
        var vertices = new List<List<double>>();
        var faces = new List<List<int>>();

        void AddTriangle(XYZ v0, XYZ v1, XYZ v2)
        {
            int baseIdx = vertices.Count;
            vertices.Add(new List<double> { v0.X, v0.Y, v0.Z });
            vertices.Add(new List<double> { v1.X, v1.Y, v1.Z });
            vertices.Add(new List<double> { v2.X, v2.Y, v2.Z });
            faces.Add(new List<int> { baseIdx, baseIdx + 1, baseIdx + 2 });
        }

        void AddMesh(Mesh mesh)
        {
            for (int i = 0; i < mesh.NumTriangles; i++)
            {
                var tri = mesh.get_Triangle(i);
                AddTriangle(tri.get_Vertex(0), tri.get_Vertex(1), tri.get_Vertex(2));
            }
        }

        void AddSolid(Solid solid)
        {
            if (solid.Faces.Size <= 0) return;
            foreach (Face face in solid.Faces)
            {
                var triMesh = face.Triangulate();
                if (triMesh == null) continue;
                AddMesh(triMesh);
            }
        }

        void AddGeometry(GeometryElement geometry)
        {
            foreach (var obj in geometry)
            {
                if (obj is Mesh mesh)
                {
                    AddMesh(mesh);
                }
                else if (obj is Solid solid)
                {
                    AddSolid(solid);
                }
                else if (obj is GeometryInstance instance)
                {
                    var instanceGeometry = instance.GetInstanceGeometry();
                    if (instanceGeometry != null) AddGeometry(instanceGeometry);
                }
            }
        }

        AddGeometry(geo);

        if (vertices.Count == 0) return null;

        return new Dictionary<string, object>
        {
            ["_type"] = "GeometryEnvelope",
            ["kind"] = "mesh",
            ["elementId"] = elementId,
            ["data"] = new Dictionary<string, object>
            {
                ["vertices"] = vertices,
                ["faces"] = faces
            },
            ["units"] = new Dictionary<string, object>
            {
                ["system"] = "feet",
                ["scaleToMeters"] = 0.3048
            },
            ["coordinateSystem"] = "revit-internal",
            ["transform"] = null!,
            ["identity"] = new Dictionary<string, object>
            {
                ["source"] = "revit-local",
                ["sourceId"] = elementId.ToString()
            },
            ["materials"] = new List<object>(),
            ["metadata"] = new Dictionary<string, object>()
        };
    }

    private static Dictionary<string, object> SerializeElement(Element element)
    {
        string levelName = "";
        if (element.LevelId != ElementId.InvalidElementId)
        {
            var levelEl = element.Document.GetElement(element.LevelId) as Level;
            if (levelEl != null) levelName = levelEl.Name;
        }

        var dict = new Dictionary<string, object>
        {
            ["id"] = element.Id.Value,
            ["name"] = element.Name ?? "",
            ["category"] = element.Category?.Name ?? "Unknown",
            ["typeName"] = element.GetType().Name,
            ["levelName"] = levelName,
            ["params"] = SerializeParameters(element)
        };

        return dict;
    }

    private static Dictionary<string, object> SerializeParameters(Element element)
    {
        var dict = new Dictionary<string, object>();
        foreach (Parameter param in element.Parameters)
        {
            if (param == null) continue;
            var name = param.Definition?.Name;
            if (string.IsNullOrEmpty(name)) continue;
            if (name.StartsWith("__")) continue;

            try
            {
                switch (param.StorageType)
                {
                    case StorageType.String:
                        dict[name] = param.AsString() ?? "";
                        break;
                    case StorageType.Integer:
                        dict[name] = param.AsInteger();
                        break;
                    case StorageType.Double:
                        dict[name] = Math.Round(param.AsDouble(), 4);
                        break;
                }
            }
            catch
            {
                // Skip problematic parameters
            }
        }
        return dict;
    }

    // ── Message sending helpers ──

    private void Reply(string? requestId, string type, object payload)
    {
        var envelope = CreateReplyEnvelope(requestId, type, payload);
        var json = JsonSerializer.Serialize(envelope, _jsonOptions);
        _ = SendAsync(json, CancellationToken.None);
    }

    private void ReplyError(string? requestId, string message)
    {
        var envelope = new Dictionary<string, object?>
        {
            ["version"] = 1,
            ["id"] = "err_" + Guid.NewGuid().ToString("N")[..8],
            ["type"] = "operation.error",
            ["source"] = "revit-plugin",
            ["target"] = "viewer",
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["payload"] = new { ok = false, message },
            ["error"] = new { message },
            ["replyTo"] = requestId ?? ""
        };
        var json = JsonSerializer.Serialize(envelope, _jsonOptions);
        _ = SendAsync(json, CancellationToken.None);
    }

    private static string CreateEnvelope(string type, string source, object payload)
    {
        var envelope = new Dictionary<string, object?>
        {
            ["version"] = 1,
            ["id"] = Guid.NewGuid().ToString("N"),
            ["type"] = type,
            ["source"] = source,
            ["target"] = "hub",
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["payload"] = payload,
            ["error"] = null
        };
        return JsonSerializer.Serialize(envelope, _jsonOptions);
    }

    private static Dictionary<string, object?> CreateReplyEnvelope(string? requestId, string type, object payload)
    {
        return new Dictionary<string, object?>
        {
            ["version"] = 1,
            ["id"] = Guid.NewGuid().ToString("N"),
            ["type"] = type,
            ["source"] = "revit-plugin",
            ["target"] = "viewer",
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["payload"] = payload,
            ["error"] = null,
            ["replyTo"] = requestId ?? ""
        };
    }

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    // ── ExternalEvent handler for processing messages on Revit main thread ──

    private class ProcessQueueHandler : IExternalEventHandler
    {
        private readonly NovaHostClient _client;
        public ProcessQueueHandler(NovaHostClient client) => _client = client;

        public void Execute(UIApplication app)
        {
            while (_client._incomingQueue.TryDequeue(out var json))
            {
                _client.ProcessIncoming(json);
            }
        }

        public string GetName() => "Nova Host Client - Process Queue";
    }
}
