// Validates a nova-plan against the live node registry.
//
// Catches the failure modes that the JSON schema can't:
//  - op.node references a node type that doesn't exist
//  - inputs[port] references a port id that isn't on the node
//  - inputs reference an op id / param name that wasn't declared
//  - cycles in the wire graph (DAG required)
//  - dangling outputs (every op should ultimately reach an Output.* node)
//
// This runs AFTER validatePlanShape — the assumption is that the basic
// JSON shape is already known to be sound.

import { NODE_TYPE_MAP } from '../core/nodes.js';
import { parseRef } from './plan-schema.js';
import { isWireTypeCompatible } from '../core/wire-type-check.js';

function nodeDef(nodeType) {
  return NODE_TYPE_MAP[nodeType] || null;
}

function findInputPort(def, portId) {
  return (def.inputs || []).find(p => p.id === portId);
}

function firstOutputPort(def) {
  return (def.outputs || [])[0] || null;
}

export function validatePlanAgainstRegistry(plan) {
  const issues = [];
  if (!plan || plan.refused) return { ok: true, issues: [] }; // refusal is its own path

  const params = plan.params || {};
  const opsById = new Map();
  for (const op of plan.ops) opsById.set(op.id, op);

  // First pass — every op.node must exist in the registry.
  for (const op of plan.ops) {
    const def = nodeDef(op.node);
    if (!def) {
      issues.push(`op "${op.id}" uses unknown node type "${op.node}". The AI invented this node — use only what's listed in the system prompt's node catalog.`);
    }
  }

  // Second pass — every referenced input/port/op must resolve.
  for (const op of plan.ops) {
    const def = nodeDef(op.node);
    if (!def) continue;
    const inputs = op.inputs || {};
    for (const [port, ref] of Object.entries(inputs)) {
      const portDef = findInputPort(def, port);
      if (!portDef) {
        issues.push(`op "${op.id}" wires into input port "${port}" but node "${op.node}" has no such port. Valid ports: [${(def.inputs || []).map(p => p.id).join(', ')}]`);
        continue;
      }
      const parsed = parseRef(ref);
      if (!parsed) continue; // shape validator already flagged
      if (parsed.kind === '$') {
        if (!Object.prototype.hasOwnProperty.call(params, parsed.name)) {
          issues.push(`op "${op.id}" port "${port}" references $${parsed.name} but no such param exists. Declared params: [${Object.keys(params).join(', ') || 'none'}]`);
        }
      } else {
        const target = opsById.get(parsed.name);
        if (!target) {
          issues.push(`op "${op.id}" port "${port}" references @${parsed.name} but no such op exists.`);
          continue;
        }
        const targetDef = nodeDef(target.node);
        if (!targetDef) continue;
        const targetOut = firstOutputPort(targetDef);
        if (!targetOut) {
          issues.push(`op "${op.id}" port "${port}" references @${parsed.name} but that node has no output.`);
          continue;
        }
        if (!isWireTypeCompatible(targetOut.type, portDef.type)) {
          issues.push(`op "${op.id}" port "${port}" (expects ${portDef.type}) is wired from @${parsed.name} which outputs ${targetOut.type}. Type mismatch.`);
        }
      }
    }
  }

  // DAG check — topological sort, detect cycles.
  const visiting = new Set();
  const visited = new Set();
  function visit(opId, stack) {
    if (visited.has(opId)) return;
    if (visiting.has(opId)) {
      issues.push(`cycle detected through ops: ${[...stack, opId].join(' → ')}`);
      return;
    }
    visiting.add(opId);
    const op = opsById.get(opId);
    if (op) {
      for (const ref of Object.values(op.inputs || {})) {
        const parsed = parseRef(ref);
        if (parsed && parsed.kind === '@' && opsById.has(parsed.name)) {
          visit(parsed.name, [...stack, opId]);
        }
      }
    }
    visiting.delete(opId);
    visited.add(opId);
  }
  for (const op of plan.ops) visit(op.id, []);

  // Output check — at least one op must be a sink (Output.* or be referenced
  // by something explicitly named as such). For now we look for either a
  // node type that starts with "Output." or any node whose first output is
  // unreferenced (the assumed final result).
  const referencedAsSource = new Set();
  for (const op of plan.ops) {
    for (const ref of Object.values(op.inputs || {})) {
      const parsed = parseRef(ref);
      if (parsed && parsed.kind === '@') referencedAsSource.add(parsed.name);
    }
  }
  const hasOutputSink = plan.ops.some(op => /^Output\./i.test(op.node));
  if (!hasOutputSink) {
    issues.push('plan has no Output.* op — add e.g. { "id":"watch","node":"Output.Watch","inputs":{"value":"@<final>"} } so the result actually renders.');
  }

  // Warn about orphans (output never consumed AND op is not an Output.*).
  for (const op of plan.ops) {
    if (/^Output\./i.test(op.node)) continue;
    if (!referencedAsSource.has(op.id)) {
      issues.push(`op "${op.id}" output is never consumed by another op — its value will be discarded.`);
    }
  }

  return { ok: issues.length === 0, issues };
}
