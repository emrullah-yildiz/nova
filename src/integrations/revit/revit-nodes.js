import { Geo } from '../../geometry/index.js';
import {
  SOURCES,
  createGeometryEnvelope,
  createIdentity,
  normalizeElementRecord
} from '../connect/protocol.js';

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
  this.identity = createIdentity({
    source: SOURCES.REVIT_LOCAL,
    sourceId: data.sourceId || data.id || 0,
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
      console.error('[RevitBridge] Failed to get elements for "' + category + '": No elements cached. Ensure Revit is connected via Connect Hub.');
      throw new Error('Revit connection required: No elements cached for category "' + category + '". Ensure Revit is connected via Connect Hub.');
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
    var client = getConnectClient();
    if (client && client.geometryById && client.geometryById[String(elementId)]) {
      return client.geometryById[String(elementId)];
    }
    var meshes = (typeof REVIT_MESHES !== 'undefined') ? REVIT_MESHES : (window.REVIT_MESHES || []);
    var idStr = String(elementId);
    for (var i = 0; i < meshes.length; i++) {
      if (String(meshes[i].id) === idStr) return meshes[i];
    }
    return null;
  },

  // Convert a REVIT_MESHES record into a Geo.Mesh3 object
  meshDataToGeo(meshRecord) {
    if (meshRecord && meshRecord._type === 'GeometryEnvelope') return geometryEnvelopeToGeo(meshRecord);
    if (!meshRecord || !meshRecord.vertices || !meshRecord.indices) return null;
    if (typeof Geo === 'undefined' || !Geo.Mesh3) return null;

    var verts = meshRecord.vertices;
    var indices = meshRecord.indices;
    var vertCount = Math.floor(verts.length / 3);
    var triCount = Math.floor(indices.length / 3);
    if (vertCount < 3 || triCount < 1) return null;

    var positions = [];
    for (var i = 0; i < vertCount; i++) {
      positions.push(new Geo.Point3(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]));
    }

    var faces = [];
    for (var j = 0; j < triCount; j++) {
      faces.push([indices[j * 3], indices[j * 3 + 1], indices[j * 3 + 2]]);
    }

    var mesh = new Geo.Mesh3(positions, faces);

    // Apply color from material data
    if (meshRecord.color && mesh._color !== undefined) {
      mesh._color = meshRecord.color;
    }

    return mesh;
  },

  // Extract geometry for a list of RevitElement objects
  getGeometries(elements) {
    if (!elements || !Array.isArray(elements)) return [];
    var meshes = (typeof REVIT_MESHES !== 'undefined') ? REVIT_MESHES : (window.REVIT_MESHES || []);
    var client = getConnectClient();
    var hasLiveGeometry = client && client.geometryById && Object.keys(client.geometryById).length > 0;
    if (meshes.length === 0 && !hasLiveGeometry) {
      console.warn('[RevitBridge] REVIT_MESHES not available — run geometry export first');
      return [];
    }
    var result = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var elId = (el instanceof RevitElement) ? el.id : (el.id || 0);
      var meshRecord = this.getMeshById(elId);
      if (meshRecord) {
        var geoMesh = this.meshDataToGeo(meshRecord);
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
    });
    var envelopes = await client.getGeometry(ids, options || {});
    var result = [];
    for (var i = 0; i < envelopes.length; i++) {
      var geoMesh = geometryEnvelopeToGeo(envelopes[i]);
      if (geoMesh) result.push(geoMesh);
    }
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
