// Turn step summaries — turns the read-only "show" actions the assistant ran on
// the canvas into human-readable chips ("Focused Tower", "Highlighted 3 nodes")
// shown below the answer. Pure + DOM-free so it's unit-testable; rendering lives
// in the app. See graph-actions.js for the op protocol.

// Describes a single show-op as { icon, label }, or null if unrecognized.
// resolveName(id) -> a node's display name (or falsy to fall back to "a node").
export function describeShowOp(op, resolveName) {
  if (!op || typeof op.op !== 'string') return null;
  const name = function(id) {
    const n = resolveName && resolveName(id);
    return n ? String(n) : 'a node';
  };
  switch (op.op) {
    case 'focusNode':
      return { icon: '⊙', label: 'Focused ' + name(op.id) };
    case 'openInspector':
      return { icon: '◳', label: 'Opened ' + name(op.id) };
    case 'highlightNodes': {
      const ids = Array.isArray(op.ids) ? op.ids : [];
      const total = typeof op.totalIds === 'number' ? op.totalIds : ids.length;
      if (ids.length === 1) return { icon: '⦿', label: 'Highlighted ' + name(ids[0]) };
      if (total > ids.length) return { icon: '⦿', label: 'Highlighted ' + ids.length + ' of ' + total + ' nodes' };
      return { icon: '⦿', label: 'Highlighted ' + ids.length + ' nodes' };
    }
    case 'revealLibraryNode':
      return { icon: '⌕', label: 'Revealed ' + (op.type ? String(op.type) : 'node') + ' in library' };
    default:
      return null;
  }
}

// Maps a list of show-ops to deduped chip descriptors, capped to avoid noise.
export function summarizeShowOps(ops, resolveName, max) {
  if (!Array.isArray(ops)) return [];
  const cap = typeof max === 'number' ? max : 5;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < ops.length; i++) {
    const d = describeShowOp(ops[i], resolveName);
    if (!d || seen.has(d.label)) continue;
    seen.add(d.label);
    out.push(d);
    if (out.length >= cap) break;
  }
  return out;
}
