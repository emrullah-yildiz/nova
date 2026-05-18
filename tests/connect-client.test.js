import { beforeEach } from 'vitest';
import { NovaConnectClient } from '../src/integrations/connect/client.js';

class FakeSocket {
  constructor() {
    this.readyState = 1;
    this.sent = [];
    FakeSocket.instance = this;
    setTimeout(() => this.onopen && this.onopen(), 0);
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
}

describe('NovaConnectClient', () => {
  beforeEach(() => {
    FakeSocket.instance = null;
  });

  it('connects to the local hub with a pairing token', async () => {
    const client = new NovaConnectClient({
      WebSocketImpl: FakeSocket,
      pairingToken: 'token-1'
    });

    await client.connect();

    expect(client.status).toBe('connected');
    expect(FakeSocket.instance.sent[0]).toMatchObject({
      type: 'hello',
      source: 'nova-browser',
      target: 'hub',
      payload: expect.objectContaining({ role: 'viewer', pairingToken: 'token-1' })
    });
  });

  it('routes request replies by replyTo and caches element records', async () => {
    const client = new NovaConnectClient({ WebSocketImpl: FakeSocket });
    await client.connect();

    const query = client.queryElements('Walls');
    const requestEnvelope = FakeSocket.instance.sent[1];
    client.handleMessage(JSON.stringify({
      version: 1,
      id: 'reply-1',
      replyTo: requestEnvelope.id,
      type: 'elements.query.result',
      source: 'revit-local',
      target: 'nova-browser',
      sessionId: 'session-1',
      projectId: 'project-1',
      timestamp: Date.now(),
      payload: {
        elements: [
          { id: 3001, name: 'Basic Wall', category: 'Walls', params: { Mark: 'W-01' } }
        ]
      },
      error: null
    }));

    const records = await query;

    expect(records).toHaveLength(1);
    expect(records[0].identity.source).toBe('revit-local');
    expect(client.elementsByCategory.Walls[0].identity.sourceId).toBe('3001');
  });
});
