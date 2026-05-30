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
