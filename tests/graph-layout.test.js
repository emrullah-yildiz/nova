import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../src/core/graph-layout.js';

const SIZE = { w: 180, h: 100 };
const sizeOf = () => SIZE;

// Count geometric crossings using node centres as edge endpoints.
function countCrossings(nodeIds, edges, pos) {
  const center = (id) => ({ x: pos[id].x + SIZE.w / 2, y: pos[id].y + SIZE.h / 2 });
  const seg = edges.map(([a, b]) => ({ a, b, p: center(a), q: center(b) }));
  const ccw = (A, B, C) => (C.y - A.y) * (B.x - A.x) - (B.y - A.y) * (C.x - A.x);
  function cross(s, t) {
    if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) return false; // shared node
    const d1 = ccw(s.p, s.q, t.p), d2 = ccw(s.p, s.q, t.q);
    const d3 = ccw(t.p, t.q, s.p), d4 = ccw(t.p, t.q, s.q);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  let n = 0;
  for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) if (cross(seg[i], seg[j])) n++;
  return n;
}

function anyOverlap(nodeIds, pos) {
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const a = pos[nodeIds[i]], b = pos[nodeIds[j]];
      const overlapX = a.x < b.x + SIZE.w && b.x < a.x + SIZE.w;
      const overlapY = a.y < b.y + SIZE.h && b.y < a.y + SIZE.h;
      if (overlapX && overlapY) return [nodeIds[i], nodeIds[j]];
    }
  }
  return null;
}

describe('layoutGraph', () => {
  it('lays a chain left→right, aligned on one row, no overlap', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const edges = [['a', 'b'], ['b', 'c'], ['c', 'd']];
    const { pos } = layoutGraph(ids, edges, sizeOf);

    expect(pos.a.x).toBeLessThan(pos.b.x);
    expect(pos.b.x).toBeLessThan(pos.c.x);
    expect(pos.c.x).toBeLessThan(pos.d.x);
    // A straight chain should be aligned on the same row.
    expect(pos.b.y).toBeCloseTo(pos.a.y, 3);
    expect(pos.d.y).toBeCloseTo(pos.a.y, 3);
    expect(anyOverlap(ids, pos)).toBeNull();
  });

  it('minimises crossings: reorders a layer to avoid an X', () => {
    // a,b on the left; a→d, b→c. Input order would cross; layout should not.
    const ids = ['a', 'b', 'c', 'd'];
    const edges = [['a', 'd'], ['b', 'c']];
    const { pos, crossings } = layoutGraph(ids, edges, sizeOf);
    expect(crossings).toBe(0);
    expect(countCrossings(ids, edges, pos)).toBe(0);
    expect(anyOverlap(ids, pos)).toBeNull();
  });

  it('keeps a fan-out free of overlaps and on increasing columns', () => {
    const ids = ['s', 't0', 't1', 't2', 't3', 't4'];
    const edges = ids.slice(1).map((t) => ['s', t]);
    const { pos } = layoutGraph(ids, edges, sizeOf);
    ids.slice(1).forEach((t) => expect(pos.s.x).toBeLessThan(pos[t].x));
    expect(anyOverlap(ids, pos)).toBeNull();
  });

  it('routes a long edge (dummy waypoints) without breaking layering or overlap', () => {
    // a→b→c plus the long edge a→c spanning two layers.
    const ids = ['a', 'b', 'c'];
    const edges = [['a', 'b'], ['b', 'c'], ['a', 'c']];
    const { pos } = layoutGraph(ids, edges, sizeOf);
    expect(pos.a.x).toBeLessThan(pos.b.x);
    expect(pos.b.x).toBeLessThan(pos.c.x);
    expect(anyOverlap(ids, pos)).toBeNull();
  });

  it('is deterministic', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const edges = [['a', 'c'], ['b', 'c'], ['c', 'd'], ['c', 'e']];
    const r1 = layoutGraph(ids, edges, sizeOf);
    const r2 = layoutGraph(ids, edges, sizeOf);
    expect(r1.pos).toEqual(r2.pos);
  });

  it('handles cycles without infinite recursion', () => {
    const ids = ['a', 'b', 'c'];
    const edges = [['a', 'b'], ['b', 'c'], ['c', 'a']]; // cycle
    const { pos } = layoutGraph(ids, edges, sizeOf);
    expect(Object.keys(pos).sort()).toEqual(['a', 'b', 'c']);
    expect(anyOverlap(ids, pos)).toBeNull();
  });

  it('places disconnected nodes without overlap', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const edges = [['a', 'b']]; // c, d are orphans
    const { pos } = layoutGraph(ids, edges, sizeOf);
    expect(anyOverlap(ids, pos)).toBeNull();
  });

  it('returns empty for no nodes', () => {
    expect(layoutGraph([], [], sizeOf)).toEqual({ pos: {}, width: 0, height: 0 });
  });
});
