import { createRequire } from 'node:module';
import { afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { NovaConnectClient } from '../src/integrations/connect/client.js';
import { NovaRevitHostAdapter } from '../src/integrations/connect/revit-host.js';
import { Geo } from '../src/geometry/index.js';

const require = createRequire(import.meta.url);
const { createConnectHub } = require('../scripts/connect-hub.cjs');

function waitForListening(server) {
  if (server.address()) return Promise.resolve();
  return new Promise(resolve => server.once('listening', resolve));
}

async function waitFor(assertion, timeoutMs = 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (assertion()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
}

describe('NovaRevitHostAdapter', () => {
  let hub;
  let host;
  let client;

  afterEach(async () => {
    if (client) client.disconnect();
    if (host) host.disconnect();
    if (hub) await hub.close();
    client = null;
    host = null;
    hub = null;
  });

  it('serves Revit snapshot, elements, geometry, and mock DirectShape creation over the hub', async () => {
    hub = createConnectHub({ port: 0, pairingToken: 'pair-1' });
    await waitForListening(hub.server);
    const url = 'ws://127.0.0.1:' + hub.server.address().port;
    host = new NovaRevitHostAdapter({ url, pairingToken: 'pair-1', WebSocketImpl: WebSocket });
    client = new NovaConnectClient({ url, pairingToken: 'pair-1', WebSocketImpl: WebSocket });

    await host.connect();
    await client.connect();
    await waitFor(() => host.sessionId && client.sessionId);

    const snapshot = await client.getProjectSnapshot();
    const walls = await client.queryElements('Walls');
    const geometries = await client.getGeometry([walls[0].identity.sourceId]);
    const createResult = await client.sendGeometry(
      new Geo.Mesh3([
        new Geo.Point3(0, 0, 0),
        new Geo.Point3(1, 0, 0),
        new Geo.Point3(0, 1, 0)
      ], [[0, 1, 2]]),
      { source: 'revit-local', sourceId: 'nova-mesh' },
      { metadata: { category: 'Generic Models' } }
    );

    expect(snapshot.projectName).toBe('Mock Revit Project');
    expect(walls).toHaveLength(1);
    expect(walls[0].identity.source).toBe('revit-local');
    expect(geometries[0]).toMatchObject({ _type: 'GeometryEnvelope', kind: 'mesh' });
    expect(createResult).toMatchObject({
      ok: true,
      data: expect.objectContaining({ directShapeId: 'mock-directshape-1' })
    });
  });
});
