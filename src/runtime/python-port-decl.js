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

// ALL top-level assignment target names, in first-appearance order (deduped).
//
// This is the CodeBlock counterpart to `lastTopLevelAssignment` (which returns
// only the LAST top-level assignment). Dynamo-style Code Block exposes EVERY
// assigned variable as an output (`a = 1; b = a + 2` → outputs `a`, `b`), so
// CodeBlock port resolution needs all of them, not just the last. Custom.Python
// keeps using `lastTopLevelAssignment` — its behavior is deliberately unchanged.
//
// "Top-level" means not inside an indented block (for / if / while / def body).
// Augmented assignments (`+=`, `-=`, …) and comparisons (`==`) are NOT outputs.
// Simple tuple unpacking (`a, b = ...`) yields each name. Names starting with `_`
// are skipped (the "private, no port" convention the inference engine already
// uses for free vars). Pure.
export function topLevelAssignments(code) {
  if (typeof code !== 'string' || !code) return [];
  const out = [];
  const seen = new Set();
  for (const raw of code.split('\n')) {
    // Skip indented lines — those are inside blocks.
    if (/^\s/.test(raw) && raw.trim() !== '') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match `lhs = expr` but not `==`, `<=`, `>=`, `!=` and not augmented
    // assignments (`+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `//=`). The lhs may be a
    // comma list (tuple unpacking).
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_,\s]*?)\s*=(?![=])\s*(.+)$/);
    if (!m) continue;
    // Reject augmented assignment: the char immediately before `=` is an operator.
    const eqIdx = trimmed.indexOf('=');
    const before = trimmed[eqIdx - 1];
    if (before && '+-*/%&|^<>'.indexOf(before) >= 0) continue;

    m[1].split(',').forEach((part) => {
      const id = part.trim();
      if (/^[A-Za-z_]\w*$/.test(id) && !id.startsWith('_') && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    });
  }
  return out;
}

// CodeBlock port-resolution contract — the function the on-node editor (Switch)
// calls on edit-commit to (re)derive ports. Returns
//   { inputs: [{ id, type }], outputs: [{ id, type }] }
// where:
//   • inputs  = free/unknown variables (via the existing `inferInputPorts`) —
//               identifiers read but never bound, not keywords/builtins/bridge,
//               not `_`-prefixed. Each typed `any`.
//   • outputs = ALL top-level assignments (via `topLevelAssignments`). Each typed
//               `any`. Falls back to a single `output0` when nothing is assigned
//               (e.g. a bare expression).
//
// This intentionally differs from `resolvePythonPorts` (Custom.Python), which
// emits only the LAST assignment as the output. CodeBlock = every assignment is a
// port; Python = the script's last result. Both share `inferInputPorts` for
// inputs. Pure — no DOM, no app state.
export function resolveCodeBlockPorts(code) {
  const freeVars = inferInputPorts(code);
  const assigns = topLevelAssignments(code);
  return {
    inputs: freeVars.map((id) => ({ id, type: 'any' })),
    outputs: assigns.length ? assigns.map((id) => ({ id, type: 'any' })) : [{ id: 'output0', type: 'any' }]
  };
}

// Identifiers that are NOT input ports even when read free: Python keywords,
// built-ins the runtime provides, and the injected bridge globals.
const PY_KEYWORDS = new Set(['for', 'in', 'if', 'elif', 'else', 'while', 'def', 'return', 'and', 'or', 'not', 'is', 'None', 'True', 'False', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'lambda', 'pass', 'break', 'continue', 'class', 'global', 'nonlocal', 'yield', 'raise', 'assert', 'del']);
const PY_BUILTINS = new Set(['len', 'range', 'print', 'abs', 'min', 'max', 'round', 'int', 'float', 'list', 'sum', 'sorted', 'reversed', 'enumerate', 'str', 'dict', 'set', 'tuple', 'bool', 'map', 'filter', 'zip', 'isinstance', 'type', 'math']);
const BRIDGE_GLOBALS = new Set(['Geo', 'RevitBridge', 'HostRegistry']);
const IDENT_SCAN_RE = /(\.?)\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

// Infers a Custom.Python cell's INPUT ports from the free variables it reads —
// identifiers used but never assigned (and not a keyword / built-in / bridge /
// loop var / def). This makes "type code → input ports appear" work the same way
// the output already follows the last assignment. Intended for the no-`# in:`
// case only; a header is authoritative and overrides this. Returns the free
// variable names in order of first appearance. Pure.
export function inferInputPorts(code) {
  if (typeof code !== 'string' || !code) return [];

  const bound = new Set();   // names assigned / bound somewhere (not inputs)
  const reads = [];          // names read, in first-appearance order
  const readSet = new Set();

  for (const raw of code.split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('#') || t.startsWith('import ') || t.startsWith('from ')) continue;

    // Strip string literals and inline comments so their contents aren't scanned.
    let line = raw.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    const hash = line.indexOf('#');
    if (hash >= 0) line = line.slice(0, hash);

    // Bound by assignment LHS (incl. augmented +=, and simple tuple unpacking).
    const assign = line.match(/^\s*([A-Za-z_][A-Za-z0-9_,\s]*?)\s*(?:[-+*/%]?=)(?!=)/);
    if (assign) {
      assign[1].split(',').forEach((n) => { const id = n.trim(); if (/^[A-Za-z_]\w*$/.test(id)) bound.add(id); });
    }
    // Bound by `for X[, Y] in ...`.
    const forM = line.match(/^\s*for\s+([A-Za-z_][A-Za-z0-9_,\s]*?)\s+in\s+/);
    if (forM) forM[1].split(',').forEach((n) => { const id = n.trim(); if (/^[A-Za-z_]\w*$/.test(id)) bound.add(id); });
    // Bound by `def name(params):` — name and params are local.
    const defM = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    if (defM) { bound.add(defM[1]); defM[2].split(',').forEach((n) => { const id = n.trim().replace(/[=:].*$/, '').trim(); if (/^[A-Za-z_]\w*$/.test(id)) bound.add(id); }); }

    // Collect read identifiers (skip attribute names after a dot).
    let m;
    IDENT_SCAN_RE.lastIndex = 0;
    while ((m = IDENT_SCAN_RE.exec(line)) !== null) {
      if (m[1] === '.') continue;
      const id = m[2];
      if (!readSet.has(id)) { readSet.add(id); reads.push(id); }
    }
  }

  return reads.filter((id) =>
    !bound.has(id) && !PY_KEYWORDS.has(id) && !PY_BUILTINS.has(id) && !BRIDGE_GLOBALS.has(id) && !id.startsWith('_'));
}

// Helper that combines the two strategies for downstream consumers:
// declared ports first; otherwise infer the output name from the last
// assignment and the inputs from the cell's free variables. The pyrunner uses
// this to render the node consistently regardless of which strategy applies.
export function resolvePythonPorts(code) {
  const decls = parsePythonPortDecls(code);
  if (decls.hasDecls) {
    // Declared inputs (e.g. from a `# in:` header) shouldn't erase the
    // output: if there's no `# out:` header, still infer the output port
    // from the last top-level assignment rather than falling back to a
    // generic output0. This keeps adding an input (which writes a `# in:`
    // header) from silently renaming the output.
    let outputs = decls.outputs;
    if (outputs.length === 0) {
      const lastVar = lastTopLevelAssignment(code);
      outputs = [{ id: lastVar || 'output0', type: 'any' }];
    }
    return {
      inputs: decls.inputs.length > 0 ? decls.inputs : [{ id: 'input0', type: 'any' }],
      outputs,
      source: 'declared'
    };
  }
  const lastVar = lastTopLevelAssignment(code);
  const freeVars = inferInputPorts(code);
  return {
    inputs: freeVars.length ? freeVars.map((id) => ({ id, type: 'any' })) : [{ id: 'input0', type: 'any' }],
    outputs: [{ id: lastVar || 'output0', type: 'any' }],
    source: (freeVars.length || lastVar) ? 'inferred' : 'default',
    inferredInputs: freeVars.length > 0
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
  } else if (resolved.inferredInputs) {
    // No header, but the cell reads free variables — those ARE its inputs, so
    // track them live (add/remove input ports as the code changes). Manual port
    // management is done by writing a `# in:` header (the + button does this),
    // which switches to the authoritative declared branch above.
    inputs = resolved.inputs.map(p => p.id);
    inputTypes = null;
  } else {
    // No header and no detectable free vars → keep whatever inputs the node
    // already has (manual / wired); fall back to a generic input only if none.
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

// Wraps a Custom.Python cell so the generated full script feeds it exactly like
// the live runtime does. A cell reads its inputs as bare variables and assigns
// its outputs as bare variables — and those bare names are the node's LIVE
// ports (`_dynInputs`/`_dynOutputs`), which track renames and `# in:`/`# out:`
// header edits. The static def ports do NOT, so codegen that keys off the def
// drifts out of sync with the cell's variables the moment a port is renamed.
//
// This binds each wired input to the cell's input variable BEFORE the cell, and
// exports each output variable under its canonical downstream name AFTER it:
//
//   inputBindings:  [{ name, source }]  emits `name = source`   (source feeds in)
//   outputBindings: [{ name, alias }]   emits `alias = name`    (alias flows out)
//
// An input binding with a null/undefined `source` (unwired port) is skipped so
// the cell keeps its own default handling. Pure — returns the new code string.
export function wrapPythonNodeCode(code, opts = {}) {
  const body = typeof code === 'string' ? code : '';
  const inputBindings = Array.isArray(opts.inputBindings) ? opts.inputBindings : [];
  const outputBindings = Array.isArray(opts.outputBindings) ? opts.outputBindings : [];
  const pre = inputBindings
    .filter(b => b && b.name && b.source != null && b.source !== '')
    .map(b => b.name + ' = ' + b.source);
  const post = outputBindings
    .filter(b => b && b.name && b.alias && b.alias !== b.name)
    .map(b => b.alias + ' = ' + b.name);
  return (pre.length ? pre.join('\n') + '\n' : '') + body + (post.length ? '\n' + post.join('\n') : '');
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Sets a Custom.Python node's `# in:` header to exactly `names`, so adding /
// removing an input port is expressed as a code edit (the code is the source
// of truth for ports). An input is declared as a header entry — NOT a
// `name = None` assignment — because the runtime injects each wired input as
// `let name = ...` before the cell runs, so an assignment would clobber the
// wired value. Existing `name:type` annotations are preserved; an empty list
// removes the header. Pure — returns the new code.
export function setInputHeader(code, names) {
  const src = typeof code === 'string' ? code : '';
  const list = Array.isArray(names) ? names.filter(n => IDENT_RE.test(n)) : [];
  const lines = src.split('\n');

  // Locate an existing `# in:` header within the leading comment block.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (!t.startsWith('#')) break; // header block ends at first real statement
    if (/^#\s*(in|inputs?)\s*:/i.test(t)) { headerIdx = i; break; }
  }

  // Preserve any existing per-name type annotations.
  const types = {};
  if (headerIdx >= 0) {
    const m = lines[headerIdx].trim().match(/^#\s*(?:in|inputs?)\s*:\s*(.*)$/i);
    (m ? m[1] : '').split(',').forEach(part => {
      const dm = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][\w[\]]*)$/);
      if (dm) types[dm[1]] = dm[2];
    });
  }

  if (list.length === 0) {
    if (headerIdx >= 0) { lines.splice(headerIdx, 1); return lines.join('\n'); }
    return src;
  }

  const decl = list.map(n => (types[n] ? n + ':' + types[n] : n)).join(', ');
  const headerLine = '# in: ' + decl;
  if (headerIdx >= 0) { lines[headerIdx] = headerLine; return lines.join('\n'); }
  return headerLine + '\n' + src;
}

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
