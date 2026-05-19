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
      projectId: valueOf(document, 'nova-connect-project', '')
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
      try {
        await fetchProjectSnapshotWithRetry(client);
        const categories = Object.keys(client.elementsByCategory || {});
        this._setNovaConnectResult({
          ok: true,
          message: 'Connected to Revit session ' + (client.sessionId || 'pending') + '. Cached ' + categories.length + ' categories.'
        });
      } catch (snapshotError) {
        const peerHint = client.peerConnected === false ? ' Hub is reachable, but no Revit host is paired for this session.' : '';
        this._setNovaConnectResult({
          ok: false,
          message: 'Connected to hub, but Revit data is not available.' + peerHint,
          detail: snapshotError.message || String(snapshotError)
        });
      }
    } catch (error) {
      this._setNovaConnectResult({ ok: false, message: error.message || 'Connection failed.' });
    }
  };

  app.disconnectNovaConnect = function() {
    const client = this._getNovaConnect();
    if (client) client.disconnect();
    this._setNovaConnectResult({ ok: true, message: 'Disconnected.' });
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
        '<button class="ncp-icon-btn" onclick="app.closeNovaConnectPanel()" title="Close">×</button>' +
      '</div>' +
      '<label class="ncp-label">Hub URL<input id="nova-connect-url" value="' + escapeHtml(settings.url) + '" autocomplete="off" placeholder="ws://127.0.0.1:8765"></label>' +
      '<label class="ncp-label">Pairing Token (optional)<input id="nova-connect-token" value="' + escapeHtml(settings.token) + '" autocomplete="off" placeholder="Leave empty if not required"></label>' +
      '<label class="ncp-label">Project ID (optional)<input id="nova-connect-project" value="' + escapeHtml(settings.projectId) + '" autocomplete="off" placeholder="Auto-detected from Revit"></label>' +
      '<div class="ncp-actions">' +
        '<button onclick="app.connectNovaConnect()">Connect</button>' +
        '<button onclick="app.disconnectNovaConnect()">Disconnect</button>' +
      '</div>' +
      (result ? '<div class="ncp-result ' + (result.ok === false ? 'ncp-result-error' : '') + '">' +
        '<strong>' + escapeHtml(result.message) + '</strong>' +
        (result.detail ? '<pre>' + escapeHtml(result.detail) + '</pre>' : '') +
      '</div>' : '');
  };
}

async function fetchProjectSnapshotWithRetry(client) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await client.getProjectSnapshot();
    } catch (error) {
      lastError = error;
      if (!/No host is connected|NO_HOST/i.test(error.message || String(error))) throw error;
      await delay(500);
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    message: launch.autoConnect
      ? 'Opened from Revit. Auto-connecting to Nova Connect...'
      : 'Opened from Revit. Click Connect to establish connection.'
  };

  if (launch.autoConnect) {
    setTimeout(() => {
      app.connectNovaConnect().catch(err => {
        console.warn('[Nova Connect] Auto-connect failed:', err.message);
      });
    }, 500);
  }
}

function readLaunchParameters(runtimeGlobal) {
  const location = runtimeGlobal.location;
  if (!location || !location.search || typeof URLSearchParams === 'undefined') return {};
  const params = new URLSearchParams(location.search);
  return {
    url: params.get('novaConnectUrl') || '',
    token: params.get('novaConnectToken') || '',
    projectId: params.get('novaConnectProject') || '',
    openPanel: params.get('novaConnectOpen') === '1',
    autoConnect: params.get('novaConnectAuto') === '1'
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
      width: min(340px, calc(100vw - 24px));
      height: calc(100vh - 44px);
      transform: translateX(100%);
      transition: transform 160ms ease;
      z-index: 4000;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-color);
      box-shadow: -12px 0 32px rgba(0, 0, 0, 0.28);
      padding: 20px;
      color: var(--text-primary);
      overflow-y: auto;
    }
    .nova-connect-panel.visible { transform: translateX(0); }
    .ncp-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 20px;
    }
    .ncp-header h2 {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: -0.01em;
      font-weight: 700;
    }
    .ncp-status {
      margin: 6px 0 0;
      font-size: 12px;
      color: var(--text-muted);
      text-transform: capitalize;
      font-weight: 500;
    }
    .ncp-status-connected { color: var(--accent-green); }
    .ncp-status-connecting { color: var(--accent-blue); }
    .ncp-status-error, .ncp-status-unavailable { color: var(--accent-red); }
    .ncp-icon-btn {
      width: 32px;
      height: 32px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-surface);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 120ms ease;
    }
    .ncp-icon-btn:hover {
      background: var(--bg-primary);
      border-color: var(--text-muted);
    }
    .ncp-label {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      color: var(--text-secondary);
      font-weight: 500;
    }
    .ncp-label input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 10px 12px;
      font-size: 13px;
      transition: border-color 120ms ease;
    }
    .ncp-label input:focus {
      outline: none;
      border-color: var(--accent-blue);
    }
    .ncp-label input::placeholder {
      color: var(--text-muted);
      opacity: 0.6;
    }
    .ncp-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 20px 0;
    }
    .ncp-actions button {
      min-height: 38px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-surface);
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 120ms ease;
    }
    .ncp-actions button:hover {
      background: var(--bg-primary);
      transform: translateY(-1px);
    }
    .ncp-actions button:first-child {
      background: var(--accent-blue);
      color: white;
      border-color: var(--accent-blue);
    }
    .ncp-actions button:first-child:hover {
      background: var(--accent-blue);
      opacity: 0.9;
      transform: translateY(-1px);
    }
    .ncp-result {
      margin-top: 20px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-primary);
      padding: 14px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-secondary);
    }
    .ncp-result strong { 
      color: var(--text-primary); 
      font-weight: 600;
      display: block;
      margin-bottom: 4px;
    }
    .ncp-result-error { 
      border-color: rgba(243, 139, 168, 0.45);
      background: rgba(243, 139, 168, 0.05);
    }
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
