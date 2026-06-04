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
// The interactive selection + placement host nodes drive the live Revit
// round-trip through the M4-T3 browser bridge (src/integrations/revit/
// revit-bridge.js):
//   requestSelection(opts, deps?)            -> { elements: ContractElement[] }
//   placeInstance(spec, deps?)               -> raw place result payload
//
// core/ must not import integrations/ (the layering runs the other way: every
// other module imports core), so the bridge is resolved at execute time:
//   1. context.revitBridge   — injected (tests + future app/connect wiring),
//   2. globalThis.NovaRevitBridge / window.NovaRevitBridge — runtime hook the
//      Connect layer attaches the M4 bridge to.
// A node throws a clear "connect first" error when no bridge is available, so a
// graph run without a live session fails loud instead of silently no-op'ing.
//
// PARAMETER get/set are NOT here — they are the batch, app-wired
// Revit.GetParameterValues / Revit.SetParameterValues nodes (engine pre-pass +
// window.RevitBridge, full SEC-013 token gate). The single-element M4 parameter
// nodes were removed as duplicates (fix/revit-node-dedup, 2026-06-04 decision).
//
// WRITES (place) only PASS approval metadata through to the bridge; the
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

// ═══════════════════════════════════════
// 13. HOSTS
NODE_LIBRARY.categories.push({ id: 'host', name: 'Host', color: '#74c7ec', icon: 'H', hidden: true, nodes: [
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

  // ── RV-M1 Collectors / Filtering [R] ──────────────────────────────────────
  // Read-only collectors/filters that extend (never duplicate) the existing
  // Revit.AllElements* collectors above. Each is codegen-only (no execute, no
  // SEC-013 write gate) emitting a RevitBridge.* read call, matching the
  // Element.Geometries / GetParameterValues pattern. The bridge methods these
  // call are handed to Trinity (connect-engineer) in docs/agent-handoff.md
  // (RV-M1b) — read-only, no write protocol.
  //
  // Sample workflow (FilterByParameter):
  //   Revit.AllElementsOfCategory(Walls) → Revit.FilterByParameter(name="Mark",
  //   op="!=", value="") → Element.Geometries → 3D viewer / output-watch.
  { type: 'revit-filter-by-parameter', name: 'Revit.FilterByParameter', icon: '⛃', inputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'name', name: 'Parameter Name', type: 'string' },{ id: 'value', name: 'Value', type: 'any' }], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'name', type: 'text', default: 'Mark', label: 'Parameter Name' },{ id: 'op', type: 'dropdown', options: ['=', '!=', '<', '>', '<=', '>='], default: '=', label: 'Comparison' },{ id: 'value', type: 'text', default: '', label: 'Value' }], preview: true, codegen: { python: '{{elements}} = RevitBridge.filterByParameter({{elements}}, "{{ctrl.name}}", "{{ctrl.op}}", "{{ctrl.value}}")\\n{{count}} = len({{elements}})\\nprint(f"{{{count}}} elements match {{ctrl.name}} {{ctrl.op}} {{ctrl.value}}")' } },

  // Sample workflow (FilterByLevel):
  //   Revit.AllElementsOfCategory(Walls) → Revit.FilterByLevel(level="Level 1")
  //   → Revit.GetParameterValues(Area) → output-watch.
  { type: 'revit-filter-by-level', name: 'Revit.FilterByLevel', icon: '☰', inputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'level', name: 'Level', type: 'string' }], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'level', type: 'text', default: 'Level 1', label: 'Level' }], preview: true, codegen: { python: '{{elements}} = RevitBridge.filterByLevel({{elements}}, "{{ctrl.level}}")\\n{{count}} = len({{elements}})\\nprint(f"{{{count}}} elements on level {{ctrl.level}}")' } },

  // Sample workflow (ElementsByType):
  //   Revit.ElementsByType(typeName="Basic Wall: Generic - 200mm") →
  //   Element.Location → Curve.* / Line viewer.
  { type: 'revit-elements-by-type', name: 'Revit.ElementsByType', icon: '⊞', inputs: [{ id: 'typeName', name: 'Type Name', type: 'string' }], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'typeName', type: 'text', default: '', label: 'Type Name' }], preview: true, codegen: { python: '{{elements}} = RevitBridge.getElementsByType("{{ctrl.typeName}}")\\n{{count}} = len({{elements}})\\nprint(f"Found {{{count}}} elements of type {{ctrl.typeName}}")' } },

  // Sample workflow (ElementById):
  //   Revit.SelectElements → (.ids) → Revit.ElementById → Element.BoundingBox →
  //   Point.* / Rectangle.* — re-resolve picked ids into element handles.
  { type: 'revit-element-by-id', name: 'Revit.ElementById', icon: '#', inputs: [{ id: 'ids', name: 'Ids', type: 'list' }], outputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [], preview: true, codegen: { python: '{{elements}} = RevitBridge.getElementsById({{ids}})\\n{{count}} = len({{elements}})\\nprint(f"Resolved {{{count}}} elements by id")' } },

  // ── RV-M1 Geometry extraction [R] ─────────────────────────────────────────
  // Extend Element.Geometries (display mesh) with richer read-only geometry
  // getters. Codegen-only, no write gate. Bridge methods handed to Trinity
  // (RV-M1b) — read-only.
  //
  // Sample workflow (Element.Solids):
  //   Revit.AllElementsOfCategory(Walls) → Element.Solids → Solid.BooleanUnion
  //   / viewer.
  { type: 'revit-element-solids', name: 'Element.Solids', icon: '◳', inputs: [{ id: 'elements', name: 'Elements', type: 'list' }], outputs: [{ id: 'solids', name: 'Solids', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [], preview: true, codegen: { python: '{{solids}} = RevitBridge.getSolids({{elements}})\\n{{count}} = len({{solids}})\\nprint(f"Extracted {{{count}}} solids")' } },

  // Sample workflow (Element.Faces):
  //   Revit.SelectElements → Element.Faces → (.faceIds) →
  //   Revit.PlaceFamilyInstance(hostFaceId) / Surface.* / viewer.
  { type: 'revit-element-faces', name: 'Element.Faces', icon: '⬡', inputs: [{ id: 'elements', name: 'Elements', type: 'list' }], outputs: [{ id: 'faces', name: 'Faces', type: 'list' },{ id: 'faceIds', name: 'Face Ids', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [], preview: true, codegen: { python: '{{faces}} = RevitBridge.getFaces({{elements}})\\n{{faceIds}} = [f.get("faceId") for f in {{faces}}]\\n{{count}} = len({{faces}})\\nprint(f"Extracted {{{count}}} faces")' } },

  // Sample workflow (Element.BoundingBox):
  //   Revit.AllElementsOfCategory(Furniture) → Element.BoundingBox →
  //   (min/max) → Rectangle.ByCenterWidthDepth / Point.* / viewer.
  { type: 'revit-element-bounding-box', name: 'Element.BoundingBox', icon: '⬚', inputs: [{ id: 'elements', name: 'Elements', type: 'list' }], outputs: [{ id: 'min', name: 'Min', type: 'list' },{ id: 'max', name: 'Max', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [], preview: true, codegen: { python: '{{_b}} = RevitBridge.getBoundingBoxes({{elements}})\\n{{min}} = [b.get("min") for b in {{_b}}]\\n{{max}} = [b.get("max") for b in {{_b}}]\\n{{count}} = len({{_b}})\\nprint(f"Computed {{{count}}} bounding boxes")' } },

  // Sample workflow (Element.Location):
  //   Revit.AllElementsOfCategory(Walls) → Element.Location → (.curves) →
  //   Curve.Divide / Line viewer; point-based families surface on (.points).
  { type: 'revit-element-location', name: 'Element.Location', icon: '⌖', inputs: [{ id: 'elements', name: 'Elements', type: 'list' }], outputs: [{ id: 'curves', name: 'Curves', type: 'list' },{ id: 'points', name: 'Points', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [], preview: true, codegen: { python: '{{_loc}} = RevitBridge.getLocations({{elements}})\\n{{curves}} = [l.get("curve") for l in {{_loc}} if l.get("curve") is not None]\\n{{points}} = [l.get("point") for l in {{_loc}} if l.get("point") is not None]\\n{{count}} = len({{_loc}})\\nprint(f"Read {{{count}}} element locations")' } },
  { type: 'revit-get-parameter-values', name: 'Revit.GetParameterValues', icon: 'P', inputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'parameterName', name: 'Parameter Name', type: 'string' }], outputs: [{ id: 'values', name: 'Values', type: 'list' },{ id: 'count', name: 'Count', type: 'number' }], controls: [{ id: 'parameterName', type: 'text', default: 'Comments', label: 'Parameter Name' }], preview: true, codegen: { python: '{{values}} = RevitBridge.getParameterValues({{elements}}, "{{ctrl.parameterName}}")\\n{{count}} = len({{values}})' } },
  { type: 'revit-set-parameter-values', name: 'Revit.SetParameterValues', icon: 'P+', inputs: [{ id: 'elements', name: 'Elements', type: 'list' },{ id: 'parameterName', name: 'Parameter Name', type: 'string' },{ id: 'value', name: 'Value', type: 'any' }], outputs: [{ id: 'results', name: 'Results', type: 'list' },{ id: 'count', name: 'Count', type: 'number' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'parameterName', type: 'text', default: 'Comments', label: 'Parameter Name' },{ id: 'value', type: 'text', default: '', label: 'Value' }], preview: true, codegen: { python: '{{results}} = RevitBridge.setParameterValues({{elements}}, "{{ctrl.parameterName}}", "{{ctrl.value}}")\\n{{count}} = len([r for r in {{results}} if r.get("ok")])\\n{{success}} = {{count}} == len({{results}})' } },
  { type: 'revit-send-geometry', name: 'Revit.SendGeometry', icon: '⬆', inputs: [{ id: 'geometry', name: 'Geometry', type: 'any' },{ id: 'category', name: 'Category', type: 'string' },{ id: 'name', name: 'Name', type: 'string' }], outputs: [{ id: 'result', name: 'Result', type: 'any' },{ id: 'elementId', name: 'Element Id', type: 'string' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'category', type: 'dropdown', options: ['Generic Models','Mass','Furniture','Walls','Floors','Roofs','Ceilings','Columns','Structural Framing','Mechanical Equipment','Plumbing Fixtures','Electrical Fixtures','Electrical Equipment'], default: 'Generic Models', label: 'Category' },{ id: 'name', type: 'text', default: 'Nova Geometry', label: 'Name' }], preview: true, codegen: { python: '{{result}} = RevitBridge.sendGeometry({{geometry}}, {}, {"category": "{{ctrl.category}}", "name": "{{ctrl.name}}"})\\n{{elementId}} = {{result}}.get("data", {}).get("directShapeId")\\n{{success}} = {{result}}.get("ok") == True' } },

  // ── M4 round-trip nodes — drive the live bridge (selection / placement) ──
  // NOTE: the M4 single-element parameter nodes (revit-get-parameters /
  // revit-set-parameters) were removed in fix/revit-node-dedup as functional
  // duplicates of the batch, app-wired Revit.GetParameterValues /
  // Revit.SetParameterValues above. The survivors run live through the engine
  // pre-pass (window.RevitBridge.get/setLiveParameterValues) and carry the full
  // SEC-013 server-issued-token write gate; the removed M4 nodes resolved a
  // NovaRevitBridge that was never wired into the running app. See decisions.md
  // (2026-06-04 "Revit parameter node consolidation").
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
    codegen: { python: '{{_r}} = RevitBridge.requestSelection({"includeFaces": True})\\n{{elements}} = {{_r}}.get("elements", [])\\n{{faceIds}} = [f.get("faceId") for e in {{elements}} for f in e.get("faces", [])]\\n{{count}} = len({{faceIds}})' } }
] });

// 15. RHINO
NODE_LIBRARY.categories.push({ id: 'rhino', name: 'Rhino', color: '#74c7ec', icon: 'R', hidden: true, nodes: [
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

// Categories visible in DISCOVERY surfaces (library palette, node search, port
// suggestions). A category flagged `hidden: true` (Host, Rhino) is parked from
// the UI but its nodes still REGISTER and RESOLVE — saved graphs that use them
// keep computing, and codegen/AI catalog are unaffected (those read the full
// NODE_LIBRARY.categories / registry, not this helper).
export function visibleCategories() {
  return NODE_LIBRARY.categories.filter(function(c) { return !c.hidden; });
}

console.log('[NodeFlow] Node Registry — ' + NODE_LIBRARY.categories.length + ' categories, ' + Object.keys(NODE_TYPE_MAP).length + ' types');

if (typeof window !== 'undefined') {
  window.NODE_LIBRARY = NODE_LIBRARY;
  window.visibleCategories = visibleCategories;
  window.NODE_TYPE_MAP = NODE_TYPE_MAP;
  window.NODE_VERSION_MAP = NODE_VERSION_MAP;
  window.TYPE_COLORS = TYPE_COLORS;
}