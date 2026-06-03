// ============================================
// tree-ops — pure DataTree transforms
//
// Every function here takes a tree (or, for the array-friendly ops, a plain
// array) and returns a NEW DataTree (or new array). They NEVER mutate their
// input — callers can keep the original tree referenced by an upstream port.
//
// These mirror the Grasshopper tree operators (Graft, Flatten, Simplify,
// Flip Matrix, Partition) plus two list-bucketing helpers (groupByKey,
// sortByKey). No node defs, no engine registration — pure data only.
// ============================================

import { DataTree, parsePath, pathKey, toTree } from './data-tree.js';

// Build a fresh tree by copying branches from `source` keyed by integer-array
// paths produced by `pathFor(originalKey, originalPath, items, index)`.
function rebuild(source, mapper) {
  const out = new DataTree();
  source.paths.forEach(function (key, branchIndex) {
    const items = source.branches.get(key) || [];
    const originalPath = parsePath(key);
    mapper(out, { key: key, path: originalPath, items: items, branchIndex: branchIndex });
  });
  return out;
}

// graft — each item becomes its own branch. For a branch at path P holding
// items [a, b, c], graft produces branches P+[0]=[a], P+[1]=[b], P+[2]=[c].
// Matches Grasshopper "Graft Tree".
export function graft(tree) {
  const t = toTree(tree);
  const out = new DataTree();
  t.paths.forEach(function (key) {
    const items = t.branches.get(key) || [];
    const basePath = parsePath(key);
    items.forEach(function (item, index) {
      out.add(basePath.concat(index), [item]);
    });
  });
  return out;
}

// flatten — collapse every branch into a single branch at the target path
// (default root {0}), concatenating items in branch (path) order. Matches
// Grasshopper "Flatten Tree".
export function flatten(tree, targetPath) {
  const t = toTree(tree);
  const out = new DataTree();
  out.add(parsePath(targetPath === undefined ? [0] : targetPath), t.flattenedItems());
  return out;
}

// simplify — remove path segments that carry no information: any leading or
// trailing index position that is identical across every branch is dropped.
// This is Grasshopper's "Simplify Tree": shared prefix/suffix levels collapse,
// the distinguishing middle levels remain. A tree with a single branch
// simplifies to the root {0}.
export function simplify(tree) {
  const t = toTree(tree);
  if (t.branchCount() === 0) return new DataTree();

  const paths = t.paths.map(parsePath);

  if (paths.length === 1) {
    const out = new DataTree();
    out.add([0], t.branches.get(t.paths[0]) || []);
    return out;
  }

  const minDepth = paths.reduce(function (m, p) { return Math.min(m, p.length); }, Infinity);

  // Count leading levels shared by all paths.
  let leading = 0;
  for (let level = 0; level < minDepth; level++) {
    const v = paths[0][level];
    const allSame = paths.every(function (p) { return p[level] === v; });
    if (allSame) leading++; else break;
  }

  // Count trailing levels shared by all paths (not overlapping the leading run).
  let trailing = 0;
  for (let offset = 0; offset < minDepth - leading; offset++) {
    const v = paths[0][paths[0].length - 1 - offset];
    const allSame = paths.every(function (p) { return p[p.length - 1 - offset] === v; });
    if (allSame) trailing++; else break;
  }

  const out = new DataTree();
  paths.forEach(function (p, i) {
    let trimmed = p.slice(leading, p.length - trailing);
    if (trimmed.length === 0) trimmed = [0];
    out.add(trimmed, t.branches.get(t.paths[i]) || []);
  });
  return out;
}

// transpose — swap the first two levels of every path (matrix flip). A path
// {a;b;...rest} becomes {b;a;...rest}. Items belonging to paths that now
// coincide are concatenated in original branch order. Paths with fewer than
// two levels pass through unchanged. Matches Grasshopper "Flip Matrix" for the
// common 2-level case.
export function transpose(tree) {
  const t = toTree(tree);
  return rebuild(t, function (out, info) {
    const p = info.path;
    let target = p;
    if (p.length >= 2) {
      target = [p[1], p[0]].concat(p.slice(2));
    }
    out.add(target, info.items);
  });
}

// partition — chunk a flat array (or a tree's flattened items) into branches
// of at most `size` items: branch {0} holds the first `size`, {1} the next,
// and so on. Matches Grasshopper "Partition List". A size <= 0 puts everything
// in a single branch {0}.
export function partition(arrayOrTree, size) {
  const t = toTree(arrayOrTree);
  const items = t.flattenedItems();
  const out = new DataTree();
  const chunk = Math.trunc(Number(size));
  if (!Number.isFinite(chunk) || chunk <= 0) {
    out.add([0], items);
    return out;
  }
  for (let i = 0; i < items.length; i += chunk) {
    out.add([Math.floor(i / chunk)], items.slice(i, i + chunk));
  }
  return out;
}

// groupByKey — bucket a flat list of items into branches, one branch per
// distinct key returned by keyFn(item, index). Branches are addressed by
// integer paths {0}, {1}, … in first-seen key order; items keep their relative
// order within a branch. Returns a new DataTree.
export function groupByKey(items, keyFn) {
  const list = Array.isArray(items) ? items : (items === undefined || items === null ? [] : [items]);
  const out = new DataTree();
  const keyOrder = [];
  const keyToIndex = new Map();
  list.forEach(function (item, index) {
    const key = keyFn(item, index);
    let branchIndex;
    if (keyToIndex.has(key)) {
      branchIndex = keyToIndex.get(key);
    } else {
      branchIndex = keyOrder.length;
      keyToIndex.set(key, branchIndex);
      keyOrder.push(key);
    }
    out.add([branchIndex], [item]);
  });
  return out;
}

// sortByKey — stable sort of a flat list by the value of keyFn(item, index).
// Returns a NEW array (input untouched). Numeric keys sort numerically; other
// keys sort by their string form. Stability is guaranteed by carrying the
// original index as the tie-breaker.
export function sortByKey(items, keyFn) {
  const list = Array.isArray(items) ? items.slice() : (items === undefined || items === null ? [] : [items]);
  const decorated = list.map(function (item, index) {
    return { item: item, index: index, key: keyFn(item, index) };
  });
  decorated.sort(function (a, b) {
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return a.index - b.index;
  });
  return decorated.map(function (d) { return d.item; });
}

// Re-export the key/path helpers callers commonly need alongside the ops.
export { pathKey, parsePath };
