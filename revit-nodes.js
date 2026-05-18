// ============================================
// Nova — Revit Integration Bridge (Runtime)
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

window.RevitElement = RevitElement;

// ═══════════════════════════════════════
// RevitBridge — data access layer
// ═══════════════════════════════════════

const RevitBridge = {
  getData() {
    if (typeof REVIT_DATA !== 'undefined') return REVIT_DATA;
    if (typeof window.REVIT_DATA !== 'undefined') return window.REVIT_DATA;
    return { categories: {}, levels: [], sheets: [], types: {}, selection: [], activeView: '', projectName: 'No Project' };
  },

  // Wrap a raw element dict into a typed RevitElement
  wrapElement(raw) {
    if (raw instanceof RevitElement) return raw;
    if (!raw || typeof raw !== 'object') return null;
    return new RevitElement({
      id: raw.id || 0,
      name: raw.name || '',
      category: raw.category || '',
      typeName: raw.typeName || '',
      levelName: raw.levelName || '',
      params: raw.params || {}
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
    var d = this.getData();
    var raw = [];
    if (category === 'Sheets') raw = d.sheets || [];
    else if (category === 'Levels') raw = d.levels || [];
    else {
      var cat = d.categories ? d.categories[category] : null;
      raw = cat ? (cat.elements || cat || []) : [];
      if (!Array.isArray(raw)) raw = [];
    }
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
    var meshes = (typeof REVIT_MESHES !== 'undefined') ? REVIT_MESHES : (window.REVIT_MESHES || []);
    var idStr = String(elementId);
    for (var i = 0; i < meshes.length; i++) {
      if (String(meshes[i].id) === idStr) return meshes[i];
    }
    return null;
  },

  // Convert a REVIT_MESHES record into a Geo.Mesh3 object
  meshDataToGeo(meshRecord) {
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
    if (meshes.length === 0) {
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
  }
};
window.RevitBridge = RevitBridge;

// ═══════════════════════════════════════
// Mock REVIT_DATA for standalone testing
// When real Revit data is injected (via step 2 export), it overrides this
// ═══════════════════════════════════════
if (typeof REVIT_DATA === 'undefined' && typeof window.REVIT_DATA === 'undefined') {
  window.REVIT_DATA = {
    projectName: 'Sample Project',
    activeView: { name: '3D View', id: 100 },
    levels: [
      { id: 1001, name: 'Level 1', category: 'Levels', typeName: 'Level', levelName: '', params: { Elevation: '0.000' } },
      { id: 1002, name: 'Level 2', category: 'Levels', typeName: 'Level', levelName: '', params: { Elevation: '3.500' } }
    ],
    sheets: [
      { id: 2001, name: 'A101 - Floor Plan', category: 'Sheets', typeName: 'Sheet', levelName: '', params: { 'Sheet Number': 'A101' } }
    ],
    categories: {
      'Walls': { elements: [
        { id: 3001, name: 'Basic Wall', category: 'Walls', typeName: 'Generic - 200mm', levelName: 'Level 1', params: { Length: '5.000', Height: '3.500', Mark: 'W-01' } },
        { id: 3002, name: 'Basic Wall', category: 'Walls', typeName: 'Generic - 200mm', levelName: 'Level 1', params: { Length: '8.200', Height: '3.500', Mark: 'W-02' } },
        { id: 3003, name: 'Basic Wall', category: 'Walls', typeName: 'Curtain Wall', levelName: 'Level 1', params: { Length: '12.000', Height: '7.000', Mark: 'CW-01' } }
      ]},
      'Floors': { elements: [
        { id: 4001, name: 'Floor', category: 'Floors', typeName: 'Generic 300mm', levelName: 'Level 1', params: { Area: '120.5', Mark: 'F-01' } },
        { id: 4002, name: 'Floor', category: 'Floors', typeName: 'Generic 300mm', levelName: 'Level 2', params: { Area: '95.0', Mark: 'F-02' } }
      ]},
      'Doors': { elements: [
        { id: 5001, name: 'Single-Flush', category: 'Doors', typeName: '0915 x 2134mm', levelName: 'Level 1', params: { Mark: 'D-01' } },
        { id: 5002, name: 'Single-Flush', category: 'Doors', typeName: '0762 x 2134mm', levelName: 'Level 1', params: { Mark: 'D-02' } }
      ]},
      'Windows': { elements: [
        { id: 6001, name: 'Fixed', category: 'Windows', typeName: '1200 x 1500mm', levelName: 'Level 1', params: { Mark: 'WIN-01' } }
      ]},
      'Furniture': { elements: [
        { id: 7001, name: 'Desk', category: 'Furniture', typeName: '1525 x 762mm', levelName: 'Level 1', params: { Mark: 'FURN-01' } },
        { id: 7002, name: 'Chair', category: 'Furniture', typeName: 'Office Chair', levelName: 'Level 1', params: { Mark: 'FURN-02' } },
        { id: 7003, name: 'Table', category: 'Furniture', typeName: 'Conference Table', levelName: 'Level 2', params: { Mark: 'FURN-03' } }
      ]}
    },
    types: {},
    selection: []
  };
  console.log('[NodeFlow] Mock REVIT_DATA loaded for standalone testing (3 Walls, 2 Floors, 2 Doors, 1 Window, 3 Furniture)');
} else {
  console.log('[NodeFlow] REVIT_DATA loaded from Revit export');
}
