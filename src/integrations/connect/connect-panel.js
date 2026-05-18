function getRuntimeGlobal() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

const PANEL_ID = 'nova-connect-panel';
const STYLE_ID = 'nova-connect-panel-style';
const STORAGE_KEY = 'nova_connect_settings';

export function installNovaConnectPanel(targetApp = getRuntimeGlobal().app, runtimeGlobal = getRuntimeGlobal()) {
  if (!targetApp || runtimeGlobal.__novaConnectPanelInstalled) return targetApp;
  runtimeGlobal.__novaConnectPanelInstalled = true;

  const document = runtimeGlobal.document;
  if (!document) return targetApp;

  injectStyles(document);
  installAppMethods(targetApp, runtimeGlobal);
  installMenuButton(document, targetApp);
  applyLaunchParameters(targetApp, runtimeGlobal);
  targetApp._renderNovaConnectPanel();
  return targetApp;
}

function installAppMethods(app, runtimeGlobal) {
  app.novaConnectPanelOpen = false;
  app.novaConnectLastResult = null;

  app.toggleNovaConnectPanel = function() {
    this.novaConnectPanelOpen = !this.novaConnectPanelOpen;
    this._renderNovaConnectPanel();
  };

  app.closeNovaConnectPanel = function() {
    this.novaConnectPanelOpen = false;
    this._renderNovaConnectPanel();
  };

  app._getNovaConnect = function() {
    return runtimeGlobal.NodeFlow ? runtimeGlobal.NodeFlow.NovaConnect : runtimeGlobal.NovaConnect;
  };

  app._getNovaRevitBridge = function() {
    return runtimeGlobal.NodeFlow ? runtimeGlobal.NodeFlow.RevitBridge : runtimeGlobal.RevitBridge;
  };

  app._readNovaConnectSettings = function() {
    const stored = readJson(runtimeGlobal.localStorage && runtimeGlobal.localStorage.getItem(STORAGE_KEY));
    const launch = readLaunchParameters(runtimeGlobal);
    return {
      url: launch.url || stored.url || 'ws://127.0.0.1:8765',
      token: launch.token || stored.token || '',
      projectId: launch.projectId || stored.projectId || ''
    };
  };

  app._writeNovaConnectSettings = function(settings) {
    if (!runtimeGlobal.localStorage) return;
    runtimeGlobal.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  };

  app._collectNovaConnectSettings = function() {
    const document = runtimeGlobal.document;
    return {
      url: valueOf(document, 'nova-connect-url', 'ws://127.0.0.1:8765'),
      token: valueOf(document, 'nova-connect-token', ''),
      projectId: valueOf(document, 'nova-connect-project', ''),
      writeApproved: checkedOf(document, 'nova-connect-write-approval')
    };
  };

  app._setNovaConnectResult = function(result) {
    this.novaConnectLastResult = result;
    this._renderNovaConnectPanel();
  };

  app.connectNovaConnect = async function() {
    const client = this._getNovaConnect();
    if (!client) return this._setNovaConnectResult({ ok: false, message: 'NovaConnect client is not available.' });
    const settings = this._collectNovaConnectSettings();
    this._writeNovaConnectSettings(settings);
    client.url = settings.url;
    client.pairingToken = settings.token;
    client.projectId = settings.projectId;
    this._setNovaConnectResult({ ok: true, message: 'Connecting to Nova Connect hub...' });
    try {
      await client.connect();
      this._setNovaConnectResult({ ok: true, message: 'Connected to session ' + (client.sessionId || 'pending') + '.' });
    } catch (error) {
      this._setNovaConnectResult({ ok: false, message: error.message || 'Connection failed.' });
    }
  };

  app.disconnectNovaConnect = function() {
    const client = this._getNovaConnect();
    if (client) client.disconnect();
    this._setNovaConnectResult({ ok: true, message: 'Disconnected.' });
  };

  app.queryNovaConnectWalls = async function() {
    const bridge = this._getNovaRevitBridge();
    if (!bridge || !bridge.queryElements) return this._setNovaConnectResult({ ok: false, message: 'RevitBridge is not available.' });
    try {
      const walls = await bridge.queryElements('Walls');
      this._setNovaConnectResult({
        ok: true,
        message: 'Received ' + walls.length + ' wall element' + (walls.length === 1 ? '.' : 's.'),
        detail: walls.map(element => element.category + ' [' + element.id + '] ' + element.name).join('\n')
      });
    } catch (error) {
      this._setNovaConnectResult({ ok: false, message: error.message || 'Wall query failed.' });
    }
  };

  app.getNovaConnectGeometry = async function() {
    const bridge = this._getNovaRevitBridge();
    if (!bridge || !bridge.queryElements || !bridge.getLiveGeometries) {
      return this._setNovaConnectResult({ ok: false, message: 'Live geometry bridge is not available.' });
    }
    try {
      const walls = await bridge.queryElements('Walls');
      const meshes = await bridge.getLiveGeometries(walls);
      this._setNovaConnectResult({
        ok: true,
        message: 'Received ' + meshes.length + ' mesh result' + (meshes.length === 1 ? '.' : 's.'),
        detail: meshes.map(mesh => mesh.toString ? mesh.toString() : mesh._type).join('\n')
      });
    } catch (error) {
      this._setNovaConnectResult({ ok: false, message: error.message || 'Geometry request failed.' });
    }
  };

  app.sendNovaConnectTestPoint = async function() {
    const bridge = this._getNovaRevitBridge();
    const Geo = runtimeGlobal.NodeFlow ? runtimeGlobal.NodeFlow.Geo : runtimeGlobal.Geo;
    if (!bridge || !bridge.sendGeometry || !Geo) return this._setNovaConnectResult({ ok: false, message: 'Send geometry bridge is not available.' });
    const settings = this._collectNovaConnectSettings();
    if (!settings.writeApproved) {
      return this._setNovaConnectResult({
        ok: false,
        message: 'Approve this write operation before sending geometry.',
        detail: 'Enable "Approve one Revit write" in the Connect panel. This prevents accidental model writes when the real Revit host is connected.'
      });
    }
    try {
      const result = await bridge.sendGeometry(new Geo.Point3(1, 2, 3), {
        source: 'revit-local',
        sourceId: 'nova-connect-test-point'
      }, {
        metadata: { category: 'Generic Models' },
        approval: {
          approved: true,
          approvedAt: Date.now(),
          approvedBy: 'nova-connect-panel',
          scope: 'single-operation',
          message: 'User approved sending the Nova Connect test point.'
        }
      });
      this._clearNovaConnectWriteApproval();
      this._setNovaConnectResult({
        ok: !!result.ok,
        message: result.message || (result.ok ? 'Geometry accepted.' : 'Geometry rejected.'),
        detail: result.data ? JSON.stringify(result.data, null, 2) : ''
      });
    } catch (error) {
      this._setNovaConnectResult({ ok: false, message: error.message || 'Geometry send failed.' });
    }
  };

  app._clearNovaConnectWriteApproval = function() {
    const checkbox = runtimeGlobal.document.getElementById('nova-connect-write-approval');
    if (checkbox) checkbox.checked = false;
  };

  app._renderNovaConnectPanel = function() {
    const document = runtimeGlobal.document;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.className = 'nova-connect-panel';
      document.body.appendChild(panel);
    }
    const settings = this._readNovaConnectSettings();
    const client = this._getNovaConnect();
    const status = client ? client.status : 'unavailable';
    const result = this.novaConnectLastResult;
    panel.className = 'nova-connect-panel' + (this.novaConnectPanelOpen ? ' visible' : '');
    panel.innerHTML =
      '<div class="ncp-header">' +
        '<div><h2>Nova Connect</h2><p class="ncp-status ncp-status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</p></div>' +
        '<button class="ncp-icon-btn" onclick="app.closeNovaConnectPanel()" title="Close">x</button>' +
      '</div>' +
      '<label class="ncp-label">Hub URL<input id="nova-connect-url" value="' + escapeHtml(settings.url) + '" autocomplete="off"></label>' +
      '<label class="ncp-label">Pairing Token<input id="nova-connect-token" value="' + escapeHtml(settings.token) + '" autocomplete="off"></label>' +
      '<label class="ncp-label">Project ID<input id="nova-connect-project" value="' + escapeHtml(settings.projectId) + '" autocomplete="off"></label>' +
      '<label class="ncp-approval"><input id="nova-connect-write-approval" type="checkbox"> <span>Approve one Revit write</span></label>' +
      '<div class="ncp-actions">' +
        '<button onclick="app.connectNovaConnect()">Connect</button>' +
        '<button onclick="app.disconnectNovaConnect()">Disconnect</button>' +
      '</div>' +
      '<div class="ncp-actions ncp-actions-stack">' +
        '<button onclick="app.queryNovaConnectWalls()">Query Walls</button>' +
        '<button onclick="app.getNovaConnectGeometry()">Get Geometry</button>' +
        '<button onclick="app.sendNovaConnectTestPoint()">Send Test Point</button>' +
      '</div>' +
      '<div class="ncp-result ' + (result && result.ok === false ? 'ncp-result-error' : '') + '">' +
        '<strong>' + escapeHtml(result ? result.message : 'Ready for a local Revit or mock Revit session.') + '</strong>' +
        (result && result.detail ? '<pre>' + escapeHtml(result.detail) + '</pre>' : '') +
      '</div>';
  };
}

function installMenuButton(document, app) {
  if (document.getElementById('menu-connect')) return;
  const menuRight = document.querySelector('.menu-right');
  if (!menuRight) return;
  const button = document.createElement('button');
  button.className = 'menu-item';
  button.id = 'menu-connect';
  button.type = 'button';
  button.title = 'Open Nova Connect';
  button.textContent = 'Connect';
  button.onclick = () => app.toggleNovaConnectPanel();
  menuRight.insertBefore(button, menuRight.firstChild);
}

function applyLaunchParameters(app, runtimeGlobal) {
  const launch = readLaunchParameters(runtimeGlobal);
  if (!launch.openPanel) return;
  app.novaConnectPanelOpen = true;
  if (runtimeGlobal.localStorage) {
    const current = app._readNovaConnectSettings();
    app._writeNovaConnectSettings({
      url: launch.url || current.url,
      token: launch.token || current.token,
      projectId: launch.projectId || current.projectId
    });
  }
  app.novaConnectLastResult = {
    ok: true,
    message: 'Opened from Revit. Start the hub, then click Connect.'
  };
}

function readLaunchParameters(runtimeGlobal) {
  const location = runtimeGlobal.location;
  if (!location || !location.search || typeof URLSearchParams === 'undefined') return {};
  const params = new URLSearchParams(location.search);
  return {
    url: params.get('novaConnectUrl') || '',
    token: params.get('novaConnectToken') || '',
    projectId: params.get('novaConnectProject') || '',
    openPanel: params.get('novaConnectOpen') === '1'
  };
}

function injectStyles(document) {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .nova-connect-panel {
      position: fixed;
      top: 44px;
      right: 0;
      width: min(360px, calc(100vw - 24px));
      height: calc(100vh - 44px);
      transform: translateX(100%);
      transition: transform 160ms ease;
      z-index: 4000;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-color);
      box-shadow: -12px 0 32px rgba(0, 0, 0, 0.28);
      padding: 16px;
      color: var(--text-primary);
      overflow-y: auto;
    }
    .nova-connect-panel.visible { transform: translateX(0); }
    .ncp-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    .ncp-header h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .ncp-status {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--text-muted);
      text-transform: capitalize;
    }
    .ncp-status-connected { color: var(--accent-green); }
    .ncp-status-error, .ncp-status-unavailable { color: var(--accent-red); }
    .ncp-icon-btn {
      width: 28px;
      height: 28px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-surface);
      color: var(--text-secondary);
      cursor: pointer;
    }
    .ncp-label {
      display: grid;
      gap: 6px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .ncp-label input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 9px 10px;
      font-size: 13px;
    }
    .ncp-approval {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0 12px;
      padding: 10px;
      border: 1px solid rgba(249, 226, 175, 0.35);
      border-radius: 6px;
      background: rgba(249, 226, 175, 0.08);
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
    }
    .ncp-approval input {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--accent-green);
    }
    .ncp-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 12px 0;
    }
    .ncp-actions-stack { grid-template-columns: 1fr; }
    .ncp-actions button {
      min-height: 34px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-surface);
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .ncp-actions button:first-child {
      background: var(--accent-blue);
      color: var(--bg-tertiary);
      border-color: var(--accent-blue);
    }
    .ncp-result {
      margin-top: 16px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-primary);
      padding: 12px;
      font-size: 13px;
      line-height: 1.4;
      color: var(--text-secondary);
    }
    .ncp-result strong { color: var(--text-primary); font-weight: 600; }
    .ncp-result-error { border-color: rgba(243, 139, 168, 0.45); }
    .ncp-result-error strong { color: var(--accent-red); }
    .ncp-result pre {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 10px 0 0;
      font: 12px/1.45 "JetBrains Mono", monospace;
      color: var(--text-muted);
    }
  `;
  document.head.appendChild(style);
}

function valueOf(document, id, fallback) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : fallback;
}

function checkedOf(document, id) {
  const element = document.getElementById(id);
  return !!(element && element.checked);
}

function readJson(value) {
  if (!value) return {};
  try {
    return JSON.parse(value) || {};
  } catch (error) {
    return {};
  }
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default installNovaConnectPanel;
