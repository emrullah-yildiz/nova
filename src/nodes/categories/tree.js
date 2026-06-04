import {
  graft,
  flatten,
  simplify,
  transpose,
  partition,
  groupByKey,
  sortByKey
} from '../../core/tree-ops.js';
import { toTree, toArray } from '../../core/data-tree.js';

// ============================================
// NOVA — Tree node category (T6 / Milestone M2)
//
// Exposes the M1 pure DataTree tree-ops (src/core/tree-ops.js, built on
// src/core/data-tree.js) as modern Nova nodes so users get Grasshopper-style
// tree manipulation in the graph: Graft, Flatten, Simplify, Transpose,
// Partition, GroupByKey, plus a parallel-key list sort (List.SortByKey).
//
// execute() wires straight to the tree-ops exports — no reimplementation.
// Tree-typed ports use the 'datatree' port type (recognised by the inspector
// type-warning system); list/scalar ports use 'list'/'any', normalised through
// toTree/toArray at the boundary.
//
// CODEGEN CONTRACT (learned in M1/T2): the tree-ops live in src/core, NOT on
// the global `Geo` object the Python/C# runtime assembles. So codegen MUST NOT
// emit `Geo.graft(...)` etc. — those would not resolve at runtime. Instead the
// generated code represents a DataTree as a plain list-of-branches (a list of
// lists), matching how List.Chunk / List.GroupBy already emit nested-list code,
// and expresses each op with native Python/C# only. The live execute() path
// uses real DataTrees; the generated code uses the list-of-branches mirror.
// ============================================

export const treeCategory = {
  id: 'tree',
  name: 'Tree',
  color: '#94e2d5',
  icon: '⑃'
};

export const treeNodes = [
  {
    type: 'Tree.Graft',
    name: 'Tree.Graft',
    category: 'tree',
    subGroup: 'Tree',
    icon: '⑂',
    aliases: ['tree-graft'],
    description: 'Grafts data into a DataTree where each item becomes its own branch. A flat list [a, b, c] yields branches {0}=[a], {1}=[b], {2}=[c]; an existing tree grafts each item of each branch one level deeper. Mirrors Grasshopper "Graft Tree".',
    inputs: [
      { id: 'data', name: 'Data', type: 'any', description: 'List or tree whose items each become their own branch' }
    ],
    outputs: [{ id: 'tree', name: 'Tree', type: 'datatree', description: 'DataTree with one item per branch' }],
    controls: [],
    execute(context, inputs) {
      return { tree: graft(toTree(inputs.data)) };
    },
    codegen: {
      python: '{{tree}} = [[x] for x in {{data}}]',
      csharp: 'var {{tree}} = {{data}}.Select(x => new List<object> { x }).ToList();'
    },
    help: {
      inputs: [{ name: 'Data', description: 'List or tree to graft' }],
      outputs: [{ name: 'Tree', description: 'One item per branch' }],
      example: {
        title: 'Graft 1..4 into 4 branches, count branches',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Tree.Graft', x: 440, y: 60 },
          { type: 'Tree.Flatten', x: 660, y: 60 },
          { type: 'List.Count', x: 880, y: 60 },
          { type: 'Output.Watch', x: 1080, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'data'],
          [4, 'tree', 5, 'tree'],
          [5, 'list', 6, 'list'],
          [6, 'count', 7, 'value']
        ]
      },
      sampleCode: '{{tree}} = [[x] for x in {{data}}]'
    }
  },
  {
    type: 'Tree.Flatten',
    name: 'Tree.Flatten',
    category: 'tree',
    subGroup: 'Tree',
    icon: '▤',
    aliases: ['tree-flatten'],
    description: 'Collapses every branch of a DataTree into a single flat list, concatenating items in branch (path) order. Accepts a tree or a plain list (returned flattened). Mirrors Grasshopper "Flatten Tree".',
    inputs: [
      { id: 'tree', name: 'Tree', type: 'any', description: 'DataTree (or list) to collapse to a flat list' }
    ],
    outputs: [{ id: 'list', name: 'List', type: 'list', description: 'Flat list of every item across all branches' }],
    controls: [],
    execute(context, inputs) {
      // toArray flattens a DataTree across branches; flatten() keeps the tree-op
      // path on record but the consumer here wants a plain list, so use toArray
      // of the single-branch flatten result.
      return { list: toArray(flatten(toTree(inputs.tree))) };
    },
    codegen: {
      python: '{{list}} = [item for sub in {{tree}} for item in (sub if isinstance(sub, list) else [sub])]',
      csharp: 'var {{list}} = {{tree}}.SelectMany(x => x is IEnumerable<object> e ? e : new[] { x }).ToList();'
    },
    help: {
      inputs: [{ name: 'Tree', description: 'Tree (or list) to flatten' }],
      outputs: [{ name: 'List', description: 'Flat list of all items' }],
      example: {
        title: 'Graft then flatten 1..4 back to a flat list, sum it',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Tree.Graft', x: 440, y: 60 },
          { type: 'Tree.Flatten', x: 660, y: 60 },
          { type: 'List.Sum', x: 880, y: 60 },
          { type: 'Output.Watch', x: 1080, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'data'],
          [4, 'tree', 5, 'tree'],
          [5, 'list', 6, 'list'],
          [6, 'result', 7, 'value']
        ]
      },
      sampleCode: '{{list}} = [item for sub in {{tree}} for item in (sub if isinstance(sub, list) else [sub])]'
    }
  },
  {
    type: 'Tree.Simplify',
    name: 'Tree.Simplify',
    category: 'tree',
    subGroup: 'Tree',
    icon: '⌁',
    aliases: ['tree-simplify'],
    description: 'Removes uninformative path levels from a DataTree: any leading or trailing index that is identical across every branch is dropped, leaving only the distinguishing middle levels. A single-branch tree simplifies to the root {0}. Mirrors Grasshopper "Simplify Tree".',
    inputs: [
      { id: 'tree', name: 'Tree', type: 'datatree', description: 'DataTree to simplify' }
    ],
    outputs: [{ id: 'tree', name: 'Tree', type: 'datatree', description: 'Tree with shared prefix/suffix path levels collapsed' }],
    controls: [],
    execute(context, inputs) {
      return { tree: simplify(toTree(inputs.tree)) };
    },
    codegen: {
      // Simplify only rewrites path addresses, not the branch *contents*. In the
      // generated list-of-branches representation there are no explicit paths to
      // collapse, so the branch data passes through unchanged.
      python: '{{tree}} = list({{tree}})',
      csharp: 'var {{tree}} = new List<object>({{tree}});'
    },
    help: {
      inputs: [{ name: 'Tree', description: 'Tree to simplify' }],
      outputs: [{ name: 'Tree', description: 'Simplified tree' }],
      example: {
        title: 'Graft 1..4, simplify, flatten back and count',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Tree.Graft', x: 440, y: 60 },
          { type: 'Tree.Simplify', x: 660, y: 60 },
          { type: 'Tree.Flatten', x: 880, y: 60 },
          { type: 'List.Count', x: 1100, y: 60 },
          { type: 'Output.Watch', x: 1300, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'data'],
          [4, 'tree', 5, 'tree'],
          [5, 'tree', 6, 'tree'],
          [6, 'list', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{tree}} = list({{tree}})'
    }
  },
  {
    type: 'Tree.Transpose',
    name: 'Tree.Transpose',
    category: 'tree',
    subGroup: 'Tree',
    icon: '⇌',
    aliases: ['tree-transpose'],
    description: 'Flips the first two path levels of a DataTree (matrix transpose): a path {a;b;…} becomes {b;a;…}, with items whose paths now coincide concatenated in original order. Turns an M-branch × N-item tree into an N-branch × M-item tree. Mirrors Grasshopper "Flip Matrix".',
    inputs: [
      { id: 'tree', name: 'Tree', type: 'datatree', description: 'DataTree to transpose (flip first two path levels)' }
    ],
    outputs: [{ id: 'tree', name: 'Tree', type: 'datatree', description: 'Transposed DataTree' }],
    controls: [],
    execute(context, inputs) {
      return { tree: transpose(toTree(inputs.tree)) };
    },
    codegen: {
      // List-of-branches transpose == matrix transpose of the rows (zip(*rows)),
      // exactly mirroring List.Transpose.
      python: '{{tree}} = list(map(list, zip(*{{tree}})))',
      csharp: 'var {{tree}} = Enumerable.Range(0, {{tree}}.Max(r => r.Count)).Select(i => {{tree}}.Select(r => r.ElementAtOrDefault(i)).ToList()).ToList();'
    },
    help: {
      inputs: [{ name: 'Tree', description: 'Tree to transpose' }],
      outputs: [{ name: 'Tree', description: 'Transposed tree' }],
      example: {
        title: 'Partition 1..6 into rows of 3, transpose, flatten, count',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 7 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 3 } },
          { type: 'Tree.Partition', x: 440, y: 90 },
          { type: 'Tree.Transpose', x: 660, y: 90 },
          { type: 'Tree.Flatten', x: 880, y: 90 },
          { type: 'List.Count', x: 1100, y: 90 },
          { type: 'Output.Watch', x: 1300, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'data'],
          [4, 'value', 5, 'size'],
          [5, 'tree', 6, 'tree'],
          [6, 'tree', 7, 'tree'],
          [7, 'list', 8, 'list'],
          [8, 'count', 9, 'value']
        ]
      },
      sampleCode: '{{tree}} = list(map(list, zip(*{{tree}})))'
    }
  },
  {
    type: 'Tree.Partition',
    name: 'Tree.Partition',
    category: 'tree',
    subGroup: 'Tree',
    icon: '▥',
    aliases: ['tree-partition'],
    description: 'Chunks data into a DataTree of branches of at most Size items each: branch {0} holds the first Size items, {1} the next, and so on. Accepts a list or a tree (flattened first). A Size of 0 or less puts everything in one branch. Mirrors Grasshopper "Partition List".',
    inputs: [
      { id: 'data', name: 'Data', type: 'any', description: 'List or tree to partition (flattened first)' },
      { id: 'size', name: 'Size', type: 'number', description: 'Maximum number of items per branch' }
    ],
    outputs: [{ id: 'tree', name: 'Tree', type: 'datatree', description: 'DataTree of fixed-size branches' }],
    controls: [{ id: 'size', type: 'formula', default: '3', label: 'Size' }],
    execute(context, inputs) {
      const size = Number(inputs.size ?? 3);
      return { tree: partition(toTree(inputs.data), Number.isNaN(size) ? 3 : size) };
    },
    codegen: {
      python: '_items = [item for sub in {{data}} for item in (sub if isinstance(sub, list) else [sub])]\n{{tree}} = [_items[i:i+int({{size}})] for i in range(0, len(_items), max(1, int({{size}})))]',
      csharp: 'var _items = {{data}}.SelectMany(x => x is IEnumerable<object> e ? e : new[] { x }).ToList(); var {{tree}} = _items.Select((x, i) => new { x, i }).GroupBy(g => g.i / (int){{size}}).Select(g => g.Select(x => x.x).ToList()).ToList();'
    },
    help: {
      inputs: [
        { name: 'Data', description: 'List or tree to partition' },
        { name: 'Size', description: 'Items per branch' }
      ],
      outputs: [{ name: 'Tree', description: 'Tree of fixed-size branches' }],
      example: {
        title: 'Partition 1..6 into branches of 2, flatten back, count',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 7 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 2 } },
          { type: 'Tree.Partition', x: 440, y: 90 },
          { type: 'Tree.Flatten', x: 660, y: 90 },
          { type: 'List.Count', x: 880, y: 90 },
          { type: 'Output.Watch', x: 1080, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'data'],
          [4, 'value', 5, 'size'],
          [5, 'tree', 6, 'tree'],
          [6, 'list', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{tree}} = [_items[i:i+int({{size}})] for i in range(0, len(_items), max(1, int({{size}})))]'
    }
  },
  {
    type: 'Tree.GroupByKey',
    name: 'Tree.GroupByKey',
    category: 'tree',
    subGroup: 'Tree',
    icon: '⊟',
    aliases: ['tree-groupbykey'],
    description: 'Buckets a flat list of items into a DataTree, one branch per distinct key. The key is computed per item by the Key f(x) formula control (x is the item) — e.g. "x % 3" groups by remainder. Branches are addressed {0}, {1}, … in first-seen key order; items keep their relative order. Mirrors Grasshopper "Group" by a key.',
    inputs: [
      { id: 'items', name: 'Items', type: 'list', description: 'Flat list of items to bucket by key' }
    ],
    outputs: [{ id: 'tree', name: 'Tree', type: 'datatree', description: 'DataTree with one branch per distinct key' }],
    controls: [{ id: 'key', type: 'formula', default: 'x % 3', label: 'Key f(x)' }],
    execute(context, inputs, controls) {
      const list = Array.isArray(inputs.items) ? inputs.items : toArray(inputs.items);
      const keyFn = compileKey(controls && controls.key);
      return { tree: groupByKey(list, (item) => String(keyFn(item))) };
    },
    codegen: {
      python: '_g = {}\nfor x in {{items}}:\n    _g.setdefault({{key}}, []).append(x)\n{{tree}} = list(_g.values())',
      csharp: 'var {{tree}} = {{items}}.GroupBy(x => {{key}}).Select(g => g.ToList()).ToList();'
    },
    help: {
      inputs: [{ name: 'Items', description: 'Flat list to bucket' }],
      outputs: [{ name: 'Tree', description: 'One branch per distinct key' }],
      example: {
        title: 'Group 1..8 by x % 3 into branches, flatten back, count',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 9 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Tree.GroupByKey', x: 440, y: 60, controls: { key: 'x % 3' } },
          { type: 'Tree.Flatten', x: 660, y: 60 },
          { type: 'List.Count', x: 880, y: 60 },
          { type: 'Output.Watch', x: 1080, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'items'],
          [4, 'tree', 5, 'tree'],
          [5, 'list', 6, 'list'],
          [6, 'count', 7, 'value']
        ]
      },
      sampleCode: '_g = {}\nfor x in {{items}}:\n    _g.setdefault({{key}}, []).append(x)\n{{tree}} = list(_g.values())'
    }
  },
  {
    type: 'List.SortByKey',
    name: 'List.SortByKey',
    category: 'tree',
    subGroup: 'List',
    icon: '↕',
    aliases: ['list-sortbykey'],
    description: 'Stably sorts a list of items by a parallel list of keys: item[i] is ordered by key[i]. Numeric keys sort numerically, others by their string form; ties keep input order. The Keys list should be the same length as Items. Mirrors Grasshopper "Sort List" (keys → values).',
    inputs: [
      { id: 'items', name: 'Items', type: 'list', description: 'Items to reorder' },
      { id: 'keys', name: 'Keys', type: 'list', description: 'Parallel sort keys (same length as Items)' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'list', description: 'Items reordered by ascending key' }],
    controls: [],
    execute(context, inputs) {
      const items = Array.isArray(inputs.items) ? inputs.items : toArray(inputs.items);
      const keys = Array.isArray(inputs.keys) ? inputs.keys : toArray(inputs.keys);
      return { result: sortByKey(items, (item, index) => keys[index]) };
    },
    codegen: {
      python: '{{result}} = [v for _, v in sorted(zip({{keys}}, {{items}}), key=lambda p: p[0])]',
      csharp: 'var {{result}} = {{items}}.Zip({{keys}}, (v, k) => new { v, k }).OrderBy(p => p.k).Select(p => p.v).ToList();'
    },
    help: {
      inputs: [
        { name: 'Items', description: 'Items to reorder' },
        { name: 'Keys', description: 'Parallel sort keys' }
      ],
      outputs: [{ name: 'Result', description: 'Items sorted by key' }],
      example: {
        title: 'Sort 3 rooms by their priority keys, take the first',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 101 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 102 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 103 } },
          { type: 'List.Create', x: 220, y: 60 },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 290, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 360, controls: { val: 2 } },
          { type: 'List.Create', x: 220, y: 280 },
          { type: 'List.SortByKey', x: 460, y: 170 },
          { type: 'List.First', x: 680, y: 170 },
          { type: 'Output.Watch', x: 880, y: 170 }
        ],
        wires: [
          [0, 'value', 3, 'item0'],
          [1, 'value', 3, 'item1'],
          [2, 'value', 3, 'item2'],
          [4, 'value', 7, 'item0'],
          [5, 'value', 7, 'item1'],
          [6, 'value', 7, 'item2'],
          [3, 'list', 8, 'items'],
          [7, 'list', 8, 'keys'],
          [8, 'result', 9, 'list'],
          [9, 'item', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = [v for _, v in sorted(zip({{keys}}, {{items}}), key=lambda p: p[0])]'
    }
  }
];

// Compile a Key f(x) formula control into a function of the item. Mirrors the
// approach the List.Map / List.GroupBy nodes use; falls back to the identity on
// a malformed expression so a bad control can never throw in the compute path.
function compileKey(expression) {
  try {
    const fn = new Function('x', `return (${expression || 'x'});`);
    return (item) => {
      try {
        return fn(item);
      } catch {
        return item;
      }
    };
  } catch {
    return (item) => item;
  }
}
