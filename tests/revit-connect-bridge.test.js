import { vi } from 'vitest';
import { installRevitNodes } from '../src/integrations/revit/revit-nodes.js';
import { createGeometryEnvelope } from '../src/integrations/connect/protocol.js';
import { Geo } from '../src/geometry/index.js';

function createRuntime(novaConnect = null) {
  return {
    NovaConnect: novaConnect,
    console
  };
}

describe('RevitBridge Nova Connect integration', () => {
  it('wraps cached live ElementRecords with stable source identity', () => {
    const runtime = createRuntime({
      status: 'connected',
      elementsByCategory: {
        Walls: [
          {
            _type: 'ElementRecord',
            id: 3001,
            name: 'Basic Wall',
            category: 'Walls',
            params: { Mark: 'W-01' },
            identity: {
              source: 'revit-local',
              sourceId: '3001',
              versionId: 'doc-1',
              units: { system: 'feet', scaleToMeters: 0.3048 },
              coordinateSystem: 'revit-internal',
              transform: null
            }
          }
        ]
      },
      geometryById: {}
    });
    const bridge = installRevitNodes(runtime);

    const walls = bridge.getElements('Walls');

    expect(walls).toHaveLength(1);
    expect(walls[0]._type).toBe('RevitElement');
    expect(walls[0].identity.sourceId).toBe('3001');
    expect(walls[0].identity.versionId).toBe('doc-1');
  });

  it('converts cached live geometry envelopes into Geo meshes', () => {
    const envelope = createGeometryEnvelope(
      new Geo.Mesh3([
        new Geo.Point3(0, 0, 0),
        new Geo.Point3(1, 0, 0),
        new Geo.Point3(0, 1, 0)
      ], [[0, 1, 2]]),
      { source: 'revit-local', sourceId: '3001' }
    );
    const runtime = createRuntime({
      status: 'connected',
      elementsByCategory: {},
      geometryById: { 3001: envelope }
    });
    const bridge = installRevitNodes(runtime);
    const element = bridge.wrapElement({ id: 3001, category: 'Walls' });

    const geometries = bridge.getGeometries([element]);

    expect(geometries).toHaveLength(1);
    expect(geometries[0]._type).toBe('Mesh3');
    expect(geometries[0].vertices).toHaveLength(3);
  });

  it('returns meshes for mixed Revit categories from exported mesh records', () => {
    const runtime = createRuntime({
      status: 'connected',
      elementsByCategory: {
        Walls: [{ id: 101, category: 'Walls', name: 'Wall' }],
        Doors: [{ id: 202, category: 'Doors', name: 'Door' }],
        Furniture: [{ id: 303, category: 'Furniture', name: 'Chair' }]
      },
      geometryById: {}
    });
    runtime.REVIT_MESHES = [
      { id: 101, category: 'Walls', vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      { elementId: 202, category: 'Doors', vertices: [0, 0, 1, 1, 0, 1, 0, 1, 1], indices: [0, 1, 2] },
      { sourceId: 303, category: 'Furniture', vertices: [0, 0, 2, 1, 0, 2, 0, 1, 2], indices: [0, 1, 2] }
    ];
    const bridge = installRevitNodes(runtime);

    const geometries = bridge.getGeometries([
      ...bridge.getElements('Walls'),
      ...bridge.getElements('Doors'),
      ...bridge.getElements('Furniture')
    ]);

    expect(geometries).toHaveLength(3);
    expect(geometries.every(geo => geo._type === 'Mesh3')).toBe(true);
    expect(geometries.map(geo => geo.sourceCategory)).toEqual(['Walls', 'Doors', 'Furniture']);
  });

  it('returns all mesh parts for elements that export multiple solids', () => {
    const runtime = createRuntime({
      status: 'connected',
      elementsByCategory: {
        'Generic Models': [{ id: 505, category: 'Generic Models', name: 'Multi Solid' }]
      },
      geometryById: {
        505: [
          { id: 505, category: 'Generic Models', vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
          { id: 505, category: 'Generic Models', vertices: [0, 0, 1, 1, 0, 1, 0, 1, 1], indices: [0, 1, 2] }
        ]
      }
    });
    const bridge = installRevitNodes(runtime);

    const geometries = bridge.getGeometries(bridge.getElements('Generic Models'));

    expect(geometries).toHaveLength(2);
    expect(geometries.every(geo => geo.sourceId === 505)).toBe(true);
  });

  it('uses embedded element geometry when the Revit payload carries geometry per element', () => {
    const runtime = createRuntime({
      status: 'connected',
      elementsByCategory: {
        Windows: [{
          id: 404,
          category: 'Windows',
          geometries: [{
            vertices: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }],
            faces: [[0, 1, 2]],
            color: '#f9e2af',
            category: 'Windows'
          }]
        }]
      },
      geometryById: {}
    });
    const bridge = installRevitNodes(runtime);

    const geometries = bridge.getGeometries(bridge.getElements('Windows'));

    expect(geometries).toHaveLength(1);
    expect(geometries[0].vertices).toHaveLength(3);
    expect(geometries[0].faces).toEqual([[0, 1, 2]]);
    expect(geometries[0].color).toBe(0xf9e2af);
  });

  it('batches live geometry requests using string source ids', async () => {
    const getGeometry = vi.fn(async ids => ids.map(id => createGeometryEnvelope(
      new Geo.Mesh3([
        new Geo.Point3(0, 0, 0),
        new Geo.Point3(1, 0, 0),
        new Geo.Point3(0, 1, 0)
      ], [[0, 1, 2]]),
      { source: 'revit-local', sourceId: id }
    )));
    const runtime = createRuntime({
      status: 'connected',
      elementsByCategory: {},
      geometryById: {},
      getGeometry
    });
    const bridge = installRevitNodes(runtime);
    const elements = Array.from({ length: 3 }, (_, index) => bridge.wrapElement({
      id: 9000 + index,
      category: 'Generic Models',
      identity: { source: 'revit-local', sourceId: String(9000 + index) }
    }));

    const geometries = await bridge.getLiveGeometries(elements, { batchSize: 2 });

    expect(getGeometry).toHaveBeenCalledTimes(2);
    expect(getGeometry.mock.calls[0][0]).toEqual(['9000', '9001']);
    expect(getGeometry.mock.calls[1][0]).toEqual(['9002']);
    expect(geometries).toHaveLength(3);
  });

  it('sends geometry through the live Nova Connect client', async () => {
    const sendGeometry = vi.fn(async () => ({ ok: true, data: { elementId: 9001 } }));
    const runtime = createRuntime({
      status: 'connected',
      elementsByCategory: {},
      geometryById: {},
      sendGeometry
    });
    const bridge = installRevitNodes(runtime);

    const result = await bridge.sendGeometry(new Geo.Point3(1, 2, 3), { source: 'revit-local', sourceId: 'new' });

    expect(result).toEqual({ ok: true, data: { elementId: 9001 } });
    expect(sendGeometry).toHaveBeenCalled();
  });
});
