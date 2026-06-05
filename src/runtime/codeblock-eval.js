// ============================================
// NOVA — CodeBlock DSL Evaluator
// ============================================
// A pure-JavaScript expression language for Custom.CodeBlock nodes, replacing
// Python execution. Each line is one expression or assignment:
//
//   result = x + y          → named output port "result", inputs x and y
//   0..10                   → list [0,1,…,10]  (series shorthand)
//   0..2..10                → [0,2,4,6,8,10]
//   0..1..#5                → 5 evenly-spaced values 0..1
//   1                       → number 1  +  bool port "out_bool" = true
//   0                       → number 0  +  bool port "out_bool" = false
//   "hello"                 → string
//   sin(angle) * radius     → math expression; angle, radius → input ports
//
// Math builtins are available without "Math." prefix: sin, cos, tan, sqrt,
// abs, floor, ceil, round, pow, log, exp, min, max, PI, pi, E, e, deg, rad.
// Use ^ for exponentiation (same as **). Comments: # or //.

import { desugarSeries } from './codeblock-syntax.js';

// Identifiers that must NOT become input ports.
const RESERVED = new Set([
  'true', 'false', 'null', 'undefined', 'Infinity', 'NaN',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'round', 'trunc',
  'log', 'log2', 'log10', 'exp', 'pow', 'hypot', 'sign',
  'min', 'max', 'PI', 'pi', 'E', 'e', 'deg', 'rad', 'len',
  'let', 'const', 'var', 'function', 'return', 'if', 'else',
  'for', 'while', 'do', 'break', 'continue', 'new', 'this',
  'typeof', 'instanceof', 'in', 'of', 'class', 'import', 'export',
  'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw',
  'delete', 'void', 'yield', 'async', 'await',
  'String', 'Number', 'Boolean', 'Array', 'Object', 'Math',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
]);

// Math functions injected into every evaluation scope (no Math. prefix needed).
const MATH_SCOPE = {
  sin: Math.sin,   cos: Math.cos,   tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  log: Math.log,   log2: Math.log2, log10: Math.log10, exp: Math.exp,
  pow: Math.pow,   hypot: Math.hypot, sign: Math.sign,
  min: Math.min,   max: Math.max,
  PI: Math.PI,     pi: Math.PI,     E: Math.E,      e: Math.E,
  deg: (r) => r * 180 / Math.PI,
  rad: (d) => d * Math.PI / 180,
  len: (a) => (Array.isArray(a) || typeof a === 'string') ? a.length : 0,
};

// Parse code into an array of {name, expr} records.
// Blank lines and # / // comments are skipped.
// "name = expr"  → named output; bare "expr" → anonymous (name is null).
export function parseCBLines(code) {
  const parsed = [];
  for (const raw of (code || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    // Named assignment: identifier = expr  (not ==, !=, <=, >=, +=, etc.)
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?![=><+\-*/%&|^!])\s*(.+)$/);
    if (m) {
      parsed.push({ name: m[1], expr: m[2].trim() });
    } else {
      parsed.push({ name: null, expr: line });
    }
  }
  return parsed;
}

// Extract identifier references in expr that could be input ports.
// Skips: reserved words, math builtins, known output names, function-call targets.
function extractVarRefs(expr, outputNames) {
  const vars = [], seen = new Set();
  const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let m;
  while ((m = re.exec(expr)) !== null) {
    const id = m[1];
    if (RESERVED.has(id) || seen.has(id) || (outputNames && outputNames.has(id))) continue;
    const rest = expr.slice(m.index + id.length).trimStart();
    if (rest.startsWith('(')) continue; // function call
    seen.add(id); vars.push(id);
  }
  return vars;
}

// True when expression is the bare literal 0 or 1 (triggers dual bool output).
function isBoolLiteral(expr) {
  return /^\s*[01]\s*$/.test(expr);
}

// Auto-name for anonymous outputs: first is 'out', rest are 'out1', 'out2', …
function autoName(idx) {
  return idx === 0 ? 'out' : 'out' + idx;
}

// Desugar series syntax without throwing.
function safeDesugar(expr) {
  try { return desugarSeries(expr); } catch { return expr; }
}

// Heuristic type for display (not enforced at runtime).
function inferType(expr) {
  const s = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(s))            return 'number';
  if (/^(true|false)$/.test(s))             return 'boolean';
  if ((s.startsWith('"') || s.startsWith("'")) &&
      (s.endsWith('"')   || s.endsWith("'")))  return 'string';
  if (s.includes('..'))                     return 'list';
  return 'any';
}

// ── Port resolution ─────────────────────────────────────────────────────────
// Static analysis: returns {inputs:[{id,type}], outputs:[{id,type}]}.
// Called by the on-node editor on every edit-commit to update live ports.
export function resolveCBPorts(code) {
  const lines = parseCBLines(code);
  const outputNames = new Set(lines.filter(l => l.name).map(l => l.name));

  const inputVars = [], seenIn = new Set();
  let anonIdx = 0;
  const outPorts = [];

  for (const line of lines) {
    // Find free variable references in the expression.
    const desugared = safeDesugar(line.expr);
    for (const v of extractVarRefs(desugared, outputNames)) {
      if (!seenIn.has(v)) { seenIn.add(v); inputVars.push(v); }
    }

    const name = line.name || autoName(anonIdx++);
    outPorts.push({ id: name, type: inferType(line.expr) });

    // Dual port: writing 0/1 exposes a companion boolean output.
    if (isBoolLiteral(line.expr)) {
      outPorts.push({ id: name + '_bool', type: 'boolean' });
    }
  }

  return {
    inputs:  inputVars.map(id => ({ id, type: 'any' })),
    outputs: outPorts.length ? outPorts : [{ id: 'out', type: 'any' }],
  };
}

// ── Execution ────────────────────────────────────────────────────────────────
// Evaluate the CodeBlock DSL and return {outputs:{id:value}, error:string|null}.
// inputValues — object mapping port ids to upstream values (from wired nodes).
export function evalCodeBlock(code, inputValues) {
  if (!code || !code.trim()) return { outputs: { out: null }, error: null };

  const lines = parseCBLines(code);
  if (!lines.length) return { outputs: { out: null }, error: null };

  // Scope: math builtins + wired input values. Extended with each output as we go.
  const scope = Object.assign({}, MATH_SCOPE, inputValues || {});
  const outputs = {};

  let anonIdx = 0;
  for (const line of lines) {
    // Expand series shorthand and allow ^ as power.
    let expr = safeDesugar(line.expr).replace(/\^/g, '**');

    const scopeKeys = Object.keys(scope);
    const scopeVals = scopeKeys.map(k => scope[k]);

    let value;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(...scopeKeys, '"use strict"; return (' + expr + ');');
      value = fn(...scopeVals);
    } catch (e) {
      return { outputs: {}, error: String(e.message || e) };
    }

    const name = line.name || autoName(anonIdx++);
    scope[name] = value;     // make available to subsequent lines
    outputs[name] = value;

    // Dual output: 0 → bool false, 1 → bool true.
    if (value === 0 || value === 1) {
      const boolName = name + '_bool';
      outputs[boolName] = Boolean(value);
      scope[boolName] = Boolean(value);
    }
  }

  return { outputs, error: null };
}
