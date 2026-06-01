// Python port declarations.
//
// Lets a Custom.Python node declare its input and output ports + types
// via header comments inside the code:
//
//   # in:  points:list[point], radius:number
//   # out: mesh:mesh
//
//   mesh = Geo.loft(points)
//
// Result: the rendered node has typed input ports `points`, `radius`
// and a typed output port `mesh`, and Phase 5's wire-type-check
// honours those types. Without the header, the node falls back to its
// generic `input0` / `output0` shape — the headers are opt-in and
// strictly additive.
//
// This is the "graph escape hatch with declared typed ports" the user
// asked for as the long-term direction.

const HEADER_RE = /^\s*#\s*(in|inputs?|out|outputs?)\s*:\s*(.+)\s*$/i;
const DECL_RE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_[\]]*))?$/;

function classifyKey(rawKey) {
  const k = rawKey.toLowerCase();
  if (k === 'in' || k === 'input' || k === 'inputs') return 'inputs';
  if (k === 'out' || k === 'output' || k === 'outputs') return 'outputs';
  return null;
}

// Parses a single "name:type, name:type" string into [{ id, type }, ...].
function parseDeclList(declString) {
  const decls = [];
  // Split on commas at top level — we don't currently support generic
  // params with commas inside (e.g. Map[k,v]), which is fine for now.
  for (const raw of declString.split(',')) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(DECL_RE);
    if (!m) continue;
    decls.push({ id: m[1], type: (m[2] || 'any').toLowerCase() });
  }
  return decls;
}

// Returns { inputs: [{ id, type }], outputs: [{ id, type }], hasDecls }.
// `hasDecls` flags whether ANY declaration was found, so the caller can
// distinguish "user didn't declare ports" from "user declared inputs
// but no outputs".
export function parsePythonPortDecls(code) {
  const result = { inputs: [], outputs: [], hasDecls: false };
  if (typeof code !== 'string' || !code) return result;
  const lines = code.split('\n');
  for (const line of lines) {
    // Stop scanning once we hit non-comment, non-blank content. The
    // header block must come at the TOP of the cell, otherwise it's
    // just a regular comment.
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('#')) break;
    const m = trimmed.match(HEADER_RE);
    if (!m) continue;
    const kind = classifyKey(m[1]);
    if (!kind) continue;
    const decls = parseDeclList(m[2]);
    if (decls.length === 0) continue;
    result[kind].push(...decls);
    result.hasDecls = true;
  }
  return result;
}

// Last-assignment output detection. When the user hasn't declared
// outputs explicitly, find the variable name of the last top-level
// assignment in the code and treat that as the output port. Lets
// `result = Geo.loft(points)` produce a port called `result` instead
// of a generic `output0`.
//
// "Top-level" means not inside an indented block (for / if / while).
// The last such assignment is the result.
export function lastTopLevelAssignment(code) {
  if (typeof code !== 'string' || !code) return null;
  const lines = code.split('\n');
  let last = null;
  for (const raw of lines) {
    // Skip indented lines — those are inside blocks.
    if (/^\s/.test(raw) && raw.trim() !== '') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Match `name = expr` but not `name == expr` and not augmented
    // assignments (+=, -=, etc.).
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+)$/);
    if (!m) continue;
    last = m[1];
  }
  return last;
}

// Helper that combines the two strategies for downstream consumers:
// declared ports first; otherwise infer the output name from the last
// assignment and leave inputs as generic input0. The pyrunner uses this
// to render the node consistently regardless of which strategy applies.
export function resolvePythonPorts(code) {
  const decls = parsePythonPortDecls(code);
  if (decls.hasDecls) {
    return {
      inputs: decls.inputs.length > 0 ? decls.inputs : [{ id: 'input0', type: 'any' }],
      outputs: decls.outputs.length > 0 ? decls.outputs : [{ id: 'output0', type: 'any' }],
      source: 'declared'
    };
  }
  const lastVar = lastTopLevelAssignment(code);
  return {
    inputs: [{ id: 'input0', type: 'any' }],
    outputs: [{ id: lastVar || 'output0', type: 'any' }],
    source: lastVar ? 'inferred' : 'default'
  };
}

// Decides what a Custom.Python node's ports should become after its code
// is edited, given the ports it currently has. This is the live-edit
// counterpart to resolvePythonPorts: it lets the node track `# in:`/`# out:`
// header edits and result-variable renames as the user types.
//
// Rules:
//  • Declared headers are authoritative for BOTH inputs and outputs.
//  • Without headers, manually-managed inputs (added via "+ Input" or wired
//    by the parser) are preserved — only the OUTPUT name tracks the last
//    top-level assignment, so `result = ...` surfaces a `result` port.
//
// `current` is { inputs: string[], outputs: string[] } of existing port ids.
// Returns the new port ids + types, a per-direction `changed` flag, and the
// ids that were removed (so the caller can drop their wires). Pure — no DOM,
// no app state — so it's unit-testable.
export function nextPythonPorts(code, current = {}) {
  const curIn = Array.isArray(current.inputs) ? current.inputs : [];
  const curOut = Array.isArray(current.outputs) ? current.outputs : [];
  const resolved = resolvePythonPorts(code);

  let inputs, inputTypes;
  if (resolved.source === 'declared') {
    inputs = resolved.inputs.map(p => p.id);
    inputTypes = {};
    resolved.inputs.forEach(p => { inputTypes[p.id] = p.type || 'any'; });
  } else {
    // No headers → keep whatever inputs the node already has (manual / wired);
    // fall back to the resolved generic input only when there are none yet.
    inputs = curIn.length ? curIn.slice() : resolved.inputs.map(p => p.id);
    inputTypes = null;
  }

  const outputs = resolved.outputs.map(p => p.id);
  const outputTypes = {};
  resolved.outputs.forEach(p => { outputTypes[p.id] = p.type || 'any'; });

  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  return {
    inputs,
    outputs,
    inputTypes,
    outputTypes,
    source: resolved.source,
    inputsChanged: !eq(inputs, curIn),
    outputsChanged: !eq(outputs, curOut),
    removedInputs: curIn.filter(id => inputs.indexOf(id) < 0),
    removedOutputs: curOut.filter(id => outputs.indexOf(id) < 0)
  };
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Renames a Custom.Python node's input or output port. Because a port id IS
// the variable name the Python block reads (input) or assigns (output), a
// rename has to touch three things together: the port list, every whole-word
// reference in the code, and any wires attached to that port. Doing them as
// one atomic transform keeps them from drifting apart.
//
// opts: { direction:'input'|'output', oldId, newId, code, dynInputs,
//         dynOutputs, wires, nodeId }
// Returns { ok, reason?, dynInputs, dynOutputs, code, wires }. On failure
// (bad name, duplicate, unknown port) the inputs are returned unchanged so the
// caller can no-op safely. Pure — no DOM, no app state.
export function renamePythonPort(opts = {}) {
  const direction = opts.direction === 'output' ? 'output' : 'input';
  const oldId = opts.oldId;
  const newId = typeof opts.newId === 'string' ? opts.newId.trim() : '';
  const code = typeof opts.code === 'string' ? opts.code : '';
  const dynInputs = Array.isArray(opts.dynInputs) ? opts.dynInputs : [];
  const dynOutputs = Array.isArray(opts.dynOutputs) ? opts.dynOutputs : [];
  const wires = Array.isArray(opts.wires) ? opts.wires : [];
  const nodeId = opts.nodeId;

  const unchanged = { dynInputs, dynOutputs, code, wires };
  const list = direction === 'input' ? dynInputs : dynOutputs;

  if (!IDENT_RE.test(newId)) return { ok: false, reason: 'invalid-name', ...unchanged };
  if (list.indexOf(oldId) < 0) return { ok: false, reason: 'unknown-port', ...unchanged };
  if (newId === oldId) return { ok: true, ...unchanged };
  if (list.indexOf(newId) >= 0) return { ok: false, reason: 'duplicate', ...unchanged };

  const rename = (id) => (id === oldId ? newId : id);
  const nextInputs = direction === 'input' ? dynInputs.map(rename) : dynInputs.slice();
  const nextOutputs = direction === 'output' ? dynOutputs.map(rename) : dynOutputs.slice();

  // Whole-word rename of the variable everywhere it appears (headers + body).
  const wordRe = new RegExp('\\b' + oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
  const nextCode = code.replace(wordRe, newId);

  const nextWires = wires.map(w => {
    if (direction === 'input' && w.toNode === nodeId && w.toPort === oldId) return { ...w, toPort: newId };
    if (direction === 'output' && w.fromNode === nodeId && w.fromPort === oldId) return { ...w, fromPort: newId };
    return w;
  });

  return { ok: true, dynInputs: nextInputs, dynOutputs: nextOutputs, code: nextCode, wires: nextWires };
}
