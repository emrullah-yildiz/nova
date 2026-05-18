import { createRequire } from 'node:module';
import { afterEach } from 'vitest';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const { createConnectHub } = require('../scripts/connect-hub.cjs');

function waitForListening(server) {
  if (server.address()) return Promise.resolve();
  return new Promise(resolve => server.once('listening', resolve));
}

function openSocket(url) {
  return new Promise(resolve => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
  });
}

function nextMessage(socket) {
  return new Promise(resolve => {
    socket.once('message', raw => resolve(JSON.parse(raw.toString())));
  });
}

function envelope(type, source, target, payload = {}) {
  return JSON.stringify({
    version: 1,
    id: source + '-' + type,
    type,
    source,
    target,
    sessionId: 'session-1',
    projectId: 'project-1',
    timestamp: Date.now(),
    payload,
    error: null
  });
}

describe('Nova Connect hub', () => {
  let hub;

  afterEach(async () => {
    if (hub) await hub.close();
    hub = null;
  });

  it('pairs host and browser clients, then routes browser requests to the host', async () => {
    hub = createConnectHub({ port: 0, pairingToken: 'pair-1' });
    await waitForListening(hub.server);
    const port = hub.server.address().port;
    const url = 'ws://127.0.0.1:' + port;
    const host = await openSocket(url);
    const viewer = await openSocket(url);

    host.send(envelope('hello', 'revit-plugin', 'hub', { role: 'host', pairingToken: 'pair-1' }));
    viewer.send(envelope('hello', 'nova-browser', 'hub', { role: 'viewer', pairingToken: 'pair-1' }));
    await nextMessage(host);
    await nextMessage(viewer);

    viewer.send(envelope('elements.query', 'nova-browser', 'host', { category: 'Walls' }));
    const routed = await nextMessage(host);

    expect(routed).toMatchObject({
      type: 'elements.query',
      source: 'nova-browser',
      target: 'host',
      sessionId: 'session-1',
      payload: { category: 'Walls' }
    });

    host.close();
    viewer.close();
  });
});
