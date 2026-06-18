// Tests for CodeBlock DSL series shorthand — all forms.
//
// `#` marks the COUNT token; the other non-start number's role depends on its
// position (Dynamo convention). Syntax table (end inclusive throughout):
//   start..end              → step=1             e.g. 0..5      → [0,1,2,3,4,5]
//   start..end..step        → step-driven        e.g. 0..10..2  → [0,2,4,6,8,10]
//   start..end..#count      → count evenly-spaced e.g. 0..1..#5 → [0,0.25,0.5,0.75,1]
//   start..#count..step     → count+1 step values e.g. 0..#5..1 → [0,1,2,3,4,5]
//
// AC-1  0..10..2   → [0,2,4,6,8,10]                 (existing form, no regression)
// AC-2  0..5       → [0,1,2,3,4,5]                  (existing two-token form, no regression)
// AC-3  0..1..#5   → [0,0.25,0.5,0.75,1]            (start..end..#count — count evenly spaced)
// AC-4  0..10..#2  → [0,10]                         (start..end..#count — 2 evenly spaced)
// AC-5  0..#5..1   → [0,1,2,3,4,5]                  (start..#count..step — step 1, 5 steps)
// AC-6  0..#2..10  → [0,10,20]                      (start..#count..step — step 10, 2 steps)

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

    // AC-3: start..end..#count (# on LAST token) — count evenly-spaced values.
    it('AC-3  0..1..#5  (start..end..#count) → [0,0.25,0.5,0.75,1]', () => {
      // count=5 evenly spaced from 0 to 1 inclusive.
      expect(desugarSeries('a = 0..1..#5')).toBe('a = [0, 0.25, 0.5, 0.75, 1]');
    });

    // AC-4: start..end..#count again — two evenly-spaced values (the endpoints).
    it('AC-4  0..10..#2  (start..end..#count) → [0,10]', () => {
      expect(desugarSeries('a = 0..10..#2')).toBe('a = [0, 10]');
    });

    // AC-5: start..#count..step (# on MIDDLE token) — step 1, count+1 values.
    it('AC-5  0..#5..1  (start..#count..step) → [0,1,2,3,4,5]', () => {
      expect(desugarSeries('a = 0..#5..1')).toBe('a = [0, 1, 2, 3, 4, 5]');
    });

    // AC-6: start..#count..step — step 10.
    it('AC-6  0..#2..10  (start..#count..step) → [0,10,20]', () => {
      expect(desugarSeries('a = 0..#2..10')).toBe('a = [0, 10, 20]');
    });

  });

  // ── desugarSeries — additional coverage ─────────────────────────────────

  describe('desugarSeries — additional edge cases', () => {

    it('start..#count..step with step=1 → [start, start+1, ..., start+count]', () => {
      // 2..#4..1 → [2,3,4,5,6]
      expect(desugarSeries('a = 2..#4..1')).toBe('a = [2, 3, 4, 5, 6]');
    });

    it('start..end..#count evenly spaced, descending — 10 down to 0', () => {
      // 10..0..#3 → [10, 5, 0]
      expect(desugarSeries('a = 10..0..#3')).toBe('a = [10, 5, 0]');
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

    it('AC-3  0..1..#5 → [0,0.25,0.5,0.75,1]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..1..#5', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('AC-4  0..10..#2 → [0,10]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..10..#2', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([0, 10]);
    });

    it('AC-5  0..#5..1 → [0,1,2,3,4,5]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..#5..1', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('AC-6  0..#2..10 → [0,10,20]', () => {
      const { outputs, error } = evalCodeBlock('a = 0..#2..10', {});
      expect(error).toBeNull();
      expect(Array.isArray(outputs.a)).toBe(true);
      expect(outputs.a).toEqual([0, 10, 20]);
    });

    it('all forms produce only real numbers — no NaN or [object Object]', () => {
      const forms = [
        'a = 0..10..2',
        'a = 0..5',
        'a = 0..1..#5',
        'a = 0..#5..1',
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
