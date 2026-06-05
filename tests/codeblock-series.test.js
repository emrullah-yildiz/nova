// Tests for CodeBlock DSL series shorthand edge cases.
//
// The three syntaxes originally reported as producing no output:
//   1..10..2   start..end..step
//   1..10..#2  start..end..#count
//   1..#2..10  start..#count..end
//
// All three must produce a real JS array of numbers (not undefined, [object Object], or NaN).
// See fix in src/runtime/codeblock-syntax.js (mark2==='#' three-token case).

import { describe, it, expect } from 'vitest';
import { desugarSeries } from '../src/runtime/codeblock-syntax.js';
import { evalCodeBlock } from '../src/runtime/codeblock-eval.js';

describe('CodeBlock series shorthand — all three forms produce output', () => {
  // ── desugarSeries: correct desugaring ───────────────────────────────────

  describe('desugarSeries', () => {
    it('1..10..2 (start..end..step) → [1,3,5,7,9]', () => {
      expect(desugarSeries('a = 1..10..2')).toBe('a = [1, 3, 5, 7, 9]');
    });

    it('1..10..#2 (start..end..#count) → [1, 10] — two evenly spaced from 1 to 10', () => {
      expect(desugarSeries('a = 1..10..#2')).toBe('a = [1, 10]');
    });

    it('1..#2..10 (start..#count..end) → [1, 10] — same as above, alternate order', () => {
      // Bug was: treated 10 as step → [1, 11]. Fix: treat 10 as end → [1, 10].
      expect(desugarSeries('a = 1..#2..10')).toBe('a = [1, 10]');
    });

    it('0..#5..10 → [0, 2.5, 5, 7.5, 10] — 5 evenly spaced from 0 to 10', () => {
      expect(desugarSeries('a = 0..#5..10')).toBe('a = [0, 2.5, 5, 7.5, 10]');
    });

    it('0..#3..6 → [0, 3, 6] — 3 evenly spaced from 0 to 6', () => {
      expect(desugarSeries('a = 0..#3..6')).toBe('a = [0, 3, 6]');
    });

    it('10..#3..0 → [10, 5, 0] — 3 evenly spaced from 10 down to 0', () => {
      expect(desugarSeries('a = 10..#3..0')).toBe('a = [10, 5, 0]');
    });
  });

  // ── evalCodeBlock: full pipeline produces real number arrays ───────────

  describe('evalCodeBlock end-to-end', () => {
    it('1..10..2 → output is [1,3,5,7,9]', () => {
      const { outputs, error } = evalCodeBlock('a = 1..10..2', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([1, 3, 5, 7, 9]);
    });

    it('1..10..#2 → output is [1, 10]', () => {
      const { outputs, error } = evalCodeBlock('a = 1..10..#2', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([1, 10]);
    });

    it('1..#2..10 → output is [1, 10] (not [1, 11] — the old bug)', () => {
      const { outputs, error } = evalCodeBlock('a = 1..#2..10', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([1, 10]);
      // Regression: old (wrong) behavior was [1, 11].
      expect(outputs.a).not.toContain(11);
    });

    it('outputs contain only real numbers — no NaN or [object Object]', () => {
      const forms = ['a = 1..10..2', 'a = 1..10..#2', 'a = 1..#2..10'];
      for (const code of forms) {
        const { outputs, error } = evalCodeBlock(code, {});
        expect(error).toBeNull();
        expect(Array.isArray(outputs.a)).toBe(true);
        for (const v of outputs.a) {
          expect(typeof v).toBe('number');
          expect(Number.isNaN(v)).toBe(false);
          expect(String(v)).not.toBe('[object Object]');
        }
      }
    });

    it('bare series (no assignment) 0..#3..6 → out = [0, 3, 6]', () => {
      const { outputs, error } = evalCodeBlock('0..#3..6', {});
      expect(error).toBeNull();
      const values = Object.values(outputs);
      expect(values.length).toBeGreaterThan(0);
      expect(Array.isArray(values[0])).toBe(true);
      expect(values[0]).toEqual([0, 3, 6]);
    });
  });
});
