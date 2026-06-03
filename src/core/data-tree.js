// ============================================
// DataTree — Grasshopper/Dynamo-style branch/path data structure
//
// Nova's node engine flows plain JS arrays ("flat lists") through ports today.
// A DataTree adds a Grasshopper-style hierarchy of branches, each addressed by
// an integer path like {0}, {0;1}, {2;0;3}. It is fully OPT-IN: a plain JS
// array keeps flowing through the engine unchanged, and the toTree/toArray
// bridges let existing flat-list nodes interoperate without any engine change.
//
// Shape (frozen by contract — downstream tasks code to these names):
//   { _type: 'DataTree', branches: Map<string, Array>, paths: string[] }
//
// Path key format: Grasshopper-style "{a;b;c}" where a,b,c are integers. The
// canonical empty/root path is "{0}". Keys are always normalized through
// pathKey()/parsePath() so callers can pass either a "{...}" string or an
// integer array [a, b, c].
//
// This module is PURE: no DOM, no engine coupling. Tree operations live in the
// companion tree-ops.js; this file owns the class and the array<->tree bridges.
// ============================================

const TREE_TYPE = 'DataTree';

// Normalize a path argument to a canonical "{a;b;c}" string key. Accepts:
//   - an integer array      [0, 1]   -> "{0;1}"
//   - a "{...}" string       "{0;1}" -> "{0;1}" (re-normalized)
//   - a number               0       -> "{0}"
// An empty/invalid path collapses to the root "{0}".
export function pathKey(path) {
  return '{' + parsePath(path).join(';') + '}';
}

// Parse a path argument into an integer array. Inverse of pathKey for the
// numeric portion. Tolerant of whitespace and surrounding braces.
export function parsePath(path) {
  if (Array.isArray(path)) {
    const cleaned = path
      .map(function (n) { return Math.trunc(Number(n)); })
      .filter(function (n) { return Number.isFinite(n); });
    return cleaned.length ? cleaned : [0];
  }
  if (typeof path === 'number' && Number.isFinite(path)) {
    return [Math.trunc(path)];
  }
  if (typeof path === 'string') {
    const inner = path.replace(/[{}]/g, '').trim();
    if (inner.length === 0) return [0];
    const parts = inner
      .split(';')
      .map(function (token) { return Math.trunc(Number(token.trim())); })
      .filter(function (n) { return Number.isFinite(n); });
    return parts.length ? parts : [0];
  }
  return [0];
}

export class DataTree {
  constructor() {
    this._type = TREE_TYPE;
    this.branches = new Map();
    // paths is kept in sync with branches.keys(); it preserves insertion order
    // and is the public ordered view of branch addresses.
    this.paths = [];
  }

  // Return the items at a path, or undefined if the branch does not exist.
  // Accepts a "{...}" string, an integer array, or a number.
  get(path) {
    return this.branches.get(pathKey(path));
  }

  // Append items to the branch at `path`, creating the branch if needed.
  // `items` may be a single value or an array; a single value is wrapped into a
  // one-item list, mirroring the engine's "single value -> one-item list"
  // promotion convention. Returns `this` for chaining. Mutates this tree —
  // tree-ops never call this on their input, only on freshly built outputs.
  add(path, items) {
    const key = pathKey(path);
    const list = Array.isArray(items) ? items.slice() : [items];
    if (this.branches.has(key)) {
      const existing = this.branches.get(key);
      existing.push.apply(existing, list);
    } else {
      this.branches.set(key, list);
      this.paths.push(key);
    }
    return this;
  }

  // Number of branches in the tree.
  branchCount() {
    return this.branches.size;
  }

  // Ordered list of path keys (a copy, safe to mutate by the caller).
  pathList() {
    return this.paths.slice();
  }

  // All items across all branches, concatenated in branch (path) order into a
  // single flat array. Does not recurse into item values — items stay as-is.
  flattenedItems() {
    const out = [];
    for (let i = 0; i < this.paths.length; i++) {
      const branch = this.branches.get(this.paths[i]);
      if (branch) out.push.apply(out, branch);
    }
    return out;
  }
}

// True for a DataTree instance (duck-typed on _type and the branches Map so
// callers can guard without importing the class identity).
export function isDataTree(value) {
  return !!value && value._type === TREE_TYPE && value.branches instanceof Map;
}

// ── Bridges ───────────────────────────────────────────────────────────────
// toTree/toArray keep existing flat-list nodes working unchanged: a flat-list
// node receives toArray(value) and a tree-aware node receives toTree(value).

// Coerce any value into a DataTree without mutating the input.
//   - a DataTree is returned as-is (already a tree; callers treat it as
//     immutable input);
//   - a plain array becomes a single-branch tree at the root path {0};
//   - undefined/null becomes an empty tree;
//   - any other scalar becomes a one-item branch at {0} (single -> one-item
//     list promotion, matching the engine convention).
export function toTree(arrayOrTree) {
  if (isDataTree(arrayOrTree)) return arrayOrTree;
  const tree = new DataTree();
  if (arrayOrTree === undefined || arrayOrTree === null) return tree;
  if (Array.isArray(arrayOrTree)) {
    tree.add([0], arrayOrTree);
  } else {
    tree.add([0], [arrayOrTree]);
  }
  return tree;
}

// Collapse a value back into a plain JS array for flat-list consumers.
//   - a DataTree returns its items concatenated across all branches in path
//     order (the inverse of toTree for a single-branch tree, so
//     toArray(toTree(arr)) deep-equals arr);
//   - a plain array is returned as-is (unchanged — backward compatible);
//   - undefined/null returns an empty array;
//   - any other scalar returns a one-item array.
export function toArray(tree) {
  if (isDataTree(tree)) return tree.flattenedItems();
  if (Array.isArray(tree)) return tree;
  if (tree === undefined || tree === null) return [];
  return [tree];
}
