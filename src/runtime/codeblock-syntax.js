// CodeBlock series-syntax desugaring.
//
// A pure pre-pass that rewrites Nova's range/series shorthand into a plain Python
// list literal BEFORE the code reaches the runtime. The series shorthand is the
// `Custom.CodeBlock` convenience for "give me a list of numbers"; desugaring to a
// list literal means it runs on the existing Python runtime and produces an
// ordinary number list — consumable by every `List.*` node — WITHOUT introducing a
// third range concept (it is not a `List.Range`/`List.Sequence` clone; the `..`
// expression simply expands to the list those nodes would produce).
//
// Series forms (end is INCLUSIVE — the owner decision; this is the intentional
// divergence from `List.Range`'s exclusive end, documented in the node plan):
//
//   0..10        start..end, step = 1            → [0,1,…,10]
//   0..10..2     start..end..STEP                → [0,2,4,6,8,10]
//   0..10..#5    start..end..#COUNT              → 5 evenly spaced incl. ends
//                                                   → [0,2.5,5,7.5,10]
//   0..#5..2     start..#COUNT..step             → [0,2,4,6,8]
//
// Rule: `#` prefixes a COUNT token; a plain number is end-or-step by POSITION
// (2nd token = end, 3rd token = step — unless `#` flips the 2nd into a count).
//
// Only `..` expressions whose operands are numeric literals (optionally signed,
// optionally `#`-prefixed) are transformed; everything else in the code is left
// byte-for-byte intact. Python has no `..` operator, so a `..`-free cell is
// untouched and this never collides with valid Python. Pure — returns the new
// code string.

// One series operand: optional leading `#` (count marker) then a signed number
// (int or float). Captured as: [#?][sign?]<digits>[.<digits>]?
const NUM = '-?\\d+(?:\\.\\d+)?';
// A full series expression: A..B or A..B..C, where each of B/C may carry `#`.
// The first operand (A = start) never carries `#`.
const SERIES_RE = new RegExp(
  '(' + NUM + ')' +                       // 1: start
  '\\.\\.' +
  '(#?)(' + NUM + ')' +                   // 2: count-marker on 2nd, 3: 2nd value
  '(?:\\.\\.(#?)(' + NUM + '))?',         // 4: count-marker on 3rd, 5: 3rd value
  'g'
);

// Builds the inclusive list for a given start/end/step. `count` (when provided)
// overrides step: evenly spaced incl. both ends.
function buildList(start, opts) {
  const values = [];
  if (opts.count != null) {
    const n = Math.round(opts.count);
    if (n <= 0) return [];
    if (n === 1) return [start];
    const end = opts.end;
    const step = (end - start) / (n - 1);
    for (let i = 0; i < n; i++) {
      values.push(round(start + step * i));
    }
    return values;
  }
  // step-driven, end inclusive
  const step = opts.step != null ? opts.step : 1;
  const end = opts.end;
  if (step === 0) return [start];
  if (step > 0) {
    // small epsilon so a clean end (e.g. 0..10..2 → include 10) is not dropped to
    // floating-point error.
    for (let v = start; v <= end + 1e-9; v = round(v + step)) values.push(v);
  } else {
    for (let v = start; v >= end - 1e-9; v = round(v + step)) values.push(v);
  }
  return values;
}

// Trim floating-point noise (0.30000000000000004 → 0.3) without forcing ints.
function round(n) {
  const r = Math.round(n * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
}

function num(s) {
  return s.indexOf('.') >= 0 ? parseFloat(s) : parseInt(s, 10);
}

// Rewrites every series expression in `code` to a Python list literal. Forms with
// a count marker (`#`) on the 2nd token are count-by-start-end; `#` on the 3rd
// token is step-with-count; bare numbers are end/step by position.
export function desugarSeries(code) {
  if (typeof code !== 'string' || !code) return code;
  // Leave string-literal contents untouched: split on string spans, desugar only
  // the code spans. A simple tokeniser that respects ' and " (no f-strings here).
  return mapCodeSpans(code, (span) => span.replace(SERIES_RE, (match, startS, mark2, v2, mark3, v3) => {
    const start = num(startS);
    // Two-token form: A..B  (B may be #count → count from start with step 1? no —
    // `0..#5` alone is start..count which needs a step; without a 3rd token we
    // treat #count on the 2nd token as "count values stepping by 1 from start".)
    if (v3 === undefined) {
      if (mark2 === '#') {
        // start..#count → count consecutive values stepping by 1.
        return toLiteral(buildList(start, { count: num(v2), end: start + (num(v2) - 1) }));
      }
      // start..end, step 1, inclusive.
      return toLiteral(buildList(start, { end: num(v2), step: 1 }));
    }
    // Three-token form: A..B..C
    if (mark2 === '#') {
      // start..#count..step → count values from start, stepping by step.
      const count = num(v2);
      const step = num(v3);
      const list = [];
      for (let i = 0; i < count; i++) list.push(round(start + step * i));
      return toLiteral(list);
    }
    if (mark3 === '#') {
      // start..end..#count → count values evenly spaced incl. ends.
      return toLiteral(buildList(start, { end: num(v2), count: num(v3) }));
    }
    // start..end..step → step-driven, inclusive.
    return toLiteral(buildList(start, { end: num(v2), step: num(v3) }));
  }));
}

function toLiteral(values) {
  return '[' + values.join(', ') + ']';
}

// Applies `fn` to each non-string span of `code`, leaving string literals intact.
function mapCodeSpans(code, fn) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      // consume the string literal verbatim
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === ch) { j++; break; }
        j++;
      }
      out += code.slice(i, j);
      i = j;
    } else {
      // consume up to the next quote OR a comment-start `#`. A `#` immediately
      // preceded by `..` is the series count marker (e.g. 0..10..#5), NOT a comment,
      // so we keep scanning through it; any other `#` begins a Python comment and the
      // rest of the line is copied verbatim (never desugared).
      let j = i;
      while (j < n && code[j] !== '"' && code[j] !== "'") {
        if (code[j] === '#' && !(code[j - 1] === '.' && code[j - 2] === '.')) break;
        j++;
      }
      out += fn(code.slice(i, j));
      if (j < n && code[j] === '#') {
        let k = j;
        while (k < n && code[k] !== '\n') k++;
        out += code.slice(j, k); // comment text, verbatim
        i = k;
      } else {
        i = j;
      }
    }
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.CodeBlockSyntax = { desugarSeries };
}
