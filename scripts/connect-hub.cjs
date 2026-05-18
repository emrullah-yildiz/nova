const crypto = require('crypto');
const { WebSocketServer } = require('ws');

function createId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function createConnectHub(options = {}) {
  const port = options.port ?? 8765;
  const host = options.host ?? '127.0.0.1';
  const pairingToken = options.pairingToken ?? createId('pair');
  const pairingTokenRequired = options.pairingToken !== undefined && options.pairingToken !== '';
  const defaultSessionId = options.defaultSessionId || 'local-revit-session';
  const sessions = new Map();
  const clients = new Map();
  const server = new WebSocketServer({ host, port });

  function getOrCreateSession(sessionId) {
    const id = sessionId || defaultSessionId;
    if (!sessions.has(id)) {
      sessions.set(id, { id, host: null, viewers: new Set(), createdAt: Date.now(), projectId: '' });
    }
    return sessions.get(id);
  }

  function send(socket, message) {
    if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  function sendError(socket, envelope, message, code) {
    send(socket, {
      version: 1,
      id: createId('err'),
      type: 'operation.error',
      source: 'nova-connect-hub',
      target: envelope && envelope.source,
      sessionId: envelope && envelope.sessionId,
      projectId: envelope && envelope.projectId,
      timestamp: Date.now(),
      payload: { ok: false, message, code: code || 'NOVA_CONNECT_HUB_ERROR' },
      error: { message, code: code || 'NOVA_CONNECT_HUB_ERROR' },
      replyTo: envelope && envelope.id
    });
  }

  function route(sender, envelope) {
    const clientInfo = clients.get(sender) || {};
    const session = getOrCreateSession(envelope.sessionId || clientInfo.sessionId);
    const target = envelope.target || (clientInfo.role === 'host' ? 'viewer' : 'host');

    if (target === 'hub') {
      handleHubMessage(sender, envelope, session);
      return;
    }

    if (target === 'host') {
      if (!session.host) return sendError(sender, envelope, 'No host is connected for this session', 'NO_HOST');
      send(session.host, { ...envelope, sessionId: session.id });
      return;
    }

    if (target === 'viewer' || target === 'browser') {
      session.viewers.forEach(viewer => {
        if (viewer !== sender) send(viewer, { ...envelope, sessionId: session.id });
      });
      return;
    }

    sendError(sender, envelope, 'Unknown target: ' + target, 'UNKNOWN_TARGET');
  }

  function handleHubMessage(socket, envelope, session) {
    if (envelope.type === 'ping') {
      send(socket, { ...envelope, type: 'pong', source: 'nova-connect-hub', target: envelope.source, replyTo: envelope.id });
      return;
    }

    if (envelope.type !== 'hello') return;

    const payload = envelope.payload || {};
    // If a pairing token was configured on the hub, reject connections
    // that don't match. When no token was configured, accept any.
    if (pairingTokenRequired && payload.pairingToken !== pairingToken) {
      sendError(socket, envelope, 'Invalid pairing token', 'INVALID_PAIRING_TOKEN');
      return;
    }

    const role = payload.role === 'host' ? 'host' : 'viewer';
    if (role === 'host') session.host = socket;
    else session.viewers.add(socket);
    session.projectId = envelope.projectId || payload.projectId || session.projectId;
    clients.set(socket, { role, sessionId: session.id });

    send(socket, {
      version: 1,
      id: createId('conn'),
      type: 'connection.established',
      source: 'nova-connect-hub',
      target: envelope.source,
      sessionId: session.id,
      projectId: session.projectId,
      timestamp: Date.now(),
      payload: {
        sessionId: session.id,
        pairingTokenRequired: !!pairingToken,
        peerConnected: role === 'host' ? session.viewers.size > 0 : !!session.host
      },
      error: null,
      replyTo: envelope.id
    });
  }

  server.on('connection', socket => {
    socket.on('message', raw => {
      let envelope;
      try {
        envelope = JSON.parse(raw.toString());
      } catch (error) {
        sendError(socket, null, 'Invalid JSON message', 'INVALID_JSON');
        return;
      }
      if (!envelope.type || !envelope.source || !envelope.id) {
        sendError(socket, envelope, 'Envelope requires id, type, and source', 'INVALID_ENVELOPE');
        return;
      }
      route(socket, envelope);
    });

    socket.on('close', () => {
      const info = clients.get(socket);
      clients.delete(socket);
      if (!info) return;
      const session = sessions.get(info.sessionId);
      if (!session) return;
      if (session.host === socket) session.host = null;
      session.viewers.delete(socket);
    });
  });

  return {
    server,
    sessions,
    clients,
    pairingToken,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

if (require.main === module) {
  const portArg = process.argv.find(arg => arg.startsWith('--port='));
  const tokenArg = process.argv.find(arg => arg.startsWith('--token='));
  const hub = createConnectHub({
    port: portArg ? Number(portArg.split('=')[1]) : Number(process.env.NOVA_CONNECT_PORT || 8765),
    pairingToken: tokenArg ? tokenArg.split('=')[1] : process.env.NOVA_CONNECT_TOKEN
  });
  hub.server.on('listening', () => {
    const address = hub.server.address();
    console.log('[Nova Connect] Hub listening on ws://127.0.0.1:' + address.port);
    console.log('[Nova Connect] Pairing token: ' + hub.pairingToken);
  });
}

module.exports = { createConnectHub };
