import { FormulaEval } from '../src/core/formula-eval.js';

describe('FormulaEval', () => {
  it('returns raw numeric strings as non-formulas', () => {
    const result = FormulaEval.eval('42');
    expect(result.value).toBe(42);
    expect(result.isFormula).toBe(false);
    expect(result.error).toBeNull();
  });

  it('evaluates arithmetic expressions', () => {
    const result = FormulaEval.eval('1 + 2 * 3 - 4 / 2');
    expect(result.value).toBe(5);
    expect(result.isFormula).toBe(true);
    expect(result.error).toBeNull();
  });

  it('evaluates functions and constants', () => {
    expect(FormulaEval.eval('sin(pi/2)').value).toBeCloseTo(1);
    expect(FormulaEval.eval('max(3, 7, 2)').value).toBe(7);
    expect(FormulaEval.eval('phi').value).toBeCloseTo(1.6180339887);
  });

  it('handles incomplete expressions gracefully', () => {
    const result = FormulaEval.eval('1 + (2 *');
    expect(result.value).toBe(1);
    expect(result.isFormula).toBe(true);
    expect(result.error).toBeNull();
  });
});
