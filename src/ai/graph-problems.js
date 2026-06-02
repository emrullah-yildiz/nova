// Locally computes what's wrong (or incomplete) about the live graph so the AI
// assistant can answer "how do I finish this workflow?" and target fixes instead
// of guessing. Pure: works off the serialized graph (app.serializeGraph()) plus
// a type → def lookup (NODE_TYPE_MAP) and an optional node-error map.
//
// Detected, low-noise, actionable problems:
//  - orphan-wire        a wire endpoint references a missing node or port
//  - type-mismatch      an output type can't feed the input it's wired to
//  - unconnected-input  an input with no wire AND no inline control fallback
//  - node-error         a node that errored on the last run
//  - no-output-sink     the graph has nodes but nothing reaches an Output.* node

import { isWireTypeCompatible } from '../core/wire-type-check.js';

function portsOf(node, typeMap, dir) {
  const dyn = dir === 'inputs' ? node._dynInputs : node._dynOutputs;
  if (Array.isArray(dyn) && dyn.length) return dyn.map((id) => ({ id, type: 'any' }));
  const def = typeMap[node.type] || {};
  return (def[dir] || []).map((p) => ({ id: p.id, type: p.type || 'any' }));
}

// A node whose live ports can't be trusted from a serialized graph: Custom.Python
// and any dynamic-input node. Its static def ports don't reflect the real ones,
// so "unconnected input" checks against them would be false alarms.
function isDynamicPortNode(node, def) {
  return node.type === 'custom-python' || node.type === 'Custom.Python'
    || (def && def.dynamicInputs) || Array.isArray(node._dynInputs) || Array.isArray(node._dynOutputs);
}

export function analyzeGraphProblems(graph, typeMap = {}, opts = {}) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const wires = Array.isArray(graph && graph.wires) ? graph.wires : [];
  const nodeErrors = opts.nodeErrors || {};
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const problems = [];

  const fedInputs = new Set();
  const usedOutputs = new Set();
  for (const w of wires) {
    if (!w) continue;
    if (byId.has(w.toNode)) fedInputs.add(w.toNode + ':' + w.toPort);
    if (byId.has(w.fromNode)) usedOutputs.add(w.fromNode + ':' + w.fromPort);
  }

  // Wires: only a MISSING NODE is a reliable orphan here. A port-name mismatch
  // is NOT detectable from a serialized graph once dynamic ports (Custom.Python)
  // are involved — its static def ports (elements/options/result) don't reflect
  // the real ports (panels/extrude_dir/thick_list), so resolving against them
  // would flag every such wire as a phantom orphan. The engine flags genuine
  // orphan wires itself; we never invent one. Type mismatches are reported only
  // when BOTH endpoints resolve to a known typed port.
  for (const w of wires) {
    if (!w) continue;
    const from = byId.get(w.fromNode);
    const to = byId.get(w.toNode);
    if (!from || !to) {
      problems.push({ kind: 'orphan-wire', message: `Wire ${w.fromNode}.${w.fromPort} → ${w.toNode}.${w.toPort} references a node that no longer exists.` });
      continue;
    }
    const outPort = portsOf(from, typeMap, 'outputs').find((p) => p.id === w.fromPort);
    const inPort = portsOf(to, typeMap, 'inputs').find((p) => p.id === w.toPort);
    if (outPort && inPort && !isWireTypeCompatible(outPort.type, inPort.type)) {
      problems.push({ kind: 'type-mismatch', nodeId: to.id, port: inPort.id, message: `Type mismatch: ${from.type}.${outPort.id} (${outPort.type}) → ${to.type}.${inPort.id} (${inPort.type}). Wire a compatible source or insert a converter.` });
    }
  }

  // Per-node: unconnected required inputs and runtime errors.
  for (const n of nodes) {
    const def = typeMap[n.type] || {};
    // Only check inputs whose port list we can trust (skip dynamic-port nodes —
    // their static def ports are fiction once the live ports diverge).
    if (!isDynamicPortNode(n, def)) {
      const controlIds = new Set((def.controls || []).map((c) => c.id));
      for (const p of portsOf(n, typeMap, 'inputs')) {
        if (fedInputs.has(n.id + ':' + p.id)) continue;
        if (controlIds.has(p.id)) continue; // has an inline control default → not "missing"
        problems.push({ kind: 'unconnected-input', nodeId: n.id, port: p.id, message: `${n.type} (${n.id}) input "${p.id}" has no incoming wire and no control default — it will read empty.` });
      }
    }
    const err = nodeErrors[n.id];
    if (err && (err.message || typeof err === 'string')) {
      problems.push({ kind: 'node-error', nodeId: n.id, message: `${n.type} (${n.id}) errored on the last run: ${err.message || err}` });
    }
  }

  // Graph-level: nothing is displayed.
  if (nodes.length > 0 && !nodes.some((n) => /^Output\./.test(n.type) || n.type === 'output-watch')) {
    problems.push({ kind: 'no-output-sink', message: 'No Output.* node in the graph — nothing is displayed. Wire your final result into an Output.Watch (or another Output.* node) to see it.' });
  }

  return problems;
}

// Renders the problem list as a compact, bounded text block for the prompt.
export function formatGraphProblems(problems, opts = {}) {
  if (!Array.isArray(problems) || problems.length === 0) return '';
  const max = opts.max || 40;
  const shown = problems.slice(0, max);
  const lines = [`PROBLEMS (${problems.length}) — fix or finish these:`];
  for (const p of shown) lines.push(`  - [${p.kind}] ${p.message}`);
  if (problems.length > shown.length) lines.push(`  …(+${problems.length - shown.length} more)`);
  return lines.join('\n');
}
