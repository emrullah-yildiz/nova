// Post-generation validator for AI-produced Python code.
//
// The AI sometimes hallucinates Geo.* method names that look plausible but
// don't actually exist in the registry (Geo.Edge, Geo.Mesh, Geo.createTower).
// PythonRunner will fail with a generic "is not a function" runtime error
// and the fix-retry asks the AI to fix it without telling it WHY the call
// failed, so the same hallucination often comes back in the fix attempt.
//
// This module:
// 1. Extracts every Geo.<name>(...) call from the generated code.
// 2. Checks each against the set of method names the node catalog exposes
//    (same source of truth as the system-prompt catalog, so we never
//    diverge — if a method is real enough to appear in the prompt, it's
//    real enough to be accepted here).
// 3. For unknown calls, suggests the closest real name via edit distance,
//    so the fix-retry prompt can include "you used Geo.Edge — did you mean
//    Geo.bezier?" instead of just the raw runtime error.

import { coreNodes } from '../nodes/coreNodes.js';

// Always-allowed Geo.* methods that don't appear in the node registry's
// codegen.python (utilities the AI may use legitimately even though they
// don't materialize as their own node — they live inside Python blocks
// or get consumed by other nodes' arguments).
const EXTRA_ALLOWED = new Set([
  'Point3', 'Vector3', 'Line3', 'Polyline3', 'Circle3', 'Arc3', 'Plane3',
  'booleanUnion', 'booleanIntersect', 'booleanSubtract',
  'perlin2', 'perlin3', 'fbm',
  'pointAttractor', 'multiAttractor',
  'noiseDeform', 'attractorDeform',
  'createNurbsCurve', 'createNurbsSurface',
  'move', 'rotate', 'scaleGeo', 'mirror',
  'arrayLinear', 'arrayPolar', 'arrayAlongCurve'
]);

let cachedKnown = null;

// Extracts the method name from `Geo.X` or `Geo.X(...)` occurrences in
// the registry's codegen.python templates. We pull straight from the
// same field used to build the prompt catalog so validation never lags
// behind what the AI has been told it can use.
export function getKnownGeoMethods() {
  if (cachedKnown) return cachedKnown;
  const set = new Set(EXTRA_ALLOWED);
  const re = /Geo\.([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const node of coreNodes) {
    const tmpl = node.codegen && node.codegen.python;
    if (typeof tmpl !== 'string') continue;
    let m;
    while ((m = re.exec(tmpl)) !== null) {
      set.add(m[1]);
    }
  }
  cachedKnown = set;
  return set;
}

// Scans code for `Geo.<name>(` call sites. We require the open paren to
// filter out bare references and namespace mentions in comments.
export function extractGeoCalls(code) {
  if (typeof code !== 'string' || !code) return [];
  const calls = [];
  const lines = code.split('\n');
  // Skip text inside fenced-style commentary just in case.
  const re = /Geo\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines so unknowns the AI explains in a comment
    // ("# we tried Geo.Edge but switched to Geo.bezier") don't false-fire.
    if (/^\s*#/.test(line)) continue;
    let m;
    while ((m = re.exec(line)) !== null) {
      calls.push({ method: m[1], line: i + 1, column: m.index + 1 });
    }
    re.lastIndex = 0;
  }
  return calls;
}

// Damerau–Levenshtein-style edit distance, good enough for finding near
// matches to suggest when the AI invents a name. Caps at 4 because beyond
// that the suggestion isn't useful.
function editDistance(a, b) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 4) return 5;
  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[la][lb];
}

// Returns up to `limit` suggestions for an unknown method, ordered by
// edit distance. Threshold tuned so "Edge" → "Line3" doesn't match (too
// far) but "createbox" → "createBox" does.
export function suggestSimilarMethods(unknown, limit = 3) {
  if (!unknown) return [];
  const known = getKnownGeoMethods();
  const scored = [];
  for (const name of known) {
    const d = editDistance(unknown, name);
    if (d <= 3) scored.push({ name, d });
  }
  scored.sort((a, b) => a.d - b.d || a.name.length - b.name.length);
  return scored.slice(0, limit).map(s => `Geo.${s.name}`);
}

// Top-level validation: returns the structured result the fix-retry and
// chat warning UI both consume. `unknowns` is empty if everything checks
// out; otherwise each entry has the offending method, its line number,
// and suggested replacements.
export function validateGeneratedCode(code) {
  const calls = extractGeoCalls(code);
  const known = getKnownGeoMethods();
  const unknowns = [];
  const seen = new Set();
  for (const call of calls) {
    if (known.has(call.method)) continue;
    if (seen.has(call.method)) continue;
    seen.add(call.method);
    unknowns.push({
      method: call.method,
      line: call.line,
      suggestions: suggestSimilarMethods(call.method)
    });
  }
  return { ok: unknowns.length === 0, unknowns, totalCalls: calls.length };
}

// Test seam.
export function _clearKnownCacheForTests() {
  cachedKnown = null;
}
