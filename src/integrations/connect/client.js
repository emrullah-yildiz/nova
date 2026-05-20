import {
  createEnvelope,
  createErrorEnvelope,
  createGeometryEnvelope,
  normalizeElementRecord,
  validateEnvelope
} from './protocol.js';
import { resolveWebSocketUrl } from '../../config/runtime-config.js';

export class NovaConnectClient {
  constructor(options = {}) {
    this.url = options.url || resolveWebSocketUrl();
    this.source = options.source || 'nova-browser';
    this.sessionId = options.sessionId || '';
    this.projectId = options.projectId || '';
    this.pairingToken = options.pairingToken || '';
    this.WebSocketImpl = options.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.timeoutMs = options.timeoutMs || 8000;
    this.socket = null;
    this.status = 'disconnected';
    this.pending = new Map();
    this.listeners = {};
    this.snapshot = null;
    this.elementsByCategory = {};
    this.geometryById = {};
    this.peerConnected = false;
  }

  connect() {
    if (!this.WebSocketImpl) {
      this.status = 'unavailable';
      return Promise.resolve(false);
    }

    return new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(this.url);
      this.socket = socket;
      this.status = 'connecting';

      socket.onopen = () => {
        this.status = 'connected';
        this.send('hello', {
          role: 'viewer',
          pairingToken: this.pairingToken,
          capabilities: ['elements.query', 'geometry.get', 'geometry.create', 'parameter.get', 'parameter.set']
        }, { target: 'hub' });
        this.emit('status', this.status);
        resolve(true);
      };
      socket.onerror = error => {
        this.status = 'error';
        this.emit('status', this.status);
        reject(error);
      };
      socket.onclose = () => {
        this.status = 'disconnected';
        this.rejectPending('Connection closed');
        this.emit('status', this.status);
      };
      socket.onmessage = event => this.handleMessage(event.data);
    });
  }

  disconnect() {
    if (this.socket) this.socket.close();
  }

  send(type, payload = {}, options = {}) {
    const envelope = createEnvelope({
      type,
      source: this.source,
      target: options.target || 'host',
      sessionId: options.sessionId || this.sessionId,
      projectId: options.projectId || this.projectId,
      payload
    });
    this.sendEnvelope(envelope);
    return envelope;
  }

  request(type, payload = {}, options = {}) {
    const envelope = this.send(type, payload, options);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(envelope.id);
        reject(new Error('Nova Connect request timed out: ' + type));
      }, options.timeoutMs || this.timeoutMs);
      this.pending.set(envelope.id, { resolve, reject, timer });
    });
  }

  async getProjectSnapshot() {
    const response = await this.request('project.snapshot', {}, { target: 'host' });
    this.applyProjectSnapshot(response.payload || {});
    return this.snapshot;
  }

  async queryElements(category, options = {}) {
    const response = await this.request('elements.query', { category, page: options.page || 1, pageSize: options.pageSize || 200 }, { target: 'host' });
    const records = (response.payload.elements || []).map(item => normalizeElementRecord(item, item.identity || { source: 'revit-local' }));
    this.elementsByCategory[category] = records;
    return records;
  }

  async getGeometry(elementIds, options = {}) {
    console.info('[NovaConnect] geometry.get request', {
      count: elementIds.length,
      sampleIds: elementIds.slice(0, 5),
      detail: options.detail || 'mesh'
    });
    const response = await this.request('geometry.get', { elementIds, detail: options.detail || 'mesh' }, { target: 'host' });
    const geometries = response.payload.geometries || [];
    console.info('[NovaConnect] geometry.get response', {
      requested: elementIds.length,
      geometries: geometries.length
    });
    geometries.forEach(item => {
      if (item.identity && item.identity.sourceId) this.geometryById[item.identity.sourceId] = item;
    });
    return geometries;
  }

  async getParameterValues(elementIds, parameterName, options = {}) {
    const response = await this.request('parameter.get', { elementIds, parameterName }, {
      target: 'host',
      timeoutMs: options.timeoutMs
    });
    return response.payload.values || [];
  }

  async setParameterValues(elementIds, parameterName, values, options = {}) {
    const response = await this.request('parameter.set', {
      elementIds,
      parameterName,
      values,
      approval: normalizeWriteApproval(options.approval || { approved: true, message: 'Set Revit parameter values from Nova graph.' })
    }, {
      target: 'host',
      timeoutMs: options.timeoutMs
    });
    return response.payload.results || [];
  }

  async sendGeometry(geometry, identity = {}, options = {}) {
    const envelope = geometry && geometry._type === 'GeometryEnvelope'
      ? geometry
      : createGeometryEnvelope(geometry, identity, options);
    const response = await this.request('geometry.create', {
      geometry: envelope,
      category: options.category || 'Generic Models',
      name: options.name || 'Nova Geometry',
      approval: normalizeWriteApproval(options.approval),
      requireUserApproval: options.requireUserApproval !== false
    }, { target: 'host' });
    return response.payload;
  }

  applyProjectSnapshot(snapshot) {
    this.snapshot = snapshot;
    if (snapshot.sessionId) this.sessionId = snapshot.sessionId;
    if (snapshot.projectId) this.projectId = snapshot.projectId;
    if (snapshot.categories) {
      Object.keys(snapshot.categories).forEach(category => {
        const categoryData = snapshot.categories[category];
        const elements = categoryData.elements || categoryData || [];
        if (Array.isArray(elements)) {
          this.elementsByCategory[category] = elements.map(item => normalizeElementRecord(item, item.identity || { source: 'revit-local' }));
        }
      });
    }
    this.emit('snapshot', this.snapshot);
  }

  handleMessage(raw) {
    let envelope;
    try {
      envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      this.emit('error', createErrorEnvelope(null, 'Invalid JSON message'));
      return;
    }

    const validation = validateEnvelope(envelope);
    if (!validation.ok) {
      this.emit('error', createErrorEnvelope(envelope, validation.errors.join('; ')));
      return;
    }

    if (envelope.type === 'pong') return;
    if (envelope.type === 'connection.established') {
      this.sessionId = envelope.sessionId || envelope.payload.sessionId || this.sessionId;
      this.projectId = envelope.projectId || envelope.payload.projectId || this.projectId;
      this.peerConnected = !!envelope.payload.peerConnected;
    }
    if (envelope.type === 'peer.connected') {
      this.peerConnected = true;
      this.emit('peer.connected', envelope);
    }
    if (envelope.type === 'peer.disconnected') {
      this.peerConnected = false;
      this.emit('peer.disconnected', envelope);
    }
    if (envelope.type === 'project.snapshot') this.applyProjectSnapshot(envelope.payload || {});
    if (envelope.type === 'project.changed') this.emit('stale', envelope.payload);

    const pending = this.pending.get(envelope.replyTo || envelope.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(envelope.replyTo || envelope.id);
      if (envelope.error) pending.reject(new Error(envelope.error.message || 'Nova Connect error'));
      else pending.resolve(envelope);
      return;
    }

    this.emit(envelope.type, envelope);
  }

  sendEnvelope(envelope) {
    if (!this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify(envelope));
    return true;
  }

  rejectPending(message) {
    this.pending.forEach(pending => {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    });
    this.pending.clear();
  }

  on(eventName, handler) {
    if (!this.listeners[eventName]) this.listeners[eventName] = [];
    this.listeners[eventName].push(handler);
  }

  emit(eventName, payload) {
    (this.listeners[eventName] || []).forEach(handler => handler(payload));
  }
}

export function createNovaConnectClient(options = {}) {
  return new NovaConnectClient(options);
}

function normalizeWriteApproval(approval = {}) {
  return {
    approved: approval.approved === true,
    approvedAt: approval.approvedAt || (approval.approved === true ? Date.now() : null),
    approvedBy: approval.approvedBy || 'nova-user',
    scope: approval.scope || 'single-operation',
    message: approval.message || ''
  };
}

export default NovaConnectClient;
