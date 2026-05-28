import { describe, it, expect } from 'vitest';

/**
 * Test: Math.Add receiving a list as input.
 * Reproduces: List.Create [10, 10] wired to Math.Add A, Number(10) wired to B.
 * or: List.Create [10, 10] to both A and B.
 */

// Simulate the array-aware logic from engine.js computeInner
function mathAdd(a, b) {
  if (a === undefined || b === undefined) return undefined;
  if (Array.isArray(a) && Array.isArray(b)) {
    var addArr = []; for (var ai = 0; ai < Math.min(a.length, b.length); ai++) addArr.push(a[ai] + b[ai]);
    return addArr;
  }
  if (Array.isArray(a)) { var addArrA = []; for (var ai2 = 0; ai2 < a.length; ai2++) addArrA.push(a[ai2] + b); return addArrA; }
  if (Array.isArray(b)) { var addArrB = []; for (var bi2 = 0; bi2 < b.length; bi2++) addArrB.push(a + b[bi2]); return addArrB; }
  return a + b;
}

function mathSubtract(a, b) {
  if (a === undefined || b === undefined) return undefined;
  if (Array.isArray(a) && Array.isArray(b)) { var subArr = []; for (var si = 0; si < Math.min(a.length, b.length); si++) subArr.push(a[si] - b[si]); return subArr; }
  if (Array.isArray(a)) { var subArrA = []; for (var si2 = 0; si2 < a.length; si2++) subArrA.push(a[si2] - b); return subArrA; }
  if (Array.isArray(b)) { var subArrB = []; for (var si3 = 0; si3 < b.length; si3++) subArrB.push(a - b[si3]); return subArrB; }
  return a - b;
}

function mathMultiply(a, b) {
  if (a === undefined || b === undefined) return undefined;
  if (Array.isArray(a) && Array.isArray(b)) { var mulArr = []; for (var mi = 0; mi < Math.min(a.length, b.length); mi++) mulArr.push(a[mi] * b[mi]); return mulArr; }
  if (Array.isArray(a)) { var mulArrA = []; for (var mi2 = 0; mi2 < a.length; mi2++) mulArrA.push(a[mi2] * b); return mulArrA; }
  if (Array.isArray(b)) { var mulArrB = []; for (var mi3 = 0; mi3 < b.length; mi3++) mulArrB.push(a * b[mi3]); return mulArrB; }
  return a * b;
}

function mathDivide(a, b) {
  if (a === undefined || b === undefined || b === 0) return undefined;
  if (Array.isArray(a) && Array.isArray(b)) { var divArr = []; for (var di = 0; di < Math.min(a.length, b.length); di++) divArr.push(b[di] !== 0 ? a[di] / b[di] : undefined); return divArr; }
  if (Array.isArray(a)) { var divArrA = []; for (var di2 = 0; di2 < a.length; di2++) divArrA.push(a[di2] / b); return divArrA; }
  if (Array.isArray(b)) { var divArrB = []; for (var di3 = 0; di3 < b.length; di3++) divArrB.push(b[di3] !== 0 ? a / b[di3] : undefined); return divArrB; }
  return a / b;
}

describe('Math.Add with list inputs', () => {
  it('number [10] + list [10, 10] => [20, 20] (broadcast)', () => {
    const result = mathAdd(10, [10, 10]);
    console.log('10 + [10, 10] =>', JSON.stringify(result), 'typeof=', Array.isArray(result) ? typeof result[0] : typeof result);
    expect(result).toEqual([20, 20]);
    expect(typeof result[0]).toBe('number');
  });

  it('list [10, 10] + number [10] => [20, 20] (broadcast)', () => {
    const result = mathAdd([10, 10], 10);
    console.log('[10, 10] + 10 =>', JSON.stringify(result));
    expect(result).toEqual([20, 20]);
    expect(typeof result[0]).toBe('number');
  });

  it('list [10, 10] + list [10, 10] => [20, 20] (element-wise)', () => {
    const result = mathAdd([10, 10], [10, 10]);
    console.log('[10, 10] + [10, 10] =>', JSON.stringify(result));
    expect(result).toEqual([20, 20]);
    expect(typeof result[0]).toBe('number');
  });

  it('list [10, 10] + list [5, 15] => [15, 25] (element-wise)', () => {
    const result = mathAdd([10, 10], [5, 15]);
    console.log('[10, 10] + [5, 15] =>', JSON.stringify(result));
    expect(result).toEqual([15, 25]);
  });

  it('number + number => single number (backward compat)', () => {
    const result = mathAdd(10, 10);
    console.log('10 + 10 =>', result, 'typeof=', typeof result);
    expect(result).toBe(20);
    expect(typeof result).toBe('number');
  });
});

describe('Math.Subtract with list inputs', () => {
  it('number [10] - list [3, 5] => [7, 5] (broadcast)', () => {
    const result = mathSubtract(10, [3, 5]);
    expect(result).toEqual([7, 5]);
    expect(typeof result[0]).toBe('number');
  });

  it('list [10, 20] - number [5] => [5, 15] (broadcast)', () => {
    const result = mathSubtract([10, 20], 5);
    expect(result).toEqual([5, 15]);
  });

  it('list - list element-wise', () => {
    const result = mathSubtract([10, 20], [3, 5]);
    expect(result).toEqual([7, 15]);
  });

  it('number - number => single number (backward compat)', () => {
    const result = mathSubtract(10, 3);
    expect(result).toBe(7);
    expect(typeof result).toBe('number');
  });
});

describe('Math.Multiply with list inputs', () => {
  it('number * list broadcasts', () => {
    const result = mathMultiply(10, [2, 3]);
    expect(result).toEqual([20, 30]);
  });

  it('list * number broadcasts', () => {
    const result = mathMultiply([2, 3], 10);
    expect(result).toEqual([20, 30]);
  });

  it('list * list element-wise', () => {
    const result = mathMultiply([2, 3], [4, 5]);
    expect(result).toEqual([8, 15]);
  });

  it('number * number => single (backward compat)', () => {
    const result = mathMultiply(10, 10);
    expect(result).toBe(100);
    expect(typeof result).toBe('number');
  });
});

describe('Math.Divide with list inputs', () => {
  it('number / list broadcasts', () => {
    const result = mathDivide(10, [2, 4]);
    expect(result).toEqual([5, 2.5]);
  });

  it('list / number broadcasts', () => {
    const result = mathDivide([10, 20], 2);
    expect(result).toEqual([5, 10]);
  });

  it('list / list element-wise', () => {
    const result = mathDivide([10, 20], [2, 4]);
    expect(result).toEqual([5, 5]);
  });

  it('handles division by zero with undefined', () => {
    const result = mathDivide([10, 20], [0, 4]);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toBe(5);
  });

  it('number / number => single (backward compat)', () => {
    const result = mathDivide(10, 2);
    expect(result).toBe(5);
    expect(typeof result).toBe('number');
  });
});