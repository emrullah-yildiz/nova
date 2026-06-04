import { describe, it, expect } from 'vitest';
import { treeNodes } from '../src/nodes/categories/tree.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';
import { isDataTree, DataTree } from '../src/core/data-tree.js';

// ──────────────────────────────────────────────────────────────────────────
// T6 — Tree node category (exposes the M1 pure tree-ops as modern nodes).
//
// Three guards:
//   1. registration — every Tree node registers in a fresh full core registry
//      with no duplicate-type / duplicate-alias collision.
//   2. execute() smoke — each node's execute() wires to the real tree-op.
//   3. codegen safety — no Tree node emits a `Geo.<name>` call (tree-ops do NOT
//      live on the global Geo the generated-code runtime assembles, so any such
//      symbol would fail to resolve; mirrors tests/transform-codegen.test.js's
//      runtime-symbol concern, inverted: here the safe set is "no Geo at all").
// ──────────────────────────────────────────────────────────────────────────

const byType = (type) => treeNodes.find((n) => n.type === type);

describe('tree-category registration', () => {
  it('ships the seven expected tree/list nodes', () => {
    expect(treeNodes.map((n) => n.type)).toEqual([
      'Tree.Graft',
      'Tree.Flatten',
      'Tree.Simplify',
      'Tree.Transpose',
      'Tree.Partition',
      'Tree.GroupByKey',
      'List.SortByKey'
    ]);
  });

  it('registers cleanly in a fresh full core registry (no type/alias collision)', () => {
    // createCoreNodeRegistry throws on any duplicate type or alias, so a clean
    // build is itself the assertion that the new category collides with nothing.
    const registry = createCoreNodeRegistry();
    for (const node of treeNodes) {
      expect(registry.getNode(node.type), `${node.type} resolves in the registry`).toBeTruthy();
    }
  });

  it('every node carries the standard def shape (icon glyph, description, codegen, help.example graph)', () => {
    for (const node of treeNodes) {
      expect(node.icon, `${node.type} icon`).toBeTruthy();
      // Icons must be symbols, never text abbreviations.
      expect(/^[a-z0-9]+$/i.test(node.icon), `${node.type} icon must be a glyph, not text`).toBe(false);
      expect(typeof node.description).toBe('string');
      expect(node.codegen && typeof node.codegen.python).toBe('string');
      expect(node.codegen && typeof node.codegen.csharp).toBe('string');
      // help.example must be a complete graph (producer -> focal -> consumer).
      expect(node.help && node.help.example, `${node.type} help.example`).toBeTruthy();
      expect(Array.isArray(node.help.example.nodes)).toBe(true);
      expect(Array.isArray(node.help.example.wires)).toBe(true);
      expect(node.help.example.nodes.length).toBeGreaterThan(2);
      // Every example must terminate in a consumer (Output.Watch / downstream).
      const types = node.help.example.nodes.map((n) => n.type);
      expect(types).toContain('Output.Watch');
      expect(types).toContain(node.type);
    }
  });
});

describe('tree-category codegen never names a global Geo symbol', () => {
  const GEO_CALL = /\bGeo\.[A-Za-z_$]/;
  for (const node of treeNodes) {
    it(`${node.type}: codegen.python/csharp emit no Geo.<name>`, () => {
      expect(GEO_CALL.test(node.codegen.python), `${node.type} python`).toBe(false);
      expect(GEO_CALL.test(node.codegen.csharp), `${node.type} csharp`).toBe(false);
    });
  }
});

describe('tree-node execute() smoke (wired to the real tree-ops)', () => {
  it('Tree.Graft turns [a, b, c] into three single-item branches', () => {
    const out = byType('Tree.Graft').execute({}, { data: ['a', 'b', 'c'] });
    expect(isDataTree(out.tree)).toBe(true);
    // toTree wraps the flat list into root branch {0}; graft then pushes each
    // item one level deeper -> three branches {0;0}, {0;1}, {0;2}, each holding
    // exactly one item (the defining property of a graft).
    expect(out.tree.branchCount()).toBe(3);
    expect(out.tree.get([0, 0])).toEqual(['a']);
    expect(out.tree.get([0, 1])).toEqual(['b']);
    expect(out.tree.get([0, 2])).toEqual(['c']);
    expect(out.tree.flattenedItems()).toEqual(['a', 'b', 'c']);
  });

  it('Tree.Flatten collapses a multi-branch tree to one flat list', () => {
    const tree = new DataTree();
    tree.add([0], [1, 2]);
    tree.add([1], [3, 4]);
    const out = byType('Tree.Flatten').execute({}, { tree });
    expect(Array.isArray(out.list)).toBe(true);
    expect(out.list).toEqual([1, 2, 3, 4]);
  });

  it('Tree.Simplify reduces a single-branch tree to the root {0}', () => {
    const tree = new DataTree();
    tree.add([5, 7], ['only']);
    const out = byType('Tree.Simplify').execute({}, { tree });
    expect(isDataTree(out.tree)).toBe(true);
    expect(out.tree.branchCount()).toBe(1);
    expect(out.tree.get([0])).toEqual(['only']);
  });

  it('Tree.Transpose flips a 2x3 tree into a 3x2 tree', () => {
    // Branches {0}=[a0,a1,a2], {1}=[b0,b1,b2] grafted to 2 levels, then transpose.
    const tree = new DataTree();
    tree.add([0, 0], ['a0']);
    tree.add([0, 1], ['a1']);
    tree.add([0, 2], ['a2']);
    tree.add([1, 0], ['b0']);
    tree.add([1, 1], ['b1']);
    tree.add([1, 2], ['b2']);
    const out = byType('Tree.Transpose').execute({}, { tree });
    expect(isDataTree(out.tree)).toBe(true);
    // 2x3 (2 first-level groups, 3 second-level) -> 3x2: first level now has 3.
    expect(out.tree.get([0, 0])).toEqual(['a0']);
    expect(out.tree.get([0, 1])).toEqual(['b0']);
    expect(out.tree.get([2, 0])).toEqual(['a2']);
    expect(out.tree.get([2, 1])).toEqual(['b2']);
    expect(out.tree.branchCount()).toBe(6);
  });

  it('Tree.Partition chunks a flat list into fixed-size branches', () => {
    const out = byType('Tree.Partition').execute({}, { data: [1, 2, 3, 4, 5], size: 2 });
    expect(isDataTree(out.tree)).toBe(true);
    expect(out.tree.branchCount()).toBe(3);
    expect(out.tree.get([0])).toEqual([1, 2]);
    expect(out.tree.get([1])).toEqual([3, 4]);
    expect(out.tree.get([2])).toEqual([5]);
  });

  it('Tree.GroupByKey buckets items by the Key f(x) control', () => {
    const out = byType('Tree.GroupByKey').execute(
      {},
      { items: [1, 2, 3, 4, 5, 6] },
      { key: 'x % 2' }
    );
    expect(isDataTree(out.tree)).toBe(true);
    expect(out.tree.branchCount()).toBe(2);
    // first-seen key for 1 is 1 (odd) -> branch {0}; for 2 is 0 (even) -> {1}.
    expect(out.tree.get([0])).toEqual([1, 3, 5]);
    expect(out.tree.get([1])).toEqual([2, 4, 6]);
  });

  it('List.SortByKey stably sorts items by a parallel keys list', () => {
    const out = byType('List.SortByKey').execute(
      {},
      { items: ['low', 'high', 'mid'], keys: [1, 3, 2] }
    );
    expect(out.result).toEqual(['low', 'mid', 'high']);
  });

  it('List.SortByKey keeps input order on equal keys (stable)', () => {
    const out = byType('List.SortByKey').execute(
      {},
      { items: ['a', 'b', 'c'], keys: [1, 1, 0] }
    );
    expect(out.result).toEqual(['c', 'a', 'b']);
  });
});
