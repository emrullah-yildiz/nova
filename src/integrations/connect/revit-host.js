import {
  SOURCES,
  createEnvelope,
  createGeometryEnvelope,
  createResult,
  normalizeElementRecord,
  validateEnvelope
} from './protocol.js';

export const DEFAULT_REVIT_HOST_CAPABILITIES = [
  'project.snapshot',
  'elements.query',
  'geometry.get',
  'geometry.create'
];

export class NovaRevitHostAdapter {
  constructor(options = {}) {
    this.url = options.url || 'ws://127.0.0.1:8765';
    this.source = options.source || 'revit-plugin';
    this.sessionId = options.sessionId || '';
    this.projectId = options.projectId || 'local-revit-project';
    this.pairingToken = options.pairingToken || '';
    this.WebSocketImpl = options.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.timeoutMs = options.timeoutMs || 8000;
    this.requireWriteApproval = options.requireWriteApproval !== false;
    this.handlers = options.handlers || createMockRevitHandlers(options.fixture);
    this.socket = null;
    this.status = 'disconnected';
    this.listeners = {};
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
          role: 'host',
          pairingToken: this.pairingToken,
          capabilities: DEFAULT_REVIT_HOST_CAPABILITIES
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
      target: options.target || 'viewer',
      sessionId: options.sessionId || this.sessionId,
      projectId: options.projectId || this.projectId,
      payload
    });
    this.sendEnvelope(envelope);
    return envelope;
  }

  async handleMessage(raw) {
    let envelope;
    try {
      envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      this.emit('error', { message: 'Invalid JSON message', error });
      return;
    }

    const validation = validateEnvelope(envelope);
    if (!validation.ok) {
      this.reply(envelope, 'operation.error', createResult({
        ok: false,
        message: validation.errors.join('; '),
        code: 'INVALID_ENVELOPE'
      }), { error: { message: validation.errors.join('; '), code: 'INVALID_ENVELOPE' } });
      return;
    }

    if (envelope.type === 'connection.established') {
      this.sessionId = envelope.sessionId || envelope.payload.sessionId || this.sessionId;
      this.projectId = envelope.projectId || this.projectId;
      this.emit('paired', envelope.payload || {});
      return;
    }

    try {
      if (envelope.type === 'project.snapshot') {
        this.reply(envelope, 'project.snapshot', await this.handlers.getProjectSnapshot(envelope.payload || {}));
      } else if (envelope.type === 'elements.query') {
        this.reply(envelope, 'elements.query.result', await this.handlers.queryElements(envelope.payload || {}));
      } else if (envelope.type === 'geometry.get') {
        this.reply(envelope, 'geometry.get.result', await this.handlers.getGeometry(envelope.payload || {}));
      } else if (envelope.type === 'geometry.create') {
        this.reply(envelope, 'geometry.create.result', await this.handleGeometryCreate(envelope.payload || {}));
      } else {
        this.reply(envelope, 'operation.error', createResult({
          ok: false,
          message: 'Unsupported Revit host operation: ' + envelope.type,
          code: 'UNSUPPORTED_OPERATION'
        }), { error: { message: 'Unsupported Revit host operation: ' + envelope.type, code: 'UNSUPPORTED_OPERATION' } });
      }
    } catch (error) {
      this.reply(envelope, 'operation.error', createResult({
        ok: false,
        message: error.message,
        code: 'HOST_OPERATION_FAILED'
      }), { error: { message: error.message, code: 'HOST_OPERATION_FAILED' } });
    }
  }

  async handleGeometryCreate(payload) {
    const approval = payload.approval || {};
    if (this.requireWriteApproval && approval.approved !== true) {
      return createResult({
        ok: false,
        message: 'Revit writes require explicit user approval.',
        code: 'WRITE_APPROVAL_REQUIRED'
      });
    }
    return this.handlers.createGeometry(payload);
  }

  reply(requestEnvelope, type, payload, options = {}) {
    const response = createEnvelope({
      type,
      source: this.source,
      target: 'viewer',
      sessionId: requestEnvelope.sessionId || this.sessionId,
      projectId: requestEnvelope.projectId || this.projectId,
      payload,
      error: options.error || null
    });
    response.replyTo = requestEnvelope.id;
    this.sendEnvelope(response);
    return response;
  }

  sendEnvelope(envelope) {
    if (!this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify(envelope));
    return true;
  }

  on(eventName, handler) {
    if (!this.listeners[eventName]) this.listeners[eventName] = [];
    this.listeners[eventName].push(handler);
  }

  emit(eventName, payload) {
    (this.listeners[eventName] || []).forEach(handler => handler(payload));
  }
}

export function createMockRevitHandlers(fixture = createMockRevitFixture()) {
  const state = {
    fixture,
    createdGeometry: []
  };

  return {
    state,

    async getProjectSnapshot() {
      return fixture.snapshot;
    },

    async queryElements({ category, page = 1, pageSize = 200 }) {
      const all = category ? (fixture.elementsByCategory[category] || []) : fixture.elements;
      const start = Math.max(0, (Number(page) - 1) * Number(pageSize));
      const end = start + Number(pageSize);
      return {
        elements: all.slice(start, end),
        page: Number(page),
        pageSize: Number(pageSize),
        total: all.length
      };
    },

    async getGeometry({ elementIds = [] }) {
      return {
        geometries: elementIds
          .map(id => fixture.geometryById[String(id)])
          .filter(Boolean)
      };
    },

    async createGeometry({ geometry }) {
      const created = {
        directShapeId: 'mock-directshape-' + (state.createdGeometry.length + 1),
        category: geometry.metadata && geometry.metadata.category ? geometry.metadata.category : 'Generic Models',
        identity: {
          ...geometry.identity,
          source: SOURCES.REVIT_LOCAL,
          sourceId: 'mock-directshape-' + (state.createdGeometry.length + 1)
        }
      };
      state.createdGeometry.push({ geometry, result: created });
      return createResult({
        ok: true,
        data: created,
        message: 'Mock DirectShape geometry accepted.'
      });
    }
  };
}

export function createMockRevitFixture() {
  const versionId = 'mock-revit-doc-2026-05-18';
  const elements = [
    normalizeElementRecord({
      id: 3001,
      name: 'Basic Wall',
      category: 'Walls',
      typeName: 'Generic - 200mm',
      levelName: 'Level 1',
      params: { Mark: 'W-01', Length: '5.000', Height: '3.500' }
    }, { source: SOURCES.REVIT_LOCAL, versionId, units: { system: 'feet', scaleToMeters: 0.3048 }, coordinateSystem: 'revit-internal' }),
    normalizeElementRecord({
      id: 4001,
      name: 'Floor',
      category: 'Floors',
      typeName: 'Generic 300mm',
      levelName: 'Level 1',
      params: { Mark: 'F-01', Area: '120.5' }
    }, { source: SOURCES.REVIT_LOCAL, versionId, units: { system: 'feet', scaleToMeters: 0.3048 }, coordinateSystem: 'revit-internal' })
  ];
  const wallGeometry = createGeometryEnvelope({
    kind: 'mesh',
    data: {
      vertices: [[0, 0, 0], [5, 0, 0], [5, 0.2, 0], [0, 0.2, 0]],
      faces: [[0, 1, 2], [0, 2, 3]]
    }
  }, elements[0].identity, { coordinateSystem: 'revit-internal', units: { system: 'feet', scaleToMeters: 0.3048 } });
  const floorGeometry = createGeometryEnvelope({
    kind: 'mesh',
    data: {
      vertices: [[0, 0, 0], [8, 0, 0], [8, 6, 0], [0, 6, 0]],
      faces: [[0, 1, 2], [0, 2, 3]]
    }
  }, elements[1].identity, { coordinateSystem: 'revit-internal', units: { system: 'feet', scaleToMeters: 0.3048 } });
  const elementsByCategory = elements.reduce((groups, element) => {
    if (!groups[element.category]) groups[element.category] = [];
    groups[element.category].push(element);
    return groups;
  }, {});

  return {
    snapshot: {
      projectId: 'mock-revit-project',
      projectName: 'Mock Revit Project',
      activeView: { id: 100, name: '3D View' },
      levels: [{ id: 1001, name: 'Level 1', category: 'Levels' }],
      sheets: [],
      categories: Object.keys(elementsByCategory).reduce((categories, category) => {
        categories[category] = { elements: elementsByCategory[category] };
        return categories;
      }, {}),
      types: {},
      selection: [],
      versionId
    },
    elements,
    elementsByCategory,
    geometryById: {
      3001: wallGeometry,
      4001: floorGeometry
    }
  };
}

export function createNovaRevitHostAdapter(options = {}) {
  return new NovaRevitHostAdapter(options);
}

export default NovaRevitHostAdapter;
