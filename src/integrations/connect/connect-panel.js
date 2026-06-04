import * as revitBridge from '../revit/revit-bridge.js';

function getRuntimeGlobal() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

function getRuntimeConfig(runtimeGlobal) {
  return runtimeGlobal.NovaConfig || runtimeGlobal.__NOVA_CONFIG__ || {};
}

const PANEL_ID = 'nova-connect-panel';
const STYLE_ID = 'nova-connect-panel-style';
const STORAGE_KEY = 'nova_connect_settings';

// The Revit release the downloadable add-in installer targets, and where the
// installer EXE is served (public/downloads -> dist/downloads via Vite).
export const REVIT_TARGET_VERSION = '2027';
export const NOVA_CONNECT_DOWNLOAD_URL = '/downloads/NovaConnect-Setup.exe';

// Pure: the "Download Nova Connect" section shown at the top of the Connect
// panel. Kept separate + exported so the download wiring (URL + Revit version
// note) is unit-testable without rendering the whole panel.
export function novaConnectDownloadMarkup(version = REVIT_TARGET_VERSION) {
  return '<div class="ncp-download">' +
    '<h3 class="ncp-download-title">Nova Connect for Revit</h3>' +
    '<p class="ncp-download-note">Requires Autodesk Revit ' + escapeHtml(version) + ' · Windows.</p>' +
    '<a class="ncp-download-btn" href="' + NOVA_CONNECT_DOWNLOAD_URL + '" download>⬇ Download Nova Connect</a>' +
    '<p class="ncp-download-sub">The installer checks for Revit and adds the plug-in automatically.</p>' +
  '</div>';
}

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

  // M4-T5 picker state. One small state object drives the picker section:
  //   phase: 'idle' | 'picking' | 'selected' | 'placing' | 'error'
  //   elements: contract elements from the last successful requestSelection
  //   message / detail: human-readable status for the current phase
  //   placeResult: { ok, message } after a placement attempt (success or error)
  app.novaConnectPicker = { phase: 'idle', elements: [], message: '', detail: '', placeResult: null };

  // The M4 RevitBridge is injected via the runtime global so tests can mock the
  // transport without a real hub. Falls back to the imported bridge in the app.
  app._getRevitBridge = function() {
    return runtimeGlobal.__novaRevitBridge || revitBridge;
  };

  app._setNovaConnectPicker = function(patch) {
    this.novaConnectPicker = Object.assign({}, this.novaConnectPicker, patch);
    this._renderNovaConnectPanel();
  };

  // Ask Revit (via the bridge) for the user's current selection. Walks the
  // picker through picking -> selected, or picking -> error.
  app.pickRevitSelection = async function() {
    const bridge = this._getRevitBridge();
    const client = this._getNovaConnect();
    if (!bridge || typeof bridge.requestSelection !== 'function') {
      return this._setNovaConnectPicker({ phase: 'error', message: 'Revit bridge is not available.', detail: '' });
    }
    this._setNovaConnectPicker({ phase: 'picking', message: 'Pick elements or faces in Revit...', detail: '', placeResult: null });
    try {
      const result = await bridge.requestSelection({ includeFaces: true }, { client });
      const elements = (result && Array.isArray(result.elements)) ? result.elements : [];
      if (elements.length === 0) {
        return this._setNovaConnectPicker({ phase: 'idle', elements: [], message: 'No elements were selected in Revit.', detail: '' });
      }
      this._setNovaConnectPicker({ phase: 'selected', elements, message: '', detail: '' });
    } catch (error) {
      this._setNovaConnectPicker({
        phase: 'error',
        message: 'Selection failed.',
        detail: (error && error.message) || String(error)
      });
    }
  };

  app.clearRevitSelection = function() {
    this._setNovaConnectPicker({ phase: 'idle', elements: [], message: '', detail: '', placeResult: null });
  };

  // Place a family instance hosted on the first selected face (or at the first
  // selected element's origin if no face is available). The hub gates the WRITE
  // behind interactive approval; here we just surface success/error.
  app.placeRevitInstance = async function() {
    const bridge = this._getRevitBridge();
    const client = this._getNovaConnect();
    const elements = this.novaConnectPicker.elements || [];
    if (elements.length === 0) {
      return this._setNovaConnectPicker({ phase: 'error', message: 'Select elements before placing.', detail: '' });
    }
    if (!bridge || typeof bridge.placeInstance !== 'function') {
      return this._setNovaConnectPicker({ phase: 'error', message: 'Revit bridge is not available.', detail: '' });
    }
    const spec = buildPlacementSpec(elements);
    this._setNovaConnectPicker({ phase: 'placing', message: 'Placing instance in Revit...', placeResult: null });
    try {
      const out = await bridge.placeInstance(spec, { client });
      const ok = !(out && out.ok === false);
      this._setNovaConnectPicker({
        phase: 'selected',
        placeResult: ok
          ? { ok: true, message: 'Placed ' + spec.familyType + (out && out.elementId ? ' (id ' + String(out.elementId) + ')' : '') + '.' }
          : { ok: false, message: (out && out.message) || 'Placement was rejected by the host.' }
      });
    } catch (error) {
      this._setNovaConnectPicker({
        phase: 'error',
        message: 'Placement failed.',
        detail: (error && error.message) || String(error)
      });
    }
  };

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
    const config = getRuntimeConfig(runtimeGlobal);
    return {
      url: launch.url || stored.url || config.websocketUrl || 'ws://127.0.0.1:8765',
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
      url: valueOf(document, 'nova-connect-url', getRuntimeConfig(runtimeGlobal).websocketUrl || 'ws://127.0.0.1:8765'),
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
    const pendingApprovals = getPendingApprovalsForDisplay();
    panel.className = 'nova-connect-panel' + (this.novaConnectPanelOpen ? ' visible' : '');
    panel.innerHTML =
      '<div class="ncp-header">' +
        '<div><h2>Nova Connect</h2><p class="ncp-status ncp-status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</p></div>' +
        '<button class="ncp-icon-btn" onclick="app.closeNovaConnectPanel()" title="Close">×</button>' +
      '</div>' +
      novaConnectDownloadMarkup() +
      '<label class="ncp-label">Hub URL<input id="nova-connect-url" value="' + escapeHtml(settings.url) + '" autocomplete="off" placeholder="ws://127.0.0.1:8765"></label>' +
      '<label class="ncp-label">Pairing Token (optional)<input id="nova-connect-token" value="' + escapeHtml(settings.token) + '" autocomplete="off" placeholder="Leave empty if not required"></label>' +
      '<label class="ncp-label">Project ID (optional)<input id="nova-connect-project" value="' + escapeHtml(settings.projectId) + '" autocomplete="off" placeholder="Auto-detected from Revit"></label>' +
      '<div class="ncp-actions">' +
        '<button onclick="app.connectNovaConnect()">Connect</button>' +
        '<button onclick="app.disconnectNovaConnect()">Disconnect</button>' +
      '</div>' +
      renderPickerSection(this.novaConnectPicker) +
      (pendingApprovals.length > 0 ? renderApprovalSection(pendingApprovals) : '') +
      (result ? '<div class="ncp-result ' + (result.ok === false ? 'ncp-result-error' : '') + '">' +
        '<strong>' + escapeHtml(result.message) + '</strong>' +
        (result.detail ? '<pre>' + escapeHtml(result.detail) + '</pre>' : '') +
      '</div>' : '');
  };
}

function getPendingApprovalsForDisplay() {
  try {
    const mod = window.__revitWriteApproval;
    if (mod && mod.getPendingApprovals) return mod.getPendingApprovals();
  } catch (e) {
    // Approvals module may not be installed; render empty list instead of crashing the panel.
  }
  return [];
}

function renderApprovalSection(approvals) {
  const items = approvals.map(a => {
    const opLabel = a.operation === 'parameter.set' ? 'Set Parameter' :
                    a.operation === 'geometry.create' ? 'Create Geometry' : a.operation;
    return '<div class="ncp-approval-item" id="approval-' + escapeHtml(a.id) + '">' +
      '<div class="ncp-approval-header">' +
        '<span class="ncp-approval-icon">⚠️</span>' +
        '<span class="ncp-approval-title">' + escapeHtml(opLabel) + '</span>' +
      '</div>' +
      '<div class="ncp-approval-desc">' + escapeHtml(a.description) + '</div>' +
      (a.parameterName ? '<div class="ncp-approval-detail">Parameter: <strong>' + escapeHtml(a.parameterName) + '</strong></div>' : '') +
      (a.elementCount > 0 ? '<div class="ncp-approval-detail">Elements: <strong>' + a.elementCount + '</strong></div>' : '') +
      (a.value ? '<div class="ncp-approval-detail">Value: <code>' + escapeHtml(String(a.value).slice(0, 80)) + '</code></div>' : '') +
      '<div class="ncp-approval-actions">' +
        '<button class="ncp-approve-btn" onclick="window.__revitWriteApproval.resolveApproval(\'' + escapeHtml(a.id) + '\', true, \'Approved by user\')">✓ Approve</button>' +
        '<button class="ncp-reject-btn" onclick="window.__revitWriteApproval.resolveApproval(\'' + escapeHtml(a.id) + '\', false, \'Rejected by user\')">✕ Deny</button>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="ncp-approval-section">' +
    '<h4 class="ncp-approval-heading">Pending Write Approvals</h4>' +
    items +
  '</div>';
}

// Pure: derive a contract placement spec from the picked elements. Hosts the
// instance on the first available face; otherwise places at the origin. Kept
// pure + module-scoped so the placement payload is easy to reason about/test.
function buildPlacementSpec(elements) {
  const first = (elements && elements[0]) || {};
  const face = Array.isArray(first.faces) && first.faces.length > 0 ? first.faces[0] : null;
  const spec = {
    kind: 'FamilyInstance',
    familyType: 'Furniture: Chair',
    points: [[0, 0, 0]]
  };
  if (face && face.faceId) spec.hostFaceId = face.faceId;
  return spec;
}

// Pure: render the picker section for the current picker state. Each phase
// renders a distinct, testable surface: idle (pick button) -> picking (busy)
// -> selected (summary + place) -> error (message + retry). placeResult is
// surfaced inside the selected phase as a success/error banner.
function renderPickerSection(picker) {
  const state = picker || { phase: 'idle', elements: [], message: '', detail: '', placeResult: null };
  const phase = state.phase || 'idle';
  let body = '';

  if (phase === 'picking' || phase === 'placing') {
    body =
      '<p class="ncp-picker-msg">' + escapeHtml(state.message || 'Working...') + '</p>' +
      '<div class="ncp-picker-actions">' +
        '<button class="ncp-picker-btn" disabled>' + (phase === 'placing' ? 'Placing…' : 'Picking…') + '</button>' +
      '</div>';
  } else if (phase === 'selected') {
    body =
      renderSelectionSummary(state.elements) +
      (state.placeResult ? renderPlaceResult(state.placeResult) : '') +
      '<div class="ncp-picker-actions">' +
        '<button class="ncp-picker-btn ncp-picker-btn-primary" onclick="app.placeRevitInstance()">Place Instance</button>' +
        '<button class="ncp-picker-btn" onclick="app.clearRevitSelection()">Clear</button>' +
      '</div>';
  } else if (phase === 'error') {
    body =
      '<div class="ncp-picker-error">' +
        '<strong>' + escapeHtml(state.message || 'Something went wrong.') + '</strong>' +
        (state.detail ? '<pre>' + escapeHtml(state.detail) + '</pre>' : '') +
      '</div>' +
      '<div class="ncp-picker-actions">' +
        '<button class="ncp-picker-btn ncp-picker-btn-primary" onclick="app.pickRevitSelection()">Retry Pick</button>' +
      '</div>';
  } else {
    // idle
    body =
      (state.message ? '<p class="ncp-picker-msg">' + escapeHtml(state.message) + '</p>' : '') +
      '<p class="ncp-picker-hint">Pick elements or faces in Revit to start a placement.</p>' +
      '<div class="ncp-picker-actions">' +
        '<button class="ncp-picker-btn ncp-picker-btn-primary" onclick="app.pickRevitSelection()">Pick Elements / Faces</button>' +
      '</div>';
  }

  return '<div class="ncp-picker-section" data-picker-phase="' + escapeHtml(phase) + '">' +
    '<h4 class="ncp-picker-heading">Selection &amp; Placement</h4>' +
    body +
  '</div>';
}

// Pure: a compact summary of the selected contract elements.
function renderSelectionSummary(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const faceCount = list.reduce((n, el) => n + (Array.isArray(el.faces) ? el.faces.length : 0), 0);
  const header = '<div class="ncp-picker-summary">' +
    '<strong>' + list.length + '</strong> element' + (list.length === 1 ? '' : 's') + ' selected' +
    (faceCount > 0 ? ' · <strong>' + faceCount + '</strong> face' + (faceCount === 1 ? '' : 's') : '') +
  '</div>';
  const rows = list.slice(0, 8).map(el => {
    const label = el.name || el.typeName || ('Element ' + el.id);
    return '<li class="ncp-picker-item">' +
      '<span class="ncp-picker-item-name">' + escapeHtml(label) + '</span>' +
      '<span class="ncp-picker-item-cat">' + escapeHtml(el.category || 'Unknown') + '</span>' +
    '</li>';
  }).join('');
  const more = list.length > 8 ? '<li class="ncp-picker-more">+' + (list.length - 8) + ' more</li>' : '';
  return header + '<ul class="ncp-picker-list">' + rows + more + '</ul>';
}

// Pure: success/error banner for a placement attempt.
function renderPlaceResult(placeResult) {
  const ok = placeResult.ok !== false;
  return '<div class="ncp-picker-place ' + (ok ? 'ncp-picker-place-ok' : 'ncp-picker-place-error') + '">' +
    escapeHtml(placeResult.message || (ok ? 'Placed.' : 'Placement failed.')) +
  '</div>';
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
    .ncp-download {
      margin-bottom: 18px;
      padding: 14px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-surface);
    }
    .ncp-download-title {
      margin: 0 0 4px;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .ncp-download-note {
      margin: 0 0 10px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .ncp-download-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 14px;
      border-radius: 7px;
      background: var(--accent-blue);
      color: var(--bg-tertiary, #11111b);
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      transition: filter 120ms ease;
    }
    .ncp-download-btn:hover { filter: brightness(1.08); }
    .ncp-download-sub {
      margin: 8px 0 0;
      font-size: 11px;
      color: var(--text-muted);
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
    /* Approval dialog styles */
    .ncp-approval-section {
      margin-top: 20px;
      border: 1px solid rgba(249, 226, 175, 0.3);
      border-radius: 8px;
      background: rgba(249, 226, 175, 0.05);
      padding: 14px;
    }
    .ncp-approval-heading {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent-yellow, #f9e2af);
    }
    .ncp-approval-item {
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-surface);
      padding: 12px;
      margin-bottom: 10px;
    }
    .ncp-approval-item:last-child { margin-bottom: 0; }
    .ncp-approval-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .ncp-approval-icon { font-size: 16px; }
    .ncp-approval-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .ncp-approval-desc {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
      line-height: 1.4;
    }
    .ncp-approval-detail {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 3px;
    }
    .ncp-approval-detail code {
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
      color: var(--accent-green, #a6e3a1);
    }
    .ncp-approval-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .ncp-approve-btn, .ncp-reject-btn {
      flex: 1;
      min-height: 32px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 120ms ease;
    }
    .ncp-approve-btn {
      background: var(--accent-green, #a6e3a1);
      color: #1e1e2e;
    }
    .ncp-approve-btn:hover { opacity: 0.85; }
    .ncp-reject-btn {
      background: var(--accent-red, #f38ba8);
      color: white;
    }
    .ncp-reject-btn:hover { opacity: 0.85; }
    /* M4-T5 selection / placement picker */
    .ncp-picker-section {
      margin-top: 20px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-surface);
      padding: 14px;
    }
    .ncp-picker-heading {
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .ncp-picker-hint, .ncp-picker-msg {
      margin: 0 0 12px;
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .ncp-picker-summary {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .ncp-picker-summary strong { color: var(--text-primary); }
    .ncp-picker-list {
      list-style: none;
      margin: 0 0 10px;
      padding: 0;
      max-height: 180px;
      overflow-y: auto;
    }
    .ncp-picker-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border: 1px solid var(--border-color);
      border-radius: 5px;
      margin-bottom: 5px;
      font-size: 12px;
    }
    .ncp-picker-item-name {
      color: var(--text-primary);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ncp-picker-item-cat {
      color: var(--text-muted);
      font-size: 11px;
      flex: none;
    }
    .ncp-picker-more {
      font-size: 11px;
      color: var(--text-muted);
      padding: 4px 8px;
    }
    .ncp-picker-actions {
      display: flex;
      gap: 8px;
    }
    .ncp-picker-btn {
      flex: 1;
      min-height: 36px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 120ms ease;
    }
    .ncp-picker-btn:hover:not([disabled]) { transform: translateY(-1px); }
    .ncp-picker-btn[disabled] { opacity: 0.6; cursor: default; }
    .ncp-picker-btn-primary {
      background: var(--accent-blue);
      color: white;
      border-color: var(--accent-blue);
    }
    .ncp-picker-error {
      border: 1px solid rgba(243, 139, 168, 0.45);
      background: rgba(243, 139, 168, 0.05);
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .ncp-picker-error strong { color: var(--accent-red); display: block; }
    .ncp-picker-error pre {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 8px 0 0;
      font: 11px/1.4 "JetBrains Mono", monospace;
      color: var(--text-muted);
    }
    .ncp-picker-place {
      border-radius: 6px;
      padding: 9px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .ncp-picker-place-ok {
      border: 1px solid rgba(166, 227, 161, 0.45);
      background: rgba(166, 227, 161, 0.08);
      color: var(--accent-green, #a6e3a1);
    }
    .ncp-picker-place-error {
      border: 1px solid rgba(243, 139, 168, 0.45);
      background: rgba(243, 139, 168, 0.05);
      color: var(--accent-red, #f38ba8);
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
  var amp = '&' + 'amp;';
  var lt = '&' + 'lt;';
  var gt = '&' + 'gt;';
  var quot = '&' + 'quot;';
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot);
}

export default installNovaConnectPanel;

export function showWriteApprovalDialog() {
  const app = getRuntimeGlobal().app;
  if (app && app.novaConnectPanelOpen === false) {
    app.toggleNovaConnectPanel();
  }
}
