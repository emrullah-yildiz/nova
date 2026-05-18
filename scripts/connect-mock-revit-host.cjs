const { WebSocket } = require('ws');

function createEnvelope({ type, source, target, sessionId, projectId, payload, error }) {
  return {
    version: 1,
    id: 'mock_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36),
    type,
    source,
    target,
    sessionId: sessionId || '',
    projectId: projectId || 'mock-revit-project',
    timestamp: Date.now(),
    payload: payload || {},
    error: error || null
  };
}

function normalizeElement(raw) {
  return {
    _type: 'ElementRecord',
    id: raw.id,
    name: raw.name,
    category: raw.category,
    typeName: raw.typeName || '',
    levelName: raw.levelName || '',
    params: raw.params || {},
    identity: {
      source: 'revit-local',
      sourceId: String(raw.id),
      versionId: 'mock-revit-doc',
      units: { system: 'feet', scaleToMeters: 0.3048 },
      coordinateSystem: 'revit-internal',
      transform: null
    }
  };
}

const elements = [
  normalizeElement({ id: 3001, name: 'Basic Wall', category: 'Walls', typeName: 'Generic - 200mm', levelName: 'Level 1', params: { Mark: 'W-01' } }),
  normalizeElement({ id: 4001, name: 'Floor', category: 'Floors', typeName: 'Generic 300mm', levelName: 'Level 1', params: { Mark: 'F-01' } })
];

const geometryById = {
  3001: {
    _type: 'GeometryEnvelope',
    kind: 'mesh',
    units: { system: 'feet', scaleToMeters: 0.3048 },
    coordinateSystem: 'revit-internal',
    transform: null,
    identity: elements[0].identity,
    data: { vertices: [[0, 0, 0], [5, 0, 0], [5, 0.2, 0], [0, 0.2, 0]], faces: [[0, 1, 2], [0, 2, 3]] },
    materials: [],
    metadata: {}
  },
  4001: {
    _type: 'GeometryEnvelope',
    kind: 'mesh',
    units: { system: 'feet', scaleToMeters: 0.3048 },
    coordinateSystem: 'revit-internal',
    transform: null,
    identity: elements[1].identity,
    data: { vertices: [[0, 0, 0], [8, 0, 0], [8, 6, 0], [0, 6, 0]], faces: [[0, 1, 2], [0, 2, 3]] },
    materials: [],
    metadata: {}
  }
};

function getSnapshot() {
  return {
    projectId: 'mock-revit-project',
    projectName: 'Mock Revit Project',
    activeView: { id: 100, name: '3D View' },
    levels: [{ id: 1001, name: 'Level 1', category: 'Levels' }],
    sheets: [],
    categories: {
      Walls: { elements: elements.filter(item => item.category === 'Walls') },
      Floors: { elements: elements.filter(item => item.category === 'Floors') }
    },
    types: {},
    selection: []
  };
}

function reply(socket, request, type, payload, error) {
  const response = createEnvelope({
    type,
    source: 'revit-plugin',
    target: 'viewer',
    sessionId: request.sessionId,
    projectId: request.projectId,
    payload,
    error
  });
  response.replyTo = request.id;
  socket.send(JSON.stringify(response));
}

const urlArg = process.argv.find(arg => arg.startsWith('--url='));
const tokenArg = process.argv.find(arg => arg.startsWith('--token='));
const url = urlArg ? urlArg.split('=')[1] : process.env.NOVA_CONNECT_URL || 'ws://127.0.0.1:8765';
const pairingToken = tokenArg ? tokenArg.split('=')[1] : process.env.NOVA_CONNECT_TOKEN || '';
const socket = new WebSocket(url);

socket.on('open', () => {
  socket.send(JSON.stringify(createEnvelope({
    type: 'hello',
    source: 'revit-plugin',
    target: 'hub',
    payload: {
      role: 'host',
      pairingToken,
      capabilities: ['project.snapshot', 'elements.query', 'geometry.get', 'geometry.create']
    }
  })));
  console.log('[Nova Connect] Mock Revit host connected to ' + url);
});

socket.on('message', raw => {
  const request = JSON.parse(raw.toString());
  if (request.type === 'connection.established') {
    console.log('[Nova Connect] Mock Revit host paired for session ' + request.sessionId);
    return;
  }
  if (request.type === 'project.snapshot') {
    reply(socket, request, 'project.snapshot', getSnapshot());
  } else if (request.type === 'elements.query') {
    const category = request.payload && request.payload.category;
    reply(socket, request, 'elements.query.result', {
      elements: category ? elements.filter(item => item.category === category) : elements,
      page: 1,
      pageSize: 200,
      total: category ? elements.filter(item => item.category === category).length : elements.length
    });
  } else if (request.type === 'geometry.get') {
    reply(socket, request, 'geometry.get.result', {
      geometries: (request.payload.elementIds || []).map(id => geometryById[String(id)]).filter(Boolean)
    });
  } else if (request.type === 'geometry.create') {
    if (!request.payload.approval || request.payload.approval.approved !== true) {
      reply(socket, request, 'geometry.create.result', {
        ok: false,
        code: 'WRITE_APPROVAL_REQUIRED',
        message: 'Revit writes require explicit user approval.'
      });
      return;
    }
    reply(socket, request, 'geometry.create.result', {
      ok: true,
      data: {
        directShapeId: 'mock-directshape-' + Date.now(),
        category: 'Generic Models'
      },
      message: 'Mock DirectShape geometry accepted.'
    });
  }
});

socket.on('error', error => {
  console.error('[Nova Connect] Mock Revit host error:', error.message);
  process.exitCode = 1;
});
