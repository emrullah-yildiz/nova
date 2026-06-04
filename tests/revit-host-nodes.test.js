// M4-T4 — legacy Revit host nodes that drive the round-trip via the M4-T3 bridge.
// Each node's execute() is exercised against a MOCKED bridge (injected through
// context.revitBridge), asserting it calls the bridge with correctly-shaped args
// and surfaces the result — no Revit host / live transport needed.

import { describe, it, expect, vi } from 'vitest';
import { NODE_TYPE_MAP, NODE_LIBRARY } from '../src/core/nodes.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';

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
  const types = [
    'revit-select-elements',
    'revit-select-faces',
    'revit-place-family-instance',
    'revit-place-adaptive-component',
    'revit-get-parameters',
    'revit-set-parameters'
  ];

  it('registers all six M4 round-trip nodes in the existing Revit category', () => {
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

describe('Revit.GetParameters', () => {
  it('calls getParameters with element id + name list and surfaces params/values', async () => {
    const bridge = makeBridge({
      getParameters: vi.fn(async () => ({ elementId: '42', params: { Comments: 'hi', Mark: 'M1' } }))
    });
    const out = await def('revit-get-parameters').execute(
      { revitBridge: bridge },
      { element: { id: 42 }, names: 'Comments, Mark' },
      { names: 'Comments' }
    );
    expect(bridge.getParameters).toHaveBeenCalledWith('42', ['Comments', 'Mark']);
    expect(out.elementId).toBe('42');
    expect(out.params).toEqual({ Comments: 'hi', Mark: 'M1' });
    expect(out.values).toEqual(['hi', 'M1']);
  });

  it('falls back to the names control when the port is empty', async () => {
    const bridge = makeBridge({
      getParameters: vi.fn(async () => ({ elementId: '9', params: { Comments: 'x' } }))
    });
    await def('revit-get-parameters').execute(
      { revitBridge: bridge },
      { element: '9' },
      { names: 'Comments' }
    );
    expect(bridge.getParameters).toHaveBeenCalledWith('9', ['Comments']);
  });
});

describe('Revit.SetParameters', () => {
  it('calls setParameters with element id + params map and passes approval through', async () => {
    const bridge = makeBridge({
      setParameters: vi.fn(async () => ({ ok: true, data: {} }))
    });
    const out = await def('revit-set-parameters').execute(
      { revitBridge: bridge },
      { element: { identity: { sourceId: 'u-77' } }, params: { Comments: 'done' } },
      { requireApproval: true }
    );
    expect(bridge.setParameters).toHaveBeenCalledTimes(1);
    const [elementId, params, deps] = bridge.setParameters.mock.calls[0];
    expect(elementId).toBe('u-77');
    expect(params).toEqual({ Comments: 'done' });
    expect(deps.approval).toMatchObject({ required: true });
    expect(out.elementId).toBe('u-77');
    expect(out.success).toBe(true);
  });

  it('does not fabricate approval when requireApproval is false', async () => {
    const bridge = makeBridge();
    await def('revit-set-parameters').execute(
      { revitBridge: bridge },
      { element: '3', params: { Mark: 'Z' } },
      { requireApproval: false }
    );
    const [, , deps] = bridge.setParameters.mock.calls[0];
    expect(deps.approval).toBeUndefined();
  });
});

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
