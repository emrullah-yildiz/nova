import { describe, it, expect } from 'vitest';
import { executeReplicated } from '../src/core/lacing.js';
import { executeWithLacing } from '../src/nodes/runtimeAdapter.js';

// ──────────────────────────────────────────────────────────────────────────
// Nested-list (list-of-list) replication — Dynamo style.
//
// A nested list fed to a scalar port fans all the way down, and the output
// mirrors the input's nesting depth. shortest/longest recurse; scalars
// broadcast at every level.
// ──────────────────────────────────────────────────────────────────────────

const ADD_INPUTS = [{ id: 'a' }, { id: 'b' }];
const ADD_OUT = ['result'];
const add = (inp) => ({ result: inp.a + inp.b });

describe('executeReplicated — recursive replication', () => {
  it('depth-2 list on one port mirrors nesting; scalar broadcasts', () => {
    const r = executeReplicated(ADD_INPUTS, { a: [[1, 2], [3, 4]], b: 10 }, 'shortest', ADD_OUT, add);
    expect(r.result).toEqual([[11, 12], [13, 14]]);
  });

  it('depth-3 nesting is preserved', () => {
    const r = executeReplicated(ADD_INPUTS, { a: [[[1], [2]], [[3]]], b: 100 }, 'shortest', ADD_OUT, add);
    expect(r.result).toEqual([[[101], [102]], [[103]]]);
  });

  it('two nested lists zip level by level (shortest)', () => {
    const r = executeReplicated(ADD_INPUTS, { a: [[1, 2], [3, 4]], b: [10, 20] }, 'shortest', ADD_OUT, add);
    // level 1 zips a-rows with b-scalars: row0 with 10, row1 with 20
    expect(r.result).toEqual([[11, 12], [23, 24]]);
  });

  it('longest recycles the last element at the nested level', () => {
    const r = executeReplicated(ADD_INPUTS, { a: [[1, 2, 3]], b: [[10]] }, 'longest', ADD_OUT, add);
    expect(r.result).toEqual([[11, 12, 13]]); // b's single 10 recycled across a's three
  });

  it('a flat list still produces a flat result (no over-nesting)', () => {
    const r = executeReplicated(ADD_INPUTS, { a: [1, 2, 3], b: 10 }, 'shortest', ADD_OUT, add);
    expect(r.result).toEqual([11, 12, 13]);
  });

  it('multi-output nodes nest every output', () => {
    const inputs = [{ id: 'a' }, { id: 'b' }];
    const outs = ['sum', 'diff'];
    const fn = (i) => ({ sum: i.a + i.b, diff: i.a - i.b });
    const r = executeReplicated(inputs, { a: [[1, 2], [3, 4]], b: 1 }, 'shortest', outs, fn);
    expect(r.sum).toEqual([[2, 3], [4, 5]]);
    expect(r.diff).toEqual([[0, 1], [2, 3]]);
  });
});

describe('executeWithLacing — nested lists end to end', () => {
  const addNode = {
    type: 'test.nestedAdd',
    inputs: [{ id: 'a', type: 'number' }, { id: 'b', type: 'number' }],
    outputs: [{ id: 'result', type: 'number' }],
    execute: (ctx, i) => ({ result: Number(i.a) + Number(i.b) })
  };

  it('fans a list-of-lists through a real node and mirrors the structure', () => {
    const out = executeWithLacing(
      addNode, {}, { a: [[1, 2], [3, 4]], b: 10 }, {}, { type: 'test.nestedAdd', controlValues: {} }
    );
    expect(out.result).toEqual([[11, 12], [13, 14]]);
  });

  it('still handles a plain single list (regression)', () => {
    const out = executeWithLacing(
      addNode, {}, { a: [1, 2, 3], b: 10 }, {}, { type: 'test.nestedAdd', controlValues: {} }
    );
    expect(out.result).toEqual([11, 12, 13]);
  });

  it('still handles all-scalar inputs (regression)', () => {
    const out = executeWithLacing(
      addNode, {}, { a: 4, b: 6 }, {}, { type: 'test.nestedAdd', controlValues: {} }
    );
    expect(out.result).toBe(10);
  });
});
