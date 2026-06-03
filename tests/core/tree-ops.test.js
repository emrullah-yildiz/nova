import { describe, it, expect } from 'vitest';
import { DataTree, toArray } from '../../src/core/data-tree.js';
import {
  graft,
  flatten,
  simplify,
  transpose,
  partition,
  groupByKey,
  sortByKey
} from '../../src/core/tree-ops.js';

function treeOf(entries) {
  const t = new DataTree();
  entries.forEach(function ([path, items]) {
    t.add(path, items);
  });
  return t;
}

describe('graft', () => {
  it('produces one branch per item', () => {
    const t = treeOf([[[0], ['a', 'b', 'c']]]);
    const g = graft(t);
    expect(g.branchCount()).toBe(3);
    expect(g.get([0, 0])).toEqual(['a']);
    expect(g.get([0, 1])).toEqual(['b']);
    expect(g.get([0, 2])).toEqual(['c']);
  });

  it('does not mutate the input tree', () => {
    const t = treeOf([[[0], ['a', 'b']]]);
    graft(t);
    expect(t.branchCount()).toBe(1);
    expect(t.get([0])).toEqual(['a', 'b']);
  });

  it('grafts a plain array via the bridge', () => {
    const g = graft([1, 2]);
    expect(g.branchCount()).toBe(2);
    expect(g.get([0, 0])).toEqual([1]);
    expect(g.get([0, 1])).toEqual([2]);
  });
});

describe('flatten', () => {
  it('collapses multiple paths into one branch', () => {
    const t = treeOf([
      [[0], ['a', 'b']],
      [[1], ['c']],
      [[2, 5], ['d', 'e']]
    ]);
    const f = flatten(t);
    expect(f.branchCount()).toBe(1);
    expect(f.get([0])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('does not mutate the input', () => {
    const t = treeOf([[[0], ['a']], [[1], ['b']]]);
    flatten(t);
    expect(t.branchCount()).toBe(2);
  });
});

describe('simplify', () => {
  it('removes a shared leading path level', () => {
    const t = treeOf([
      [[5, 0], ['a']],
      [[5, 1], ['b']]
    ]);
    const s = simplify(t);
    expect(s.pathList()).toEqual(['{0}', '{1}']);
    expect(s.get([0])).toEqual(['a']);
    expect(s.get([1])).toEqual(['b']);
  });

  it('removes a shared trailing path level', () => {
    const t = treeOf([
      [[0, 7], ['a']],
      [[1, 7], ['b']]
    ]);
    const s = simplify(t);
    expect(s.pathList()).toEqual(['{0}', '{1}']);
  });

  it('collapses a single-branch tree to the root', () => {
    const t = treeOf([[[4, 9], ['a', 'b']]]);
    const s = simplify(t);
    expect(s.pathList()).toEqual(['{0}']);
    expect(s.get([0])).toEqual(['a', 'b']);
  });

  it('keeps distinguishing middle levels', () => {
    const t = treeOf([
      [[3, 0, 8], ['a']],
      [[3, 1, 8], ['b']]
    ]);
    const s = simplify(t);
    expect(s.pathList()).toEqual(['{0}', '{1}']);
  });
});

describe('transpose', () => {
  it('flips a 2x3 tree into a 3x2 tree', () => {
    // 2 rows of 3, grafted into a 2-level tree: {row;col} = [value]
    const t = treeOf([
      [[0, 0], [1]], [[0, 1], [2]], [[0, 2], [3]],
      [[1, 0], [4]], [[1, 1], [5]], [[1, 2], [6]]
    ]);
    const flipped = transpose(t);
    // Now indexed {col;row}: 3 first-level cols, each with 2 rows.
    const cols = new Set(flipped.pathList().map((k) => k.replace(/[{}]/g, '').split(';')[0]));
    expect(cols.size).toBe(3);
    expect(flipped.branchCount()).toBe(6);
    expect(flipped.get([0, 0])).toEqual([1]); // was {0;0}
    expect(flipped.get([0, 1])).toEqual([4]); // was {1;0}
    expect(flipped.get([2, 0])).toEqual([3]); // was {0;2}
    expect(flipped.get([2, 1])).toEqual([6]); // was {1;2}
  });

  it('transpose is its own inverse for a 2-level tree', () => {
    const t = treeOf([
      [[0, 0], [1]], [[0, 1], [2]],
      [[1, 0], [3]], [[1, 1], [4]]
    ]);
    const back = transpose(transpose(t));
    expect(back.get([0, 0])).toEqual([1]);
    expect(back.get([0, 1])).toEqual([2]);
    expect(back.get([1, 0])).toEqual([3]);
    expect(back.get([1, 1])).toEqual([4]);
  });

  it('merges items whose flipped paths coincide', () => {
    const t = treeOf([
      [[0, 1], ['a']],
      [[1, 0], ['b']]
    ]);
    // both flip to {1;0} and {0;1}? {0;1}->{1;0}, {1;0}->{0;1} : no merge here
    const flipped = transpose(t);
    expect(flipped.get([1, 0])).toEqual(['a']);
    expect(flipped.get([0, 1])).toEqual(['b']);
  });

  it('does not mutate the input', () => {
    const t = treeOf([[[0, 1], ['a']]]);
    transpose(t);
    expect(t.get([0, 1])).toEqual(['a']);
  });
});

describe('partition', () => {
  it('chunks a flat array into branches of the given size', () => {
    const p = partition([1, 2, 3, 4, 5], 2);
    expect(p.branchCount()).toBe(3);
    expect(p.get([0])).toEqual([1, 2]);
    expect(p.get([1])).toEqual([3, 4]);
    expect(p.get([2])).toEqual([5]);
  });

  it('chunks a tree by its flattened items', () => {
    const t = treeOf([[[0], [1, 2]], [[1], [3, 4]]]);
    const p = partition(t, 3);
    expect(p.get([0])).toEqual([1, 2, 3]);
    expect(p.get([1])).toEqual([4]);
  });

  it('puts everything in one branch for size <= 0', () => {
    const p = partition([1, 2, 3], 0);
    expect(p.branchCount()).toBe(1);
    expect(p.get([0])).toEqual([1, 2, 3]);
  });
});

describe('groupByKey', () => {
  it('buckets items into separate branches by key', () => {
    const items = [
      { team: 'a', n: 1 },
      { team: 'b', n: 2 },
      { team: 'a', n: 3 },
      { team: 'b', n: 4 }
    ];
    const g = groupByKey(items, (item) => item.team);
    expect(g.branchCount()).toBe(2);
    // first-seen key order: 'a' -> {0}, 'b' -> {1}
    expect(g.get([0]).map((x) => x.n)).toEqual([1, 3]);
    expect(g.get([1]).map((x) => x.n)).toEqual([2, 4]);
  });

  it('handles a single key (one branch)', () => {
    const g = groupByKey([1, 3, 5], (n) => n % 2);
    expect(g.branchCount()).toBe(1);
    expect(g.get([0])).toEqual([1, 3, 5]);
  });

  it('returns an empty tree for empty input', () => {
    expect(groupByKey([], (x) => x).branchCount()).toBe(0);
  });
});

describe('sortByKey', () => {
  it('sorts numerically by computed key', () => {
    expect(sortByKey([3, 1, 2], (n) => n)).toEqual([1, 2, 3]);
  });

  it('is stable for equal keys', () => {
    const items = [
      { id: 'a', k: 1 },
      { id: 'b', k: 1 },
      { id: 'c', k: 0 }
    ];
    const sorted = sortByKey(items, (x) => x.k);
    expect(sorted.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input array', () => {
    const arr = [3, 1, 2];
    sortByKey(arr, (n) => n);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe('flat-list backward compatibility through ops', () => {
  it('a flat array survives toArray(flatten(array))', () => {
    const arr = [1, 2, 3];
    expect(toArray(flatten(arr))).toEqual(arr);
  });
});
