// Tests for CodeBlock DSL series shorthand — all four forms.
//
// Syntax table (end inclusive throughout):
//   start..end              → step=1            e.g. 0..5  → [0,1,2,3,4,5]
//   start..end..step        → step-driven        e.g. 0..10..2 → [0,2,4,6,8,10]
//   start..step..#count     → count+1 values     e.g. 0..10..#2 → [0,10,20]
//   start..#amount..end     → evenly-spaced      e.g. 0..#5..10 → [0,2.5,5,7.5,10]
//
// AC-1  0..10..2   → [0,2,4,6,8,10]                 (existing form, no regression)
// AC-2  0..5       → [0,1,2,3,4,5]                  (existing two-token form, no regression)
// AC-3  0..10..#2  → [0,10,20]                      (NEW: start..step..#count)
// AC-4  0..5..#3   → [0,5,10,15]                    (NEW: start..step..#count)
// AC-5  0..#5..10  → [0,2.5,5,7.5,10]               (start..#amount..end, 5 values)
// AC-6  1..#3..7   → [1,4,7]                        (start..#amount..end, 3 values)

import { describe, it, expect } from 'vitest';
import { desugarSeries } from '../src/runtime/codeblock-syntax.js';
import { evalCodeBlock } from '../src/runtime/codeblock-eval.js';

describe('CodeBlock series shorthand — all four syntax forms', () => {

  // ── desugarSeries: correct token expansion ──────────────────────────────

  describe('desugarSeries — AC checks', () => {

    // AC-1: existing start..end..step unchanged
    it('AC-1  0..10..2  (start..end..step) → [0,2,4,6,8,10]', () => {
      expect(desugarSeries('a = 0..10..2')).toBe('a = [0, 2, 4, 6, 8, 10]');
    });

    // AC-2: existing two-token form unchanged
    it('AC-2  0..5  (start..end) → [0,1,2,3,4,5]', () => {
      expect(desugarSeries('a = 0..5')).toBe('a = [0, 1, 2, 3, 4, 5]');
    });

    // AC-3: NEW form — start..step..#count (# on LAST token)
    it('AC-3  0..10..#2  (start..step..#count) → [0,10,20]', () => {
      // step=10, count=2 → 3 values: 0, 10, 20
      expect(desugarSeries('a = 0..10..#2')).toBe('a = [0, 10, 20]');
    });

    // AC-4: NEW form — start..step..#count again
    it('AC-4  0..5..#3  (start..step..#count) → [0,5,10,15]', () => {
      // step=5, count=3 → 4 values: 0, 5, 10, 15
      expect(desugarSeries('a = 0..5..#3')).toBe('a = [0, 5, 10, 15]');
    });

    // AC-5: existing start..#amount..end (# on MIDDLE token), 5 values
    it('AC-5  0..#5..10  (start..#amount..end) → [0,2.5,5,7.5,10]', () => {
      expect(desugarSeries('a = 0..#5..10')).toBe('a = [0, 2.5, 5, 7.5, 10]');
    });

    // AC-6: existing start..#amount..end, 3 values
    it('AC-6  1..#3..7  (start..#amount..end) → [1,4,7]', () => {
      expect(desugarSeries('a = 1..#3..7')).toBe('a = [1, 4, 7]');
    });

  });

  // ── desugarSeries — additional coverage ─────────────────────────────────

  describe('desugarSeries — additional edge cases', () => {

    it('start..step..#count with step=1 → [start, start+1, ..., start+count]', () => {
      // 2..1..#4 → [2,3,4,5,6]
      expect(desugarSeries('a = 2..1..#4')).toBe('a = [2, 3, 4, 5, 6]');
    });

    it('start..#amount..end symmetric with middle # — 10 down to 0', () => {
      // 10..#3..0 → [10, 5, 0]
      expect(desugarSeries('a = 10..#3..0')).toBe('a = [10, 5, 0]');
    });

    it('start..end step=1 (AC-2 variant with larger range)', () => {
      expect(desugarSeries('a = 1..4')).toBe('a = [1, 2, 3, 4]');
    });

    it('1..10..2 (start..end..step) → [1,3,5,7,9] — regression from prior tests', () => {
      expect(desugarSeries('a = 1..10..2')).toBe('a = [1, 3, 5, 7, 9]');
    });

    it('string literals are not desugared', () => {
      expect(desugarSeries('a = "0..10"')).toBe('a = "0..10"');
    });

    it('comment-only lines are passed through', () => {
      // The # in the comment must not be mistaken for a series marker.
      expect(desugarSeries('# 0..10..#2 comment')).toBe('# 0..10..#2 comment');
    });

  });

  // ── evalCodeBlock: full pipeline sanity ─────────────────────────────────

  describe('evalCodeBlock — full-pipeline AC checks', () => {

    it('AC-1  0..10..2 → [0,2,4,6,8,10]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..10..2', {});
      expect(error).toBeNull();
      expect(outputs.a).toEqual([0, 2, 4, 6, 8, 10]);
    });

    it('AC-2  0..5 → [0,1,2,3,4,5]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..5', {});
      expect(error).toBeNull();
      expect(outputs.a).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('AC-3  0..10..#2 → [0,10,20]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..10..#2', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([0, 10, 20]);
    });

    it('AC-4  0..5..#3 → [0,5,10,15]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..5..#3', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([0, 5, 10, 15]);
    });

    it('AC-5  0..#5..10 → [0,2.5,5,7.5,10]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..#5..10', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([0, 2.5, 5, 7.5, 10]);
    });

    it('AC-6  1..#3..7 → [1,4,7]', () => {
      const { outputs, error } = evalCodeBlock('a = 1..#3..7', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([1, 4, 7]);
    });

    it('all four forms produce only real numbers — no NaN or [object Object]', () => {
      const forms = [
        'a = 0..10..2',
        'a = 0..5',
        'a = 0..10..#2',
        'a = 0..#5..10',
      ];
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

  });

});
