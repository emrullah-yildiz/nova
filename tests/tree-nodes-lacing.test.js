import { describe, it, expect } from 'vitest';
import { treeNodes } from '../src/nodes/categories/tree.js';
import { isDataTree, DataTree } from '../src/core/data-tree.js';
import { executeWithLacing, resolveControls, resolveInputs } from '../src/nodes/runtimeAdapter.js';

// ──────────────────────────────────────────────────────────────────────────
// F-001 regression — the tree nodes must NOT auto-lace (fan per item) on their
// primary use case: a real flat list wired straight in.
//
// The earlier unit tests called execute() directly and so bypassed the engine's
// lacing layer entirely, which is exactly why the auto-lacing bug slipped past.
// These tests drive the nodes through the REAL engine path:
//
//   resolveInputs (single->one-item-list promotion)  ->
//   executeWithLacing (isAutoLaceable / fan decision) ->  execute()
//
// resolveInputs runs via a getInput(id) closure exactly as the engine wires it,
// so the 'list'-port promotion that wraps a DataTree into [tree] is exercised
// for real — proving unwrapTreeInput restores the DataTree case end-to-end.
// ──────────────────────────────────────────────────────────────────────────

const byType = (type) => treeNodes.find((n) => n.type === type);

// Mirror the engine: resolveInputs(getInput) then executeWithLacing. Returns the
// raw output object { [outputId]: value } that executeWithLacing produces. If the
// node had fanned (the F-001 bug), the output value would be a list instead of a
// single DataTree/flat list — which is exactly what the assertions below catch.
function runThroughEngine(node, inputs, controlValues = {}) {
  const inst = { type: node.type, controlValues };
  const getInput = (id) => inputs[id];
  const getVal = (id, raw) => raw;
  const controls = resolveControls(node, inst, getVal);
  const resolved = resolveInputs(node, inst, getInput, getVal, controls);
  return executeWithLacing(node, {}, resolved, controls, inst);
}

describe('tree nodes do not fan over a plain flat list (engine path)', () => {
  it('Tree.Graft([1,2,3]) yields ONE DataTree with 3 branches (not a list of trees)', () => {
    const { tree } = runThroughEngine(byType('Tree.Graft'), { data: [1, 2, 3] });
    // Had it fanned, `tree` would be an array of 3 DataTrees (isDataTree false).
    expect(isDataTree(tree), 'output must be one DataTree, not a fanned list').toBe(true);
    expect(tree.branchCount()).toBe(3);
    expect(tree.flattenedItems()).toEqual([1, 2, 3]);
  });

  it('Tree.Flatten([1,2,3,4]) yields the flat list, NOT [[1],[2],[3],[4]]', () => {
    const { list } = runThroughEngine(byType('Tree.Flatten'), { tree: [1, 2, 3, 4] });
    expect(list).toEqual([1, 2, 3, 4]);
  });

  it('Tree.Partition([1..5], size 2) yields 3 branches (not 5 fanned trees)', () => {
    const { tree } = runThroughEngine(byType('Tree.Partition'), { data: [1, 2, 3, 4, 5], size: 2 });
    expect(isDataTree(tree), 'output must be one DataTree, not a fanned list').toBe(true);
    expect(tree.branchCount()).toBe(3);
    expect(tree.get([0])).toEqual([1, 2]);
    expect(tree.get([1])).toEqual([3, 4]);
    expect(tree.get([2])).toEqual([5]);
  });
});

describe('Tree.Flatten still handles a DataTree input through the engine', () => {
  it('flattens a multi-branch DataTree (single->list promotion must not mis-wrap it)', () => {
    const tree = new DataTree();
    tree.add([0], [1, 2]);
    tree.add([1], [3, 4]);
    // resolveInputs sees a non-array on a 'list' port and promotes it to [tree];
    // unwrapTreeInput must restore the DataTree so it flattens to [1,2,3,4],
    // NOT to [tree] -> a single-item list mis-read.
    const { list } = runThroughEngine(byType('Tree.Flatten'), { tree });
    expect(list).toEqual([1, 2, 3, 4]);
  });
});

describe('Tree.Graft / Tree.Partition still accept a DataTree input through the engine', () => {
  it('Tree.Graft grafts an existing DataTree one level deeper (not wrapped)', () => {
    const tree = new DataTree();
    tree.add([0], ['a', 'b']);
    const { tree: out } = runThroughEngine(byType('Tree.Graft'), { data: tree });
    expect(isDataTree(out)).toBe(true);
    expect(out.branchCount()).toBe(2);
    expect(out.get([0, 0])).toEqual(['a']);
    expect(out.get([0, 1])).toEqual(['b']);
  });

  it('Tree.Partition flattens a DataTree first, then chunks (not wrapped)', () => {
    const tree = new DataTree();
    tree.add([0], [1, 2, 3]);
    tree.add([1], [4, 5, 6]);
    const { tree: out } = runThroughEngine(byType('Tree.Partition'), { data: tree, size: 2 });
    expect(isDataTree(out)).toBe(true);
    expect(out.branchCount()).toBe(3);
    expect(out.get([0])).toEqual([1, 2]);
    expect(out.get([2])).toEqual([5, 6]);
  });
});
