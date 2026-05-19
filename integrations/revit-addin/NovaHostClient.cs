using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
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
            capabilities = new[] { "project.snapshot", "elements.query", "geometry.get", "geometry.create", "parameter.get", "parameter.set" }
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

                    case "parameter.get":
                        HandleParameterGet(requestId, root);
                        break;

                    case "parameter.set":
                        HandleParameterSet(requestId, root);
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
                var envelope = geo == null
                    ? ExtractBoundingBoxEnvelope(element, rawId)
                    : ExtractGeometryEnvelope(geo, rawId, element);
                if (envelope != null)
                    geometries.Add(envelope);
            }
            catch
            {
                var fallback = ExtractBoundingBoxEnvelope(element, rawId);
                if (fallback != null) geometries.Add(fallback);
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

    private static List<long> ReadElementIds(JsonElement request)
    {
        var elementIds = new List<long>();
        JsonElement payload = default;
        if (request.TryGetProperty("payload", out var p)) payload = p;

        if (payload.ValueKind != JsonValueKind.Object ||
            !payload.TryGetProperty("elementIds", out var idsProp) ||
            idsProp.ValueKind != JsonValueKind.Array)
        {
            return elementIds;
        }

        foreach (var idVal in idsProp.EnumerateArray())
        {
            if (TryReadElementId(idVal, out var parsedId))
            {
                elementIds.Add(parsedId);
            }
        }

        return elementIds;
    }

    private static string ReadParameterName(JsonElement request)
    {
        JsonElement payload = default;
        if (request.TryGetProperty("payload", out var p)) payload = p;
        if (payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("parameterName", out var nameProp))
        {
            return nameProp.GetString() ?? "";
        }
        return "";
    }

    private void HandleParameterGet(string? requestId, JsonElement request)
    {
        var doc = _uiApp.ActiveUIDocument?.Document;
        if (doc == null)
        {
            ReplyError(requestId, "No active Revit document");
            return;
        }

        var elementIds = ReadElementIds(request);
        var parameterName = ReadParameterName(request);
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            ReplyError(requestId, "Parameter name is required");
            return;
        }

        var values = new List<Dictionary<string, object?>>();
        foreach (var rawId in elementIds)
        {
            var element = doc.GetElement(new ElementId(rawId));
            var param = element?.LookupParameter(parameterName);
            values.Add(new Dictionary<string, object?>
            {
                ["elementId"] = rawId,
                ["parameterName"] = parameterName,
                ["found"] = param != null,
                ["readOnly"] = param?.IsReadOnly ?? false,
                ["storageType"] = param?.StorageType.ToString() ?? "",
                ["value"] = param == null ? null : ReadParameterValue(doc, param)
            });
        }

        Reply(requestId, "parameter.get.result", new
        {
            values,
            count = values.Count
        });
    }

    private void HandleParameterSet(string? requestId, JsonElement request)
    {
        var doc = _uiApp.ActiveUIDocument?.Document;
        if (doc == null)
        {
            ReplyError(requestId, "No active Revit document");
            return;
        }

        JsonElement payload = default;
        if (request.TryGetProperty("payload", out var p)) payload = p;

        var approved = payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("approval", out var approval) &&
            approval.TryGetProperty("approved", out var ap) &&
            ap.GetBoolean();

        if (!approved)
        {
            Reply(requestId, "parameter.set.result", new
            {
                results = Array.Empty<object>(),
                count = 0,
                ok = false,
                code = "WRITE_APPROVAL_REQUIRED",
                message = "Revit parameter writes require explicit user approval."
            });
            return;
        }

        var elementIds = ReadElementIds(request);
        var parameterName = ReadParameterName(request);
        if (string.IsNullOrWhiteSpace(parameterName))
        {
            ReplyError(requestId, "Parameter name is required");
            return;
        }

        JsonElement valuesProp = default;
        var hasValues = payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("values", out valuesProp);

        if (!hasValues)
        {
            ReplyError(requestId, "Parameter values are required");
            return;
        }

        var results = new List<Dictionary<string, object?>>();
        using (var tx = new Transaction(doc, "Nova Set Parameter Values"))
        {
            tx.Start();

            for (var i = 0; i < elementIds.Count; i++)
            {
                var rawId = elementIds[i];
                var element = doc.GetElement(new ElementId(rawId));
                var param = element?.LookupParameter(parameterName);
                var value = SelectParameterSetValue(valuesProp, i);

                if (element == null)
                {
                    results.Add(ParameterSetResult(rawId, parameterName, false, "Element not found", null));
                    continue;
                }
                if (param == null)
                {
                    results.Add(ParameterSetResult(rawId, parameterName, false, "Parameter not found", null));
                    continue;
                }
                if (param.IsReadOnly)
                {
                    results.Add(ParameterSetResult(rawId, parameterName, false, "Parameter is read-only", ReadParameterValue(doc, param)));
                    continue;
                }

                try
                {
                    if (TrySetParameterValue(param, value, out var normalizedValue, out var message))
                    {
                        results.Add(ParameterSetResult(rawId, parameterName, true, message, normalizedValue));
                    }
                    else
                    {
                        results.Add(ParameterSetResult(rawId, parameterName, false, message, ReadParameterValue(doc, param)));
                    }
                }
                catch (Exception ex)
                {
                    results.Add(ParameterSetResult(rawId, parameterName, false, ex.Message, ReadParameterValue(doc, param)));
                }
            }

            tx.Commit();
        }

        var successCount = results.Count(result => result.TryGetValue("ok", out var ok) && ok is bool b && b);
        Reply(requestId, "parameter.set.result", new
        {
            results,
            count = successCount,
            ok = successCount == results.Count
        });
    }

    private static JsonElement SelectParameterSetValue(JsonElement valuesProp, int index)
    {
        if (valuesProp.ValueKind != JsonValueKind.Array) return valuesProp;
        var values = valuesProp.EnumerateArray().ToList();
        if (values.Count == 0) return default;
        return index < values.Count ? values[index] : values[^1];
    }

    private static Dictionary<string, object?> ParameterSetResult(long elementId, string parameterName, bool ok, string message, object? value)
    {
        return new Dictionary<string, object?>
        {
            ["elementId"] = elementId,
            ["parameterName"] = parameterName,
            ["ok"] = ok,
            ["message"] = message,
            ["value"] = value
        };
    }

    private static object? ReadParameterValue(Document doc, Parameter param)
    {
        return param.StorageType switch
        {
            StorageType.String => param.AsString() ?? param.AsValueString() ?? "",
            StorageType.Integer => param.AsInteger(),
            StorageType.Double => Math.Round(param.AsDouble(), 6),
            StorageType.ElementId => ReadElementIdParameterValue(doc, param),
            _ => null
        };
    }

    private static string ReadElementIdParameterValue(Document doc, Parameter param)
    {
        var elementId = param.AsElementId();
        if (elementId == ElementId.InvalidElementId)
        {
            return "";
        }

        var referencedElement = doc.GetElement(elementId);
        if (referencedElement != null && !string.IsNullOrWhiteSpace(referencedElement.Name))
        {
            return referencedElement.Name;
        }

        var displayValue = param.AsValueString();
        if (!string.IsNullOrWhiteSpace(displayValue))
        {
            return displayValue;
        }

        return elementId.Value.ToString(CultureInfo.InvariantCulture);
    }

    private static bool TrySetParameterValue(Parameter param, JsonElement value, out object? normalizedValue, out string message)
    {
        normalizedValue = null;
        message = "Parameter updated";

        switch (param.StorageType)
        {
            case StorageType.String:
                normalizedValue = JsonValueToString(value);
                param.Set((string?)normalizedValue ?? "");
                return true;

            case StorageType.Integer:
                if (TryReadIntegerValue(value, out var intValue))
                {
                    normalizedValue = intValue;
                    param.Set(intValue);
                    return true;
                }
                message = "Value cannot be converted to an integer";
                return false;

            case StorageType.Double:
                if (TryReadDoubleValue(value, out var doubleValue))
                {
                    normalizedValue = doubleValue;
                    param.Set(doubleValue);
                    return true;
                }
                message = "Value cannot be converted to a number";
                return false;

            case StorageType.ElementId:
                if (TryReadElementId(value, out var elementId))
                {
                    normalizedValue = elementId.ToString(CultureInfo.InvariantCulture);
                    param.Set(new ElementId(elementId));
                    return true;
                }
                message = "Value cannot be converted to an element id";
                return false;

            default:
                message = "Unsupported parameter storage type";
                return false;
        }
    }

    private static string JsonValueToString(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? "",
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => "",
            JsonValueKind.Undefined => "",
            _ => value.GetRawText()
        };
    }

    private static bool TryReadIntegerValue(JsonElement value, out int result)
    {
        result = 0;
        if (value.ValueKind == JsonValueKind.Number) return value.TryGetInt32(out result);
        if (value.ValueKind == JsonValueKind.True) { result = 1; return true; }
        if (value.ValueKind == JsonValueKind.False) { result = 0; return true; }
        if (value.ValueKind == JsonValueKind.String)
        {
            return int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out result);
        }
        return false;
    }

    private static bool TryReadDoubleValue(JsonElement value, out double result)
    {
        result = 0;
        if (value.ValueKind == JsonValueKind.Number) return value.TryGetDouble(out result);
        if (value.ValueKind == JsonValueKind.String)
        {
            return double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out result);
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

        var categoryName = "Generic Models";
        if (createPayload.TryGetProperty("category", out var categoryProp))
        {
            categoryName = categoryProp.GetString() ?? categoryName;
        }

        var elementName = "Nova Geometry";
        if (createPayload.TryGetProperty("name", out var nameProp))
        {
            elementName = nameProp.GetString() ?? elementName;
        }

        var vertexScale = ReadGeometryScaleToRevitFeet(geometryProp);
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
            points.Add(new XYZ(arr[0] * vertexScale, arr[1] * vertexScale, arr[2] * vertexScale));
        }

        var faces = new List<List<int>>();
        foreach (var face in facesProp.EnumerateArray())
        {
            var indices = new List<int>();
            foreach (var indexProp in face.EnumerateArray())
            {
                if (indexProp.TryGetInt32(out var index))
                {
                    indices.Add(index);
                }
            }
            if (indices.Count >= 3) faces.Add(indices);
        }

        var categoryId = ResolveDirectShapeCategory(categoryName);
        var shape = BuildDirectShapeMesh(points, faces);
        if (shape.Count == 0)
        {
            ReplyError(requestId, "Geometry payload did not contain a valid mesh");
            return;
        }

        using (var tx = new Transaction(doc, "Nova Create DirectShape"))
        {
            tx.Start();

            var ds = DirectShape.CreateElement(doc, categoryId);
            ds.Name = string.IsNullOrWhiteSpace(elementName) ? "Nova Geometry" : elementName;
            ds.ApplicationId = "Nova";
            ds.ApplicationDataId = Guid.NewGuid().ToString("N");
            ds.SetShape(shape);

            tx.Commit();

            Reply(requestId, "geometry.create.result", new
            {
                ok = true,
                data = new
                {
                    directShapeId = ds.Id.Value.ToString(),
                    category = categoryName,
                    name = ds.Name
                },
                message = "DirectShape geometry created."
            });
        }
    }

    private static double ReadGeometryScaleToRevitFeet(JsonElement geometryProp)
    {
        if (geometryProp.TryGetProperty("units", out var unitsProp) &&
            unitsProp.ValueKind == JsonValueKind.Object &&
            unitsProp.TryGetProperty("scaleToMeters", out var scaleProp) &&
            scaleProp.TryGetDouble(out var scaleToMeters))
        {
            return scaleToMeters / 0.3048;
        }
        return 1.0 / 0.3048;
    }

    private static ElementId ResolveDirectShapeCategory(string categoryName)
    {
        var normalized = (categoryName ?? "").Trim().ToLowerInvariant();
        var category = normalized switch
        {
            "mass" or "massing" => BuiltInCategory.OST_Mass,
            "furniture" => BuiltInCategory.OST_Furniture,
            "walls" or "wall" => BuiltInCategory.OST_Walls,
            "floors" or "floor" => BuiltInCategory.OST_Floors,
            "roofs" or "roof" => BuiltInCategory.OST_Roofs,
            "ceilings" or "ceiling" => BuiltInCategory.OST_Ceilings,
            "columns" or "column" => BuiltInCategory.OST_Columns,
            "structural framing" or "framing" => BuiltInCategory.OST_StructuralFraming,
            "mechanical equipment" => BuiltInCategory.OST_MechanicalEquipment,
            "plumbing fixtures" => BuiltInCategory.OST_PlumbingFixtures,
            "electrical fixtures" => BuiltInCategory.OST_ElectricalFixtures,
            "electrical equipment" => BuiltInCategory.OST_ElectricalEquipment,
            _ => BuiltInCategory.OST_GenericModel
        };
        return new ElementId(category);
    }

    private static List<GeometryObject> BuildDirectShapeMesh(List<XYZ> points, List<List<int>> faces)
    {
        var builder = new TessellatedShapeBuilder();
        builder.OpenConnectedFaceSet(true);

        foreach (var indices in faces)
        {
            var facePoints = new List<XYZ>();
            foreach (var index in indices)
            {
                if (index >= 0 && index < points.Count)
                {
                    facePoints.Add(points[index]);
                }
            }
            if (facePoints.Count < 3) continue;

            try
            {
                builder.AddFace(new TessellatedFace(facePoints, ElementId.InvalidElementId));
            }
            catch
            {
                // Skip malformed faces and keep the rest of the mesh.
            }
        }

        builder.CloseConnectedFaceSet();
        builder.Target = TessellatedShapeBuilderTarget.AnyGeometry;
        builder.Fallback = TessellatedShapeBuilderFallback.Mesh;
        builder.Build();
        return builder.GetBuildResult().GetGeometricalObjects().ToList();
    }


    private Dictionary<string, object>? ExtractGeometryEnvelope(GeometryElement geo, long elementId, Element element)
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

        if (vertices.Count == 0) return ExtractBoundingBoxEnvelope(element, elementId);

        return CreateMeshEnvelope(elementId, vertices, faces, "revit-geometry");
    }

    private Dictionary<string, object>? ExtractBoundingBoxEnvelope(Element element, long elementId)
    {
        var box = element.get_BoundingBox(null);
        if (box == null) return null;

        var min = box.Min;
        var max = box.Max;
        if (min == null || max == null) return null;
        if (Math.Abs(max.X - min.X) < 0.0001 &&
            Math.Abs(max.Y - min.Y) < 0.0001 &&
            Math.Abs(max.Z - min.Z) < 0.0001)
        {
            return null;
        }

        var vertices = new List<List<double>>
        {
            new() { min.X, min.Y, min.Z },
            new() { max.X, min.Y, min.Z },
            new() { max.X, max.Y, min.Z },
            new() { min.X, max.Y, min.Z },
            new() { min.X, min.Y, max.Z },
            new() { max.X, min.Y, max.Z },
            new() { max.X, max.Y, max.Z },
            new() { min.X, max.Y, max.Z }
        };

        var faces = new List<List<int>>
        {
            new() { 0, 1, 2 }, new() { 0, 2, 3 },
            new() { 4, 6, 5 }, new() { 4, 7, 6 },
            new() { 0, 4, 5 }, new() { 0, 5, 1 },
            new() { 1, 5, 6 }, new() { 1, 6, 2 },
            new() { 2, 6, 7 }, new() { 2, 7, 3 },
            new() { 3, 7, 4 }, new() { 3, 4, 0 }
        };

        return CreateMeshEnvelope(elementId, vertices, faces, "revit-bounding-box");
    }

    private static Dictionary<string, object> CreateMeshEnvelope(
        long elementId,
        List<List<double>> vertices,
        List<List<int>> faces,
        string extraction)
    {
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
            ["metadata"] = new Dictionary<string, object>
            {
                ["extraction"] = extraction
            }
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
                    case StorageType.ElementId:
                        dict[name] = ReadElementIdParameterValue(element.Document, param);
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
