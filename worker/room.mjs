// ProjectRoom — a Durable Object that fans out presence (cursors) and graph
// edit-ops between everyone viewing/editing the same cloud project. One DO
// instance per project (addressed by idFromName(projectId)).
//
// Identity + role are resolved by the Worker BEFORE the upgrade reaches here
// (cookie session → project membership), then passed as X-Nova-* headers. The
// DO trusts those headers because only the Worker can route to it — a browser
// cannot reach the DO directly. The room is the authority on who may write:
// viewer `op` messages are dropped (see routeRoomMessage), so a tampered client
// still cannot mutate the shared graph.

/* global WebSocketPair */
import { routeRoomMessage, buildInitPayload } from '../src/app/collab-core.js';

export class ProjectRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // connId → { ws, userId, firstName, color, role }
    this.peers = new Map();
    this._nextConnId = 1;
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    const identity = {
      userId: request.headers.get('X-Nova-User-Id') || '',
      firstName: request.headers.get('X-Nova-First-Name') || 'Guest',
      color: request.headers.get('X-Nova-Color') || '#4d96ff',
      role: request.headers.get('X-Nova-Role') || 'Viewer'
    };
    if (!identity.userId) return new Response('Missing identity.', { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this._register(server, identity);

    return new Response(null, { status: 101, webSocket: client });
  }

  _register(ws, identity) {
    const connId = 'c' + (this._nextConnId++);
    this.peers.set(connId, { ws, ...identity });

    // Tell the joiner who is already here (so they can draw existing cursors),
    // plus their own resolved role (the client gates editing affordances on it).
    try {
      const init = buildInitPayload({ peers: this.peers }, connId);
      ws.send(JSON.stringify({ ...init, you: { userId: identity.userId, role: identity.role } }));
    } catch { /* socket already gone */ }

    // Announce the new peer to everyone else.
    this._broadcast(connId, 'others', {
      type: 'join', userId: identity.userId, firstName: identity.firstName, color: identity.color
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(typeof event.data === 'string' ? event.data : ''); }
      catch { return; }
      const { broadcasts } = routeRoomMessage({ peers: this.peers }, connId, msg);
      for (const b of broadcasts) this._broadcast(connId, b.target, b.payload);
    });

    const cleanup = () => this._unregister(connId);
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
  }

  _unregister(connId) {
    const peer = this.peers.get(connId);
    if (!peer) return;
    this.peers.delete(connId);
    this._broadcast(connId, 'others', { type: 'leave', userId: peer.userId });
  }

  // target: 'self' | 'others' | 'all'
  _broadcast(fromConnId, target, payload) {
    const data = JSON.stringify(payload);
    for (const [connId, peer] of this.peers) {
      if (target === 'self' && connId !== fromConnId) continue;
      if (target === 'others' && connId === fromConnId) continue;
      try { peer.ws.send(data); }
      catch { this.peers.delete(connId); }
    }
  }
}
