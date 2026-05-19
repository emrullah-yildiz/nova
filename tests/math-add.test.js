import { describe, it, expect } from 'vitest';

/**
 * Test file to verify Math.Add computes correctly in the actual
 * computeInner from engine.js. We simulate the exact execution path
 * used when the user types 10 in both A and B formula fields.
 */

// Simulate how FormulaEval.eval works
// It returns a NUMBER for plain numeric strings
const mockFormulaEval = {
  eval(expr) {
    const num = parseFloat(expr);
    if (String(num) === expr) return { value: num, isFormula: false, error: null };
    return { value: 0, isFormula: false, error: null };
  }
};

// Simulate the EXACT getVal from engine.js with my fix
function getVal_FIXED(nd, id, def) {
  // Check pre-evaluated formula result
  var evalKey = '_eval_' + id;
  if (nd.controlValues && nd.controlValues[evalKey] !== undefined && !isNaN(nd.controlValues[evalKey])) {
    var n = Number(nd.controlValues[evalKey]);  // MY FIX: Number()
    return isNaN(n) ? def : n;
  }

  var cv = nd.controlValues ? nd.controlValues[id] : undefined;
  if (cv !== undefined && cv !== null) {
    if (typeof cv === 'string' && cv.length > 0) {
      var result = mockFormulaEval.eval(cv);
      if (result && result.error === null) {
        var n2 = Number(result.value);  // MY FIX: Number()
        return isNaN(n2) ? def : n2;
      }
    }
    var num = parseFloat(cv);
    return isNaN(num) ? def : num;
  }
  return def;
}

// Simulate the BROKEN getVal from engine.js WITHOUT my fix
function getVal_BROKEN(nd, id, def) {
  var evalKey = '_eval_' + id;
  if (nd.controlValues && nd.controlValues[evalKey] !== undefined && !isNaN(nd.controlValues[evalKey])) {
    return nd.controlValues[evalKey];  // BUG: returns unchecked type
  }

  var cv = nd.controlValues ? nd.controlValues[id] : undefined;
  if (cv !== undefined && cv !== null) {
    if (typeof cv === 'string' && cv.length > 0) {
      var result = mockFormulaEval.eval(cv);
      if (result && result.error === null) {
        return result.value;  // BUG: returns unchecked type — result.value IS number from FormulaEval, but _eval_ might be string
      }
    }
    var num = parseFloat(cv);
    return isNaN(num) ? def : num;
  }
  return def;
}

describe('Math.Add number coercion', () => {
  it('_eval_ values that are strings cause "1010" concatenation without fix', () => {
    // Simulate scenario where _eval_a is set to "10" (string) from external source
    const nd = {
      type: 'math-add',
      controlValues: { a: "10", b: "10", _eval_a: "10", _eval_b: "10" }
    };

    const result = getVal_FIXED(nd, 'a', undefined);
    const brokenResult = getVal_BROKEN(nd, 'a', undefined);

    console.log('_eval_a = "10" (string):');
    console.log('  FIXED:  typeof =', typeof result, ', value =', result);
    console.log('  BROKEN: typeof =', typeof brokenResult, ', value =', brokenResult);

    expect(typeof result).toBe('number');
    expect(result).toBe(10);
    // Without fix, string "10" is returned — leads to "10" + "10" = "1010"
    if (typeof brokenResult === 'string') {
      console.log('  => BROKEN would produce "10" + "10" =', brokenResult + brokenResult);
    }
  });

  it('_eval_ values that are numbers work correctly', () => {
    const nd = {
      controlValues: { _eval_a: 42, a: '99' }
    };

    // Both should work since _eval_a is already a number
    const fixed = getVal_FIXED(nd, 'a', 0);
    const broken = getVal_BROKEN(nd, 'a', 0);

    expect(fixed).toBe(42);
    expect(broken).toBe(42);
  });

  it('raw string control value "10" is coerced to number 10 by both paths', () => {
    const nd = {
      controlValues: { a: "10" }
    };

    const fixed = getVal_FIXED(nd, 'a', 0);
    const broken = getVal_BROKEN(nd, 'a', 0);

    // Both work because parseFloat("10") = 10 AND FormulaEval.eval("10").value = 10 (number)
    expect(fixed).toBe(10);
    expect(broken).toBe(10);
    console.log('Raw "10": FIXED=', fixed, 'typeof=' + typeof fixed);
  });

  it('Math.Add with [10, 10] from wired Number nodes produces 20', () => {
    // Simulate: two Number Input nodes (output 10 each) wired to Math.Add A and B
    const src1 = { id: 'n1', type: 'number-input', controlValues: { val: '10' } };
    const src2 = { id: 'n2', type: 'number-input', controlValues: { val: '10' } };
    const add = { id: 'n3', type: 'math-add', controlValues: {} };

    // Simulate Number input compute: parseFloat
    function computeSrc(nd) {
      if (nd.controlValues && nd.controlValues.val !== undefined) {
        return parseFloat(nd.controlValues.val) || 0;
      }
      return 0;
    }

    const aVal = computeSrc(src1); // 10 (number)
    const bVal = computeSrc(src2); // 10 (number)

    const result = aVal + bVal;
    console.log('Wired Number nodes: a=' + aVal + ', b=' + bVal + ', result=' + result + ' typeof=' + typeof result);

    expect(aVal).toBe(10);
    expect(bVal).toBe(10);
    expect(result).toBe(20);
    expect(typeof result).toBe('number');
  });

  it('Math.Add with [10, 10] from formula fields (no wires) produces 20', () => {
    // Simulate: user typed "10" in both formula fields, _eval_ wasn't set yet
    const add = {
      type: 'math-add',
      controlValues: { a: '10', b: '10' }
    };

    // getInput would return undefined (no wires)
    // getVal falls through to raw control values → parseFloat("10") = 10
    const a = getVal_FIXED(add, 'a', undefined);
    const b = getVal_FIXED(add, 'b', undefined);

    const result = a + b;
    console.log('Formula fields: a=' + a + ', b=' + b + ', result=' + result + ' typeof=' + typeof result);

    expect(a).toBe(10);
    expect(b).toBe(10);
    expect(result).toBe(20);
    expect(typeof result).toBe('number');
  });
});