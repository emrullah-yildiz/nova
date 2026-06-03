import { describe, it, expect } from 'vitest';
import {
  DataTree,
  pathKey,
  parsePath,
  isDataTree,
  toTree,
  toArray
} from '../../src/core/data-tree.js';

describe('pathKey / parsePath', () => {
  it('formats integer arrays as Grasshopper-style keys', () => {
    expect(pathKey([0])).toBe('{0}');
    expect(pathKey([0, 1, 2])).toBe('{0;1;2}');
  });

  it('normalizes string and number inputs', () => {
    expect(pathKey('{0;1}')).toBe('{0;1}');
    expect(pathKey(' { 0 ; 1 } ')).toBe('{0;1}');
    expect(pathKey(3)).toBe('{3}');
  });

  it('collapses empty/invalid paths to the root {0}', () => {
    expect(pathKey([])).toBe('{0}');
    expect(pathKey('{}')).toBe('{0}');
    expect(pathKey(undefined)).toBe('{0}');
  });

  it('parsePath round-trips integer arrays', () => {
    expect(parsePath('{2;0;3}')).toEqual([2, 0, 3]);
    expect(parsePath([1, 2])).toEqual([1, 2]);
  });
});

describe('DataTree shape and methods', () => {
  it('exposes the contracted shape', () => {
    const t = new DataTree();
    expect(t._type).toBe('DataTree');
    expect(t.branches instanceof Map).toBe(true);
    expect(Array.isArray(t.paths)).toBe(true);
  });

  it('add creates branches and keeps paths in sync', () => {
    const t = new DataTree();
    t.add([0], ['a', 'b']);
    t.add([1], ['c']);
    expect(t.branchCount()).toBe(2);
    expect(t.pathList()).toEqual(['{0}', '{1}']);
    expect(t.get([0])).toEqual(['a', 'b']);
    expect(t.get('{1}')).toEqual(['c']);
  });

  it('add appends to an existing branch without duplicating the path', () => {
    const t = new DataTree();
    t.add([0], ['a']);
    t.add([0], ['b']);
    expect(t.branchCount()).toBe(1);
    expect(t.get([0])).toEqual(['a', 'b']);
  });

  it('add promotes a single value to a one-item list', () => {
    const t = new DataTree();
    t.add([0], 'solo');
    expect(t.get([0])).toEqual(['solo']);
  });

  it('get returns undefined for a missing branch', () => {
    const t = new DataTree();
    expect(t.get([9])).toBeUndefined();
  });

  it('flattenedItems concatenates all branches in path order', () => {
    const t = new DataTree();
    t.add([1], ['c', 'd']);
    t.add([0], ['a', 'b']);
    // path order is insertion order: {1} then {0}
    expect(t.flattenedItems()).toEqual(['c', 'd', 'a', 'b']);
  });

  it('pathList returns a defensive copy', () => {
    const t = new DataTree();
    t.add([0], ['a']);
    const list = t.pathList();
    list.push('{99}');
    expect(t.pathList()).toEqual(['{0}']);
  });
});

describe('isDataTree', () => {
  it('detects DataTree instances and rejects others', () => {
    expect(isDataTree(new DataTree())).toBe(true);
    expect(isDataTree([1, 2, 3])).toBe(false);
    expect(isDataTree(null)).toBe(false);
    expect(isDataTree({ _type: 'DataTree' })).toBe(false);
  });
});

describe('bridges: toTree / toArray (backward compatibility)', () => {
  it('toTree(plainArray) then toArray round-trips to the original array', () => {
    const original = [1, 2, 3, 'x'];
    const tree = toTree(original);
    expect(isDataTree(tree)).toBe(true);
    expect(toArray(tree)).toEqual(original);
  });

  it('toTree wraps a plain array into a single root branch', () => {
    const tree = toTree([10, 20]);
    expect(tree.branchCount()).toBe(1);
    expect(tree.get([0])).toEqual([10, 20]);
  });

  it('toTree passes an existing tree through unchanged', () => {
    const tree = new DataTree();
    tree.add([0], ['a']);
    expect(toTree(tree)).toBe(tree);
  });

  it('toTree of a scalar makes a one-item branch', () => {
    const tree = toTree(42);
    expect(tree.get([0])).toEqual([42]);
  });

  it('toTree of null/undefined makes an empty tree', () => {
    expect(toTree(undefined).branchCount()).toBe(0);
    expect(toTree(null).branchCount()).toBe(0);
  });

  it('toArray leaves a plain array unchanged (flat lists keep flowing)', () => {
    const arr = [1, 2, 3];
    expect(toArray(arr)).toBe(arr);
  });

  it('toArray handles scalars and nullish values', () => {
    expect(toArray(7)).toEqual([7]);
    expect(toArray(undefined)).toEqual([]);
    expect(toArray(null)).toEqual([]);
  });
});
