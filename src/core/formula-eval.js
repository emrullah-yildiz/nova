const CONSTS = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
  phi: 1.6180339887,
  PHI: 1.6180339887,
  tau: Math.PI * 2,
  TAU: Math.PI * 2
};

const FUNCS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  rad: function(d) { return d * Math.PI / 180; },
  deg: function(r) { return r * 180 / Math.PI; },
  pow: Math.pow,
  sign: Math.sign,
  clamp: function(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
};

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < expr.length && expr[i+1] >= '0' && expr[i+1] <= '9')) {
      let num = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) { num += expr[i]; i++; }
      if (i < expr.length && (expr[i] === 'e' || expr[i] === 'E')) {
        num += expr[i++];
        if (i < expr.length && (expr[i] === '+' || expr[i] === '-')) { num += expr[i++]; }
        while (i < expr.length && expr[i] >= '0' && expr[i] <= '9') { num += expr[i++]; }
      }
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let id = '';
      while (i < expr.length && ((expr[i] >= 'a' && expr[i] <= 'z') || (expr[i] >= 'A' && expr[i] <= 'Z') || (expr[i] >= '0' && expr[i] <= '9') || expr[i] === '_')) {
        id += expr[i++];
      }
      tokens.push({ type: 'id', value: id });
      continue;
    }
    if ('+-*/%^(),'.indexOf(ch) >= 0) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    i++;
  }
  return tokens;
}

function parse(tokens) {
  let pos = 0;

  const peek = () => pos < tokens.length ? tokens[pos] : null;
  const next = () => tokens[pos++];

  function parseExpr() {
    let left = parseTerm();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parsePower();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = next().value;
      const right = parsePower();
      if (op === '*') left = left * right;
      else if (op === '/') left = right !== 0 ? left / right : 0;
      else left = right !== 0 ? left % right : 0;
    }
    return left;
  }

  function parsePower() {
    let base = parseUnary();
    while (peek() && peek().type === 'op' && peek().value === '^') {
      next();
      const exp = parseUnary();
      base = Math.pow(base, exp);
    }
    return base;
  }

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

  function parseAtom() {
    const t = peek();
    if (!t) return 0;
    if (t.type === 'num') { next(); return t.value; }
    if (t.type === 'id') {
      const id = next().value;
      if (peek() && peek().type === 'op' && peek().value === '(') {
        next();
        const args = [];
        if (!(peek() && peek().type === 'op' && peek().value === ')')) {
          args.push(parseExpr());
          while (peek() && peek().type === 'op' && peek().value === ',') { next(); args.push(parseExpr()); }
        }
        if (peek() && peek().type === 'op' && peek().value === ')') next();
        const fn = FUNCS[id];
        return fn ? fn.apply(null, args) : 0;
      }
      if (CONSTS[id] !== undefined) return CONSTS[id];
      return 0;
    }
    if (t.type === 'op' && t.value === '(') {
      next();
      const val = parseExpr();
      if (peek() && peek().type === 'op' && peek().value === ')') next();
      return val;
    }
    next();
    return 0;
  }

  const result = parseExpr();
  return isNaN(result) || !isFinite(result) ? 0 : result;
}

export const FormulaEval = {
  eval(expr) {
    if (expr === undefined || expr === null || expr === '') return { value: 0, isFormula: false, error: null };
    const trimmed = String(expr).trim();
    if (trimmed.toLowerCase() === 'auto') return { value: NaN, isFormula: false, error: null };
    if (trimmed.toLowerCase() === 'true') return { value: 1, isFormula: false, error: null };
    if (trimmed.toLowerCase() === 'false') return { value: 0, isFormula: false, error: null };
    const num = parseFloat(trimmed);
    if (String(num) === trimmed || (!isNaN(num) && trimmed.match(/^-?\d+\.?\d*$/))) {
      return { value: num, isFormula: false, error: null };
    }
    try {
      const tokens = tokenize(trimmed);
      if (tokens.length === 0) return { value: 0, isFormula: false, error: null };
      const result = parse(tokens);
      return { value: result, isFormula: true, error: null };
    } catch (e) {
      return { value: 0, isFormula: true, error: e.message };
    }
  }
};
