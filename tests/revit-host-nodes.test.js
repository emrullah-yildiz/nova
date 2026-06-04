// M4-T4 — legacy Revit host nodes that drive the round-trip via the M4-T3 bridge.
// Each node's execute() is exercised against a MOCKED bridge (injected through
// context.revitBridge), asserting it calls the bridge with correctly-shaped args
// and surfaces the result — no Revit host / live transport needed.

import { describe, it, expect, vi } from 'vitest';
import { NODE_TYPE_MAP, NODE_LIBRARY } from '../src/core/nodes.js';
import { createCoreNodeRegistry, getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { executeRegistryNodeUnlaced } from '../src/nodes/runtimeAdapter.js';

const def = (type) => NODE_TYPE_MAP[type];

// A bridge mock matching the M4-T3 surface (requestSelection/placeInstance/
// getParameters/setParameters). Each method records its call and returns a
// canned, contract-shaped payload.
function makeBridge(overrides = {}) {
  return {
    requestSelection: vi.fn(async () => ({ elements: [] })),
    placeInstance: vi.fn(async () => ({ ok: true, data: { elementIds: [] } })),
    getParameters: vi.fn(async () => ({ elementId: '', params: {} })),
    setParameters: vi.fn(async () => ({ ok: true, data: {} })),
    ...overrides
  };
}

describe('M4 Revit host node registration', () => {
  // The live-bridge execute() round-trip nodes that remain after the
  // fix/revit-node-dedup consolidation. The single-element parameter nodes
  // (revit-get-parameters / revit-set-parameters) were removed as duplicates of
  // the batch, app-wired Revit.Get/SetParameterValues nodes.
  const types = [
    'revit-select-elements',
    'revit-select-faces',
    'revit-place-family-instance',
    'revit-place-adaptive-component'
  ];

  it('registers all four M4 round-trip nodes in the existing Revit category', () => {
    const revit = NODE_LIBRARY.categories.find((c) => c.id === 'revit');
    expect(revit).toBeTruthy();
    const names = revit.nodes.map((n) => n.type);
    types.forEach((t) => expect(names).toContain(t));
    // Folded into the existing Revit category — no parallel/duplicate category.
    const revitCats = NODE_LIBRARY.categories.filter((c) => c.id === 'revit');
    expect(revitCats).toHaveLength(1);
  });

  it('every M4 node carries an async execute', () => {
    types.forEach((t) => {
      expect(def(t)).toBeTruthy();
      expect(typeof def(t).execute).toBe('function');
    });
  });

  // Dedup guard: the removed single-element parameter duplicates must NOT come
  // back. There is exactly ONE get-parameters node (the batch
  // revit-get-parameter-values) and ONE set-parameters node
  // (revit-set-parameter-values) in the Revit category.
  it('does not re-register the removed single-element parameter duplicates', () => {
    expect(def('revit-get-parameters')).toBeUndefined();
    expect(def('revit-set-parameters')).toBeUndefined();
  });

  it('keeps exactly one canonical get- and one set-parameters node', () => {
    const revit = NODE_LIBRARY.categories.find((c) => c.id === 'revit');
    const typeList = revit.nodes.map((n) => n.type);
    const getParamNodes = typeList.filter((t) => /get-param/i.test(t));
    const setParamNodes = typeList.filter((t) => /set-param/i.test(t));
    expect(getParamNodes).toEqual(['revit-get-parameter-values']);
    expect(setParamNodes).toEqual(['revit-set-parameter-values']);
  });

  it('matches the expected canonical Revit node inventory', () => {
    const revit = NODE_LIBRARY.categories.find((c) => c.id === 'revit');
    const typeList = revit.nodes.map((n) => n.type).sort();
    expect(typeList).toEqual([
      'revit-all-elements-view',
      'revit-all-of-category',
      'revit-element-bounding-box',
      'revit-element-by-id',
      'revit-element-faces',
      'revit-element-geometries',
      'revit-element-info',
      'revit-element-location',
      'revit-element-phase',
      'revit-element-solids',
      'revit-element-workset',
      'revit-elements-by-type',
      'revit-family-types',
      'revit-filter-by-level',
      'revit-filter-by-parameter',
      'revit-get-parameter-values',
      'revit-material-collect',
      'revit-parameter-by-builtin',
      'revit-place-adaptive-component',
      'revit-place-family-instance',
      'revit-select-elements',
      'revit-select-faces',
      'revit-send-geometry',
      'revit-set-parameter-values',
      'revit-type-parameters'
    ]);
  });

  it('builds a fresh registry with no duplicate-type collision', () => {
    // Building a fresh registry must not throw a "Node type already registered"
    // collision (registry.js throws on a duplicate canonical type / alias).
    expect(() => createCoreNodeRegistry()).not.toThrow();
    const registry = createCoreNodeRegistry();
    // The legacy host nodes bridge into the registry (legacyCoreNodes), so they
    // resolve there as legacy-sourced defs — present, single, collision-free.
    types.forEach((t) => {
      expect(registry.hasNode(t)).toBe(true);
      expect(registry.getNode(t).metadata && registry.getNode(t).metadata.source).toBe('legacy-node-library');
    });
  });

  it('throws a clear connect-first error when no bridge is available', async () => {
    await expect(def('revit-select-elements').execute({}, {}, {})).rejects.toThrow(/Nova Connect Revit bridge is not available/);
  });
});

describe('Revit.SelectElements', () => {
  it('calls requestSelection and surfaces elements/ids/count', async () => {
    const bridge = makeBridge({
      requestSelection: vi.fn(async () => ({
        elements: [
          { id: '1001', name: 'Wall A', category: 'Walls' },
          { id: '1002', name: 'Wall B', category: 'Walls' }
        ]
      }))
    });
    const out = await def('revit-select-elements').execute(
      { revitBridge: bridge },
      {},
      { categories: 'Walls, Doors' }
    );
    expect(bridge.requestSelection).toHaveBeenCalledTimes(1);
    expect(bridge.requestSelection).toHaveBeenCalledWith({ categories: ['Walls', 'Doors'] });
    expect(out.ids).toEqual(['1001', '1002']);
    expect(out.count).toBe(2);
    expect(out.elements).toHaveLength(2);
  });

  it('omits categories when the control is blank', async () => {
    const bridge = makeBridge();
    await def('revit-select-elements').execute({ revitBridge: bridge }, {}, { categories: '' });
    expect(bridge.requestSelection).toHaveBeenCalledWith({});
  });
});

describe('Revit.SelectFaces', () => {
  it('requests selection with includeFaces and flattens face ids', async () => {
    const bridge = makeBridge({
      requestSelection: vi.fn(async () => ({
        elements: [
          { id: '1', faces: [{ faceId: 'f1' }, { faceId: 'f2' }] },
          { id: '2', faces: [{ faceId: 'f3' }] }
        ]
      }))
    });
    const out = await def('revit-select-faces').execute({ revitBridge: bridge }, {}, { categories: '' });
    expect(bridge.requestSelection).toHaveBeenCalledWith({ includeFaces: true });
    expect(out.faceIds).toEqual(['f1', 'f2', 'f3']);
    expect(out.count).toBe(3);
  });
});

describe('Revit.PlaceFamilyInstance', () => {
  it('calls placeInstance with kind familyInstance and reads result.data.elementIds', async () => {
    const bridge = makeBridge({
      placeInstance: vi.fn(async () => ({ ok: true, data: { elementIds: [5001, 5002] } }))
    });
    const points = [[0, 0, 0], [1, 0, 0]];
    const out = await def('revit-place-family-instance').execute(
      { revitBridge: bridge },
      { familyType: 'Chair', points, hostFaceId: 'face-9', params: { Mark: 'A' } },
      { requireApproval: true }
    );
    expect(bridge.placeInstance).toHaveBeenCalledTimes(1);
    const spec = bridge.placeInstance.mock.calls[0][0];
    expect(spec.kind).toBe('familyInstance');
    expect(spec.familyType).toBe('Chair');
    expect(spec.points).toBe(points);
    expect(spec.hostFaceId).toBe('face-9');
    expect(spec.params).toEqual({ Mark: 'A' });
    // Approval metadata passed THROUGH (not fabricated approval).
    expect(spec.approval).toMatchObject({ required: true });
    // result.data.elementIds, coerced to strings.
    expect(out.elementIds).toEqual(['5001', '5002']);
    expect(out.count).toBe(2);
    expect(out.success).toBe(true);
  });

  it('omits approval metadata when requireApproval is false', async () => {
    const bridge = makeBridge();
    await def('revit-place-family-instance').execute(
      { revitBridge: bridge },
      { familyType: 'Chair', points: [[0, 0, 0]] },
      { requireApproval: false }
    );
    const spec = bridge.placeInstance.mock.calls[0][0];
    expect(spec.approval).toBeUndefined();
    expect(spec.hostFaceId).toBeUndefined();
  });
});

describe('Revit.PlaceAdaptiveComponent', () => {
  it('calls placeInstance with kind adaptiveComponent and surfaces element ids', async () => {
    const bridge = makeBridge({
      placeInstance: vi.fn(async () => ({ ok: true, data: { elementIds: ['7001'] } }))
    });
    const points = [[0, 0, 0], [1, 1, 0], [2, 0, 0]];
    const out = await def('revit-place-adaptive-component').execute(
      { revitBridge: bridge },
      { familyType: 'Panel', points },
      { requireApproval: true }
    );
    const spec = bridge.placeInstance.mock.calls[0][0];
    expect(spec.kind).toBe('adaptiveComponent');
    expect(spec.familyType).toBe('Panel');
    expect(spec.points).toBe(points);
    expect(out.elementIds).toEqual(['7001']);
    expect(out.count).toBe(1);
    expect(out.success).toBe(true);
  });
});

// NOTE: Revit.GetParameters / Revit.SetParameters (the single-element M4
// parameter nodes) were removed as duplicates of the batch, app-wired
// Revit.Get/SetParameterValues nodes — see fix/revit-node-dedup. Their live
// behavior (read/write parameters with the SEC-013 token gate) is covered by
// the engine pre-pass tests in tests/engine.test.js
// ('reads cached Revit parameter values' / 'prefetches live Revit parameter
// writes for SetParameterValues nodes').

describe('element-id extraction (result.data.elementIds variants)', () => {
  it('handles top-level elementIds, single id, and bare array shapes', async () => {
    const shapes = [
      { res: { ok: true, elementIds: ['a'] }, expected: ['a'] },
      { res: { ok: true, data: { elementId: 'b' } }, expected: ['b'] },
      { res: ['c', 'd'], expected: ['c', 'd'] },
      { res: { ok: false, data: {} }, expected: [] }
    ];
    for (const { res, expected } of shapes) {
      const bridge = makeBridge({ placeInstance: vi.fn(async () => res) });
      const out = await def('revit-place-family-instance').execute(
        { revitBridge: bridge },
        { familyType: 'X', points: [[0, 0, 0]] },
        { requireApproval: true }
      );
      expect(out.elementIds).toEqual(expected);
    }
  });
});

// ── Regression guard for F-001/F-002 (the legacy→registry bridge dropping
// `execute`). The LIVE engine reaches a legacy node only through
// getLiveCoreRegistry().getNode(type) (engine.js default branch), NOT through
// NODE_TYPE_MAP (which the rest of this file uses). If legacyBridge.js stops
// carrying `execute` through, these nodes become inert in the app even though
// every NODE_TYPE_MAP-based test above still passes — so this block drives the
// node the way the engine does. ──
describe('engine registry path (F-001/F-002 wiring guard)', () => {
  const types = [
    'revit-select-elements',
    'revit-select-faces',
    'revit-place-family-instance',
    'revit-place-adaptive-component'
  ];

  it('exposes each M4 node execute on the LIVE core registry (not just NODE_TYPE_MAP)', () => {
    const registry = getLiveCoreRegistry();
    types.forEach((t) => {
      const node = registry.getNode(t);
      expect(node, `registry should resolve ${t}`).toBeTruthy();
      // This is the exact predicate engine.js gates dispatch on:
      // `typeof registryNode.execute === 'function'`.
      expect(typeof node.execute, `${t}.execute must be a function on the registry`).toBe('function');
    });
  });

  it('a fresh registry (createCoreNodeRegistry) also carries execute through the bridge', () => {
    const registry = createCoreNodeRegistry();
    types.forEach((t) => {
      expect(typeof registry.getNode(t).execute).toBe('function');
    });
  });

  it('does NOT add an execute to pure-codegen legacy nodes (no behavior change for them)', () => {
    const registry = getLiveCoreRegistry();
    // These older legacy Revit/host nodes define NO execute — they must stay
    // execute-less so they keep running via codegen / the app pre-pass cache.
    ['revit-element-geometries', 'revit-get-parameter-values', 'host-get-elements', 'rhino-objects-by-layer'].forEach((t) => {
      const node = registry.getNode(t);
      expect(node).toBeTruthy();
      expect(node.execute == null).toBe(true);
    });
  });

  it('drives revit-select-elements through executeRegistryNodeUnlaced (the engine dispatch helper) with a mocked bridge', async () => {
    const registry = getLiveCoreRegistry();
    const node = registry.getNode('revit-select-elements');
    const bridge = makeBridge({
      requestSelection: vi.fn(async () => ({ elements: [{ id: '1001' }, { id: '1002' }] }))
    });
    // Mirror the engine: the registry node + getInput/getVal closures + a context.
    // The node resolves the bridge from context.revitBridge.
    const nodeInstance = { type: 'revit-select-elements', controlValues: { categories: 'Walls' } };
    // The helper invokes execute (proving the registry-path dispatch reaches it).
    // execute is async, so the helper hands back a thenable for the multi-output
    // object; the engine's live round-trip resolves it via the async pre-pass
    // (see residual note in docs/agent-handoff.md). Here we await the bridge work.
    executeRegistryNodeUnlaced(node, nodeInstance, () => undefined, (id, def) => def, { revitBridge: bridge });
    expect(bridge.requestSelection).toHaveBeenCalledWith({ categories: ['Walls'] });

    // And the node's resolved output is the expected, correct shape.
    const out = await node.execute({ revitBridge: bridge }, {}, { categories: 'Walls' });
    expect(out.ids).toEqual(['1001', '1002']);
    expect(out.count).toBe(2);
  });

  it('drives revit-place-family-instance (a WRITE) through the dispatch helper and passes approval through', async () => {
    const registry = getLiveCoreRegistry();
    const node = registry.getNode('revit-place-family-instance');
    const bridge = makeBridge({ placeInstance: vi.fn(async () => ({ ok: true, data: { elementIds: ['e-9'] } })) });
    const nodeInstance = { type: 'revit-place-family-instance', controlValues: { familyType: 'Chair', requireApproval: true } };
    executeRegistryNodeUnlaced(
      node,
      nodeInstance,
      (portId) => {
        if (portId === 'familyType') return 'Chair';
        if (portId === 'points') return [[0, 0, 0]];
        return undefined;
      },
      (id, def) => def,
      { revitBridge: bridge }
    );
    // The registry node's execute ran with the engine-resolved inputs/controls.
    const spec = bridge.placeInstance.mock.calls[0][0];
    expect(spec.kind).toBe('familyInstance');
    expect(spec.familyType).toBe('Chair');
    // Approval metadata passed THROUGH (not a fabricated approval).
    expect(spec.approval).toMatchObject({ required: true });
  });
});

describe('runtime bridge resolution via globalThis', () => {
  it('falls back to globalThis.NovaRevitBridge when no context bridge is injected', async () => {
    const bridge = makeBridge({
      requestSelection: vi.fn(async () => ({ elements: [{ id: 'g1' }] }))
    });
    globalThis.NovaRevitBridge = bridge;
    try {
      const out = await def('revit-select-elements').execute({}, {}, { categories: '' });
      expect(bridge.requestSelection).toHaveBeenCalled();
      expect(out.ids).toEqual(['g1']);
    } finally {
      delete globalThis.NovaRevitBridge;
    }
  });
});
