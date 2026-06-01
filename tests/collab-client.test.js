// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { CollaboClient } from '../src/app/collab.js';

// A minimal fake WebSocket: records sends, lets the test drive open/message.
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sent = [];
    this._listeners = {};
    FakeSocket.last = this;
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  _emit(type, ev) { (this._listeners[type] || []).forEach(fn => fn(ev)); }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this._emit('close', {}); }
  // test helpers
  open() { this.readyState = 1; this._emit('open', {}); }
  receive(obj) { this._emit('message', { data: JSON.stringify(obj) }); }
}

function makeApp() {
  return {
    zoom: 1, panX: 0, panY: 0,
    nodes: [], wires: [],
    _roleEvents: [],
    _onCollabRole(role, canEdit) { this._roleEvents.push({ role, canEdit }); },
    // graph mutation stubs the client's _applyRemoteOp dispatches to
    _added: [], _moved: [], _removed: [], _ctrl: [], _wireAdd: [], _wireRemove: [],
    applyRemoteNodeAdd(op) { this._added.push(op); },
    applyRemoteNodeMove(op) { this._moved.push(op); },
    removeNode(id) { this._removed.push(id); },
    onCtrl(id, ctrlId, value) { this._ctrl.push({ id, ctrlId, value }); },
    addWire(fn, fp, tn, tp) { this._wireAdd.push({ fn, fp, tn, tp }); },
    applyRemoteWireRemove(op) { this._wireRemove.push(op); }
  };
}

let now = 0;
function makeClient(app) {
  return new CollaboClient(app, { WebSocketImpl: FakeSocket, now: () => now });
}

beforeEach(() => {
  now = 0;
  document.body.innerHTML = '<div id="canvas-area"></div>';
  FakeSocket.last = null;
});

describe('CollaboClient connection', () => {
  it('opens a same-origin room URL with the project id', () => {
    const c = makeClient(makeApp());
    c.connect('prj_123');
    expect(FakeSocket.last.url).toContain('/api/projects/prj_123/room');
    expect(c.connected).toBe(false); // not until open
    FakeSocket.last.open();
    expect(c.connected).toBe(true);
  });

  it('does not send before the socket is open', () => {
    const c = makeClient(makeApp());
    c.connect('prj_123');
    c.sendCursor(5, 5);
    expect(FakeSocket.last.sent).toHaveLength(0);
  });
});

describe('cursor throttling', () => {
  it('sends the first cursor immediately, throttles the next within 50ms', () => {
    const c = makeClient(makeApp());
    c.connect('prj_1'); FakeSocket.last.open();
    now = 100;
    c.sendCursor(1, 2);
    expect(FakeSocket.last.sent).toHaveLength(1);
    expect(JSON.parse(FakeSocket.last.sent[0])).toEqual({ type: 'cursor', x: 1, y: 2 });
    now = 120; // only 20ms later
    c.sendCursor(3, 4);
    expect(FakeSocket.last.sent).toHaveLength(1); // throttled
    now = 160; // >50ms after the first
    c.sendCursor(5, 6);
    expect(FakeSocket.last.sent).toHaveLength(2);
    expect(JSON.parse(FakeSocket.last.sent[1])).toEqual({ type: 'cursor', x: 5, y: 6 });
  });
});

describe('peer cursor overlays', () => {
  it('init creates cursor elements for existing peers with colour + first name', () => {
    const c = makeClient(makeApp());
    c.connect('prj_1'); FakeSocket.last.open();
    FakeSocket.last.receive({ type: 'init', you: { userId: 'me', role: 'Editor' }, peers: [
      { userId: 'u2', firstName: 'Bob', color: '#6bcb77' }
    ] });
    const cursors = document.querySelectorAll('#canvas-area .collab-cursor');
    expect(cursors).toHaveLength(1);
    expect(cursors[0].querySelector('.collab-cursor-label').textContent).toBe('Bob');
    expect(cursors[0].querySelector('.collab-cursor-label').style.background).toBeTruthy();
  });

  it('join adds a peer, cursor positions it, leave removes it', () => {
    const app = makeApp();
    const c = makeClient(app);
    c.connect('prj_1'); FakeSocket.last.open();
    FakeSocket.last.receive({ type: 'join', userId: 'u2', firstName: 'Ann', color: '#4d96ff' });
    expect(document.querySelectorAll('.collab-cursor')).toHaveLength(1);

    // Cursor at canvas (10,20) with zoom 2, pan (5,5) → DOM (25,45)
    app.zoom = 2; app.panX = 5; app.panY = 5;
    FakeSocket.last.receive({ type: 'cursor', userId: 'u2', x: 10, y: 20 });
    const el = document.querySelector('.collab-cursor');
    expect(el.style.left).toBe('25px');
    expect(el.style.top).toBe('45px');

    FakeSocket.last.receive({ type: 'leave', userId: 'u2' });
    expect(document.querySelectorAll('.collab-cursor')).toHaveLength(0);
  });

  it('refreshPositions re-maps cursors after pan/zoom', () => {
    const app = makeApp();
    const c = makeClient(app);
    c.connect('prj_1'); FakeSocket.last.open();
    FakeSocket.last.receive({ type: 'join', userId: 'u2', firstName: 'Ann', color: '#4d96ff' });
    FakeSocket.last.receive({ type: 'cursor', userId: 'u2', x: 10, y: 10 });
    app.zoom = 3; app.panX = 0; app.panY = 0;
    c.refreshPositions();
    const el = document.querySelector('.collab-cursor');
    expect(el.style.left).toBe('30px');
    expect(el.style.top).toBe('30px');
  });

  it('disconnect removes all cursors and resets role', () => {
    const c = makeClient(makeApp());
    c.connect('prj_1'); FakeSocket.last.open();
    FakeSocket.last.receive({ type: 'join', userId: 'u2', firstName: 'Ann', color: '#4d96ff' });
    c.disconnect();
    expect(document.querySelectorAll('.collab-cursor')).toHaveLength(0);
    expect(c.canEdit).toBe(false);
  });
});

describe('role + read-only', () => {
  it('init reports the resolved role to the app', () => {
    const app = makeApp();
    const c = makeClient(app);
    c.connect('prj_1'); FakeSocket.last.open();
    FakeSocket.last.receive({ type: 'init', you: { userId: 'me', role: 'Editor' }, peers: [] });
    expect(c.canEdit).toBe(true);
    expect(app._roleEvents).toContainEqual({ role: 'Editor', canEdit: true });
  });

  it('a viewer cannot broadcast ops', () => {
    const c = makeClient(makeApp());
    c.connect('prj_1'); FakeSocket.last.open();
    FakeSocket.last.receive({ type: 'init', you: { userId: 'me', role: 'Viewer' }, peers: [] });
    expect(c.canEdit).toBe(false);
    c.broadcastOp({ kind: 'node.remove', id: 'node-1' });
    // sent should contain no 'op' message
    const ops = FakeSocket.last.sent.map(s => JSON.parse(s)).filter(m => m.type === 'op');
    expect(ops).toHaveLength(0);
  });

  it('an editor broadcasts ops', () => {
    const c = makeClient(makeApp());
    c.connect('prj_1'); FakeSocket.last.open();
    FakeSocket.last.receive({ type: 'init', you: { userId: 'me', role: 'Editor' }, peers: [] });
    c.broadcastOp({ kind: 'node.move', id: 'node-1', x: 1, y: 2 });
    const ops = FakeSocket.last.sent.map(s => JSON.parse(s)).filter(m => m.type === 'op');
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toEqual({ kind: 'node.move', id: 'node-1', x: 1, y: 2 });
  });
});

describe('remote op application (echo guard)', () => {
  it('dispatches each op kind to the right app method with _applyingRemoteOp set', () => {
    const app = makeApp();
    // assert the guard is set during the call and cleared after
    let guardDuring = null;
    app.applyRemoteNodeMove = (op) => { guardDuring = app._applyingRemoteOp; app._moved.push(op); };
    const c = makeClient(app);
    c.connect('prj_1'); FakeSocket.last.open();

    FakeSocket.last.receive({ type: 'op', userId: 'u2', op: { kind: 'node.add', id: 'node-9', type: 'Math.Add', x: 1, y: 2 } });
    FakeSocket.last.receive({ type: 'op', userId: 'u2', op: { kind: 'node.move', id: 'node-9', x: 3, y: 4 } });
    FakeSocket.last.receive({ type: 'op', userId: 'u2', op: { kind: 'node.remove', id: 'node-9' } });
    FakeSocket.last.receive({ type: 'op', userId: 'u2', op: { kind: 'node.control', id: 'node-9', ctrlId: 'k', value: 5 } });
    FakeSocket.last.receive({ type: 'op', userId: 'u2', op: { kind: 'wire.add', fromNode: 'a', fromPort: 'o', toNode: 'b', toPort: 'i' } });
    FakeSocket.last.receive({ type: 'op', userId: 'u2', op: { kind: 'wire.remove', fromNode: 'a', fromPort: 'o', toNode: 'b', toPort: 'i' } });

    expect(app._added).toHaveLength(1);
    expect(app._moved).toHaveLength(1);
    expect(app._removed).toEqual(['node-9']);
    expect(app._ctrl).toEqual([{ id: 'node-9', ctrlId: 'k', value: 5 }]);
    expect(app._wireAdd).toHaveLength(1);
    expect(app._wireRemove).toHaveLength(1);
    expect(guardDuring).toBe(true);          // guard set while applying
    expect(app._applyingRemoteOp).toBe(false); // cleared afterwards
  });
});
