// FM-M1 — Forma pairing-room platform tests (Link / platform-engineer).
// Covers: pairing-code issuance + session binding (F-001), one-time-join,
// expiry, revoke; the room-core validate-before-route allow-list (F-002) +
// role-scoping; and the FormaPairingRoom DO relay producing a write audit row
// (F-003) through the enterprise store.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnterpriseStore } from '../src/enterprise/domain.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';
import {
  FormaPairingService,
  mintPairingCode,
  FORMA_PAIRING_PREFIX
} from '../src/enterprise/forma-pairing.mjs';
import {
  evaluateJoin,
  routeFrame,
  otherRole,
  presenceFrame
} from '../src/integrations/forma/forma-room-core.js';
import { FORMA_MESSAGE_TYPES } from '../src/integrations/forma/forma-bridge.js';
import { hashToken } from '../src/enterprise/state-hash.mjs';

// ── Pairing-code service ──────────────────────────────────────────────────────

describe('FormaPairingService — issuance + lifecycle', () => {
  let svc;
  let clock;
  beforeEach(() => {
    clock = 1_000_000;
    svc = new FormaPairingService({ now: () => clock });
  });

  it('mints a >=128-bit code (256-bit / 64 hex chars)', () => {
    const code = mintPairingCode();
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    const a = mintPairingCode();
    const b = mintPairingCode();
    expect(a).not.toBe(b); // not predictable
  });

  it('issues a code bound to the user, stored HASHED (raw code never persisted)', async () => {
    const { code, expiresAt } = await svc.issue({ userId: 'usr_1', organizationId: 'org_1' });
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toBe(clock + 24 * 60 * 60 * 1000); // default 24h
    // The in-memory fallback is keyed by the HASH, and no record holds the raw code.
    const key = FORMA_PAIRING_PREFIX + hashToken(code);
    const record = svc._mem.get(key);
    expect(record).toBeTruthy();
    expect(record.userId).toBe('usr_1');
    expect(JSON.stringify(record)).not.toContain(code);
  });

  it('F-001: nova-app join REQUIRES the issuing user session (code possession is not enough)', async () => {
    const { code } = await svc.issue({ userId: 'usr_owner', organizationId: 'org_1' });

    // No session presented → rejected.
    expect(await svc.authorizeJoin({ code, role: 'nova-app', sessionUserId: null }))
      .toMatchObject({ ok: false, reason: 'session_required' });

    // A DIFFERENT user's session (stolen code) → rejected.
    expect(await svc.authorizeJoin({ code, role: 'nova-app', sessionUserId: 'usr_attacker' }))
      .toMatchObject({ ok: false, reason: 'session_mismatch' });

    // The issuing user's session → allowed.
    const ok = await svc.authorizeJoin({ code, role: 'nova-app', sessionUserId: 'usr_owner' });
    expect(ok.ok).toBe(true);
    expect(ok.record.userId).toBe('usr_owner');
  });

  it('forma-extension joins by code only (no Nova session required)', async () => {
    const { code } = await svc.issue({ userId: 'usr_owner' });
    const ok = await svc.authorizeJoin({ code, role: 'forma-extension' });
    expect(ok.ok).toBe(true);
  });

  it('one-time-join: a second join for the same role is rejected', async () => {
    const { code } = await svc.issue({ userId: 'usr_owner' });
    expect((await svc.authorizeJoin({ code, role: 'nova-app', sessionUserId: 'usr_owner' })).ok).toBe(true);
    // Replay the same role with the same (now-used) code → rejected.
    expect(await svc.authorizeJoin({ code, role: 'nova-app', sessionUserId: 'usr_owner' }))
      .toMatchObject({ ok: false, reason: 'already_joined' });
    // The OTHER role may still bind once.
    expect((await svc.authorizeJoin({ code, role: 'forma-extension' })).ok).toBe(true);
    // …but not twice.
    expect(await svc.authorizeJoin({ code, role: 'forma-extension' }))
      .toMatchObject({ ok: false, reason: 'already_joined' });
  });

  it('expiry: a code past its TTL is rejected (and dropped)', async () => {
    const { code } = await svc.issue({ userId: 'usr_owner', ttlMs: 1000 });
    clock += 2000; // advance past expiry
    expect(await svc.authorizeJoin({ code, role: 'forma-extension' }))
      .toMatchObject({ ok: false, reason: 'expired' });
    // dropped from the store
    expect(svc._mem.get(FORMA_PAIRING_PREFIX + hashToken(code))).toBeUndefined();
  });

  it('revoke: drops the code (scoped to its owner) so further joins fail', async () => {
    const { code } = await svc.issue({ userId: 'usr_owner' });
    // A different user cannot revoke it.
    expect(await svc.revoke(code, { expectUserId: 'usr_other' })).toBe(false);
    // The owner can.
    expect(await svc.revoke(code, { expectUserId: 'usr_owner' })).toBe(true);
    expect(await svc.authorizeJoin({ code, role: 'forma-extension' }))
      .toMatchObject({ ok: false, reason: 'unknown_code' });
  });

  it('an unknown / forged code is rejected', async () => {
    expect(await svc.authorizeJoin({ code: 'deadbeef', role: 'forma-extension' }))
      .toMatchObject({ ok: false, reason: 'unknown_code' });
    expect(await svc.resolveOwner('deadbeef')).toMatchObject({ ok: false });
  });

  it('resolveOwner returns the owning user/org without binding a role', async () => {
    const { code } = await svc.issue({ userId: 'usr_owner', organizationId: 'org_9' });
    const owner = await svc.resolveOwner(code);
    expect(owner).toMatchObject({ ok: true, userId: 'usr_owner', organizationId: 'org_9' });
    // resolveOwner does NOT consume the one-time-join, so a real join still works.
    expect((await svc.authorizeJoin({ code, role: 'forma-extension' })).ok).toBe(true);
  });
});

// ── Room core: role-scoping + validate-before-route ──────────────────────────

describe('forma-room-core — role scoping (exactly one peer per role)', () => {
  it('rejects an unknown role', () => {
    expect(evaluateJoin('bogus', new Set())).toMatchObject({ ok: false, reason: 'unknown_role' });
  });
  it('allows one nova-app + one forma-extension, rejects a duplicate role', () => {
    const present = new Set();
    expect(evaluateJoin('nova-app', present).ok).toBe(true);
    present.add('nova-app');
    expect(evaluateJoin('forma-extension', present).ok).toBe(true);
    present.add('forma-extension');
    // A third/duplicate join of an occupied role is rejected.
    expect(evaluateJoin('nova-app', present)).toMatchObject({ ok: false, reason: 'role_taken' });
    expect(evaluateJoin('forma-extension', present)).toMatchObject({ ok: false, reason: 'role_taken' });
  });
  it('otherRole maps each role to its peer', () => {
    expect(otherRole('nova-app')).toBe('forma-extension');
    expect(otherRole('forma-extension')).toBe('nova-app');
  });
});

describe('forma-room-core — validate-before-route (F-002 allow-list)', () => {
  const env = { type: FORMA_MESSAGE_TYPES.SELECTION_GET, id: 'm1', source: 'nova-app', payload: {} };

  it('relays a known, valid read frame to the other peer', () => {
    const d = routeFrame('nova-app', env);
    expect(d.action).toBe('relay');
    expect(d.toRole).toBe('forma-extension');
    expect(d.isWrite).toBe(false);
  });

  it('rejects an UNKNOWN / forged message type (does not forward)', () => {
    const d = routeFrame('nova-app', { type: 'forma.evil.exec', id: 'x', source: 'nova-app', payload: {} });
    expect(d.action).toBe('reject');
    expect(d.reason).toBe('unknown_type');
  });

  it('rejects a known type with an INVALID payload', () => {
    // building.create requires a finite height — omit it.
    const d = routeFrame('nova-app', {
      type: FORMA_MESSAGE_TYPES.BUILDING_CREATE, id: 'b1', source: 'nova-app', payload: { footprint: {} }
    });
    expect(d.action).toBe('reject');
    expect(d.reason).toBe('validation_failed');
    expect(d.errors.length).toBeGreaterThan(0);
  });

  it('rejects an unparsable / typeless frame', () => {
    expect(routeFrame('nova-app', null)).toMatchObject({ action: 'reject', reason: 'unparsable_frame' });
    expect(routeFrame('nova-app', { id: 'x' })).toMatchObject({ action: 'reject', reason: 'missing_type' });
  });

  it('flags a valid WRITE frame as a write (for audit)', () => {
    const d = routeFrame('nova-app', {
      type: FORMA_MESSAGE_TYPES.GEOMETRY_SEND, id: 'w1', source: 'nova-app', payload: { geometry: { mesh: 1 } }
    });
    expect(d).toMatchObject({ action: 'relay', isWrite: true, operation: FORMA_MESSAGE_TYPES.GEOMETRY_SEND });
  });

  it('presenceFrame reports paired only when both roles are present', () => {
    expect(presenceFrame('peer.connected', 'nova-app', new Set(['nova-app'])).paired).toBe(false);
    expect(presenceFrame('peer.connected', 'forma-extension', new Set(['nova-app', 'forma-extension'])).paired).toBe(true);
  });
});

// ── FormaPairingRoom DO: relay + write audit (F-003) ─────────────────────────

// Minimal WebSocket double: records sent frames and lets tests inject inbound
// messages by firing the registered 'message' listener.
class FakeWS {
  constructor() { this.sent = []; this._listeners = {}; this.accepted = false; }
  accept() { this.accepted = true; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  send(data) { this.sent.push(JSON.parse(data)); }
  emit(type, event) { for (const fn of (this._listeners[type] || [])) fn(event); }
  // Simulate a peer pushing a frame to the server.
  inbound(frame) { this.emit('message', { data: JSON.stringify(frame) }); }
}

// Patch the global WebSocketPair the DO uses so server.accept()/addEventListener
// hit our FakeWS. fetch() returns { status:101, webSocket } with the client half.
function installFakeWebSocketPair() {
  const made = [];
  globalThis.WebSocketPair = function () {
    const client = new FakeWS();
    const server = new FakeWS();
    made.push({ client, server });
    return [client, server];
  };
  return made;
}

function upgradeRequest(headers) {
  const h = new Headers({ Upgrade: 'websocket', ...headers });
  return new Request('https://hi-nova.work/api/forma/rooms/abc?role=' + (headers['X-Forma-Role'] || ''), { headers: h });
}

// The Workers runtime allows `new Response(null, { status: 101, webSocket })`;
// node/undici's Response rejects status 101 with a RangeError. The DO registers
// the peer BEFORE constructing that response, so a successful join still wires
// up the socket — we just can't build the 101 Response here. This wrapper runs
// the DO fetch and returns { status } resolved from either the real response
// (rejections like 409/426 build fine) or the swallowed 101 RangeError.
async function joinRoom(room, headers) {
  try {
    const res = await room.fetch(upgradeRequest(headers));
    return { status: res.status, res };
  } catch (e) {
    if (e instanceof RangeError && /status/.test(e.message)) return { status: 101, res: null };
    throw e;
  }
}

describe('FormaPairingRoom DO — relay + write audit (F-003)', () => {
  let store;
  let FormaPairingRoom;
  let setSink;
  let resetSink;
  let pairs;
  let auditCalls;

  beforeEach(async () => {
    // A real EnterpriseStore (no persistence/KV) to capture audit rows.
    const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
    store = new EnterpriseStore({ authService });

    pairs = installFakeWebSocketPair();
    const mod = await import('../worker/forma-room.mjs');
    FormaPairingRoom = mod.FormaPairingRoom;
    setSink = mod.__setFormaWriteAuditSink;
    resetSink = mod.__resetFormaWriteAuditSink;

    // Inject a spy audit sink that records onto OUR store (the DO's real sink
    // boots a store from env via getApi; this proves the relay-path call shape
    // without a live KV/DB).
    auditCalls = [];
    setSink((_env, args) => {
      auditCalls.push(args);
      return store.recordFormaWrite(args);
    });
  });

  afterEach(() => { resetSink(); delete globalThis.WebSocketPair; });

  it('records a forma.write audit row on a relayed write frame', () => {
    // recordFormaWrite is the server-authoritative audit entry point (F-003).
    const event = store.recordFormaWrite({
      userId: 'usr_owner',
      organizationId: 'org_1',
      pairingRoom: 'room_hash',
      operation: FORMA_MESSAGE_TYPES.GEOMETRY_SEND,
      ok: true,
      metadata: { name: 'tower' }
    });
    expect(event.type).toBe('forma.write');
    expect(event.userId).toBe('usr_owner');
    expect(event.targetId).toBe('room_hash');
    expect(event.metadata).toMatchObject({ host: 'forma', operation: FORMA_MESSAGE_TYPES.GEOMETRY_SEND, ok: true, pairingRoom: 'room_hash' });
    expect(store.auditEvents.length).toBe(1);
  });

  it('records a forma.write.denied row for a rejected/forged write', () => {
    const event = store.recordFormaWrite({
      userId: 'usr_owner', pairingRoom: 'room_hash', operation: FORMA_MESSAGE_TYPES.BUILDING_CREATE, ok: false, metadata: { reason: 'validation_failed' }
    });
    expect(event.type).toBe('forma.write.denied');
    expect(event.metadata.ok).toBe(false);
    expect(event.metadata.reason).toBe('validation_failed');
  });

  it('DO relays a valid frame from one peer to the other and rejects unknown types', async () => {
    const room = new FormaPairingRoom({ waitUntil() {} }, {});
    // Join nova-app then forma-extension via the DO fetch path.
    expect((await joinRoom(room, { 'X-Forma-Role': 'nova-app', 'X-Nova-User-Id': 'usr_owner', 'X-Forma-Pairing-Room': 'room_hash' })).status).toBe(101);
    expect((await joinRoom(room, { 'X-Forma-Role': 'forma-extension', 'X-Nova-User-Id': 'usr_owner', 'X-Forma-Pairing-Room': 'room_hash' })).status).toBe(101);

    const novaServer = pairs[0].server;
    const extServer = pairs[1].server;

    // nova-app sends a valid read frame → relayed to forma-extension.
    const before = extServer.sent.length;
    novaServer.inbound({ type: FORMA_MESSAGE_TYPES.SELECTION_GET, id: 'm1', source: 'nova-app', payload: {} });
    expect(extServer.sent.length).toBe(before + 1);
    expect(extServer.sent[extServer.sent.length - 1].type).toBe(FORMA_MESSAGE_TYPES.SELECTION_GET);

    // nova-app sends a forged type → NOT relayed; sender gets a forma.error.
    const extBefore = extServer.sent.length;
    const novaBefore = novaServer.sent.length;
    novaServer.inbound({ type: 'forma.evil.exec', id: 'x', source: 'nova-app', payload: {} });
    expect(extServer.sent.length).toBe(extBefore); // nothing relayed
    expect(novaServer.sent.length).toBe(novaBefore + 1);
    expect(novaServer.sent[novaServer.sent.length - 1].type).toBe('forma.error');
  });

  it('DO rejects a duplicate role join with 409', async () => {
    const room = new FormaPairingRoom({ waitUntil() {} }, {});
    expect((await joinRoom(room, { 'X-Forma-Role': 'nova-app', 'X-Nova-User-Id': 'usr_owner' })).status).toBe(101);
    const dup = await joinRoom(room, { 'X-Forma-Role': 'nova-app', 'X-Nova-User-Id': 'usr_owner' });
    expect(dup.status).toBe(409);
    const body = await dup.res.json();
    expect(body.error.reason).toBe('role_taken');
  });

  it('DO writes a server-authoritative audit row on a relayed WRITE frame (F-003)', async () => {
    const room = new FormaPairingRoom({ waitUntil() {} }, {});
    // Both peers join; identity carries the OWNING Nova user (resolved by the
    // Worker from the code record) + the pairing-room key.
    await joinRoom(room, { 'X-Forma-Role': 'nova-app', 'X-Nova-User-Id': 'usr_owner', 'X-Nova-Org-Id': 'org_1', 'X-Forma-Pairing-Room': 'room_hash' });
    await joinRoom(room, { 'X-Forma-Role': 'forma-extension', 'X-Nova-User-Id': 'usr_owner', 'X-Nova-Org-Id': 'org_1', 'X-Forma-Pairing-Room': 'room_hash' });

    const novaServer = pairs[0].server;
    const extServer = pairs[1].server;

    // nova-app sends a valid WRITE frame → relayed to forma-extension AND audited.
    const extBefore = extServer.sent.length;
    novaServer.inbound({
      type: FORMA_MESSAGE_TYPES.GEOMETRY_SEND, id: 'w1', source: 'nova-app', payload: { geometry: { mesh: 1 }, name: 'tower' }
    });
    // Relayed
    expect(extServer.sent.length).toBe(extBefore + 1);
    expect(extServer.sent[extServer.sent.length - 1].type).toBe(FORMA_MESSAGE_TYPES.GEOMETRY_SEND);
    // Audited, keyed to the owning user + pairing room, ok:true.
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0]).toMatchObject({ userId: 'usr_owner', organizationId: 'org_1', pairingRoom: 'room_hash', operation: FORMA_MESSAGE_TYPES.GEOMETRY_SEND, ok: true });
    expect(store.auditEvents[0].type).toBe('forma.write');
    expect(store.auditEvents[0].userId).toBe('usr_owner');
  });

  it('DO audits a REJECTED write (forged/invalid) as a denial, without relaying it', async () => {
    const room = new FormaPairingRoom({ waitUntil() {} }, {});
    await joinRoom(room, { 'X-Forma-Role': 'nova-app', 'X-Nova-User-Id': 'usr_owner', 'X-Forma-Pairing-Room': 'room_hash' });
    await joinRoom(room, { 'X-Forma-Role': 'forma-extension', 'X-Nova-User-Id': 'usr_owner', 'X-Forma-Pairing-Room': 'room_hash' });
    const extServer = pairs[1].server;
    const novaServer = pairs[0].server;

    const extBefore = extServer.sent.length;
    // A WRITE type with an invalid payload (building.create with no height).
    novaServer.inbound({ type: FORMA_MESSAGE_TYPES.BUILDING_CREATE, id: 'b1', source: 'nova-app', payload: { footprint: {} } });
    // NOT relayed
    expect(extServer.sent.length).toBe(extBefore);
    // Denial audited
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0]).toMatchObject({ operation: FORMA_MESSAGE_TYPES.BUILDING_CREATE, ok: false });
    expect(store.auditEvents[0].type).toBe('forma.write.denied');
  });
});
