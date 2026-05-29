import { Geo } from '../../geometry/index.js';
import {
  SOURCES,
  createGeometryEnvelope,
  createIdentity,
  normalizeElementRecord
} from '../connect/protocol.js';
import { createRevitElementRef } from '../../core/values.js';

function getRuntimeGlobal() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

let RevitBridge;

// ============================================
// NODEFLOW AI — Revit Integration Bridge (Runtime)
// RevitElement data type + RevitBridge utility object
// ============================================

// ═══════════════════════════════════════
// RevitElement — typed data object for Revit elements
// Carries: id, name, category, typeName, levelName, params
// Displays as: "Category [Id]" in Data Inspector
// ═══════════════════════════════════════

function RevitElement(data) {
  this._type = 'RevitElement';
  this.id = data.id || 0;
  this.name = data.name || '';
  this.category = data.category || 'Unknown';
  this.typeName = data.typeName || '';
  this.levelName = data.levelName || '';
  this.params = data.params || {};
  this.geometry = data.geometry || null;
  this.geometries = data.geometries || null;
  this.mesh = data.mesh || null;
  this.meshes = data.meshes || null;
  this.raw = data.raw || data;
  this.identity = createIdentity({
    source: SOURCES.REVIT_LOCAL,
    sourceId: data.sourceId || data.uniqueId || data.elementId || data.id || 0,
    versionId: data.versionId || '',
    ...(data.identity || {})
  });
  this.sourceId = this.identity.sourceId;
  this.versionId = this.identity.versionId;
}

RevitElement.prototype.toString = function() {
  return this.category + ' [' + this.id + ']';
};

RevitElement.prototype.get = function(key, fallback) {
  if (key === 'id') return this.id;
  if (key === 'name') return this.name;
  if (key === 'category') return this.category;
  if (key === 'typeName') return this.typeName;
  if (key === 'levelName') return this.levelName;
  if (this.params && this.params[key] !== undefined) return this.params[key];
  return fallback !== undefined ? fallback : null;
};

RevitElement.prototype.toElementRef = function() {
  return createRevitElementRef(this);
};

export function installRevitNodes(runtimeGlobal = getRuntimeGlobal()) {
  if (runtimeGlobal.__revitNodesInstalled) return runtimeGlobal.RevitBridge;
  runtimeGlobal.__revitNodesInstalled = true;
  const window = runtimeGlobal;

window.RevitElement = RevitElement;

function getConnectClient() {
  var client = window.NovaConnect;
  if (!client) return null;
  if (client.status === 'connected') return client;
  if (client.snapshot || Object.keys(client.elementsByCategory || {}).length > 0) return client;
  return null;
}

function getCachedElements(category) {
  var client = getConnectClient();
  if (!client || !client.elementsByCategory) return null;
  var cached = client.elementsByCategory[category];
  return Array.isArray(cached) ? cached : null;
}

function geometryEnvelopeToGeo(envelope) {
  if (!envelope || envelope.kind !== 'mesh' || !envelope.data) return null;
  var vertices = envelope.data.vertices || [];
  var faces = envelope.data.faces || [];
  if (!Array.isArray(vertices) || !Array.isArray(faces)) return null;
  var points = [];
  for (var i = 0; i < vertices.length; i++) {
    var vertex = vertices[i];
    points.push(new Geo.Point3(Number(vertex[0] || 0), Number(vertex[1] || 0), Number(vertex[2] || 0)));
  }
  return new Geo.Mesh3(points, faces.map(function(face) { return face.slice(); }));
}

// ═══════════════════════════════════════
// RevitBridge — data access layer
// ═══════════════════════════════════════

RevitBridge = {
  getConnectClient: getConnectClient,

  isLive() {
    var client = getConnectClient();
    return !!(client && client.status === 'connected');
  },

  async connect(options) {
    var client = window.NovaConnect;
    if (!client) throw new Error('NovaConnect client is not installed');
    if (options) {
      if (options.url) client.url = options.url;
      if (options.sessionId) client.sessionId = options.sessionId;
      if (options.projectId) client.projectId = options.projectId;
      if (options.pairingToken) client.pairingToken = options.pairingToken;
    }
    await client.connect();
    return client;
  },

  async refreshProject() {
    var client = getConnectClient();
    if (!client || client.status !== 'connected') return this.getData();
    return client.getProjectSnapshot();
  },

  getData() {
    var client = getConnectClient();
    if (client && client.snapshot) return client.snapshot;
    console.error('[RevitBridge] Failed to get data: No active Revit session. Start the Connect Hub and pair with Revit.');
    throw new Error('Revit connection required: No active Revit session. Start the Connect Hub and pair with Revit.');
  },

  // Wrap a raw element dict into a typed RevitElement
  wrapElement(raw) {
    if (raw instanceof RevitElement) return raw;
    if (!raw || typeof raw !== 'object') return null;
    var normalized = raw._type === 'ElementRecord'
      ? raw
      : normalizeElementRecord(raw, raw.identity || { source: SOURCES.REVIT_LOCAL });
    return new RevitElement({
      id: normalized.id || 0,
      name: normalized.name || '',
      category: normalized.category || '',
      typeName: normalized.typeName || '',
      levelName: normalized.levelName || '',
      params: normalized.params || {},
      geometry: raw.geometry || normalized.geometry || null,
      geometries: raw.geometries || normalized.geometries || null,
      mesh: raw.mesh || normalized.mesh || null,
      meshes: raw.meshes || normalized.meshes || null,
      raw: raw,
      identity: normalized.identity
    });
  },

  // Get all elements across all categories as RevitElement objects
  getAllElements() {
    var d = this.getData();
    var result = [];
    var cats = d.categories || {};
    var catNames = Object.keys(cats);
    for (var ci = 0; ci < catNames.length; ci++) {
      var cat = cats[catNames[ci]];
      var elems = cat.elements || cat || [];
      if (!Array.isArray(elems)) continue;
      for (var ei = 0; ei < elems.length; ei++) {
        var wrapped = this.wrapElement(elems[ei]);
        if (wrapped) result.push(wrapped);
      }
    }
    // Also include sheets and levels if they have element data
    if (d.sheets && Array.isArray(d.sheets)) {
      for (var si = 0; si < d.sheets.length; si++) {
        var ws = this.wrapElement(d.sheets[si]);
        if (ws) result.push(ws);
      }
    }
    if (d.levels && Array.isArray(d.levels)) {
      for (var li = 0; li < d.levels.length; li++) {
        var wl = this.wrapElement(d.levels[li]);
        if (wl) result.push(wl);
      }
    }
    return result;
  },

  getElements(category) {
    var liveRaw = getCachedElements(category);
    if (!liveRaw) {
      var client = getConnectClient();
      var knownCategories = client && client.elementsByCategory ? Object.keys(client.elementsByCategory) : [];
      console.error('[RevitBridge] Failed to get elements for "' + category + '": No elements cached.', {
        clientStatus: client ? client.status : 'missing',
        peerConnected: client ? client.peerConnected : false,
        knownCategories: knownCategories
      });
      throw new Error(
        'Revit connection required: No elements cached for category "' + category + '". ' +
        'Connect Nova to the hub after Revit host is paired, or click Connect again to refresh the project snapshot. ' +
        'Known categories: ' + (knownCategories.length ? knownCategories.join(', ') : 'none')
      );
    }
    var liveResult = [];
    for (var li = 0; li < liveRaw.length; li++) {
      var liveWrapped = this.wrapElement(liveRaw[li]);
      if (liveWrapped) liveResult.push(liveWrapped);
    }
    return liveResult;
  },

  async queryElements(category, options) {
    var client = getConnectClient();
    if (!client || client.status !== 'connected') {
      console.error('[RevitBridge] Failed to query "' + category + '": No active Revit session. Connect to a live Revit host first.');
      throw new Error('Revit connection required: Cannot query elements without active Revit session.');
    }
    var raw = await client.queryElements(category, options || {});
    var result = [];
    for (var i = 0; i < raw.length; i++) {
      var wrapped = this.wrapElement(raw[i]);
      if (wrapped) result.push(wrapped);
    }
    return result;
  },

  getTypes(category) {
    var d = this.getData();
    return d.types ? (d.types[category] || []) : [];
  },
  getLevels() { return this.getData().levels || []; },
  getSheets() { return this.getData().sheets || []; },
  getSelection() {
    var d = this.getData();
    var raw = d.selection || [];
    var result = [];
    for (var i = 0; i < raw.length; i++) {
      var wrapped = this.wrapElement(raw[i]);
      if (wrapped) result.push(wrapped);
    }
    return result;
  },
  getActiveView() { return this.getData().activeView || {}; },
  getProjectName() { return this.getData().projectName || 'Unknown'; },
  getParam(element, paramName) {
    if (element instanceof RevitElement) {
      return element.get(paramName, null);
    }
    if (!element || !element.params) return null;
    return element.params[paramName] !== undefined ? element.params[paramName] : null;
  },
  getParameterValues(elements, paramName) {
    if (!elements) return [];
    if (!Array.isArray(elements)) elements = [elements];
    return elements.map(function(element) {
      return RevitBridge.getParam(element, paramName);
    });
  },
  async getLiveParameterValues(elements, paramName, options) {
    if (!elements || !Array.isArray(elements)) return [];
    var client = getConnectClient();
    if (!client || client.status !== 'connected' || typeof client.getParameterValues !== 'function') {
      return this.getParameterValues(elements, paramName);
    }
    var ids = elements.map(function(el) {
      return RevitBridge.getElementIdentity(el);
    }).filter(function(id) { return id !== undefined && id !== null && String(id).length > 0; });
    if (ids.length === 0 || !paramName) return [];
    var records = await client.getParameterValues(ids, paramName, options || {});
    return records.map(function(record) { return record ? record.value : null; });
  },
  async setLiveParameterValues(elements, paramName, value, options) {
    if (!elements || !Array.isArray(elements) || !paramName) return [];
    var client = getConnectClient();
    if (!client || client.status !== 'connected' || typeof client.setParameterValues !== 'function') {
      return elements.map(function(element) {
        return {
          elementId: RevitBridge.getElementIdentity(element),
          parameterName: paramName,
          ok: false,
          message: 'Connect to a local Revit host before setting parameter values.'
        };
      });
    }
    var ids = elements.map(function(el) {
      return RevitBridge.getElementIdentity(el);
    }).filter(function(id) { return id !== undefined && id !== null && String(id).length > 0; });
    if (ids.length === 0) return [];
    var values = Array.isArray(value) ? value : ids.map(function() { return value; });

    // Enforce user approval before Revit write operations
    var approvalMod = window.__revitWriteApproval;
    if (approvalMod && typeof approvalMod.requestWriteApproval === 'function') {
      var approvalResult = await approvalMod.requestWriteApproval({
        host: 'revit',
        operation: 'parameter.set',
        description: 'Set ' + paramName + ' on ' + ids.length + ' Revit elements',
        elementCount: ids.length,
        elementIds: ids,
        parameterName: paramName,
        value: Array.isArray(values) ? values[0] : values
      });
      if (!approvalResult.approved) {
        return elements.map(function(element) {
          return {
            elementId: RevitBridge.getElementIdentity(element),
            parameterName: paramName,
            ok: false,
            message: 'Write rejected: ' + (approvalResult.message || 'User denied the write operation')
          };
        });
      }
      // Audit: record the approved host operation
      try {
        if (approvalMod.recordHostAuditEvent) {
          approvalMod.recordHostAuditEvent(approvalResult, {
            host: 'revit',
            operation: 'parameter.set',
            elementCount: ids.length,
            elementIds: ids,
            parameterName: paramName,
            description: 'Set ' + paramName + ' on ' + ids.length + ' elements'
          }).catch(function() {});
        }
      } catch (auditErr) {
        // Audit recording is best-effort; failures here must not block the write.
      }
    }

    var results = await client.setParameterValues(ids, paramName, values, { ...(options || {}), approval: { approved: true, approvedBy: 'nova-user', scope: 'single-operation', message: 'Approved via Connect panel' } });
    results.forEach(function(result, index) {
      if (!result || !result.ok) return;
      var element = elements[index];
      if (element && element.params) element.params[paramName] = result.value;
      if (element && element.raw && element.raw.params) element.raw.params[paramName] = result.value;
    });
    return results;
  },
  filterByParam(elements, paramName, op, value) {
    return elements.filter(function(el) {
      var pv;
      if (el instanceof RevitElement) {
        pv = el.get(paramName, null);
      } else {
        pv = el.params ? el.params[paramName] : null;
      }
      if (pv === null || pv === undefined) return op === 'empty';
      var pvStr = String(pv);
      switch(op) {
        case 'equals': return pvStr === value;
        case 'contains': return pvStr.indexOf(value) >= 0;
        case 'not empty': return pvStr.length > 0;
        case 'greater than': return parseFloat(pv) > parseFloat(value);
        case 'less than': return parseFloat(pv) < parseFloat(value);
        case 'empty': return !pvStr || pvStr.length === 0;
        default: return true;
      }
    });
  },

  // ═══════════════════════════════════════
  // Geometry extraction — reads REVIT_MESHES
  // ═══════════════════════════════════════

  getMeshById(elementId) {
    var matches = this.getMeshesById(elementId);
    return matches.length > 0 ? matches[0] : null;
  },

  getMeshesById(elementId) {
    var client = getConnectClient();
    if (client && client.geometryById && client.geometryById[String(elementId)]) {
      var liveMapped = client.geometryById[String(elementId)];
      return Array.isArray(liveMapped) ? liveMapped : [liveMapped];
    }
    var meshes = this.getMeshRecords();
    var idStr = String(elementId);
    if (!Array.isArray(meshes) && meshes && typeof meshes === 'object') {
      var mapped = meshes[idStr] || meshes[elementId] || null;
      return Array.isArray(mapped) ? mapped : (mapped ? [mapped] : []);
    }
    var matches = [];
    for (var i = 0; i < meshes.length; i++) {
      if (this.meshMatchesElement(meshes[i], idStr)) matches.push(meshes[i]);
    }
    return matches;
  },

  getMeshRecords() {
    if (typeof REVIT_MESHES !== 'undefined') return REVIT_MESHES;
    if (window.REVIT_MESHES) return window.REVIT_MESHES;
    var client = getConnectClient();
    if (client && client.snapshot) return client.snapshot.meshes || client.snapshot.geometries || [];
    return [];
  },

  getElementIdentity(element) {
    if (!element) return '';
    return String(
      (element.identity && element.identity.sourceId) ||
      element.id ||
      element.elementId ||
      element.sourceId ||
      element.uniqueId ||
      ''
    );
  },

  meshMatchesElement(meshRecord, elementId) {
    if (!meshRecord || !elementId) return false;
    var ids = [
      meshRecord.id,
      meshRecord.elementId,
      meshRecord.ElementId,
      meshRecord.sourceId,
      meshRecord.uniqueId,
      meshRecord.dbId,
      meshRecord.identity && meshRecord.identity.sourceId
    ];
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] !== undefined && ids[i] !== null && String(ids[i]) === String(elementId)) return true;
    }
    return false;
  },

  collectElementMeshRecords(element) {
    var raw = element && element.raw ? element.raw : element;
    var candidates = [];
    ['geometry', 'geometries', 'mesh', 'meshes'].forEach(function(key) {
      if (element && element[key]) candidates.push(element[key]);
      if (raw && raw !== element && raw[key]) candidates.push(raw[key]);
    });
    var records = [];
    function append(value) {
      if (!value) return;
      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i++) append(value[i]);
        return;
      }
      if (value.meshes && Array.isArray(value.meshes)) append(value.meshes);
      else if (value.geometry && value.geometry !== value) append(value.geometry);
      else if (records.indexOf(value) === -1) records.push(value);
    }
    for (var c = 0; c < candidates.length; c++) append(candidates[c]);
    return records;
  },

  normalizeVertex(value) {
    if (Array.isArray(value)) return new Geo.Point3(value[0] || 0, value[1] || 0, value[2] || 0);
    return new Geo.Point3(value.x || value.X || 0, value.y || value.Y || 0, value.z || value.Z || 0);
  },

  normalizeColor(color) {
    if (typeof color === 'number') return color;
    if (typeof color === 'string') return parseInt(color.replace('#', ''), 16) || 0x89b4fa;
    return 0x89b4fa;
  },

  // Convert a REVIT_MESHES record into a Geo.Mesh3 object
  meshDataToGeo(meshRecord) {
    if (meshRecord && meshRecord._type === 'GeometryEnvelope') return geometryEnvelopeToGeo(meshRecord);
    if (!meshRecord) return null;
    if (meshRecord._type === 'Mesh3') return meshRecord;
    if (meshRecord.mesh) meshRecord = meshRecord.mesh;
    if (!meshRecord.vertices) return null;
    if (typeof Geo === 'undefined' || !Geo.Mesh3) return null;

    var verts = meshRecord.vertices;
    var indices = meshRecord.indices || meshRecord.faces || meshRecord.triangles;
    if (!indices) return null;
    var verticesAreFlat = typeof verts[0] === 'number';
    var indicesAreFlat = typeof indices[0] === 'number';
    var vertCount = verticesAreFlat ? Math.floor(verts.length / 3) : verts.length;
    var triCount = indicesAreFlat ? Math.floor(indices.length / 3) : indices.length;
    if (vertCount < 3 || triCount < 1) return null;

    var positions = [];
    for (var i = 0; i < vertCount; i++) {
      positions.push(verticesAreFlat
        ? new Geo.Point3(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2])
        : this.normalizeVertex(verts[i]));
    }

    var faces = [];
    for (var j = 0; j < triCount; j++) {
      faces.push(indicesAreFlat
        ? [indices[j * 3], indices[j * 3 + 1], indices[j * 3 + 2]]
        : [indices[j][0], indices[j][1], indices[j][2]]);
    }

    var mesh = new Geo.Mesh3(positions, faces, this.normalizeColor(meshRecord.color));
    mesh.sourceId = meshRecord.elementId || meshRecord.id || meshRecord.sourceId || null;
    mesh.sourceCategory = meshRecord.category || null;
    return mesh;
  },

  // Extract geometry for a list of RevitElement objects
  getGeometries(elements) {
    if (!elements || !Array.isArray(elements)) return [];
    var meshes = this.getMeshRecords();
    var client = getConnectClient();
    var hasLiveGeometry = client && client.geometryById && Object.keys(client.geometryById).length > 0;
    var hasEmbeddedGeometry = elements.some(function(el) { return RevitBridge.collectElementMeshRecords(el).length > 0; });
    if (Array.isArray(meshes) && meshes.length === 0 && !hasLiveGeometry && !hasEmbeddedGeometry) {
      console.warn('[RevitBridge] REVIT_MESHES not available — run geometry export first');
      return [];
    }
    var result = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var embedded = this.collectElementMeshRecords(el);
      for (var em = 0; em < embedded.length; em++) {
        var embeddedGeo = this.meshDataToGeo(embedded[em]);
        if (embeddedGeo) result.push(embeddedGeo);
      }
      if (embedded.length > 0) continue;
      var elId = this.getElementIdentity(el);
      var meshRecords = this.getMeshesById(elId);
      for (var mr = 0; mr < meshRecords.length; mr++) {
        var geoMesh = this.meshDataToGeo(meshRecords[mr]);
        if (geoMesh) result.push(geoMesh);
      }
    }
    return result;
  },

  async getLiveGeometries(elements, options) {
    if (!elements || !Array.isArray(elements)) return [];
    var client = getConnectClient();
    if (!client || client.status !== 'connected') return this.getGeometries(elements);
    var ids = elements.map(function(el) {
      if (el instanceof RevitElement) return el.identity.sourceId;
      return (el.identity && el.identity.sourceId) || el.id;
    }).filter(function(id) { return id !== undefined && id !== null && String(id).length > 0; });
    var batchSize = Math.max(1, Number(options && options.batchSize) || 50);
    var envelopes = [];
    console.info('[RevitBridge] Element.Geometries requesting live geometry', {
      elementCount: elements.length,
      idCount: ids.length,
      batchSize: batchSize,
      sampleIds: ids.slice(0, 5)
    });
    for (var offset = 0; offset < ids.length; offset += batchSize) {
      var batchIds = ids.slice(offset, offset + batchSize);
      console.info('[RevitBridge] geometry.get batch', {
        batch: Math.floor(offset / batchSize) + 1,
        count: batchIds.length,
        firstId: batchIds[0],
        lastId: batchIds[batchIds.length - 1]
      });
      var batch = await client.getGeometry(batchIds, options || {});
      console.info('[RevitBridge] geometry.get batch returned', {
        requested: batchIds.length,
        geometries: batch.length
      });
      envelopes = envelopes.concat(batch);
    }
    var result = [];
    for (var i = 0; i < envelopes.length; i++) {
      var geoMesh = geometryEnvelopeToGeo(envelopes[i]);
      if (geoMesh) result.push(geoMesh);
    }
    console.info('[RevitBridge] Element.Geometries converted live geometry', {
      envelopes: envelopes.length,
      meshes: result.length
    });
    return result;
  },

  async sendGeometry(geometry, identity, options) {
    var client = getConnectClient();
    if (!client || client.status !== 'connected') {
      console.error('[RevitBridge] Failed to send geometry: No active Revit session. Connect to a live Revit host first.');
      return {
        ok: false,
        code: 'NOVA_CONNECT_OFFLINE',
        message: 'Connect to a local Revit host before sending geometry.'
      };
    }
    var envelope = createGeometryEnvelope(geometry, identity || { source: SOURCES.REVIT_LOCAL }, options || {});
    return client.sendGeometry(envelope, envelope.identity, options || {});
  }
};
window.RevitBridge = RevitBridge;

  return RevitBridge;
}

export { RevitBridge, RevitElement };
export default installRevitNodes;
