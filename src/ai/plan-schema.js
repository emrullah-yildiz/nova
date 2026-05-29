// Phase 7: nova-plan schema.
//
// The plan is the structured form the AI emits instead of free-form Python
// when build intent is detected. We parse it mechanically into a graph
// (no regex Python reverse-engineering) and reject any plan that doesn't
// resolve cleanly against the node registry.
//
// Shape:
//
//   {
//     "version": 1,
//     "refused": { "reason": "...", "suggestions": ["..."] },   // optional
//     "params": { "name": value, ... },                          // optional
//     "ops": [
//       { "id": "rings", "node": "Pattern.Phyllotaxis",
//         "controls": { "count": 100 }, "inputs": { "center": "@origin" } },
//       { "id": "tower", "node": "Solid.ByLoft",
//         "inputs": { "profiles": "@rings" } },
//       { "id": "watch", "node": "Output.Watch",
//         "inputs": { "value": "@tower" } }
//     ]
//   }
//
// References inside `inputs[portId]`:
//   "@opId"     → another op's primary output (its node's first output port)
//   "$paramName" → a top-level param's value (becomes an Input.* node and a
//                  wire from there to this port)
//
// `controls` carries values that become the node's control values
// (sliders, dropdowns, text). Inputs carry data flow (wires).
//
// `refused: true` is the formal "I can't build this with available nodes"
// path. The plan path then surfaces the reason in chat with suggestions —
// the user is never silently given a half-broken graph.

export const NOVA_PLAN_VERSION = 1;

// Strict shape validation — checks JSON structure only, doesn't touch the
// node registry. validatePlanAgainstRegistry handles cross-referencing.
export function validatePlanShape(plan) {
  const issues = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, issues: ['plan must be a non-null object'] };
  }
  if (plan.version !== NOVA_PLAN_VERSION) {
    issues.push(`plan.version must be ${NOVA_PLAN_VERSION}, got ${JSON.stringify(plan.version)}`);
  }

  // Refusal short-circuits the rest of the schema. AI uses this when it
  // can't satisfy the request with available nodes; we surface it cleanly.
  if (plan.refused) {
    if (typeof plan.refused !== 'object' || !plan.refused.reason || typeof plan.refused.reason !== 'string') {
      issues.push('plan.refused must be { reason: string, suggestions?: string[] }');
    }
    return { ok: issues.length === 0, issues, refused: true };
  }

  // params is optional but if present must be a flat object of primitives.
  if (plan.params !== undefined) {
    if (typeof plan.params !== 'object' || Array.isArray(plan.params) || plan.params === null) {
      issues.push('plan.params must be an object of { name: value }');
    } else {
      for (const [k, v] of Object.entries(plan.params)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
          issues.push(`param name "${k}" must be a valid identifier`);
        }
        if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') {
          issues.push(`param "${k}" must be a number, string, or boolean (got ${typeof v})`);
        }
      }
    }
  }

  if (!Array.isArray(plan.ops) || plan.ops.length === 0) {
    issues.push('plan.ops must be a non-empty array');
    return { ok: false, issues };
  }

  const seenIds = new Set();
  for (let i = 0; i < plan.ops.length; i++) {
    const op = plan.ops[i];
    const ctx = `op[${i}]`;
    if (!op || typeof op !== 'object' || Array.isArray(op)) {
      issues.push(`${ctx} must be an object`); continue;
    }
    if (typeof op.id !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(op.id)) {
      issues.push(`${ctx}.id must be a valid identifier (got ${JSON.stringify(op.id)})`);
    } else if (seenIds.has(op.id)) {
      issues.push(`${ctx}.id "${op.id}" is duplicated`);
    } else {
      seenIds.add(op.id);
    }
    if (typeof op.node !== 'string' || !op.node) {
      issues.push(`${ctx}.node must be a non-empty string`);
    }
    if (op.controls !== undefined && (typeof op.controls !== 'object' || Array.isArray(op.controls) || op.controls === null)) {
      issues.push(`${ctx}.controls must be an object if present`);
    }
    if (op.inputs !== undefined) {
      if (typeof op.inputs !== 'object' || Array.isArray(op.inputs) || op.inputs === null) {
        issues.push(`${ctx}.inputs must be an object if present`);
      } else {
        for (const [port, ref] of Object.entries(op.inputs)) {
          if (typeof ref !== 'string') {
            issues.push(`${ctx}.inputs.${port} must be a string reference (@opId or $paramName)`);
          } else if (!/^[@$][A-Za-z_][A-Za-z0-9_]*$/.test(ref)) {
            issues.push(`${ctx}.inputs.${port} must start with @ (op) or $ (param), got ${JSON.stringify(ref)}`);
          }
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

// Parses a reference string like "@rings" or "$count" into its kind/name.
export function parseRef(ref) {
  if (typeof ref !== 'string' || ref.length < 2) return null;
  const kind = ref[0];
  if (kind !== '@' && kind !== '$') return null;
  return { kind, name: ref.slice(1) };
}
