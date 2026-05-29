// Phase 3: argument-type validation for AI-generated Geo.* calls.
//
// Phase 2 catches hallucinated method NAMES. Phase 3 catches the next
// class of bug: a real method, called with the wrong KIND of argument.
// The production regression that motivates this module is:
//
//   circle_points = []
//   for i in range(n):
//       circle_points.append(Geo.Point3(x, y, z))
//   curve = Geo.combineAll(circle_points)   # ← expects list[Mesh3]
//
// Geo.combineAll exists (Phase 2 says ok) but is being fed a list of
// points where it expects a list of meshes, so PythonRunner fails at
// the wrong layer with a generic "is not a function" error. The
// fix-retry doesn't know it's a TYPE mismatch and tends to loop.
//
// We track variable types through a single forward pass, with a
// hand-curated signature table for the common Geo.* methods so we
// can flag mismatches before PythonRunner runs.

// Hand-curated signatures for the Geo.* methods where argument types
// matter most. Not exhaustive on purpose — only the methods where
// passing the wrong type silently produces nonsense rather than a
// clean error. Extend as new failure patterns appear.
//
// Element types in lists are expressed as 'mesh[]', 'point[]', etc.
// 'any' means "we don't know enough to flag this" and never errors.
const GEO_SIGNATURES = {
  // Primitive constructors
  Point3:  { params: ['number', 'number', 'number'], returns: 'point' },
  Vector3: { params: ['number', 'number', 'number'], returns: 'vector' },
  Line3:   { params: ['point', 'point'],             returns: 'curve' },
  Circle3: { params: ['point', 'number'],            returns: 'curve' },
  Arc3:    { params: ['point', 'number', 'number', 'number'], returns: 'curve' },
  Polyline3: { params: ['point[]', 'any'], returns: 'curve' },
  Plane3:  { params: ['point', 'vector'], returns: 'plane' },

  // Solids
  createBox:      { params: ['point', 'number', 'number', 'number'], returns: 'mesh' },
  createSphere:   { params: ['point', 'number'],                     returns: 'mesh' },
  createCylinder: { params: ['point', 'number', 'number'],           returns: 'mesh' },
  createCone:     { params: ['point', 'number', 'number'],           returns: 'mesh' },
  createTorus:    { params: ['point', 'number', 'number'],           returns: 'mesh' },

  // Operations that take typed lists — these are the high-value catches.
  loft:        { params: ['curve[]'], returns: 'mesh' },
  combineAll:  { params: ['mesh[]'],  returns: 'mesh' },
  extrude:     { params: ['curve', 'vector'], returns: 'mesh' },
  revolve:     { params: ['curve', 'point', 'vector', 'number'], returns: 'mesh' },
  sweep:       { params: ['curve', 'curve'], returns: 'mesh' },
  pipe:        { params: ['curve', 'number'], returns: 'mesh' },

  // Booleans
  booleanUnion:     { params: ['mesh', 'mesh'], returns: 'mesh' },
  booleanIntersect: { params: ['mesh', 'mesh'], returns: 'mesh' },
  booleanSubtract:  { params: ['mesh', 'mesh'], returns: 'mesh' },

  // Surface helpers
  thicken:       { params: ['mesh', 'number'], returns: 'mesh' },
  smooth:        { params: ['mesh', 'number'], returns: 'mesh' },
  subdivide:     { params: ['mesh', 'number'], returns: 'mesh' },
  surfaceFromGrid: { params: ['point[]', 'number', 'number'], returns: 'mesh' },

  // Transform
  move:     { params: ['any', 'vector'], returns: 'any' },
  rotate:   { params: ['any', 'point', 'vector', 'number'], returns: 'any' },
  scaleGeo: { params: ['any', 'number', 'point'], returns: 'any' },
  mirror:   { params: ['any', 'point', 'vector'], returns: 'any' },

  // Arrays / patterns — return lists with known element types.
  arrayLinear:   { params: ['any', 'vector', 'number', 'number'], returns: 'list' },
  arrayPolar:    { params: ['any', 'point', 'vector', 'number'], returns: 'list' },
  phyllotaxis:   { params: ['number', 'number'], returns: 'point[]' },
  hexGrid:       { params: ['point', 'number', 'number', 'number'], returns: 'point[]' },
  diamondGrid:   { params: ['point', 'number', 'number', 'number', 'number'], returns: 'point[]' },
  fibonacciSphere: { params: ['number', 'number'], returns: 'point[]' },

  // Curves
  bezier:       { params: ['point[]'], returns: 'curve' },
  interpolate:  { params: ['point[]'], returns: 'curve' },
  offsetCurve:  { params: ['curve', 'number'], returns: 'curve' }
};

// Types that are interchangeable in practice. Used by the compatibility
// check so we don't false-fire on close-enough relationships.
const TYPE_EQUIVALENCE = {
  any: ['point', 'vector', 'mesh', 'curve', 'number', 'plane', 'list', 'point[]', 'mesh[]', 'curve[]', 'vector[]'],
  vector: ['point'],     // a Vector3 and Point3 share x/y/z and Nova accepts either in many places
  curve: ['line', 'circle', 'arc', 'polyline']
};

function typesCompatible(expected, actual) {
  if (!expected || !actual) return true; // missing → permissive
  // Stay conservative: when we can't infer the actual type, do NOT flag.
  // Phase 3 is about catching DEFINITELY-wrong types (point[] fed to a
  // mesh[] slot), not nagging the user about every untracked variable.
  if (actual === 'unknown' || expected === 'unknown') return true;
  if (expected === 'any' || actual === 'any') return true;
  if (expected === actual) return true;
  // List-of-X relationships.
  if (expected === 'list' && (actual === 'list' || actual.endsWith('[]'))) return true;
  if (actual === 'list' && expected.endsWith('[]')) return true; // can't disprove → allow
  // Equivalence pools.
  for (const [base, aliases] of Object.entries(TYPE_EQUIVALENCE)) {
    if (expected === base && aliases.includes(actual)) return true;
    if (actual === base && aliases.includes(expected)) return true;
  }
  return false;
}

// Splits a single argument list like "(a, b, c)" or "Geo.X(Y), 2, [1,2]"
// into top-level arguments. Respects nesting.
function splitArgs(argString) {
  const args = [];
  let depth = 0;
  let cur = '';
  let inStr = false;
  let strCh = '';
  for (let i = 0; i < argString.length; i++) {
    const ch = argString[i];
    if (inStr) {
      cur += ch;
      if (ch === strCh && argString[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; strCh = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; cur += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

// Returns inferred type of a single expression text. `env` is a
// { varName -> typeString } map representing local bindings.
export function inferExprType(expr, env = {}) {
  if (typeof expr !== 'string') return 'unknown';
  const e = expr.trim();
  if (!e) return 'unknown';
  // Numeric literal.
  if (/^-?\d+(\.\d+)?$/.test(e)) return 'number';
  if (e === 'True' || e === 'False') return 'boolean';
  // String literal.
  if (/^["']/.test(e)) return 'string';
  // List literal — try to derive element type if all elements share one.
  if (e.startsWith('[') && e.endsWith(']')) {
    const inner = e.slice(1, -1);
    if (!inner.trim()) return 'list'; // empty list, element unknown
    const elts = splitArgs(inner);
    const elementTypes = elts.map(elt => inferExprType(elt, env));
    const first = elementTypes[0];
    if (elementTypes.every(t => t === first)) return first === 'unknown' ? 'list' : `${first}[]`;
    return 'list';
  }
  // Geo.X(...) call.
  const geoMatch = e.match(/^Geo\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (geoMatch) {
    const sig = GEO_SIGNATURES[geoMatch[1]];
    return sig ? sig.returns : 'unknown';
  }
  // math.X(...) → number for the common cases.
  if (/^math\./.test(e)) return 'number';
  // Plain variable reference.
  if (/^[A-Za-z_]\w*$/.test(e)) return env[e] || 'unknown';
  return 'unknown';
}

// Scans a code string and returns a structured report of TYPE mismatches.
// We deliberately ignore method-name errors here — Phase 2 already covers
// those, and skipping unknown methods avoids duplicate noise.
export function validateGeneratedCodeTypes(code) {
  if (typeof code !== 'string' || !code) return { ok: true, mismatches: [] };

  const env = {};
  const mismatches = [];
  const seenKeys = new Set(); // dedupe identical reports
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // Assignment: `name = expression`
    const assignMatch = raw.match(/^(\s*)([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[2];
      const rhs = assignMatch[3].trim();
      const t = inferExprType(rhs, env);
      env[varName] = t;
    }

    // List append pattern: `name.append(expr)` — promotes empty list to typed.
    const appendMatch = raw.match(/^\s*([A-Za-z_]\w*)\.append\s*\(\s*(.+)\s*\)\s*$/);
    if (appendMatch) {
      const varName = appendMatch[1];
      const eltExpr = appendMatch[2];
      const eltType = inferExprType(eltExpr, env);
      const prev = env[varName];
      if ((prev === 'list' || !prev) && eltType !== 'unknown') {
        env[varName] = `${eltType}[]`;
      }
    }

    // Find all Geo.X(...) calls on this line and type-check each argument.
    // We use a manual scan to capture the balanced argument list.
    let cursor = 0;
    while (cursor < line.length) {
      const m = line.slice(cursor).match(/Geo\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (!m) break;
      const callStart = cursor + m.index;
      const argsStart = callStart + m[0].length;
      // Find matching close paren.
      let depth = 1;
      let p = argsStart;
      while (p < line.length && depth > 0) {
        const ch = line[p];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        p++;
        if (depth === 0) break;
      }
      if (depth !== 0) break; // unbalanced — give up on this line
      const argString = line.slice(argsStart, p - 1);
      const method = m[1];
      const sig = GEO_SIGNATURES[method];
      cursor = p;
      if (!sig) continue;

      const args = splitArgs(argString);
      for (let idx = 0; idx < args.length && idx < sig.params.length; idx++) {
        const expectedType = sig.params[idx];
        const actualType = inferExprType(args[idx], env);
        if (!typesCompatible(expectedType, actualType)) {
          const key = `${i}|${method}|${idx}|${expectedType}|${actualType}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          mismatches.push({
            line: i + 1,
            method,
            paramIndex: idx,
            expected: expectedType,
            got: actualType,
            argText: args[idx]
          });
        }
      }
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

// Small helper so the integration can format a single human-readable hint.
export function formatMismatchHint(mismatch) {
  const { method, paramIndex, expected, got, argText, line } = mismatch;
  return `line ${line}: Geo.${method}() arg ${paramIndex + 1} (\`${argText}\`) is ${got}, but it expects ${expected}`;
}
