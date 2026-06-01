// CollaboClient — the browser side of live collaboration. Opens one WebSocket
// to the per-project ProjectRoom Durable Object and:
//   • streams this user's cursor (canvas-space, throttled) to peers,
//   • renders every peer's cursor as a coloured arrow + first-name chip,
//   • (when the user is an editor) broadcasts graph edit-ops and applies the
//     ops it receives from other editors, with an echo guard.
//
// The server (ProjectRoom) is authoritative on write permission: a viewer's ops
// are dropped there, so read-only enforcement does not depend on the client.

import { colorForUser } from './collab-core.js';

const CURSOR_THROTTLE_MS = 50; // ~20 updates/sec

export class CollaboClient {
  // opts.WebSocketImpl + opts.now let tests inject a fake socket / clock.
  constructor(app, opts = {}) {
    this.app = app;
    this._WebSocket = opts.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this._now = opts.now || (() => Date.now());
    this.ws = null;
    this.projectId = null;
    this.role = 'Viewer';
    this.canEdit = false;
    this._peers = new Map();      // userId → { el, firstName, color, x, y }
    this._lastCursorSent = 0;
    this._pendingCursor = null;
  }

  _log(...args) {
    if (typeof console !== 'undefined') console.log('[nova-collab]', ...args);
  }

  // Report connection state to the app so it can show a visible indicator.
  _emitStatus(state) {
    if (this.app && this.app._onCollabStatus) {
      try { this.app._onCollabStatus(state, this._peers.size, this.role); } catch (e) { /* ignore */ }
    }
  }

  connect(projectId) {
    if (!projectId || !this._WebSocket) { this._log('connect skipped: no projectId or no WebSocket impl'); return; }
    this.disconnect();
    this.projectId = projectId;
    const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
    const host = typeof location !== 'undefined' ? location.host : '';
    const url = proto + '//' + host + '/api/projects/' + encodeURIComponent(projectId) + '/room';
    this._log('connecting to', url);
    this._emitStatus('connecting');
    try {
      this.ws = new this._WebSocket(url);
    } catch (e) {
      this._log('connect threw', e && e.message);
      this.ws = null;
      this._emitStatus('error');
      return;
    }
    this.ws.addEventListener('open', () => { this._log('socket open'); this._emitStatus('connected'); });
    this.ws.addEventListener('message', (ev) => this._onMessage(ev));
    this.ws.addEventListener('close', (ev) => {
      this._log('socket closed', 'code=' + (ev && ev.code), 'reason=' + (ev && ev.reason));
      this._clearAllPeers();
      this._emitStatus('disconnected');
    });
    this.ws.addEventListener('error', () => { this._log('socket error'); this._emitStatus('error'); });
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* ignore */ }
      this.ws = null;
    }
    this._clearAllPeers();
    this.projectId = null;
    this.role = 'Viewer';
    this.canEdit = false;
    this._emitStatus('disconnected');
  }

  get connected() {
    return !!this.ws && this.ws.readyState === 1; // OPEN
  }

  // ── Outbound ────────────────────────────────────────────────────────────

  _send(obj) {
    if (!this.connected) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  // Cursor coords are CANVAS-space (graph coords), so a peer's cursor stays
  // anchored to the same graph point regardless of each viewer's pan/zoom.
  sendCursor(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const t = this._now();
    if (t - this._lastCursorSent < CURSOR_THROTTLE_MS) {
      this._pendingCursor = { x, y };
      if (!this._flushTimer && typeof setTimeout !== 'undefined') {
        const wait = CURSOR_THROTTLE_MS - (t - this._lastCursorSent);
        this._flushTimer = setTimeout(() => {
          this._flushTimer = null;
          if (this._pendingCursor) {
            const p = this._pendingCursor; this._pendingCursor = null;
            this._lastCursorSent = this._now();
            this._send({ type: 'cursor', x: p.x, y: p.y });
          }
        }, Math.max(0, wait));
      }
      return;
    }
    this._lastCursorSent = t;
    this._send({ type: 'cursor', x, y });
  }

  // Broadcast a graph edit op. No-op for viewers (and the server drops it too).
  broadcastOp(op) {
    if (!this.canEdit || !op) return;
    this._send({ type: 'op', op });
  }

  // ── Inbound ─────────────────────────────────────────────────────────────

  _onMessage(ev) {
    let msg;
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); }
    catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'init':
        if (msg.you) {
          this.role = msg.you.role || 'Viewer';
          this.canEdit = this.role === 'Owner' || this.role === 'Admin' || this.role === 'Editor';
          if (this.app && this.app._onCollabRole) this.app._onCollabRole(this.role, this.canEdit);
        }
        (msg.peers || []).forEach(p => this._ensurePeer(p.userId, p.firstName, p.color));
        this._log('joined room as', this.role, '— peers already here:', (msg.peers || []).length);
        this._emitStatus('connected');
        break;
      case 'join':
        this._ensurePeer(msg.userId, msg.firstName, msg.color);
        this._log('peer joined:', msg.firstName, '(' + msg.userId + ')');
        this._emitStatus('connected');
        break;
      case 'cursor':
        this._movePeer(msg.userId, msg.x, msg.y);
        break;
      case 'leave':
        this._removePeer(msg.userId);
        this._log('peer left:', msg.userId);
        this._emitStatus('connected');
        break;
      case 'op':
        this._applyRemoteOp(msg.op);
        break;
      default:
        break;
    }
  }

  // ── Peer cursor overlays ──────────────────────────────────────────────────

  _canvasArea() {
    return typeof document !== 'undefined' ? document.getElementById('canvas-area') : null;
  }

  _ensurePeer(userId, firstName, color) {
    if (!userId || this._peers.has(userId)) return;
    const area = this._canvasArea();
    const safeColor = color || colorForUser(userId);
    let el = null;
    if (area) {
      el = document.createElement('div');
      el.className = 'collab-cursor';
      el.style.display = 'none'; // shown once we have a position
      el.innerHTML =
        '<svg class="collab-cursor-arrow" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">' +
          '<path d="M2 2 L2 15 L6 11 L9 17 L11 16 L8 10 L14 10 Z" fill="' + safeColor + '" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>' +
        '</svg>' +
        '<span class="collab-cursor-label" style="background:' + safeColor + '"></span>';
      el.querySelector('.collab-cursor-label').textContent = firstName || 'Guest';
      area.appendChild(el);
    }
    this._peers.set(userId, { el, firstName: firstName || 'Guest', color: safeColor, x: null, y: null });
  }

  _movePeer(userId, x, y) {
    const peer = this._peers.get(userId);
    if (!peer) {
      // A cursor for a peer we haven't seen a join for yet — create lazily.
      this._ensurePeer(userId, 'Guest', colorForUser(userId));
    }
    const p = this._peers.get(userId);
    if (!p) return;
    p.x = x; p.y = y;
    this._positionPeer(p);
  }

  _positionPeer(p) {
    if (!p.el || p.x == null || p.y == null) return;
    const app = this.app;
    const zoom = (app && typeof app.zoom === 'number') ? app.zoom : 1;
    const panX = (app && typeof app.panX === 'number') ? app.panX : 0;
    const panY = (app && typeof app.panY === 'number') ? app.panY : 0;
    // Canvas-space → DOM (within #canvas-area): the node layer is transformed
    // translate(panX,panY) scale(zoom), so a graph point maps to pan + coord*zoom.
    p.el.style.left = (p.x * zoom + panX) + 'px';
    p.el.style.top = (p.y * zoom + panY) + 'px';
    p.el.style.display = '';
  }

  // Reposition every peer cursor — call on pan/zoom so they track the graph.
  refreshPositions() {
    for (const p of this._peers.values()) this._positionPeer(p);
  }

  _removePeer(userId) {
    const p = this._peers.get(userId);
    if (p && p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    this._peers.delete(userId);
  }

  _clearAllPeers() {
    for (const p of this._peers.values()) {
      if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    }
    this._peers.clear();
  }

  // ── Remote op application (Phase B) ───────────────────────────────────────

  // Apply an op received from another editor WITHOUT re-broadcasting it. The
  // _applyingRemoteOp flag on the app makes the mutation hooks skip broadcast.
  _applyRemoteOp(op) {
    const app = this.app;
    if (!app || !op || typeof op !== 'object') return;
    app._applyingRemoteOp = true;
    try {
      switch (op.kind) {
        case 'node.add':
          if (app.applyRemoteNodeAdd) app.applyRemoteNodeAdd(op);
          break;
        case 'node.move':
          if (app.applyRemoteNodeMove) app.applyRemoteNodeMove(op);
          break;
        case 'node.remove':
          if (app.removeNode) app.removeNode(op.id);
          break;
        case 'node.control':
          if (app.onCtrl) app.onCtrl(op.id, op.ctrlId, op.value);
          break;
        case 'wire.add':
          if (app.addWire) app.addWire(op.fromNode, op.fromPort, op.toNode, op.toPort);
          break;
        case 'wire.remove':
          if (app.applyRemoteWireRemove) app.applyRemoteWireRemove(op);
          break;
        default:
          break;
      }
    } catch (e) {
      /* never let a malformed remote op break the session */
    } finally {
      app._applyingRemoteOp = false;
    }
  }
}

export default CollaboClient;
