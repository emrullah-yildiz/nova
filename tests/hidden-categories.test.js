// Hiding Host + Rhino from DISCOVERY surfaces (library palette, node search,
// port suggestions) while keeping their nodes registered/resolvable.
//
// Invariant: `hidden: true` is a DISCOVERY-ONLY flag. The node registry,
// codegen, and AI catalog read the full NODE_LIBRARY.categories / the live
// registry — never visibleCategories() — so a saved graph that already uses a
// Host/Rhino node keeps computing. Only library/search/suggestion surfaces
// filter hidden categories out.

import { describe, it, expect, beforeAll } from 'vitest';
import { NODE_LIBRARY, NODE_TYPE_MAP, visibleCategories } from '../src/core/nodes.js';
import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';

const byId = (id) => NODE_LIBRARY.categories.find((c) => c.id === id);

// Modern categories merge into NODE_LIBRARY lazily on first registry build.
// Force it once so the "modern category stays visible" assertion is deterministic.
beforeAll(() => { getLiveCoreRegistry(); });

describe('hidden node categories (Host + Rhino)', () => {
  it('flags host and rhino categories hidden:true', () => {
    expect(byId('host')).toBeTruthy();
    expect(byId('rhino')).toBeTruthy();
    expect(byId('host').hidden).toBe(true);
    expect(byId('rhino').hidden).toBe(true);
  });

  it('keeps revit and the modern categories NOT hidden', () => {
    const revit = byId('revit');
    expect(revit).toBeTruthy();
    expect(revit.hidden).toBeFalsy();
    // A representative modern category must stay visible.
    const modern = NODE_LIBRARY.categories.find((c) => c.nodes.some((n) => n.type === 'Output.Watch'));
    expect(modern).toBeTruthy();
    expect(modern.hidden).toBeFalsy();
  });

  it('visibleCategories() excludes hidden categories but keeps revit + modern', () => {
    const visible = visibleCategories();
    const ids = visible.map((c) => c.id);
    expect(ids).not.toContain('host');
    expect(ids).not.toContain('rhino');
    expect(ids).toContain('revit');
    // No hidden category leaks through.
    expect(visible.every((c) => !c.hidden)).toBe(true);
    // It is a strict subset: exactly the two hidden categories are dropped.
    expect(visible.length).toBe(NODE_LIBRARY.categories.length - 2);
  });

  it('does NOT remove host/rhino node types from the flat type map', () => {
    // Discovery hiding must not unregister the nodes.
    expect(NODE_TYPE_MAP['host-get-elements']).toBeTruthy();
    expect(NODE_TYPE_MAP['rhino-objects-by-layer']).toBeTruthy();
  });

  it('still resolves a host and a rhino node in the live core registry', () => {
    // The engine reaches legacy nodes through the registry, not visibleCategories().
    const registry = getLiveCoreRegistry();
    expect(registry.hasNode('host-get-elements')).toBe(true);
    expect(registry.hasNode('rhino-objects-by-layer')).toBe(true);
  });
});
