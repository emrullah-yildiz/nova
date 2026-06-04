// ============================================
// NODEFLOW AI — NODE REGISTRY (Single Source of Truth)
// ALL categories and node definitions live here.
// No other file should touch NODE_LIBRARY.categories.
// Categories: A→Z. Nodes within each: A→Z.
// ============================================

import { addDefToVersionMap } from './node-versions.js';

export const NODE_LIBRARY = { categories: [] };
export const NODE_TYPE_MAP = {};
// Parallel to NODE_TYPE_MAP, but keyed type → { version → def } so a node
// instance can pin (and switch) a behavior version. See core/node-versions.js.
export const NODE_VERSION_MAP = {};
export const TYPE_COLORS = {
  number: '#a6e3a1', string: '#f9e2af', boolean: '#f38ba8',
  point: '#89b4fa', vector: '#94e2d5', line: '#89b4fa',
  circle: '#89b4fa', list: '#fab387', any: '#a6adc8', function: '#f5c2e7',
  mesh: '#f38ba8', curve: '#94e2d5', plane: '#89b4fa',
  solid: '#f38ba8', surface: '#94e2d5', nurbscurve: '#f9e2af',
  nurbssurface: '#94e2d5', field: '#74c7ec', pattern: '#a6e3a1', revit: '#89dceb',
  revitelement: '#89dceb'
};

// ═══════════════════════════════════════

// Custom / AI category migrated to src/nodes/categories/custom.js
// (Custom.AI, Custom.Code, Custom.Comment, Custom.Formula, Custom.Python).
// Engine retains 'custom-python'/'custom-code'/'Custom.Python' case for
// PythonRunner routing; modern Custom.Code uses native JS via the default
// registry execute path.

// Testing category migrated to src/nodes/categories/testing.js
// (Testing.SlowCompute). Engine retains 'slow-compute'/'Testing.SlowCompute'
// case for the Promise-based cancellation harness.


// List category migrated to src/nodes/categories/list.js.

// Logic category migrated to src/nodes/categories/logic.js.


// Modeling category dissolved: op-offset → Curve.Offset, op-trim → Curve.Trim,
// op-smooth → Solid.Smooth, op-subdivide → Surface.Subdivide,
// op-thicken → Solid.BySurfaceThicken. op-point-grid removed.
// Parametric Forms category dissolved into Surfaces / Parametric subgroup
// (Surface.CatenaryShell, Surface.Dini, Surface.Enneper, Surface.Gyroid,
//  Surface.HyperbolicParaboloid, Surface.Hyperboloid, Surface.KleinBottle,
//  Surface.MobiusStrip, Surface.Seashell).
//
// Patterns category migrated to src/nodes/categories/patterns.js.


// ═══════════════════════════════════════
// M4 round-trip host-node helpers (legacy Revit category)
// ----------------------------------------------------------------------------
// These legacy host nodes drive the live Revit round-trip through the M4-T3
// browser bridge (src/integrations/revit/revit-bridge.js):
//   requestSelection(opts, deps?)            -> { elements: ContractElement[] }
//   placeInstance(spec, deps?)               -> raw place result payload
//   getParameters(elementId, names, deps?)   -> { elementId, params: {name:value} }
//   setParameters(elementId, params, deps?)  -> raw set result payload
//
// core/ must not import integrations/ (the layering runs the other way: every
// other module imports core), so the bridge is resolved at execute time:
//   1. context.revitBridge   — injected (tests + future app/connect wiring),
//   2. globalThis.NovaRevitBridge / window.NovaRevitBridge — runtime hook the
//      Connect layer attaches the M4 bridge to.
// A node throws a clear "connect first" error when no bridge is available, so a
// graph run without a live session fails loud instead of silently no-op'ing.
//
// WRITES (place / set) only PASS approval metadata through to the bridge; the
// hub/server performs the interactive approval and is the authority (SEC-013).
// These nodes never fabricate an approval.
// ═══════════════════════════════════════

function resolveRevitBridge(context) {
  if (context && context.revitBridge) return context.revitBridge;
  if (typeof globalThis !== 'undefined' && globalThis.NovaRevitBridge) return globalThis.NovaRevitBridge;
  if (typeof window !== 'undefined' && window.NovaRevitBridge) return window.NovaRevitBridge;
  throw new Error('Nova Connect Revit bridge is not available. Pair with the local hub and a live Revit host first.');
}

// Pull the created element ids out of a place/set result. The M4-T2 add-in
// returns them under result.data.elementIds; be defensive about a few shapes a
// host might send (bare array, top-level elementIds, single id) so a malformed
// host response surfaces an empty list rather than throwing.
function extractElementIds(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result.map(String);
  const data = result.data && typeof result.data === 'object' ? result.data : result;
  let ids = data && data.elementIds;
  if (ids === undefined || ids === null) {
    ids = data && (data.elementId !== undefined ? data.elementId : data.id);
  }
  if (ids === undefined || ids === null) return [];
  return (Array.isArray(ids) ? ids : [ids]).map(String);
}

function isWriteOk(result) {
  if (!result) return false;
  if (result.ok === true) return true;
  const data = result.data && typeof result.data === 'object' ? result.data : null;
  return !!(data && data.ok === true);
}

// Build optional approval metadata for a WRITE from the node's control. The
// node passes this THROUGH to the bridge; it does not approve anything itself.
function buildApprovalMeta(controls) {
  if (!controls || controls.requireApproval === false || controls.requireApproval === 'false') {
    return undefined;
  }
  return { required: true, requestedBy: 'nova-graph', scope: 'single-operation' };
}

function splitNames(raw) {
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  if (raw === undefined || raw === null) return [];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

// Coerce a port input that may carry RevitElement objects / records / raw ids
// into a single element id string for the singular-elementId M4 contract.
function toElementId(value) {
  if (value === undefined || value === null) return '';
  const el = Array.isArray(value) ? value[0] : value;
  if (el === undefined || el === null) return '';
  if (typeof el === 'object') {
    if (el.identity && el.identity.sourceId != null) return String(el.identity.sourceId);
    if (el.id != null) return String(el.id);
    if (el.elementId != null) return String(el.elementId);
    if (el.sourceId != null) return String(el.sourceId);
    return '';
  }
  return String(el);
}

// ═══════════════════════════════════════
// 13. HOSTS
NODE_LIBRARY.categories.push({ id: 'host', name: 'Host', color: '#74c7ec', icon: 'H', nodes: [
  { type: 'host-get-elements', name: 'Host.GetElements', icon: 'H', inputs: [{ id: 'query', name: 'Query', type: 'string' }], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'count', name: 'Count', type: 'number' },{ id: 'host', name: 'Host', type: 'string' }], controls: [{ id: 'host', type: 'dropdown', options: ['revit','rhino'], default: 'revit', label: 'Host' },{ id: 'category', type: 'text', default: 'Walls', label: 'Category / Layer' }], preview: true, codegen: { python: '{{elements}} = HostRegistry.get("{{ctrl.host}}").getElements({"category": "{{ctrl.category}}"})\\n{{count}} = len({{elements}})' } },
  { type: 'host-get-geometry', name: 'Host.GetGeometry', icon: 'G', inputs: [{ id: 'refs', name: 'Refs', type: 'list' }], outputs: [{ id: 'geometry', name: 'Geometry', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'host', type: 'dropdown', options: ['revit','rhino'], default: 'revit', label: 'Host' },{ id: 'level', type: 'dropdown', options: ['Bounds','PreviewMesh','FullMesh','NativeHostGeometry'], default: 'Bounds', label: 'Level' }], preview: true, codegen: { python: '{{geometry}} = HostRegistry.get("{{ctrl.host}}").getGeometry({{refs}}, {"level": "{{ctrl.level}}"})\\n{{count}} = len({{geometry}})' } },
  { type: 'host-get-parameter-values', name: 'Host.GetParameterValues', icon: 'P', inputs: [{ id: 'refs', name: 'Refs', type: 'list' },{ id: 'names', name: 'Names', type: 'string' }], outputs: [{ id: 'values', name: 'Values', type: 'any' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'host', type: 'dropdown', options: ['revit','rhino'], default: 'revit', label: 'Host' },{ id: 'names', type: 'text', default: 'Comments', label: 'Names' }], preview: true, codegen: { python: '{{values}} = HostRegistry.get("{{ctrl.host}}").getParameterValues({{refs}}, "{{ctrl.names}}")' } },
  { type: 'host-set-parameter-values', name: 'Host.SetParameterValues', icon: 'P+', inputs: [{ id: 'refs', name: 'Refs', type: 'list' },{ id: 'names', name: 'Names', type: 'string' },{ id: 'values', name: 'Values', type: 'any' }], outputs: [{ id: 'results', name: 'Results', type: 'list' },{ id: 'count', name: 'Count', type: 'number' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'host', type: 'dropdown', options: ['revit','rhino'], default: 'revit', label: 'Host' },{ id: 'names', type: 'text', default: 'Comments', label: 'Names' },{ id: 'values', type: 'text', default: '', label: 'Values' }], preview: true, codegen: { python: '{{results}} = HostRegistry.get("{{ctrl.host}}").setParameterValues({{refs}}, "{{ctrl.names}}", {{values}})\\n{{count}} = len({{results}})' } },
  { type: 'host-send-geometry', name: 'Host.SendGeometry', icon: '^', inputs: [{ id: 'geometry', name: 'Geometry', type: 'any' },{ id: 'options', name: 'Options', type: 'any' }], outputs: [{ id: 'result', name: 'Result', type: 'any' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'host', type: 'dropdown', options: ['revit','rhino'], default: 'revit', label: 'Host' },{ id: 'name', type: 'text', default: 'Nova Geometry', label: 'Name' },{ id: 'category', type: 'text', default: 'Generic Models', label: 'Category' }], preview: true, codegen: { python: '{{result}} = HostRegistry.get("{{ctrl.host}}").sendGeometry({{geometry}}, {"name": "{{ctrl.name}}", "category": "{{ctrl.category}}"})\\n{{success}} = {{result}}.get("ok") == True' } }
] });

// 14. REVIT
// ═══════════════════════════════════════
NODE_LIBRARY.categories.push({ id: 'revit', name: 'Revit', color: '#89dceb', icon: '🏗', nodes: [
  { type: 'revit-all-elements-view', name: 'Revit.AllElementsInActiveView', icon: '👁', inputs: [], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [], preview: true, codegen: { python: '{{elements}} = RevitBridge.getAllElements()\\n{{count}} = len({{elements}})\\nprint(f"Found {{{count}}} elements in active view")' } },
  { type: 'revit-all-of-category', name: 'Revit.AllElementsOfCategory', icon: '📦', inputs: [], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'category', type: 'dropdown', options: ['Walls','Floors','Roofs','Ceilings','Doors','Windows','Rooms','Columns','Structural Columns','Structural Framing','Furniture','Generic Models','Mechanical Equipment','Plumbing Fixtures','Electrical Fixtures','Electrical Equipment','Pipes','Ducts','Stairs','Railings','Curtain Panels','Grids','Levels','Sheets'], default: 'Walls', label: 'Category' }], preview: true, codegen: { python: '{{elements}} = RevitBridge.getElements("{{ctrl.category}}")\\n{{count}} = len({{elements}})\\nprint(f"Found {{{count}}} {{ctrl.category}}")' } },
  { type: 'revit-element-geometries', name: 'Element.Geometries', icon: '🔷', inputs: [{ id: 'elements', name: 'Elements', type: 'list' }], outputs: [{ id: 'meshes', name: 'Meshes', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [], preview: true, codegen: { python: '{{meshes}} = RevitBridge.getGeometries({{elements}})\\n{{count}} = len({{meshes}})\\nprint(f"Extracted {{{count}}} meshes")' } },
  { type: 'revit-get-parameter-values', name: 'Revit.GetParameterValues', icon: 'P', inputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'parameterName', name: 'Parameter Name', type: 'string' }], outputs: [{ id: 'values', name: 'Values', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'parameterName', type: 'text', default: 'Comments', label: 'Parameter Name' }], preview: true, codegen: { python: '{{values}} = RevitBridge.getParameterValues({{elements}}, "{{ctrl.parameterName}}")\\n{{count}} = len({{values}})' } },
  { type: 'revit-set-parameter-values', name: 'Revit.SetParameterValues', icon: 'P+', inputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'parameterName', name: 'Parameter Name', type: 'string' },{ id: 'value', name: 'Value', type: 'any' }], outputs: [{ id: 'results', name: 'Results', type: 'list' },{ id: 'count', name: 'Count', type: 'number' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'parameterName', type: 'text', default: 'Comments', label: 'Parameter Name' },{ id: 'value', type: 'text', default: '', label: 'Value' }], preview: true, codegen: { python: '{{results}} = RevitBridge.setParameterValues({{elements}}, "{{ctrl.parameterName}}", "{{ctrl.value}}")\\n{{count}} = len([r for r in {{results}} if r.get("ok")])\\n{{success}} = {{count}} == len({{results}})' } },
  { type: 'revit-send-geometry', name: 'Revit.SendGeometry', icon: '⬆', inputs: [{ id: 'geometry', name: 'Geometry', type: 'any' },{ id: 'category', name: 'Category', type: 'string' },{ id: 'name', name: 'Name', type: 'string' }], outputs: [{ id: 'result', name: 'Result', type: 'any' },{ id: 'elementId', name: 'Element Id', type: 'string' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'category', type: 'dropdown', options: ['Generic Models','Mass','Furniture','Walls','Floors','Roofs','Ceilings','Columns','Structural Framing','Mechanical Equipment','Plumbing Fixtures','Electrical Fixtures','Electrical Equipment'], default: 'Generic Models', label: 'Category' },{ id: 'name', type: 'text', default: 'Nova Geometry', label: 'Name' }], preview: true, codegen: { python: '{{result}} = RevitBridge.sendGeometry({{geometry}}, {}, {"category": "{{ctrl.category}}", "name": "{{ctrl.name}}"})\\n{{elementId}} = {{result}}.get("data", {}).get("directShapeId")\\n{{success}} = {{result}}.get("ok") == True' } },

  // ── M4 round-trip nodes — drive the live bridge (selection / place / params) ──
  { type: 'revit-get-parameters', name: 'Revit.GetParameters', icon: '🔍', inputs: [{ id: 'element', name: 'Element', type: 'any' },{ id: 'names', name: 'Names', type: 'string' }], outputs: [{ id: 'elementId', name: 'Element Id', type: 'string' },{ id: 'params', name: 'Params', type: 'any' },{ id: 'values', name: 'Values', type: 'list' }], controls: [{ id: 'names', type: 'text', default: 'Comments', label: 'Names (comma-sep)' }], preview: true,
    async execute(context, inputs, controls) {
      const bridge = resolveRevitBridge(context);
      const elementId = toElementId(inputs.element);
      const names = splitNames(inputs.names !== undefined && inputs.names !== null ? inputs.names : controls.names);
      const res = await bridge.getParameters(elementId, names);
      const params = res && res.params && typeof res.params === 'object' ? res.params : {};
      return { elementId: res && res.elementId !== undefined ? String(res.elementId) : elementId, params, values: names.map(n => (params[n] !== undefined ? params[n] : null)) };
    },
    codegen: { python: '{{_r}} = RevitBridge.getParameters("{{element}}", "{{ctrl.names}}".split(","))\\n{{elementId}} = {{_r}}.get("elementId")\\n{{params}} = {{_r}}.get("params", {})\\n{{values}} = list({{params}}.values())' } },

  { type: 'revit-place-adaptive-component', name: 'Revit.PlaceAdaptiveComponent', icon: '◈', inputs: [{ id: 'familyType', name: 'Family Type', type: 'string' },{ id: 'points', name: 'Points', type: 'list' },{ id: 'params', name: 'Params', type: 'any' }], outputs: [{ id: 'elementIds', name: 'Element Ids', type: 'list' },{ id: 'count', name: 'Count', type: 'number' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'familyType', type: 'text', default: '', label: 'Family Type' },{ id: 'requireApproval', type: 'boolean', default: true, label: 'Require Approval' }], preview: true,
    async execute(context, inputs, controls) {
      const bridge = resolveRevitBridge(context);
      const spec = {
        kind: 'adaptiveComponent',
        familyType: inputs.familyType !== undefined && inputs.familyType !== null ? inputs.familyType : controls.familyType,
        points: inputs.points
      };
      if (inputs.params !== undefined && inputs.params !== null) spec.params = inputs.params;
      const approval = buildApprovalMeta(controls);
      if (approval !== undefined) spec.approval = approval;
      const res = await bridge.placeInstance(spec);
      const elementIds = extractElementIds(res);
      return { elementIds, count: elementIds.length, success: isWriteOk(res) || elementIds.length > 0 };
    },
    codegen: { python: '{{_r}} = RevitBridge.placeInstance({"kind": "adaptiveComponent", "familyType": "{{familyType}}", "points": {{points}}})\\n{{elementIds}} = {{_r}}.get("data", {}).get("elementIds", [])\\n{{count}} = len({{elementIds}})\\n{{success}} = {{_r}}.get("ok") == True' } },

  { type: 'revit-place-family-instance', name: 'Revit.PlaceFamilyInstance', icon: '◆', inputs: [{ id: 'familyType', name: 'Family Type', type: 'string' },{ id: 'points', name: 'Points', type: 'list' },{ id: 'hostFaceId', name: 'Host Face Id', type: 'string' },{ id: 'params', name: 'Params', type: 'any' }], outputs: [{ id: 'elementIds', name: 'Element Ids', type: 'list' },{ id: 'count', name: 'Count', type: 'number' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'familyType', type: 'text', default: '', label: 'Family Type' },{ id: 'requireApproval', type: 'boolean', default: true, label: 'Require Approval' }], preview: true,
    async execute(context, inputs, controls) {
      const bridge = resolveRevitBridge(context);
      const spec = {
        kind: 'familyInstance',
        familyType: inputs.familyType !== undefined && inputs.familyType !== null ? inputs.familyType : controls.familyType,
        points: inputs.points
      };
      if (inputs.hostFaceId !== undefined && inputs.hostFaceId !== null && String(inputs.hostFaceId).length > 0) spec.hostFaceId = String(inputs.hostFaceId);
      if (inputs.params !== undefined && inputs.params !== null) spec.params = inputs.params;
      const approval = buildApprovalMeta(controls);
      if (approval !== undefined) spec.approval = approval;
      const res = await bridge.placeInstance(spec);
      const elementIds = extractElementIds(res);
      return { elementIds, count: elementIds.length, success: isWriteOk(res) || elementIds.length > 0 };
    },
    codegen: { python: '{{_r}} = RevitBridge.placeInstance({"kind": "familyInstance", "familyType": "{{familyType}}", "points": {{points}}})\\n{{elementIds}} = {{_r}}.get("data", {}).get("elementIds", [])\\n{{count}} = len({{elementIds}})\\n{{success}} = {{_r}}.get("ok") == True' } },

  { type: 'revit-select-elements', name: 'Revit.SelectElements', icon: '⊕', inputs: [], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'ids', name: 'Ids', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'categories', type: 'text', default: '', label: 'Categories (comma-sep)' }], preview: true,
    async execute(context, inputs, controls) {
      const bridge = resolveRevitBridge(context);
      const opts = {};
      const cats = splitNames(controls.categories);
      if (cats.length > 0) opts.categories = cats;
      const res = await bridge.requestSelection(opts);
      const elements = res && Array.isArray(res.elements) ? res.elements : [];
      return { elements, ids: elements.map(el => (el && el.id !== undefined ? String(el.id) : '')), count: elements.length };
    },
    codegen: { python: '{{_r}} = RevitBridge.requestSelection({})\\n{{elements}} = {{_r}}.get("elements", [])\\n{{ids}} = [e.get("id") for e in {{elements}}]\\n{{count}} = len({{elements}})' } },

  { type: 'revit-select-faces', name: 'Revit.SelectFaces', icon: '⬚', inputs: [], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'faceIds', name: 'Face Ids', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'categories', type: 'text', default: '', label: 'Categories (comma-sep)' }], preview: true,
    async execute(context, inputs, controls) {
      const bridge = resolveRevitBridge(context);
      const opts = { includeFaces: true };
      const cats = splitNames(controls.categories);
      if (cats.length > 0) opts.categories = cats;
      const res = await bridge.requestSelection(opts);
      const elements = res && Array.isArray(res.elements) ? res.elements : [];
      const faceIds = [];
      elements.forEach(el => {
        if (el && Array.isArray(el.faces)) el.faces.forEach(f => { if (f && f.faceId !== undefined) faceIds.push(String(f.faceId)); });
      });
      return { elements, faceIds, count: faceIds.length };
    },
    codegen: { python: '{{_r}} = RevitBridge.requestSelection({"includeFaces": True})\\n{{elements}} = {{_r}}.get("elements", [])\\n{{faceIds}} = [f.get("faceId") for e in {{elements}} for f in e.get("faces", [])]\\n{{count}} = len({{faceIds}})' } },

  { type: 'revit-set-parameters', name: 'Revit.SetParameters', icon: '✎', inputs: [{ id: 'element', name: 'Element', type: 'any' },{ id: 'params', name: 'Params', type: 'any' }], outputs: [{ id: 'elementId', name: 'Element Id', type: 'string' },{ id: 'result', name: 'Result', type: 'any' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'requireApproval', type: 'boolean', default: true, label: 'Require Approval' }], preview: true,
    async execute(context, inputs, controls) {
      const bridge = resolveRevitBridge(context);
      const elementId = toElementId(inputs.element);
      const params = inputs.params && typeof inputs.params === 'object' && !Array.isArray(inputs.params) ? inputs.params : {};
      const deps = {};
      const approval = buildApprovalMeta(controls);
      if (approval !== undefined) deps.approval = approval;
      const res = await bridge.setParameters(elementId, params, deps);
      return { elementId, result: res, success: isWriteOk(res) };
    },
    codegen: { python: '{{result}} = RevitBridge.setParameters("{{element}}", {{params}})\\n{{elementId}} = "{{element}}"\\n{{success}} = {{result}}.get("ok") == True' } }
] });

// 15. RHINO
NODE_LIBRARY.categories.push({ id: 'rhino', name: 'Rhino', color: '#74c7ec', icon: 'R', nodes: [
  { type: 'rhino-objects-by-layer', name: 'Rhino.ObjectsByLayer', icon: 'L', inputs: [{ id: 'layer', name: 'Layer', type: 'string' }], outputs: [{ id: 'objects', name: 'Objects', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'layer', type: 'text', default: 'Default', label: 'Layer' }], preview: true, codegen: { python: '{{objects}} = HostRegistry.get("rhino").getElements({"layer": "{{ctrl.layer}}"})\\n{{count}} = len({{objects}})' } }
] });
// ═══════════════════════════════════════
// BUILD NODE_TYPE_MAP (flat lookup)
// ═══════════════════════════════════════
NODE_LIBRARY.categories.forEach(function(cat) {
  cat.nodes.forEach(function(node) {
    NODE_TYPE_MAP[node.type] = Object.assign({}, node, { categoryId: cat.id, categoryColor: cat.color });
    addDefToVersionMap(NODE_VERSION_MAP, NODE_TYPE_MAP[node.type]);
  });
});

console.log('[NodeFlow] Node Registry — ' + NODE_LIBRARY.categories.length + ' categories, ' + Object.keys(NODE_TYPE_MAP).length + ' types');

if (typeof window !== 'undefined') {
  window.NODE_LIBRARY = NODE_LIBRARY;
  window.NODE_TYPE_MAP = NODE_TYPE_MAP;
  window.NODE_VERSION_MAP = NODE_VERSION_MAP;
  window.TYPE_COLORS = TYPE_COLORS;
}