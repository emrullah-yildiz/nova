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
