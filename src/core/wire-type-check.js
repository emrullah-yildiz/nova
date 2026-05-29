// Phase 5: graph-time wire-port type compatibility.
//
// Phase 3 catches type mismatches in AI-generated CODE before the graph is
// built. Phase 5 catches them in the actual GRAPH — both wires created by
// the parser AND wires the user drags manually. A wire that connects a
// mesh-output to a point-input is almost always a bug; we surface it as
// a red dashed line with a tooltip so the user can see and fix it.
//
// Compatibility rules are intentionally permissive: when we don't know
// enough to be sure (e.g. both ports are typed `list` or `any`), the wire
// is accepted. Phase 5 only flags DEFINITELY-wrong wires.
//
// The port-type vocabulary is the same string set as TYPE_COLORS in
// src/core/nodes.js (point, vector, mesh, curve, list, number, etc.).

// Pairs of types that look different at the lexical level but are
// interchangeable in practice. Bidirectional. Centred on how Nova's
// Geo operations actually behave (a Vector3 and Point3 share x/y/z and
// many ops accept either; a single mesh accepted by a list-input port
// is treated as a singleton).
const EQUIVALENT_PAIRS = [
  // x/y/z record types
  ['point', 'vector'],
  // Curves of various flavours all flow through the same downstream ops
  ['curve', 'line'],
  ['curve', 'circle'],
  ['curve', 'polyline'],
  ['curve', 'nurbscurve'],
  // Solids and meshes are the same primitive in Nova's runtime
  ['mesh', 'solid'],
  ['surface', 'nurbssurface']
];

// Types that accept "anything" on either side of a wire. `any` is the
// universal slot; `list` and `pattern` accept varied content.
const PERMISSIVE_TYPES = new Set(['any', 'list', 'pattern', 'field']);

// True iff two port types can be connected without raising a mismatch
// warning. Symmetric — order of args doesn't matter.
export function isWireTypeCompatible(fromType, toType) {
  if (!fromType || !toType) return true; // missing schema info → permissive
  if (fromType === toType) return true;
  if (PERMISSIVE_TYPES.has(fromType) || PERMISSIVE_TYPES.has(toType)) return true;
  for (const [a, b] of EQUIVALENT_PAIRS) {
    if ((fromType === a && toType === b) || (fromType === b && toType === a)) return true;
  }
  return false;
}

// Resolves the type strings of a wire's two endpoints given the live
// node array (each node has `def.inputs[]` and `def.outputs[]` with
// `id` and `type` per port). Returns null if a node or port can't be
// found — we can't validate what we can't resolve.
export function resolveWireTypes(wire, nodes) {
  if (!wire || !Array.isArray(nodes)) return null;
  const from = nodes.find(n => n.id === wire.fromNode);
  const to = nodes.find(n => n.id === wire.toNode);
  if (!from || !to || !from.def || !to.def) return null;
  const outPort = (from.def.outputs || []).find(p => p.id === wire.fromPort);
  const inPort = (to.def.inputs || []).find(p => p.id === wire.toPort);
  if (!outPort || !inPort) return null;
  return { fromType: outPort.type || null, toType: inPort.type || null };
}

// Returns the mismatch info object the renderer attaches to the wire
// when types don't match; returns null when the wire is fine. The
// `reason` string is a one-liner suitable for use as an SVG <title>
// tooltip.
export function describeWireTypeMismatch(wire, nodes) {
  const types = resolveWireTypes(wire, nodes);
  if (!types) return null;
  if (isWireTypeCompatible(types.fromType, types.toType)) return null;
  return {
    fromType: types.fromType,
    toType: types.toType,
    reason: `Type mismatch — this output is ${types.fromType}, but the input expects ${types.toType}. The graph may not compute as expected.`
  };
}

// Recomputes the mismatch flag for every wire in `wires` (mutates each
// wire object). Called by the engine whenever the graph changes — wires
// are cheap to enumerate (typically dozens, never thousands).
export function refreshWireTypeFlags(wires, nodes) {
  if (!Array.isArray(wires) || !Array.isArray(nodes)) return;
  for (const w of wires) {
    const mismatch = describeWireTypeMismatch(w, nodes);
    if (mismatch) w.typeMismatch = mismatch;
    else delete w.typeMismatch;
  }
}
