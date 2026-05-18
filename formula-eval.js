// ═══════════════════════════════════════════════════
// FORMULA EVALUATOR — Safe math expression parser
// Supports: numbers, +, -, *, /, %, ^ (power)
//           sin, cos, tan, asin, acos, atan, atan2
//           sqrt, abs, floor, ceil, round, log, log10, exp
//           min, max, pi, e, phi (golden ratio)
//           parentheses, unary minus
// ═══════════════════════════════════════════════════

var FormulaEval = (function() {

  var CONSTS = { pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E, phi: 1.6180339887, PHI: 1.6180339887, tau: Math.PI * 2, TAU: Math.PI * 2 };

  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    log: Math.log, log10: Math.log10, exp: Math.exp,
    min: Math.min, max: Math.max,
    rad: function(d) { return d * Math.PI / 180; },
    deg: function(r) { return r * 180 / Math.PI; },
    pow: Math.pow,
    sign: Math.sign,
    clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  };

  // Tokenizer
  function tokenize(expr) {
    var tokens = [];
    var i = 0;
    while (i < expr.length) {
      var ch = expr[i];
      if (ch === ' ' || ch === '\t') { i++; continue; }
      // Number
      if (ch >= '0' && ch <= '9' || (ch === '.' && i + 1 < expr.length && expr[i+1] >= '0' && expr[i+1] <= '9')) {
        var num = '';
        while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) { num += expr[i]; i++; }
        // Scientific notation
        if (i < expr.length && (expr[i] === 'e' || expr[i] === 'E')) {
          num += expr[i]; i++;
          if (i < expr.length && (expr[i] === '+' || expr[i] === '-')) { num += expr[i]; i++; }
          while (i < expr.length && expr[i] >= '0' && expr[i] <= '9') { num += expr[i]; i++; }
        }
        tokens.push({ type: 'num', value: parseFloat(num) });
        continue;
      }
      // Identifier (function or constant)
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
        var id = '';
        while (i < expr.length && ((expr[i] >= 'a' && expr[i] <= 'z') || (expr[i] >= 'A' && expr[i] <= 'Z') || (expr[i] >= '0' && expr[i] <= '9') || expr[i] === '_')) { id += expr[i]; i++; }
        tokens.push({ type: 'id', value: id });
        continue;
      }
      // Operators and parens
      if ('+-*/%^(),'.indexOf(ch) >= 0) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      // Unknown — skip
      i++;
    }
    return tokens;
  }

  // Recursive descent parser
  function parse(tokens) {
    var pos = 0;

    function peek() { return pos < tokens.length ? tokens[pos] : null; }
    function next() { return tokens[pos++]; }

    // expr = term (('+' | '-') term)*
    function parseExpr() {
      var left = parseTerm();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        var op = next().value;
        var right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }

    // term = power (('*' | '/' | '%') power)*
    function parseTerm() {
      var left = parsePower();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
        var op = next().value;
        var right = parsePower();
        if (op === '*') left = left * right;
        else if (op === '/') left = right !== 0 ? left / right : 0;
        else left = right !== 0 ? left % right : 0;
      }
      return left;
    }

    // power = unary ('^' unary)*
    function parsePower() {
      var base = parseUnary();
      while (peek() && peek().type === 'op' && peek().value === '^') {
        next();
        var exp = parseUnary();
        base = Math.pow(base, exp);
      }
      return base;
    }

    // unary = '-' unary | '+' unary | atom
    function parseUnary() {
      if (peek() && peek().type === 'op' && peek().value === '-') {
        next();
        return -parseUnary();
      }
      if (peek() && peek().type === 'op' && peek().value === '+') {
        next();
        return parseUnary();
      }
      return parseAtom();
    }

    // atom = number | '(' expr ')' | func '(' args ')' | constant
    function parseAtom() {
      var t = peek();
      if (!t) return 0;

      // Number
      if (t.type === 'num') { next(); return t.value; }

      // Identifier: constant or function
      if (t.type === 'id') {
        var id = next().value;
        // Function call
        if (peek() && peek().type === 'op' && peek().value === '(') {
          next(); // consume '('
          var args = [];
          if (!(peek() && peek().type === 'op' && peek().value === ')')) {
            args.push(parseExpr());
            while (peek() && peek().type === 'op' && peek().value === ',') {
              next(); // consume ','
              args.push(parseExpr());
            }
          }
          if (peek() && peek().type === 'op' && peek().value === ')') next();
          var fn = FUNCS[id];
          if (fn) return fn.apply(null, args);
          return 0;
        }
        // Constant
        if (CONSTS[id] !== undefined) return CONSTS[id];
        return 0;
      }

      // Parenthesized expression
      if (t.type === 'op' && t.value === '(') {
        next();
        var val = parseExpr();
        if (peek() && peek().type === 'op' && peek().value === ')') next();
        return val;
      }

      next(); // skip unknown
      return 0;
    }

    var result = parseExpr();
    return isNaN(result) || !isFinite(result) ? 0 : result;
  }

  return {
    // Evaluate a formula string → number
    // Returns { value: number, isFormula: boolean, error: string|null }
    eval: function(expr) {
      if (expr === undefined || expr === null || expr === '') return { value: 0, isFormula: false, error: null };
      if (String(expr).trim().toLowerCase() === 'auto') return { value: NaN, isFormula: false, error: null };
      if (String(expr).trim().toLowerCase() === 'true') return { value: 1, isFormula: false, error: null };
      if (String(expr).trim().toLowerCase() === 'false') return { value: 0, isFormula: false, error: null };
      var s = String(expr).trim();
      // Plain number?
      var num = parseFloat(s);
      if (String(num) === s || (!isNaN(num) && s.match(/^-?\d+\.?\d*$/))) {
        return { value: num, isFormula: false, error: null };
      }
      // Formula
      try {
        var tokens = tokenize(s);
        if (tokens.length === 0) return { value: 0, isFormula: false, error: null };
        var result = parse(tokens);
        return { value: result, isFormula: true, error: null };
      } catch (e) {
        return { value: 0, isFormula: true, error: e.message };
      }
    }
  };
})();

window.FormulaEval = FormulaEval;
