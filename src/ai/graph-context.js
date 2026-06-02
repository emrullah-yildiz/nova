// Builds a compact, token-bounded snapshot of the live graph for the AI
// assistant's system prompt. Today the assistant only sees the generated "code
// on canvas"; this gives it the actual structure — node ids, types, versions,
// ports, positions, control values, and wiring — so it can answer questions
// about the current workflow ("what should I wire next?") and propose precise
// edits that reference nodes by id.
//
// Pure: takes the serialized graph (from app.serializeGraph()) plus a type →
// def lookup (NODE_TYPE_MAP), and returns { text, stats }. No DOM, no app state,
// so the formatting + truncation rules are unit-testable.

function formatPorts(ports) {
  if (!Array.isArray(ports) || ports.length === 0) return '';
  return ports
    .map((p) => (p && p.id) + (p && p.type && p.type !== 'any' ? ':' + p.type : ''))
    .filter(Boolean)
    .join(', ');
}

function formatControls(controlValues, maxLen) {
  if (!controlValues || typeof controlValues !== 'object') return '';
  const parts = [];
  for (const key of Object.keys(controlValues)) {
    const raw = controlValues[key];
    if (raw == null) continue;
    let s;
    if (typeof raw === 'string') s = raw;
    else { try { s = JSON.stringify(raw); } catch { s = String(raw); } }
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    if (s.length > maxLen) s = s.slice(0, maxLen) + '…';
    parts.push(key + ':' + s);
  }
  return parts.length ? '{' + parts.join(', ') + '}' : '';
}

// graph: { nodes: [{ id, type, x, y, version, controlValues, _dynInputs?, _dynOutputs? }], wires: [{ fromNode, fromPort, toNode, toPort }] }
// typeMap: { [type]: { name?, inputs?: [{id,type}], outputs?: [{id,type}] } }
// opts: { maxNodes = 60, maxWires = 120, maxControlLen = 40 }
export function buildGraphContext(graph, typeMap = {}, opts = {}) {
  const maxNodes = opts.maxNodes || 60;
  const maxWires = opts.maxWires || 120;
  const maxControlLen = opts.maxControlLen || 40;

  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const wires = Array.isArray(graph && graph.wires) ? graph.wires : [];
  const stats = { nodeCount: nodes.length, wireCount: wires.length, droppedNodes: 0, droppedWires: 0 };

  if (nodes.length === 0) return { text: '', stats };

  const shownNodes = nodes.slice(0, maxNodes);
  stats.droppedNodes = nodes.length - shownNodes.length;

  const lines = [];
  lines.push(`LIVE GRAPH — ${nodes.length} node${nodes.length === 1 ? '' : 's'}, ${wires.length} wire${wires.length === 1 ? '' : 's'}`);
  lines.push('NODES:');
  for (const nd of shownNodes) {
    if (!nd || !nd.id) continue;
    const def = typeMap[nd.type] || {};
    const inPorts = (Array.isArray(nd._dynInputs) && nd._dynInputs.length)
      ? nd._dynInputs.map((id) => ({ id })) : (def.inputs || []);
    const outPorts = (Array.isArray(nd._dynOutputs) && nd._dynOutputs.length)
      ? nd._dynOutputs.map((id) => ({ id })) : (def.outputs || []);
    const ver = nd.version && nd.version > 1 ? ' v' + nd.version : '';
    const pos = (typeof nd.x === 'number' && typeof nd.y === 'number') ? ` @(${Math.round(nd.x)},${Math.round(nd.y)})` : '';
    const ins = formatPorts(inPorts);
    const outs = formatPorts(outPorts);
    const portStr = (ins ? ` in[${ins}]` : '') + (outs ? ` out[${outs}]` : '');
    const ctrl = formatControls(nd.controlValues, maxControlLen);
    lines.push(`  ${nd.id}  ${nd.type}${ver}${pos}${portStr}${ctrl ? '  ' + ctrl : ''}`);
  }
  if (stats.droppedNodes > 0) lines.push(`  …(+${stats.droppedNodes} more node${stats.droppedNodes === 1 ? '' : 's'} not shown)`);

  if (wires.length) {
    const shownWires = wires.slice(0, maxWires);
    stats.droppedWires = wires.length - shownWires.length;
    lines.push('WIRES:');
    for (const w of shownWires) {
      if (!w) continue;
      lines.push(`  ${w.fromNode}.${w.fromPort} → ${w.toNode}.${w.toPort}`);
    }
    if (stats.droppedWires > 0) lines.push(`  …(+${stats.droppedWires} more wire${stats.droppedWires === 1 ? '' : 's'} not shown)`);
  }

  return { text: lines.join('\n'), stats };
}
