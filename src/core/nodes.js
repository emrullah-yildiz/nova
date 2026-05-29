// ============================================
// NODEFLOW AI — NODE REGISTRY (Single Source of Truth)
// ALL categories and node definitions live here.
// No other file should touch NODE_LIBRARY.categories.
// Categories: A→Z. Nodes within each: A→Z.
// ============================================

export const NODE_LIBRARY = { categories: [] };
export const NODE_TYPE_MAP = {};
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

// ═══════════════════════════════════════
// 2. CUSTOM / AI
// ═══════════════════════════════════════
NODE_LIBRARY.categories.push({ id: 'custom', name: 'Custom / AI', color: '#94e2d5', icon: '✦', nodes: [
  { type: 'custom-ainode', name: 'AI Generated', icon: '✦', inputs: [{ id: 'in0', name: 'Input', type: 'any' }], outputs: [{ id: 'out0', name: 'Output', type: 'any' }], controls: [{ id: 'prompt', type: 'text', default: 'Describe behavior…', label: 'Prompt' }], preview: true, codegen: { python: '# AI: {{ctrl.prompt}}\\n{{out0}} = {{in0}}', csharp: '' } },
  { type: 'custom-code', name: 'Code Block', icon: '{ }', inputs: [{ id: 'input0', name: 'input0', type: 'any' }], outputs: [{ id: 'output0', name: 'output0', type: 'any' }], controls: [{ id: 'code', type: 'text', default: 'return input0;', label: 'Code' }], preview: true, codegen: { python: '{{output0}} = (lambda input0: {{ctrl.code}})({{input0}})', csharp: '' } },
  { type: 'custom-comment', name: 'Comment', icon: '💬', inputs: [], outputs: [], controls: [{ id: 'text', type: 'text', default: 'Add notes here…', label: 'Note' }], preview: false, codegen: { python: '# {{ctrl.text}}', csharp: '' } },
  { type: 'custom-formula', name: 'Formula', icon: 'ƒ', inputs: [{ id: 'x', name: 'x', type: 'number' },{ id: 'y', name: 'y', type: 'number' }], outputs: [{ id: 'result', name: 'Result', type: 'number' }], controls: [{ id: 'expr', type: 'text', default: 'x + y', label: 'Expression' }], preview: true, codegen: { python: '{{result}} = {{ctrl.expr}}', csharp: '' } },
  { type: 'custom-python', name: 'Python', icon: '🐍', inputs: [{ id: 'input0', name: 'input', type: 'any' }], outputs: [{ id: 'output0', name: 'output', type: 'any' }], controls: [{ id: 'code', type: 'text', default: 'output = input', label: 'Python' }], preview: true, codegen: { python: '# Python block\\n{{ctrl.code}}', csharp: '' } }
] });

// ═══════════════════════════════════════
// 3. TESTING / DEBUG (hidden from normal categories)
NODE_LIBRARY.categories.push({ id: 'testing', name: 'Testing', color: '#f5c2e7', icon: '⚡', nodes: [
  { type: 'slow-compute', name: 'Slow Compute (test cancel)', icon: '⏱', inputs: [{ id: 'value', name: 'Value', type: 'number' }], outputs: [{ id: 'result', name: 'Result', type: 'number' }], controls: [{ id: 'delayMs', type: 'formula', default: '5000', label: 'Delay (ms)' }], preview: true, codegen: { python: '{{result}} = {{value}}', csharp: '' } }
] });


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
  { type: 'revit-send-geometry', name: 'Revit.SendGeometry', icon: '⬆', inputs: [{ id: 'geometry', name: 'Geometry', type: 'any' },{ id: 'category', name: 'Category', type: 'string' },{ id: 'name', name: 'Name', type: 'string' }], outputs: [{ id: 'result', name: 'Result', type: 'any' },{ id: 'elementId', name: 'Element Id', type: 'string' },{ id: 'success', name: 'Success', type: 'boolean' }], controls: [{ id: 'category', type: 'dropdown', options: ['Generic Models','Mass','Furniture','Walls','Floors','Roofs','Ceilings','Columns','Structural Framing','Mechanical Equipment','Plumbing Fixtures','Electrical Fixtures','Electrical Equipment'], default: 'Generic Models', label: 'Category' },{ id: 'name', type: 'text', default: 'Nova Geometry', label: 'Name' }], preview: true, codegen: { python: '{{result}} = RevitBridge.sendGeometry({{geometry}}, {}, {"category": "{{ctrl.category}}", "name": "{{ctrl.name}}"})\\n{{elementId}} = {{result}}.get("data", {}).get("directShapeId")\\n{{success}} = {{result}}.get("ok") == True' } }
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
  });
});

console.log('[NodeFlow] Node Registry — ' + NODE_LIBRARY.categories.length + ' categories, ' + Object.keys(NODE_TYPE_MAP).length + ' types');

if (typeof window !== 'undefined') {
  window.NODE_LIBRARY = NODE_LIBRARY;
  window.NODE_TYPE_MAP = NODE_TYPE_MAP;
  window.TYPE_COLORS = TYPE_COLORS;
}