// Mechanical transformation: nova-plan → { nodes, wires, nextId }
//
// Matches the shape CodeParser.parseToGraph returns so the AI-graph build
// path (graph.nodes.forEach in app.js) can consume either output the same
// way. Each param becomes an Input.* node; each op becomes the node it
// names; inputs become wires.
//
// Assumes the plan has already passed validatePlanShape and
// validatePlanAgainstRegistry — this is the build step, not the gate.

import { NODE_TYPE_MAP } from '../core/nodes.js';
import { parseRef } from './plan-schema.js';

const COL = 220;
const ROW = 120;

// Pick the right Input.* node type for a param value.
function inputNodeTypeForValue(v) {
  if (typeof v === 'number') return 'Input.Number';
  if (typeof v === 'boolean') return 'Input.Boolean';
  return 'Input.Text';
}
function inputControlForValue(v) {
  if (typeof v === 'number') return { val: v };
  if (typeof v === 'boolean') return { val: v };
  return { val: String(v) };
}

function firstOutputId(nodeType) {
  const def = NODE_TYPE_MAP[nodeType];
  if (!def || !def.outputs || def.outputs.length === 0) return 'output0';
  return def.outputs[0].id;
}

export function buildGraphFromPlan(plan) {
  if (plan && plan.refused) {
    return { nodes: [], wires: [], nextId: 1, refused: plan.refused };
  }

  const nodes = [];
  const wires = [];
  let nextId = 1;

  // Layout: params on the left in a column, ops in a row(s) to the right.
  // We compute each op's depth by topological order so they spread visually
  // and the wires don't tangle.
  const opOrder = topoOrder(plan.ops);
  const opIdToDepth = new Map();
  const opIdToNodeId = new Map();
  for (const id of opOrder) {
    const op = plan.ops.find(o => o.id === id);
    let depth = 0;
    for (const ref of Object.values(op.inputs || {})) {
      const parsed = parseRef(ref);
      if (parsed && parsed.kind === '@' && opIdToDepth.has(parsed.name)) {
        depth = Math.max(depth, opIdToDepth.get(parsed.name) + 1);
      }
    }
    opIdToDepth.set(id, depth);
  }

  // Place params (col 0).
  const paramNames = Object.keys(plan.params || {});
  const paramNodeIds = new Map();
  paramNames.forEach((name, i) => {
    const value = plan.params[name];
    const nodeType = inputNodeTypeForValue(value);
    const nodeId = 'node-' + nextId++;
    nodes.push({
      id: nodeId,
      type: nodeType,
      variable: name,
      controls: inputControlForValue(value),
      inputRefs: {},
      rawCode: `${name} = ${JSON.stringify(value)}`,
      outputVars: [name],
      x: 80,
      y: 80 + i * ROW
    });
    paramNodeIds.set(name, nodeId);
  });

  // Place ops (col >= 1, depth-driven).
  // Track row counts per column so we don't overlap.
  const rowsPerCol = new Map();
  const opCol = (depth) => 80 + (depth + 1) * COL;
  const opRow = (col) => {
    const used = rowsPerCol.get(col) || 0;
    rowsPerCol.set(col, used + 1);
    return 80 + used * ROW;
  };

  for (const opId of opOrder) {
    const op = plan.ops.find(o => o.id === opId);
    const depth = opIdToDepth.get(opId);
    const col = opCol(depth);
    const y = opRow(col);
    const nodeId = 'node-' + nextId++;
    nodes.push({
      id: nodeId,
      type: op.node,
      variable: opId,
      controls: { ...(op.controls || {}) },
      inputRefs: { ...(op.inputs || {}) },
      rawCode: '',
      outputVars: [opId],
      x: col,
      y
    });
    opIdToNodeId.set(opId, nodeId);
  }

  // Resolve wires from inputs.
  for (const opId of opOrder) {
    const op = plan.ops.find(o => o.id === opId);
    const toNode = opIdToNodeId.get(opId);
    for (const [port, ref] of Object.entries(op.inputs || {})) {
      const parsed = parseRef(ref);
      if (!parsed) continue;
      if (parsed.kind === '$') {
        const fromNode = paramNodeIds.get(parsed.name);
        if (!fromNode) continue;
        wires.push({
          fromNode,
          fromPort: firstOutputId(inputNodeTypeForValue(plan.params[parsed.name])),
          toNode,
          toPort: port
        });
      } else {
        const fromNode = opIdToNodeId.get(parsed.name);
        const target = plan.ops.find(o => o.id === parsed.name);
        if (!fromNode || !target) continue;
        wires.push({
          fromNode,
          fromPort: firstOutputId(target.node),
          toNode,
          toPort: port
        });
      }
    }
  }

  return { nodes, wires, nextId };
}

// Renders the plan as canonical Python that the existing CodeParser can
// reliably consume — one assignment per line, no for-loops, no nested
// calls. Each op's Geo.* line comes from its node's codegen.python
// template with {{name}} placeholders replaced by the plan's param /
// op references. Lets the plan path reuse the entire canvas-build
// pipeline (including the Phase 6 port-mapping fix) without us having
// to re-implement node rendering and wire creation for plans.
export function planToPython(plan) {
  if (!plan || plan.refused) return '';
  const lines = ['import math', ''];
  for (const [k, v] of Object.entries(plan.params || {})) {
    lines.push(`${k} = ${formatValue(v)}`);
  }
  if (Object.keys(plan.params || {}).length > 0) lines.push('');

  const order = topoOrder(plan.ops);
  const hasOutputOp = plan.ops.some(o => /^Output\./i.test(o.node));
  let finalVar = null;
  for (const id of order) {
    const op = plan.ops.find(o => o.id === id);
    const def = NODE_TYPE_MAP[op.node];
    if (!def) {
      lines.push(`# Unknown node ${op.node} — skipping (validator should have caught this)`);
      continue;
    }
    const py = def.codegen && def.codegen.python;
    if (!py || py.indexOf('\n') !== -1) {
      // Multi-line codegen or none — emit a placeholder. The plan path
      // is meant for nodes whose codegen is a single-line assignment.
      lines.push(`# ${op.id} (${op.node}) has no single-line codegen — skipped`);
      continue;
    }
    let rendered = py
      .replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (m, name) => substitute(name, op, id))
      .replace(/\{\{ctrl\.([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (m, name) => formatValue((op.controls || {})[name]));
    lines.push(rendered);
    if (!/^Output\./i.test(op.node)) finalVar = id;
  }
  // Only auto-append a print when the plan didn't declare an Output.* op —
  // Output.Watch's codegen already emits print(value), so adding our own
  // would print twice.
  if (finalVar && !hasOutputOp) lines.push(`print(${finalVar})`);
  return lines.join('\n');
}

function substitute(placeholderName, op, currentOpId) {
  // The placeholder can be the op's output var (the {{result}} name from
  // codegen.python) or one of its input port ids. Map output → opId,
  // input port → resolved reference.
  if (op.inputs && Object.prototype.hasOwnProperty.call(op.inputs, placeholderName)) {
    const ref = op.inputs[placeholderName];
    const parsed = parseRef(ref);
    if (parsed) return parsed.name;
    return placeholderName;
  }
  if ((op.controls || {})[placeholderName] !== undefined) {
    return formatValue(op.controls[placeholderName]);
  }
  // Output placeholder — codegen uses {{result}}, {{solid}} etc. for the
  // assignment LHS. Substitute the op's id so the variable name in the
  // generated Python matches what downstream ops reference.
  return currentOpId;
}

function formatValue(v) {
  if (v === undefined || v === null) return '0';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return JSON.stringify(v);
}

// Returns ids in dependency order (parents before children). On cycle
// the cycle's nodes will still appear, just in arbitrary order — the
// validator should have rejected cycles already.
function topoOrder(ops) {
  const idsInPlan = new Set(ops.map(o => o.id));
  const indeg = new Map(ops.map(o => [o.id, 0]));
  const adj = new Map(ops.map(o => [o.id, []]));
  for (const op of ops) {
    for (const ref of Object.values(op.inputs || {})) {
      const parsed = parseRef(ref);
      if (parsed && parsed.kind === '@' && idsInPlan.has(parsed.name)) {
        adj.get(parsed.name).push(op.id);
        indeg.set(op.id, indeg.get(op.id) + 1);
      }
    }
  }
  const queue = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of adj.get(id) || []) {
      indeg.set(next, indeg.get(next) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  // Append any ops the topo missed (cycles, defensive).
  for (const op of ops) if (!order.includes(op.id)) order.push(op.id);
  return order;
}
