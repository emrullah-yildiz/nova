// FormaPairingRoom — a Durable Object that relays validated Forma protocol
// frames between the Nova Forma extension iframe (`forma-extension` peer) and
// the standalone Nova app (`nova-app` peer), joined by a PAIRING CODE. This is
// the Forma transport (cloud relay), the analogue of Revit's localhost hub —
// see docs/architecture/forma-connect.md. One DO instance per pairing code
// (addressed by idFromName(code)).
//
// Mirrors ProjectRoom (worker/room.mjs): the Worker authorizes the upgrade
// BEFORE it reaches the DO (the nova-app peer's cookie session is verified AND
// the room verifies the pairing code was issued to that user — Oracle F-001),
// then passes the resolved role + owning Nova user/org as trusted X-Nova-* /
// X-Forma-* headers. The DO trusts those headers because only the Worker can
// route to it. The DO is the authority on role-scoping (exactly one peer per
// role) and on validate-before-route (Oracle F-002): unknown/forged frames are
// rejected, never permissively forwarded. Each relayed WRITE frame produces a
// server-authoritative audit row (Oracle F-003) keyed by pairing room + Nova
// user — Forma writes have no approval prompt, so the audit IS the control.

/* global WebSocketPair */
import {
  evaluateJoin,
  routeFrame,
  presenceFrame,
  rejectionFrame,
  FORMA_PEER_ROLES
} from '../src/integrations/forma/forma-room-core.js';
import { recordFormaWriteAudit } from './api.mjs';

// The audit sink the DO writes write frames to. Defaults to the real Worker
// store path (recordFormaWriteAudit → getApi(env) → EnterpriseStore.recordFormaWrite,
// flushed to Neon). Test-only: __setFormaWriteAuditSink() swaps in a spy so the
// relay path can be exercised without booting a store, mirroring the
// __setCloudClientFactory injection pattern used by the SEC-013 wiring tests.
let auditSink = recordFormaWriteAudit;
export function __setFormaWriteAuditSink(fn) { auditSink = fn || recordFormaWriteAudit; }
export function __resetFormaWriteAuditSink() { auditSink = recordFormaWriteAudit; }

// Tear the room down once empty and idle for this long (mirrors the lifecycle
// note in the platform handoff). DO alarms would be the persistent variant;
// presence here is in-memory, so emptiness naturally collapses the isolate.
const IDLE_TEARDOWN_MS = 5 * 60 * 1000;

export class FormaPairingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // role → { ws, userId, organizationId, pairingRoom }
    this.peers = new Map();
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    const role = request.headers.get('X-Forma-Role') || '';
    // Resolved by the Worker from the pairing-code record (server-authoritative,
    // never from a client claim). The nova-app peer carries its verified session
    // user; the forma-extension peer carries the OWNING user the code was issued
    // to, so write audits are always keyed to the responsible Nova user.
    const identity = {
      role,
      userId: request.headers.get('X-Nova-User-Id') || '',
      organizationId: request.headers.get('X-Nova-Org-Id') || '',
      pairingRoom: request.headers.get('X-Forma-Pairing-Room') || ''
    };

    const decision = evaluateJoin(role, new Set(this.peers.keys()));
    if (!decision.ok) {
      // 409 for a role already taken / unknown role — the third/duplicate join.
      return new Response(JSON.stringify({ error: { code: 'FORMA_ROOM_JOIN_REJECTED', reason: decision.reason } }), {
        status: 409, headers: { 'Content-Type': 'application/json' }
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this._register(server, identity);

    return new Response(null, { status: 101, webSocket: client });
  }

  _register(ws, identity) {
    const { role } = identity;
    this.peers.set(role, { ws, ...identity });

    // Tell the joiner the current presence (so the Nova bridge can flip
    // isPaired() when both peers are present).
    this._send(ws, presenceFrame('peer.connected', role, new Set(this.peers.keys())));
    // Announce to the other peer.
    this._broadcastOthers(role, presenceFrame('peer.connected', role, new Set(this.peers.keys())));

    ws.addEventListener('message', (event) => {
      let frame;
      try { frame = JSON.parse(typeof event.data === 'string' ? event.data : ''); }
      catch { frame = null; }
      this._onFrame(role, frame);
    });

    const cleanup = () => this._unregister(role);
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);
  }

  _onFrame(fromRole, frame) {
    const sender = this.peers.get(fromRole);
    const decision = routeFrame(fromRole, frame);

    if (decision.action === 'reject') {
      // Validate-before-route (F-002): reject, never relay. Notify the sender so
      // the bridge can surface the error.
      if (sender) this._send(sender.ws, rejectionFrame(decision.reason, decision.errors, frame && frame.id));
      // A forged/invalid WRITE frame is still accountability-relevant: record a
      // denial row so a rejected write attempt is auditable too (F-003).
      if (frame && typeof frame === 'object' && isWriteType(frame.type)) {
        this._auditWrite(sender, frame.type, false, { reason: decision.reason });
      }
      return;
    }

    // Relay to the other peer (if present). A write with no peer to receive it
    // is still audited (the attempt happened) and a not-paired error returned.
    const target = this.peers.get(decision.toRole);
    if (decision.isWrite) {
      this._auditWrite(sender, decision.operation, !!target, target ? {} : { reason: 'peer_absent' });
    }
    if (!target) {
      if (sender) this._send(sender.ws, rejectionFrame('peer_absent', [`No ${decision.toRole} peer is connected.`], frame && frame.id));
      return;
    }
    this._send(target.ws, decision.frame);
  }

  // F-003: persist a server-authoritative audit row for a Forma write frame,
  // keyed by pairing room + the owning Nova user (resolved by the Worker from
  // the pairing-code record, carried on the peer identity). Best-effort: a
  // failed audit write never breaks the relay loop, but it is logged.
  _auditWrite(sender, operation, ok, metadata = {}) {
    const id = sender || {};
    try {
      const p = auditSink(this.env, {
        userId: id.userId || '',
        organizationId: id.organizationId || '',
        pairingRoom: id.pairingRoom || '',
        operation,
        ok,
        metadata
      });
      if (this.state && typeof this.state.waitUntil === 'function' && p && typeof p.then === 'function') {
        this.state.waitUntil(p.catch((e) => console.error('[forma-room] audit failed:', (e && e.message) || e)));
      } else if (p && typeof p.catch === 'function') {
        p.catch((e) => console.error('[forma-room] audit failed:', (e && e.message) || e));
      }
    } catch (e) {
      console.error('[forma-room] audit threw:', (e && e.message) || e);
    }
  }

  _unregister(role) {
    if (!this.peers.has(role)) return;
    this.peers.delete(role);
    this._broadcastOthers(role, presenceFrame('peer.disconnected', role, new Set(this.peers.keys())));
    // Lifecycle: empty room → let the isolate idle out. (DO storage isn't used,
    // so there is no persisted state to clean up.)
    if (this.peers.size === 0 && this.state && typeof this.state.waitUntil === 'function') {
      // Best-effort idle hint; the platform reclaims the empty isolate.
      void IDLE_TEARDOWN_MS;
    }
  }

  _send(ws, payload) {
    try { ws.send(JSON.stringify(payload)); } catch { /* socket gone */ }
  }

  _broadcastOthers(fromRole, payload) {
    const data = JSON.stringify(payload);
    for (const [role, peer] of this.peers) {
      if (role === fromRole) continue;
      try { peer.ws.send(data); } catch { this.peers.delete(role); }
    }
  }
}

// Local write-type check (kept in the shell so the DO doesn't need to import the
// bridge's predicate twice through different paths). Mirrors
// FORMA_WRITE_MESSAGE_TYPES from forma-bridge.js.
const FORMA_WRITE_TYPES = new Set(['forma.geometry.send', 'forma.building.create', 'forma.building.update']);
function isWriteType(type) { return FORMA_WRITE_TYPES.has(type); }

export { FORMA_PEER_ROLES };
