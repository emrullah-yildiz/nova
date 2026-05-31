import { NODE_TYPE_MAP } from '../core/nodes.js';
import { getRuntimeConfig } from '../config/runtime-config.js';
import { buildInviteStatus } from './invite-status.js';

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

// ============================================
// NODEFLOW AI — Save / Load System
// Serializes graph to JSON, saves to localStorage + file download
// Restores nodes, wires, positions, control values, dynamic ports
// ============================================

export function installSaveLoad(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__saveLoadInstalled) return true;
  targetApp.__saveLoadInstalled = true;
  const app = targetApp;

  const STORAGE_PREFIX = 'nodeflow_project_';
  const RECENT_KEY = 'nodeflow_recent_projects';
  const AUTOSAVE_KEY = 'nodeflow_autosave';
  const escapeHtml = value => app.escapeHtml
    ? app.escapeHtml(value)
    : String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const escapeJsString = value => String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\x3c');
  const isCloudEnabled = () => !!getRuntimeConfig().cloudProjectsEnabled;

  const shareRoleSelect = l => {
    const role = l && l.role === 'Viewer' ? 'Viewer' : 'Editor';
    const disabled = app._roleUpdating && app._roleUpdating[l.id] ? ' disabled' : '';
    return '<span class="share-select share-role-select"><select aria-label="Access level" onchange="app._updateShareLinkRole(\'' + escapeJsString(l.id) + '\', this.value)"' + disabled + '>' +
      '<option value="Editor"' + (role === 'Editor' ? ' selected' : '') + '>Can edit</option>' +
      '<option value="Viewer"' + (role === 'Viewer' ? ' selected' : '') + '>Can view</option>' +
      '</select></span>';
  };

  // Shared revoke-button renderer used by BOTH the invited-people list
  // (_renderInvitedRows) and the anon-link list (_renderAnonLinks) so the
  // two-step inline confirm behaves identically. When this link is the one being
  // confirmed (app._revokeConfirmId === l.id) it shows a green confirm + a cancel
  // button; otherwise it shows the trash button, which only ASKS (no network).
  const revokeControls = l =>
    (app._revokeConfirmId === l.id)
      ? '<button class="share-icon-btn confirm" title="Confirm remove" aria-label="Confirm remove" onclick="app._confirmRevokeShareLink(\'' + escapeJsString(l.id) + '\')">✓</button>' +
        '<button class="share-icon-btn" title="Cancel" aria-label="Cancel" onclick="app._cancelRevokeShareLink()">✕</button>'
      : '<button class="share-icon-btn danger" title="Remove" aria-label="Remove" onclick="app._askRevokeShareLink(\'' + escapeJsString(l.id) + '\')">🗑</button>';

  // ══════════════════════════════════════
  // SERIALIZE — graph → JSON
  // ══════════════════════════════════════
  app.serializeGraph = function() {
    return {
      version: 2,
      timestamp: Date.now(),
      name: app._projectName || 'Untitled',
      zoom: app.zoom, panX: app.panX, panY: app.panY,
      nextNodeId: app.nextNodeId,
      nodes: app.nodes.map(nd => ({
        id: nd.id, type: nd.type,
        x: nd.x, y: nd.y, zIndex: nd.zIndex,
        controlValues: { ...nd.controlValues },
        dataPanelOpen: nd.dataPanelOpen || false,
        _preview3d: nd._preview3d !== undefined ? nd._preview3d : true,
        _dynInputs: nd._dynInputs || null,
        _dynOutputs: nd._dynOutputs || null,
        _pyResults: null // don't save runtime results
      })),
      wires: app.wires.map(w => ({ ...w }))
    };
  };

  // ══════════════════════════════════════
  // DESERIALIZE — JSON → graph
  // ══════════════════════════════════════
  app.deserializeGraph = function(data) {
    if (!data || !data.nodes) return false;

    // Clear canvas
    app.nodes.forEach(nd => {
      const el = document.getElementById(nd.id);
      if (el) el.remove();
    });
    app.nodes = [];
    app.wires = [];
    app.selectedNodes = [];
    app._hasRun = false;
    app._isRunningGraph = false;
    app._lastRunVersion = 0;
    app._cloudProjectId = '';
    app.nodeZCounter = 10;
    const canvas = document.getElementById('node-canvas');
    if (canvas) canvas.innerHTML = '';
    const svg = document.getElementById('wire-svg');
    if (svg) svg.innerHTML = '';

    // Restore state
    app._projectName = data.name || 'Untitled';
    app.zoom = data.zoom || 1;
    app.panX = data.panX || 0;
    app.panY = data.panY || 0;
    app.nextNodeId = data.nextNodeId || 1;

    // Rebuild nodes
    data.nodes.forEach(saved => {
      const def = NODE_TYPE_MAP[saved.type];
      if (!def) return;

      app.nodeZCounter++;
      const nd = {
        id: saved.id,
        type: saved.type,
        x: saved.x, y: saved.y,
        def: { ...def },
        controlValues: {},
        dataPanelOpen: saved.dataPanelOpen || false,
        zIndex: saved.zIndex || app.nodeZCounter,
        _preview3d: saved._preview3d !== undefined ? saved._preview3d : true
      };

      // Restore controls
      def.controls.forEach(c => { nd.controlValues[c.id] = c.default; });
      if (saved.controlValues) {
        Object.keys(saved.controlValues).forEach(k => {
          nd.controlValues[k] = saved.controlValues[k];
        });
      }

      // Restore dynamic ports for Python nodes
      if (saved._dynInputs) nd._dynInputs = saved._dynInputs;
      if (saved._dynOutputs) nd._dynOutputs = saved._dynOutputs;

      app.nodes.push(nd);
      app.renderNode(nd);
    });

    // Rebuild wires
    data.wires.forEach(w => { app.wires.push({ ...w }); });

    // Apply transform
    if (app.applyTransform) app.applyTransform();
    if (app.updatePortDots) app.updatePortDots();
    if (app.renderWires) setTimeout(() => app.renderWires(), 50);
    if (app.updateMenuState) app.updateMenuState();

    // Update zoom indicator
    const zi = document.getElementById('zoom-indicator');
    if (zi) zi.textContent = Math.round(app.zoom * 100) + '%';

    return true;
  };

  // ══════════════════════════════════════
  // SAVE TO FILE (download .nodeflow JSON)
  // ══════════════════════════════════════
  app.saveToFile = function() {
    const data = app.serializeGraph();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (data.name || 'project') + '.nodeflow';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    app.addAIMessage('workspace', '💾 Project saved as **' + a.download + '**');
  };

  // ══════════════════════════════════════
  app.getNovaCloudClient = function() {
    if (app._novaCloudClient) return app._novaCloudClient;
    const factory = typeof window !== 'undefined' && window.NodeFlow && window.NodeFlow.createNovaCloudClient
      ? window.NodeFlow.createNovaCloudClient
      : null;
    // Cookie mode: authenticate as the signed-in user via the session cookie
    // (same identity as the rest of the app), not a separate dev-login token.
    app._novaCloudClient = factory ? factory({ useCookie: true }) : null;
    return app._novaCloudClient;
  };

  app.isSignedIn = function() { return !!app.currentUser; };

  app.loginNovaCloudDemo = async function(email = 'owner@demo.nova') {
    const client = app.getNovaCloudClient();
    if (!client) throw new Error('Nova Cloud client is not available.');
    const session = await client.devLogin({ email, organizationSlug: 'demo' });
    app._novaCloudUser = session.user;
    return session;
  };

  app.ensureNovaCloudSession = async function() {
    const client = app.getNovaCloudClient();
    if (!client) throw new Error('Nova Cloud client is not available.');
    // Account-backed: require a real signed-in session (cookie). No dev-login.
    if (!app.currentUser) {
      const err = new Error('Sign in to save projects to your account.');
      err.code = 'NOT_SIGNED_IN';
      throw err;
    }
    return client;
  };

  app.saveToCloud = async function(name = app._projectName || 'Untitled') {
    const client = await app.ensureNovaCloudSession();
    const graph = app.serializeGraph();
    let project;
    if (app._cloudProjectId) {
      project = await client.saveProjectGraph(app._cloudProjectId, { graph, message: 'Saved from Nova web' });
    } else {
      project = await client.createProject({ name, graph });
      app._cloudProjectId = project.id;
    }
    app._projectName = project.name || name;
    app._lastCloudSaveSerialized = JSON.stringify(graph);
    app.addAIMessage('workspace', 'Saved **' + app._projectName + '** to your account.');
    return project;
  };

  app.openCloudProject = async function(projectId) {
    const client = await app.ensureNovaCloudSession();
    const project = await client.getProject(projectId);
    const versions = project.versions || [];
    const version = versions.find(item => item.id === project.currentVersionId) || versions[versions.length - 1];
    if (!version || !version.graph) throw new Error('Cloud project has no graph version.');
    if (app.currentPage !== 'workspace') app.newProject();
    app.deserializeGraph(version.graph);
    app._cloudProjectId = project.id;
    app._projectName = project.name;
    app._lastCloudSaveSerialized = JSON.stringify(app.serializeGraph());
    app.addAIMessage('workspace', 'Opened **' + project.name + '** from your account.');
    _saveToRecent(project.name, project.id);
    return project;
  };

  app.saveCloudFromDialog = async function(name) {
    try {
      if (!isCloudEnabled()) throw new Error('Cloud projects are disabled in runtime config.');
      const project = await app.saveToCloud(name || app._projectName || 'Untitled');
      app._saveCloudProjectId(project.id);
      return project;
    } catch (e) {
      if (e && e.code === 'NOT_SIGNED_IN') {
        app.addAIMessage('workspace', 'Sign in to save this project to your account.');
        if (app.signIn) app.signIn();
      } else {
        app.addAIMessage('workspace', 'Cloud save failed: ' + e.message);
      }
      throw e;
    }
  };

  app._saveCloudProjectId = function(projectId) {
    app._cloudProjectId = projectId || app._cloudProjectId;
    try {
      if (app._cloudProjectId) localStorage.setItem('nova_last_cloud_project_id', app._cloudProjectId);
    } catch (e) { /* ignore */ }
  };

  app.showCloudOpenDialog = async function() {
    const existing = document.getElementById('cloud-open-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cloud-open-dialog-overlay';
    overlay.className = 'project-save-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = '<div style="width:520px;max-height:70vh;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;animation:slideUp 0.2s ease">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid var(--border-color)">' +
        '<h3 style="font-size:16px;font-weight:700;color:var(--text-bright)">Open Cloud Project</h3>' +
        '<button onclick="document.getElementById(\'cloud-open-dialog-overlay\').remove()" style="width:28px;height:28px;border-radius:6px;background:transparent;color:var(--text-muted);border:none;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">x</button>' +
      '</div>' +
      '<div id="cloud-project-list" style="flex:1;overflow-y:auto;padding:16px 24px;color:var(--text-muted);font-size:13px">Loading cloud projects...</div>' +
      '<div style="display:flex;gap:8px;padding:16px 24px;border-top:1px solid var(--border-color);justify-content:flex-end">' +
        '<button onclick="document.getElementById(\'cloud-open-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;background:var(--bg-surface);color:var(--text-secondary);border:none;border-radius:var(--radius-sm);cursor:pointer">Cancel</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    const list = document.getElementById('cloud-project-list');
    try {
      if (!isCloudEnabled()) throw new Error('Cloud projects are disabled in runtime config.');
      const client = await app.ensureNovaCloudSession();
      const result = await client.listProjects({ limit: 50 });
      const projects = result.projects || result.items || [];
      if (!projects.length) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No cloud projects yet.</div>';
        return;
      }
      list.innerHTML = projects.map(project => {
        const updated = project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'Unknown';
        return '<div class="open-project-item" onclick="app.openCloudProject(\'' + escapeJsString(project.id) + '\').then(function(p){app._saveCloudProjectId(p.id);document.getElementById(\'cloud-open-dialog-overlay\').remove();}).catch(function(e){app.addAIMessage(\'workspace\', \'Cloud open failed: \' + e.message);})" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--radius-sm);cursor:pointer;border:1px solid var(--border-color);margin-bottom:6px;transition:all 0.15s"' +
          ' onmouseenter="this.style.background=\'var(--bg-surface-hover)\';this.style.borderColor=\'var(--accent-blue)\'"' +
          ' onmouseleave="this.style.background=\'\';this.style.borderColor=\'var(--border-color)\'">' +
            '<div style="font-size:20px">☁</div>' +
            '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">' + escapeHtml(project.name || 'Untitled') + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted)">' + escapeHtml(updated) + '</div></div>' +
          '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px;line-height:1.5">Could not load cloud projects.<br><br>' + escapeHtml(e.message) + '<br><br>Start the Nova API on <code>http://127.0.0.1:8787</code> with persistent storage enabled.</div>';
    }
  };

  // OPEN FROM FILE (.nodeflow JSON)
  // ══════════════════════════════════════
  app.openFromFile = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.nodeflow,.json';
    input.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (app.currentPage !== 'workspace') app.newProject();
          if (app.deserializeGraph(data)) {
            var projName = data.name || file.name.replace('.nodeflow', '').replace('.json', '');
            app._projectName = projName;
            app.addAIMessage('workspace', '📂 Opened **' + projName + '** — ' + data.nodes.length + ' nodes, ' + data.wires.length + ' wires.');
            // Also save to localStorage so Recent Projects can reopen it
            try {
              localStorage.setItem(STORAGE_PREFIX + projName, JSON.stringify(data));
            } catch (e) { /* storage full — ignore */ }
            _saveToRecent(projName);
          } else {
            app.addAIMessage('workspace', '❌ Failed to load project file.');
          }
        } catch (err) {
          app.addAIMessage('workspace', '❌ Invalid file: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // ══════════════════════════════════════
  // SAVE TO LOCALSTORAGE
  // ══════════════════════════════════════
  app.saveToLocal = function(name) {
    name = name || app._projectName || 'Untitled';
    app._projectName = name;
    const data = app.serializeGraph();
    data.name = name;
    try {
      localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(data));
      _saveToRecent(name);
      app.addAIMessage('workspace', '💾 Saved **' + name + '** to browser storage.');
      // Refresh landing page recent list in case user goes back
      if (app.renderRecentProjects) app.renderRecentProjects();
    } catch (e) {
      app.addAIMessage('workspace', '❌ Save failed: ' + e.message);
    }
  };

  // ══════════════════════════════════════
  // OPEN FROM LOCALSTORAGE
  // ══════════════════════════════════════
  app.openFromLocal = function(name) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + name);
      if (!raw) {
        // Project not in localStorage — switch to workspace and show error with option to open file
        if (app.currentPage !== 'workspace') app.newProject();
        app.addAIMessage('workspace', '⚠️ Project **' + name + '** not found in browser storage.\n\nIt may have been saved as a file. Use **File → Open** or drag the .nodeflow file into the browser.');
        return;
      }
      const data = JSON.parse(raw);
      if (app.currentPage !== 'workspace') app.newProject();
      if (app.deserializeGraph(data)) {
        app._projectName = name;
        app.addAIMessage('workspace', '📂 Opened **' + name + '** — ' + data.nodes.length + ' nodes.');
        _saveToRecent(name);
      }
    } catch (e) {
      app.addAIMessage('workspace', '❌ Load failed: ' + e.message);
    }
  };

  // ══════════════════════════════════════
  // AUTOSAVE (every 30 seconds when in workspace)
  // ══════════════════════════════════════
  setInterval(() => {
    if (app.currentPage === 'workspace' && app.nodes.length > 0) {
      try {
        const data = app.serializeGraph();
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      } catch (e) { /* silent */ }
      // Cloud autosave: only for a signed-in user with an existing cloud
      // project, and only when the graph actually changed since the last cloud
      // save (avoids creating a redundant version every 30s).
      if (app.currentUser && app._cloudProjectId && isCloudEnabled()) {
        try {
          const serialized = JSON.stringify(app.serializeGraph());
          if (serialized !== app._lastCloudSaveSerialized) {
            app._lastCloudSaveSerialized = serialized;
            const client = app.getNovaCloudClient();
            if (client) {
              client.saveProjectGraph(app._cloudProjectId, { graph: app.serializeGraph(), message: 'Autosave' })
                .catch(() => { app._lastCloudSaveSerialized = null; }); // retry next tick on failure
            }
          }
        } catch (e) { /* silent */ }
      }
    }
  }, 30000);

  // Restore autosave on init if available
  app._checkAutosave = function() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.nodes || data.nodes.length === 0) return false;
      return data;
    } catch (e) { return false; }
  };

  // ══════════════════════════════════════
  // SAVE DIALOG (name prompt)
  // ══════════════════════════════════════
  app.showSaveDialog = function() {
    const existing = document.getElementById('save-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'save-dialog-overlay';
    overlay.className = 'project-save-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = '<div style="width:400px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.5);padding:24px;animation:slideUp 0.2s ease">' +
      '<h3 style="font-size:16px;font-weight:700;color:var(--text-bright);margin-bottom:16px">💾 Save Project</h3>' +
      '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">Project Name</label>' +
      '<input id="save-name-input" type="text" value="' + escapeHtml(app._projectName || 'Untitled') + '" style="width:100%;padding:10px 14px;font-size:14px;background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);outline:none;margin-bottom:16px" />' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button onclick="app.saveToLocal(document.getElementById(\'save-name-input\').value);document.getElementById(\'save-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;font-weight:600;background:var(--accent-blue);color:var(--bg-tertiary);border:none;border-radius:var(--radius-sm);cursor:pointer">Save to Browser</button>' +
        '<button onclick="app.saveCloudFromDialog(document.getElementById(\'save-name-input\').value).then(function(){document.getElementById(\'save-dialog-overlay\').remove();}).catch(function(){})" style="padding:8px 16px;font-size:13px;font-weight:600;background:var(--accent-purple);color:var(--bg-tertiary);border:none;border-radius:var(--radius-sm);cursor:pointer">Save to Cloud</button>' +
        '<button onclick="app._projectName=document.getElementById(\'save-name-input\').value;app.saveToFile();document.getElementById(\'save-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;background:var(--bg-surface);color:var(--text-secondary);border:none;border-radius:var(--radius-sm);cursor:pointer">Download File</button>' +
        '<button onclick="document.getElementById(\'save-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;background:var(--bg-surface);color:var(--text-muted);border:none;border-radius:var(--radius-sm);cursor:pointer">Cancel</button>' +
      '</div></div>';

    overlay.innerHTML = '<div class="project-save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-dialog-title">' +
      '<div class="project-save-header">' +
        '<div class="project-save-mark">S</div>' +
        '<div><h3 id="save-dialog-title">Save project</h3><p>Choose where this graph should live.</p></div>' +
        '<button class="project-save-close" onclick="document.getElementById(\'save-dialog-overlay\').remove()" aria-label="Close">x</button>' +
      '</div>' +
      '<label class="project-save-label" for="save-name-input">Project name</label>' +
      '<input id="save-name-input" class="project-save-input" type="text" value="' + escapeHtml(app._projectName || 'Untitled') + '" />' +
      '<div class="project-save-actions">' +
        '<button class="project-save-action" data-save-target="cloud" onclick="this.disabled=true;this.textContent=\'Saving...\';app.saveCloudFromDialog(document.getElementById(\'save-name-input\').value).then(function(){document.getElementById(\'save-dialog-overlay\').remove();}).catch(function(){var b=document.querySelector(\'[data-save-target=cloud]\');if(b){b.disabled=false;b.innerHTML=\'<span>Cloud</span><strong>Save to cloud</strong>\';}})"><span>Cloud</span><strong>Save to cloud</strong></button>' +
        '<button class="project-save-action" onclick="app.saveToLocal(document.getElementById(\'save-name-input\').value);document.getElementById(\'save-dialog-overlay\').remove()"><span>Browser</span><strong>Save locally</strong></button>' +
        '<button class="project-save-action" onclick="app._projectName=document.getElementById(\'save-name-input\').value;app.saveToFile();document.getElementById(\'save-dialog-overlay\').remove()"><span>File</span><strong>Download copy</strong></button>' +
      '</div>' +
      '<div class="project-save-footer">' +
        '<span>Cloud saves can be opened from File -> Open from Cloud.</span>' +
        '<button onclick="document.getElementById(\'save-dialog-overlay\').remove()">Cancel</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    setTimeout(() => {
      const inp = document.getElementById('save-name-input');
      if (inp) { inp.focus(); inp.select(); }
    }, 50);
  };

  // ══════════════════════════════════════
  // OPEN DIALOG (list saved projects)
  // ══════════════════════════════════════
  app.showOpenDialog = function() {
    const existing = document.getElementById('open-dialog-overlay');
    if (existing) existing.remove();

    // Get saved projects from localStorage
    const projects = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          projects.push({
            name: key.substring(STORAGE_PREFIX.length),
            nodes: data.nodes ? data.nodes.length : 0,
            wires: data.wires ? data.wires.length : 0,
            date: data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'
          });
        } catch (e) { /* skip corrupt */ }
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'open-dialog-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    let projectListHTML = '';
    if (projects.length === 0) {
      projectListHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No saved projects yet.<br>Use Save to store projects in your browser.</div>';
    } else {
      projectListHTML = projects.map(p =>
        '<div class="open-project-item" onclick="app.openFromLocal(\'' + escapeJsString(p.name) + '\');document.getElementById(\'open-dialog-overlay\').remove()" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--radius-sm);cursor:pointer;border:1px solid var(--border-color);margin-bottom:6px;transition:all 0.15s"' +
        ' onmouseenter="this.style.background=\'var(--bg-surface-hover)\';this.style.borderColor=\'var(--accent-blue)\'"' +
        ' onmouseleave="this.style.background=\'\';this.style.borderColor=\'var(--border-color)\'">' +
          '<div style="font-size:20px">📄</div>' +
          '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">' + escapeHtml(p.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted)">' + p.nodes + ' nodes, ' + p.wires + ' wires — ' + escapeHtml(p.date) + '</div></div>' +
          '<button onclick="event.stopPropagation();if(confirm(\'Delete ' + escapeJsString(p.name) + '?\')){localStorage.removeItem(\'' + escapeJsString(STORAGE_PREFIX + p.name) + '\');document.getElementById(\'open-dialog-overlay\').remove();app.showOpenDialog()}" style="width:24px;height:24px;border-radius:4px;background:transparent;color:var(--text-muted);border:none;font-size:12px;cursor:pointer" title="Delete">🗑</button>' +
        '</div>'
      ).join('');
    }

    overlay.innerHTML = '<div style="width:480px;max-height:70vh;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;animation:slideUp 0.2s ease">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid var(--border-color)">' +
        '<h3 style="font-size:16px;font-weight:700;color:var(--text-bright)">📂 Open Project</h3>' +
        '<button onclick="document.getElementById(\'open-dialog-overlay\').remove()" style="width:28px;height:28px;border-radius:6px;background:transparent;color:var(--text-muted);border:none;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:16px 24px">' + projectListHTML + '</div>' +
      '<div style="display:flex;gap:8px;padding:16px 24px;border-top:1px solid var(--border-color)">' +
        '<button onclick="app.openFromFile();document.getElementById(\'open-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;font-weight:600;background:var(--accent-blue);color:var(--bg-tertiary);border:none;border-radius:var(--radius-sm);cursor:pointer">Open from File…</button>' +
        '<div style="flex:1"></div>' +
        '<button onclick="document.getElementById(\'open-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;background:var(--bg-surface);color:var(--text-secondary);border:none;border-radius:var(--radius-sm);cursor:pointer">Cancel</button>' +
      '</div></div>';

    document.body.appendChild(overlay);
  };

  // ══════════════════════════════════════
  // RECENT PROJECTS (for landing page)
  // ══════════════════════════════════════
  function _saveToRecent(name, cloudId) {
    try {
      let recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      recent = recent.filter(r => r.name !== name);
      const entry = { name: name, date: Date.now() };
      if (cloudId) entry.cloudId = cloudId;
      recent.unshift(entry);
      if (recent.length > 10) recent = recent.slice(0, 10);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (e) { /* ignore */ }
  }

  // Patch landing page recent projects to show real data. Signed in → the
  // account's cloud projects ("My Projects"); anonymous → local browser recents.
  function _readBrowserRecents() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch (e) { return []; }
  }

  // Single dispatcher so onclick attributes stay short and HTML-safe.
  app._openRecentItem = function(name, cloudId) {
    if (cloudId) {
      app.openCloudProject(cloudId)
        .then(function(pr) { app._saveCloudProjectId(pr.id); })
        .catch(function(e) { if (app.addAIMessage) app.addAIMessage('workspace', 'Open failed: ' + e.message); });
    } else {
      app.openFromLocal(name);
    }
  };

  function _recentItemHtml(name, ago, cloudId) {
    const icon = cloudId ? '☁' : '📄';
    const badge = cloudId
      ? '<span class=”ri-type ri-type-cloud”>cloud</span>'
      : '<span class=”ri-type ri-type-local”>local</span>';
    const onclick = cloudId
      ? 'app._openRecentItem(\'\',\'' + escapeJsString(cloudId) + '\')'
      : 'app._openRecentItem(\'' + escapeJsString(name) + '\',\'\')';
    return '<button class=”recent-item” onclick=”' + onclick + '”>' +
      '<span class=”ri-icon”>' + icon + '</span>' +
      '<span class=”ri-name”>' + escapeHtml(name) + '</span>' +
      badge +
      '<span class=”ri-date”>' + escapeHtml(ago) + '</span></button>';
  }

  function _browserRecentMarkup(recent) {
    if (!recent.length) return '';
    return recent.map(r => _recentItemHtml(r.name, _timeAgo(r.date), r.cloudId || '')).join('');
  }

  const origRenderRecent = app.renderRecentProjects.bind(app);
  app.renderRecentProjects = function() {
    const listEl = document.getElementById('recent-list');
    if (!listEl) return;
    const browserRecent = _readBrowserRecents();
    if (browserRecent.length) {
      listEl.innerHTML = _browserRecentMarkup(browserRecent);
    } else if (app.currentUser && isCloudEnabled()) {
      listEl.innerHTML = '<div class="recent-empty" style="padding:4px 0 0;color:var(--text-muted);font-size:12px">Open a project to see it here.</div>';
    } else {
      origRenderRecent();
    }

    const mySection = document.getElementById('my-projects-section');
    if (!mySection) return;
    if (app.currentUser && isCloudEnabled()) {
      mySection.style.display = '';
      const myList = document.getElementById('my-projects-list');
      if (myList) {
        const requestId = String(Date.now()) + Math.random();
        myList.dataset.cloudRequestId = requestId;
        delete myList.dataset.cloudLoaded;
        myList.innerHTML = '<div class="recent-empty" style="padding:12px;color:var(--text-muted);font-size:12px">Loading your projects...</div>';
        app._renderCloudProjects({ requestId });
      }
    } else {
      mySection.style.display = 'none';
    }
  };

  // Async: fetch and render the signed-in user's account projects into the
  // dedicated "My Projects" section. Falls back to a friendly empty/error state.
  app._renderCloudProjects = async function(options = {}) {
    const el = document.getElementById('my-projects-list');
    if (!el) return;
    const requestId = options.requestId || '';
    try {
      const client = app.getNovaCloudClient();
      const [ownedPage, sharedPage] = await Promise.all([
        client.listProjects({ limit: 24 }).catch(() => ({ projects: [] })),
        client.listSharedProjects({ limit: 24 }).catch(() => ({ projects: [] }))
      ]);
      if (requestId && el.dataset.cloudRequestId !== requestId) return;
      const owned = (ownedPage && ownedPage.projects) || [];
      const shared = (sharedPage && sharedPage.projects) || [];
      el.dataset.cloudLoaded = '1';
      if (!owned.length && !shared.length) {
        el.innerHTML = '<div class="recent-empty" style="padding:12px;color:var(--text-muted);font-size:12px">No projects yet — save one to your account and it shows up here.</div>';
        return;
      }
      const cloudItem = (p) => _recentItemHtml(p.name || 'Untitled', _timeAgo(p.updatedAt || p.createdAt || Date.now()), p.id);
      let html = owned.map(cloudItem).join('');
      if (shared.length) {
        html += '<div class="recent-group" style="font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--text-muted);padding:10px 4px 4px">Shared with you</div>' +
          shared.map(cloudItem).join('');
      }
      el.innerHTML = html;
    } catch (e) {
      if (requestId && el.dataset.cloudRequestId !== requestId) return;
      el.innerHTML = '<div class="recent-empty" style="padding:12px;color:var(--text-muted);font-size:12px">Could not load your projects.</div>';
    }
  };

  // A page-independent status overlay for the invite/redeem flow. The workspace
  // chat isn't visible on the landing page, so redeem progress and errors are
  // surfaced here instead — otherwise failures (403 unverified, 410 revoked,
  // 404 invalid) vanish and the invitee just sits on the landing page.
  app._showJoinStatus = function(opts) {
    const o = opts || {};
    let overlay = document.getElementById('join-status-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'join-status-overlay';
      overlay.className = 'project-save-overlay';
      document.body.appendChild(overlay);
    }
    // Dismissable only when it's showing an error (not while loading).
    overlay.onclick = o.loading ? null : (e) => { if (e.target === overlay) overlay.remove(); };
    const title = o.loading ? 'Opening shared project…' : 'Couldn’t open the shared project';
    const mark = o.loading ? '<span class="join-spinner" aria-hidden="true"></span>' : '↗';
    const body = '<p class="join-status-msg">' + escapeHtml(o.message || '') + '</p>';
    const footer = o.loading ? '' :
      '<div class="project-save-footer" style="gap:8px;justify-content:flex-end">' +
        '<button class="share-create-btn" onclick="(document.getElementById(\'join-status-overlay\')||{}).remove&&document.getElementById(\'join-status-overlay\').remove()">OK</button>' +
      '</div>';
    overlay.innerHTML = '<div class="project-save-dialog" role="dialog" aria-modal="true" aria-live="polite" style="width:min(420px,100%)">' +
      '<div class="project-save-header"><div class="project-save-mark">' + mark + '</div>' +
      '<div><h3>' + escapeHtml(title) + '</h3>' + body + '</div></div>' +
      footer + '</div>';
    return overlay;
  };

  app._clearJoinStatus = function() {
    const o = document.getElementById('join-status-overlay');
    if (o) o.remove();
  };

  // Turn a redeem/open error into a clear, actionable, page-independent message.
  // The cloud client throws Error with .status (403/404/410) and sometimes .code.
  app._joinErrorMessage = function(e) {
    const status = e && e.status;
    if (status === 403) {
      if (e && e.code === 'INVITE_EMAIL_MISMATCH') return e.message;
      return 'Please verify your email first, then open the invite link again.';
    }
    if (status === 404) {
      return 'This invite link is invalid.';
    }
    if (status === 410) {
      return 'This invite link has expired or was revoked. Ask the project owner for a new one.';
    }
    return 'Couldn’t open the shared project: ' + ((e && e.message) || 'unknown error') + '.';
  };

  // Join a shared project by redeeming a share token, then open it. Shows a
  // visible loading state while awaiting and a visible, actionable error on
  // failure — regardless of which page the invitee is currently on.
  app.redeemShareToken = async function(token) {
    if (!token) return;
    app._showJoinStatus({ loading: true });
    try {
      const client = app.getNovaCloudClient();
      const res = await client.redeemShareLink(token);
      const project = res && res.project;
      if (project && project.id) {
        // The redeem response now includes the full project with versions, so we
        // can open it directly without a second round-trip to getProject.
        const versions = project.versions || [];
        const version = versions.find(v => v.id === project.currentVersionId) || versions[versions.length - 1];
        if (!version || !version.graph) throw new Error('Cloud project has no graph version.');
        if (app.currentPage !== 'workspace') app.newProject();
        app.deserializeGraph(version.graph);
        app._cloudProjectId = project.id;
        app._projectName = project.name;
        app._lastCloudSaveSerialized = JSON.stringify(app.serializeGraph());
        app.addAIMessage('workspace', 'Opened **' + project.name + '** from your account.');
        _saveToRecent(project.name, project.id);
        app._saveCloudProjectId(project.id);
      }
      app._clearJoinStatus();
    } catch (e) {
      const msg = app._joinErrorMessage(e);
      app._showJoinStatus({ loading: false, message: msg });
      // Also mirror to the workspace chat (harmless, visible later if they're
      // already in a project) without relying on it for the user-facing report.
      app.addAIMessage && app.addAIMessage('workspace', msg);
    }
  };

  // Share dialog: generate a viewer/editor link for the current cloud project
  // and manage existing links. Requires sign-in + a saved cloud project.
  app.showShareDialog = function() {
    if (!app.currentUser) { app.addAIMessage && app.addAIMessage('workspace', 'Sign in to share this project.'); app._signInReason = 'share'; if (app.signIn) app.signIn(); return; }
    if (!app._cloudProjectId) { app.addAIMessage && app.addAIMessage('workspace', 'Save this project to your account first (File → Save → Save to cloud), then share it.'); return; }
    const existing = document.getElementById('share-dialog-overlay');
    if (existing) existing.remove();
    app._freshLinkUrls = {}; // raw URLs are only known for links created this session
    app._lastCreatedAnyoneLink = null;
    // Persist the transient per-recipient invite status across close/reopen:
    // initialize once, and NEVER reset it here. An invite that was still being
    // sent when the dialog was closed keeps its pending entry, so reopening can
    // paint its spinner again (see the synchronous _renderInvitedRows below).
    app._invitePending = app._invitePending || {};
    // Optimistically-removed link ids: filtered out of both list renderers so a
    // revoked row never reappears while the server catches up. Persists across
    // close/reopen (do NOT clear on open).
    app._locallyRevoked = app._locallyRevoked || new Set();
    // Reset any stale inline-confirm state so a half-finished "remove?" prompt
    // from a previous open doesn't linger.
    app._revokeConfirmId = null;
    const overlay = document.createElement('div');
    overlay.id = 'share-dialog-overlay';
    overlay.className = 'project-save-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    const ownerName = (app.currentUser && (app.currentUser.displayName || app.currentUser.email)) || 'You';
    overlay.innerHTML = '<div class="project-save-dialog" role="dialog" aria-modal="true" style="width:min(520px,100%)">' +
      '<div class="project-save-header"><div class="project-save-mark">↗</div>' +
      '<div><h3>Invite to project</h3><p>Invite people by email, or share a link. Everyone signs in first.</p></div>' +
      '<button class="project-save-close" onclick="document.getElementById(\'share-dialog-overlay\').remove()" aria-label="Close">x</button></div>' +
      // Email invite row
      '<div class="share-controls">' +
        '<input id="invite-email" class="share-email-input" type="text" placeholder="Enter emails to invite…" onkeydown="if(event.key===\'Enter\')app._sendInvites()" />' +
        '<span class="share-select"><select id="invite-role" aria-label="Invite access"><option value="Editor">Can edit</option><option value="Viewer">Can view</option></select></span>' +
        '<button class="share-create-btn" id="invite-send" onclick="app._sendInvites()">Invite</button>' +
      '</div>' +
      '<div id="invite-status" class="share-status"></div>' +
      // Invited people — listed directly under the email box
      '<div id="invite-list" style="max-height:26vh;overflow-y:auto"></div>' +
      // Anyone-with-the-link row
      '<div class="share-anyone"><span class="share-anyone-label">🔗 Anyone with the link</span>' +
        '<span class="share-select"><select id="anyone-role" aria-label="Link access"><option value="Editor">Can edit</option><option value="Viewer">Can view</option></select></span>' +
        '<button class="share-link-btn" id="anyone-create" onclick="app._createAnyoneLink()">Copy link</button></div>' +
      '<div id="anyone-created-link"></div>' +
      // Anonymous link list
      '<div id="share-link-list" style="max-height:24vh;overflow-y:auto"></div>' +
      '<div class="project-save-footer"><span>' + escapeHtml(ownerName) + ' · owner</span>' +
      '<button onclick="document.getElementById(\'share-dialog-overlay\').remove()">Done</button></div></div>';
    document.body.appendChild(overlay);
    // Paint cached server invites (_lastInvites) + any in-flight/just-resolved
    // pending rows (_invitePending) IMMEDIATELY, with zero blank gap. This is
    // what keeps an invite that's still being sent visible as a spinner when the
    // dialog is reopened — _renderShareLinks below only paints #invite-list after
    // its listShareLinks network round-trip, which would otherwise leave the list
    // blank (and the loading rows "lost") until the request returns.
    app._renderInvitedRows();
    // Then reconcile with server truth; _renderShareLinks re-merges _invitePending
    // onto the refreshed _lastInvites, so spinners persist and keep resolving.
    app._renderShareLinks();
  };

  // Rebuilds ONLY the #invite-list markup, synchronously, by merging the cached
  // server invites (app._lastInvites — active links that have an .email) with the
  // transient app._invitePending map (keyed by lowercased email). A pending entry
  // merges onto the matching server row so an in-flight spinner becomes a status
  // icon in place; pending emails with no server row yet (in-flight, or failures
  // that never produced a link) render as their own rows. The status icon sits
  // just left of the revoke button so it lands on the right of the row.
  app._renderInvitedRows = function() {
    const inviteList = document.getElementById('invite-list');
    if (!inviteList) return;
    const revoked = app._locallyRevoked = app._locallyRevoked || new Set();
    const invites = (Array.isArray(app._lastInvites) ? app._lastInvites : []).filter(l => !revoked.has(l.id));
    const pending = app._invitePending || {};
    const roleLabel = r => (r === 'Viewer' ? 'Can view' : 'Can edit');

    const statIcon = entry => {
      if (!entry) return '';
      const title = escapeHtml(entry.title || '');
      if (entry.state === 'ok') return '<span class="invite-stat ok" title="' + title + '" aria-label="' + title + '">✓</span>';
      if (entry.state === 'warn') return '<span class="invite-stat warn" title="' + title + '" aria-label="' + title + '">✓</span>';
      if (entry.state === 'err') return '<span class="invite-stat err" title="' + title + '" aria-label="' + title + '">✕</span>';
      return '<span class="invite-stat spin" title="' + title + '" aria-label="' + title + '">⟳</span>';
    };

    const seen = new Set();
    const rows = [];

    // Server invite rows, with the pending status icon merged in when present.
    for (const l of invites) {
      const key = String(l.email || '').toLowerCase();
      seen.add(key);
      rows.push('<div class="share-link-row"><span class="ri-icon">✉</span>' +
        '<span class="share-link-meta">' + escapeHtml(l.email) +
        ' <span style="color:var(--text-muted)">· invited</span></span>' +
        shareRoleSelect(l) + statIcon(pending[key]) + revokeControls(l) + '</div>');
    }

    // Pending-only rows: in-flight spinners and failures that never got a link.
    for (const key of Object.keys(pending)) {
      if (seen.has(key)) continue;
      const entry = pending[key];
      if (!entry || entry.state === 'err') continue;
      rows.push('<div class="share-link-row"><span class="ri-icon">✉</span>' +
        '<span class="share-link-meta">' + escapeHtml(entry.email || key) +
        ' <span style="color:var(--text-muted)">· ' + escapeHtml(roleLabel(entry.role)) + ' · invited</span></span>' +
        statIcon(entry) + '</div>');
    }

    inviteList.innerHTML = rows.length
      ? '<div class="share-section-label">Invited</div>' + rows.join('')
      : '';
  };

  // Invite by email — splits the input on commas/whitespace and asks the server
  // to email each a role-scoped join link. Feedback is immediate and per-recipient:
  // a spinner row appears for every email the moment Invite is clicked, then each
  // resolves in place to a green check (emailed), an amber check (created but not
  // emailed — share the link below) or a red cross (couldn't create the invite).
  // The status line stays HONEST: it only says "emailed" when the server confirmed
  // a real provider delivered it.
  app._sendInvites = async function() {
    const inp = document.getElementById('invite-email');
    const status = document.getElementById('invite-status');
    const raw = (inp && inp.value || '').trim();
    if (!raw) {
      if (status) { status.className = 'share-status err'; status.textContent = 'Enter one or more email addresses to invite.'; }
      return;
    }
    const role = (document.getElementById('invite-role') || {}).value || 'Editor';
    const emails = raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (emails.length === 0) {
      if (status) { status.className = 'share-status err'; status.textContent = 'Enter a valid email address.'; }
      return;
    }
    const btn = document.getElementById('invite-send');
    if (status) { status.className = 'share-status'; status.textContent = 'Sending invitation' + (emails.length > 1 ? 's' : '') + '...'; }
    if (btn) { btn.disabled = true; btn.textContent = 'Inviting…'; }

    // Seed pending state so a spinner row shows for every email at once. Keys are
    // lowercased to match the server's email normalization, so each pending entry
    // merges onto the matching server row instead of duplicating it.
    if (!app._invitePending) app._invitePending = {};
    const pending = app._invitePending;
    for (const email of emails) {
      pending[email.toLowerCase()] = { email: email, role: role, state: 'pending', title: 'Sending invitation…' };
    }
    if (inp) inp.value = '';
    app._renderInvitedRows();

    let delivered = 0, created = 0, undelivered = 0, failed = 0;
    const links = []; // { email, joinUrl } for created/undelivered (not-emailed) invites
    const failures = [];

    // Sequential: the server uses an in-memory snapshot store, so parallel writes
    // can clobber each other. After each request resolves, update that row's icon.
    for (const email of emails) {
      const key = email.toLowerCase();
      try {
        const res = await app.getNovaCloudClient().inviteByEmail(app._cloudProjectId, { email: email, role: role });
        if (res && res.ok) {
          const prov = res.delivery && res.delivery.provider;
          const wasDelivered = !!(res.delivery && res.delivery.delivered);
          // 'pending' means email was kicked off fire-and-forget — treat as sent.
          const isPending = prov === 'pending';
          if (wasDelivered || isPending) {
            delivered++;
            pending[key] = { email: email, role: role, state: 'ok', title: 'Invitation sent to ' + email + '.' };
          } else {
            // Classify the non-delivery honestly: a real provider that tried and
            // failed (has an error / provider !== none|console) is "undelivered" —
            // NOT "not configured".
            const err = res.delivery && res.delivery.error;
            const realFailure = prov === 'resend' || (err && prov !== 'none' && prov !== 'console');
            if (realFailure) undelivered++; else created++;
            if (res.joinUrl) links.push({ email: email, joinUrl: res.joinUrl });
            const title = realFailure
              ? "Invite created, but the email couldn't be delivered: " + (err || 'unknown error') + '. Share the link below.'
              : "Invite created, but email delivery isn't configured — share the link below.";
            pending[key] = { email: email, role: role, state: 'warn', title: title, joinUrl: res.joinUrl };
          }
        } else {
          failed++;
          const msg = (res && res.error) ? String(res.error) : 'request failed';
          failures.push({ email, message: msg });
          delete pending[key];
        }
      } catch (e) {
        failed++;
        const msg = (e && e.message) ? e.message : String(e);
        failures.push({ email, message: msg });
        delete pending[key];
      }
      app._renderInvitedRows();
    }

    const result = buildInviteStatus({ delivered, created, undelivered, failed, links });
    const finalStatus = document.getElementById('invite-status') || status;
    if (finalStatus) {
      finalStatus.className = 'share-status ' + (result.state === 'err' ? 'err' : result.state === 'warn' ? 'warn' : 'ok');
      // Render the message plus any copyable join links for invites that were
      // created but not emailed.
      let html = '<span>' + escapeHtml(result.text) + '</span>';
      if (result.links.length) {
        html += '<div class="invite-fallback-links" style="margin-top:8px;display:flex;flex-direction:column;gap:6px">' +
          result.links.map(l =>
            '<div class="share-link-row">' +
              '<input class="share-url-input" readonly value="' + escapeHtml(l.joinUrl) + '" title="Join link for ' + escapeHtml(l.email) + '" onclick="this.select()" />' +
              '<button class="share-icon-btn" title="Copy link" data-url="' + escapeHtml(l.joinUrl) + '" onclick="app._copyShareUrl(this)">📋</button>' +
          '</div>').join('') +
          '</div>';
      }
      if (failures.length) {
        html += '<div class="invite-errors" style="margin-top:8px;display:flex;flex-direction:column;gap:4px">' +
          failures.map(f => '<span>Could not invite ' + escapeHtml(f.email) + ': ' + escapeHtml(f.message) + '</span>').join('') +
          '</div>';
      }
      finalStatus.innerHTML = html;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Invite'; }
    // Reconcile with server truth; pending icons persist because
    // _renderInvitedRows merges _invitePending onto _lastInvites.
    await app._renderShareLinks();
  };

  // "Anyone with the link" — create a role-scoped link and copy it.
  app._createAnyoneLink = async function() {
    const role = (document.getElementById('anyone-role') || {}).value || 'Editor';
    const btn = document.getElementById('anyone-create');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
      const link = await app.getNovaCloudClient().createShareLink(app._cloudProjectId, { role });
      const url = (typeof location !== 'undefined' ? location.origin : '') + '/?join=' + encodeURIComponent(link.token);
      app._freshLinkUrls = app._freshLinkUrls || {};
      app._freshLinkUrls[link.id] = url;
      app._lastCreatedAnyoneLink = { id: link.id, role: role, url: url };
      app._renderAnyoneCreatedLink();
      try { if (navigator.clipboard) navigator.clipboard.writeText(url); } catch (e) { /* ignore */ }
      await app._renderShareLinks();
    } catch (e) {
      app.addAIMessage && app.addAIMessage('workspace', 'Could not create link: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Copy link'; }
    }
  };

  // Async reconcile: fetch server truth, cache BOTH lists (invited + anon), then
  // paint via the two synchronous renderers. Keeping the renderers synchronous is
  // what lets a revoke remove its row instantly (optimistically) before this
  // network round-trip even starts.
  app._renderShareLinks = async function() {
    const inviteList = document.getElementById('invite-list');
    const linkList = document.getElementById('share-link-list');
    if (!inviteList && !linkList) return;
    let links = [];
    try { links = (await app.getNovaCloudClient().listShareLinks(app._cloudProjectId)).shareLinks || []; } catch (e) { /* ignore */ }
    const active = links.filter(l => !l.revokedAt).sort((a, b) => b.createdAt - a.createdAt);

    // Cache both lists, then delegate to the synchronous renderers so live
    // per-recipient invite status (spinner / check / cross from app._invitePending)
    // and optimistic removals (app._locallyRevoked) are applied consistently.
    app._lastInvites = active.filter(l => l.email);
    app._lastAnonLinks = active.filter(l => !l.email);
    app._renderInvitedRows();
    app._renderAnyoneCreatedLink();
    app._renderAnonLinks();
  };

  app._renderAnyoneCreatedLink = function() {
    const mount = document.getElementById('anyone-created-link');
    if (!mount) return;
    const link = app._lastCreatedAnyoneLink;
    const revoked = app._locallyRevoked = app._locallyRevoked || new Set();
    if (!link || !link.url || revoked.has(link.id)) {
      mount.innerHTML = '';
      return;
    }
    const roleLabel = link.role === 'Viewer' ? 'Can view' : 'Can edit';
    mount.innerHTML = '<div class="share-created-link-row">' +
      '<input class="share-url-input" readonly value="' + escapeHtml(link.url) + '" title="' + escapeHtml(roleLabel) + ' link" onclick="this.select()" />' +
      shareRoleSelect(link) + revokeControls(link) +
      '<button class="share-icon-btn" title="Copy link" aria-label="Copy link" data-url="' + escapeHtml(link.url) + '" onclick="app._copyShareUrl(this)">📋</button>' +
      '</div>';
  };

  // Rebuilds ONLY the #share-link-list markup, synchronously, from the cached
  // anon links (app._lastAnonLinks — active links with no .email) and the
  // session-only raw URLs (app._freshLinkUrls). A link created this session shows
  // an input + copy button; otherwise it's an "Anyone with the link · role ·
  // timeAgo" row. Optimistically-revoked ids are filtered out, and the revoke
  // button uses the shared two-step inline confirm.
  app._renderAnonLinks = function() {
    const linkList = document.getElementById('share-link-list');
    if (!linkList) return;
    const revoked = app._locallyRevoked = app._locallyRevoked || new Set();
    const currentId = app._lastCreatedAnyoneLink && app._lastCreatedAnyoneLink.id;
    const anon = (Array.isArray(app._lastAnonLinks) ? app._lastAnonLinks : []).filter(l => !revoked.has(l.id) && l.id !== currentId);
    const fresh = app._freshLinkUrls || {};
    const roleLabel = r => (r === 'Viewer' ? 'Can view' : 'Can edit');

    linkList.innerHTML = anon.length
      ? '<div class="share-section-label">Links</div>' + anon.map(l => {
          if (fresh[l.id]) {
            return '<div class="share-link-row">' +
              '<input class="share-url-input" readonly value="' + escapeHtml(fresh[l.id]) + '" title="' + escapeHtml(roleLabel(l.role)) + ' link" onclick="this.select()" />' +
              shareRoleSelect(l) + revokeControls(l) +
              '<button class="share-icon-btn" title="Copy link" data-url="' + escapeHtml(fresh[l.id]) + '" onclick="app._copyShareUrl(this)">📋</button>' +
              '</div>';
          }
          return '<div class="share-link-row"><span class="ri-icon">🔗</span>' +
            '<span class="share-link-meta">Anyone with the link <span style="color:var(--text-muted)">· ' + escapeHtml(_timeAgo(l.createdAt)) + '</span></span>' +
            shareRoleSelect(l) + revokeControls(l) + '</div>';
        }).join('')
      : '';
  };

  app._updateShareLinkRole = async function(linkId, role) {
    if (!linkId || !['Editor', 'Viewer'].includes(role)) return;
    const applyRole = nextRole => {
      for (const listName of ['_lastInvites', '_lastAnonLinks']) {
        const list = Array.isArray(app[listName]) ? app[listName] : [];
        const item = list.find(l => l.id === linkId);
        if (item) item.role = nextRole;
      }
      if (app._lastCreatedAnyoneLink && app._lastCreatedAnyoneLink.id === linkId) {
        app._lastCreatedAnyoneLink.role = nextRole;
      }
    };
    const all = []
      .concat(Array.isArray(app._lastInvites) ? app._lastInvites : [])
      .concat(Array.isArray(app._lastAnonLinks) ? app._lastAnonLinks : []);
    const created = app._lastCreatedAnyoneLink && app._lastCreatedAnyoneLink.id === linkId ? app._lastCreatedAnyoneLink : null;
    const existing = all.find(l => l.id === linkId) || created;
    const previousRole = existing && existing.role;
    if (previousRole === role) return;

    app._roleUpdating = app._roleUpdating || {};
    app._roleUpdating[linkId] = true;
    applyRole(role);
    app._renderInvitedRows();
    app._renderAnyoneCreatedLink();
    app._renderAnonLinks();

    try {
      const updated = await app.getNovaCloudClient().updateShareLinkRole(app._cloudProjectId, linkId, { role });
      if (updated && updated.role) applyRole(updated.role);
      await app._renderShareLinks();
    } catch (e) {
      if (previousRole) applyRole(previousRole);
      app.addAIMessage && app.addAIMessage('workspace', 'Could not change access: ' + ((e && e.message) || e));
    } finally {
      delete app._roleUpdating[linkId];
      app._renderInvitedRows();
      app._renderAnyoneCreatedLink();
      app._renderAnonLinks();
    }
  };

  app._copyShareUrl = function(btn) {
    const url = btn && btn.getAttribute('data-url');
    if (!url) return;
    try { if (navigator.clipboard) navigator.clipboard.writeText(url); } catch (e) { /* ignore */ }
    const prev = btn.textContent;
    btn.textContent = '✓';
    setTimeout(function() { btn.textContent = prev; }, 1200);
  };

  // Step 1 of the two-step confirm: clicking 🗑 only ASKS (no network). Flips the
  // row's action area to a confirm/cancel pair via the shared revokeControls.
  app._askRevokeShareLink = function(linkId) {
    app._revokeConfirmId = linkId;
    app._renderInvitedRows();
    app._renderAnyoneCreatedLink();
    app._renderAnonLinks();
  };

  // Cancel: revert the confirm/cancel pair back to the trash button.
  app._cancelRevokeShareLink = function() {
    app._revokeConfirmId = null;
    app._renderInvitedRows();
    app._renderAnyoneCreatedLink();
    app._renderAnonLinks();
  };

  // Step 2: actually revoke. The row is removed OPTIMISTICALLY (synchronously,
  // before the network call) and restored if the server revoke fails.
  app._confirmRevokeShareLink = async function(linkId) {
    app._revokeConfirmId = null;
    const revokedCreatedLink = app._lastCreatedAnyoneLink && app._lastCreatedAnyoneLink.id === linkId;
    // Drop any transient invite status for this link's email so revoking an
    // invite doesn't leave a stale pending-only row behind.
    if (app._invitePending && Array.isArray(app._lastInvites)) {
      const gone = app._lastInvites.find(l => l.id === linkId);
      if (gone && gone.email) delete app._invitePending[String(gone.email).toLowerCase()];
    }
    // Optimistic removal: hide the row now, before the request fires.
    app._locallyRevoked = app._locallyRevoked || new Set();
    app._locallyRevoked.add(linkId);
    if (app._freshLinkUrls) delete app._freshLinkUrls[linkId];
    app._renderInvitedRows();
    app._renderAnyoneCreatedLink();
    app._renderAnonLinks();

    try {
      await app.getNovaCloudClient().revokeShareLink(app._cloudProjectId, linkId);
      await app._renderShareLinks();
      if (revokedCreatedLink) {
        app._lastCreatedAnyoneLink = null;
        app._renderAnyoneCreatedLink();
      }
      // Server no longer lists it, so the optimistic guard isn't needed — drop it
      // to keep the Set from growing unbounded across many revokes.
      app._locallyRevoked.delete(linkId);
    } catch (e) {
      // Restore the row and surface the failure honestly.
      app._locallyRevoked.delete(linkId);
      app._renderInvitedRows();
      app._renderAnyoneCreatedLink();
      app._renderAnonLinks();
      app.addAIMessage && app.addAIMessage('workspace', 'Could not remove the invite: ' + ((e && e.message) || e));
    }
  };

  // Backwards-compatible alias — older callers/tests may use _revokeShareLink.
  app._revokeShareLink = app._confirmRevokeShareLink;

  // ══════════════════════════════════════
  // SUBMIT A TICKET (Help → opens a GitHub issue server-side)
  // ══════════════════════════════════════
  app.showTicketDialog = function() {
    if (!app.currentUser) { app.addAIMessage && app.addAIMessage('workspace', 'Sign in to submit a ticket.'); if (app.signIn) app.signIn(); return; }
    const existing = document.getElementById('ticket-dialog-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'ticket-dialog-overlay';
    overlay.className = 'project-save-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = '<div class="project-save-dialog" role="dialog" aria-modal="true" style="width:min(520px,100%)">' +
      '<div class="project-save-header"><div class="project-save-mark">🎫</div>' +
      '<div><h3>Submit a ticket</h3><p>Report a bug or request a feature — this opens an issue on the Nova GitHub repo.</p></div>' +
      '<button class="project-save-close" onclick="document.getElementById(\'ticket-dialog-overlay\').remove()" aria-label="Close">x</button></div>' +
      '<div class="share-controls" style="margin-bottom:10px">' +
        '<span class="share-select"><select id="ticket-category" aria-label="Category"><option value="bug">Bug</option><option value="feature">Feature request</option><option value="question">Question</option></select></span>' +
        '<input id="ticket-title" class="share-email-input" type="text" placeholder="Short summary" />' +
      '</div>' +
      '<textarea id="ticket-body" class="ticket-textarea" placeholder="What happened? Steps to reproduce, what you expected, screenshots links…"></textarea>' +
      '<div id="ticket-status" class="share-status"></div>' +
      '<div class="project-save-footer"><span>Posted to the public Nova repo — don\'t include secrets.</span>' +
      '<button class="share-create-btn" id="ticket-submit" onclick="app._submitTicket()">Submit</button></div></div>';
    document.body.appendChild(overlay);
    setTimeout(function() { const t = document.getElementById('ticket-title'); if (t) t.focus(); }, 50);
  };

  app._submitTicket = async function() {
    const title = ((document.getElementById('ticket-title') || {}).value || '').trim();
    const body = (document.getElementById('ticket-body') || {}).value || '';
    const category = (document.getElementById('ticket-category') || {}).value || 'bug';
    const status = document.getElementById('ticket-status');
    if (!title || !body.trim()) { if (status) { status.className = 'share-status err'; status.textContent = 'Add a short summary and a description.'; } return; }
    const btn = document.getElementById('ticket-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    try {
      const res = await app.getNovaCloudClient().submitTicket({ title: title, body: body, category: category });
      if (status) {
        status.className = 'share-status ok';
        status.innerHTML = 'Ticket created.' + (res && res.url ? ' <a href="' + escapeHtml(res.url) + '" target="_blank" rel="noopener" style="color:var(--accent-blue);font-weight:700">View on GitHub →</a>' : '');
      }
      const ti = document.getElementById('ticket-title'); const tb = document.getElementById('ticket-body');
      if (ti) ti.value = ''; if (tb) tb.value = '';
    } catch (e) {
      if (status) {
        status.className = 'share-status err';
        status.textContent = /not configured/i.test(e.message || '') ? 'Ticket submission isn’t set up on this deployment yet.' : ('Could not submit: ' + e.message);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
    }
  };

  function _timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' days ago';
    return new Date(ts).toLocaleDateString();
  }

  // ══════════════════════════════════════
  // WIRE UP MENU ITEMS
  // ══════════════════════════════════════
  function _ensureCloudMenuItems() {
    const saveAs = document.getElementById('mi-saveas');
    if (!saveAs || document.getElementById('mi-cloud-open')) return;

    const cloudOpen = document.createElement('button');
    cloudOpen.className = 'menu-dropdown-item disabled';
    cloudOpen.id = 'mi-cloud-open';
    cloudOpen.textContent = 'Open from Cloud';

    saveAs.insertAdjacentElement('afterend', cloudOpen);
  }

  _ensureCloudMenuItems();

  const miSave = document.getElementById('mi-save');
  const miSaveAs = document.getElementById('mi-saveas');
  const miCloudOpen = document.getElementById('mi-cloud-open');
  const miOpen = document.getElementById('mi-open');
  const miExport = document.getElementById('mi-export');
  const miImport = document.getElementById('mi-import');

  if (miSave) { miSave.classList.remove('disabled'); miSave.onclick = function() { app.showSaveDialog(); }; }
  if (miSaveAs) { miSaveAs.classList.remove('disabled'); miSaveAs.onclick = function() { app.showSaveDialog(); }; }
  if (miCloudOpen) { miCloudOpen.classList.remove('disabled'); miCloudOpen.onclick = function() { app.showCloudOpenDialog(); }; }
  if (miOpen) { miOpen.classList.remove('disabled'); miOpen.onclick = function() { app.showOpenDialog(); }; }
  if (miExport) { miExport.classList.remove('disabled'); miExport.onclick = function() { app.saveToFile(); }; }
  if (miImport) { miImport.classList.remove('disabled'); miImport.onclick = function() { app.openFromFile(); }; }

  // ══════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ══════════════════════════════════════
  document.addEventListener('keydown', function(e) {
    if (app.currentPage !== 'workspace') return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    // Ctrl+S → Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (app._projectName && app._projectName !== 'Untitled') {
        app.saveToLocal(app._projectName);
      } else {
        app.showSaveDialog();
      }
    }
    // Ctrl+O → Open
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      app.showOpenDialog();
    }
    // Ctrl+Shift+S → Save As
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      app.showSaveDialog();
    }
  });

  // ══════════════════════════════════════
  // AUTOSAVE RECOVERY ON STARTUP
  // ══════════════════════════════════════
  const autosave = app._checkAutosave();
  if (autosave && autosave.nodes && autosave.nodes.length > 0) {
    // Show recovery option on landing page — placed before templates section
    const templatesSection = document.querySelector('.templates-section');
    if (templatesSection) {
      const recoveryDiv = document.createElement('div');
      recoveryDiv.style.cssText = 'margin-bottom:24px;padding:12px 16px;background:rgba(137,180,250,0.08);border:1px solid rgba(137,180,250,0.2);border-radius:10px;display:flex;align-items:center;gap:12px;';
      recoveryDiv.innerHTML = '<span style="font-size:18px">🔄</span>' +
        '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">Unsaved work found</div>' +
        '<div style="font-size:11px;color:var(--text-muted)">' + autosave.nodes.length + ' nodes from ' + escapeHtml(autosave.name || 'last session') + '</div></div>' +
        '<button id="btn-recover" style="padding:6px 14px;font-size:12px;font-weight:600;background:var(--accent-blue);color:var(--bg-tertiary);border:none;border-radius:6px;cursor:pointer">Recover</button>' +
        '<button id="btn-dismiss-recover" style="padding:6px 10px;font-size:12px;background:var(--bg-surface);color:var(--text-muted);border:none;border-radius:6px;cursor:pointer">Dismiss</button>';
      templatesSection.parentElement.insertBefore(recoveryDiv, templatesSection);

      document.getElementById('btn-recover').onclick = function() {
        app.newProject();
        app.deserializeGraph(autosave);
        app.addAIMessage('workspace', '🔄 Recovered **' + (autosave.name || 'autosaved project') + '** — ' + autosave.nodes.length + ' nodes restored.');
        recoveryDiv.remove();
      };
      document.getElementById('btn-dismiss-recover').onclick = function() {
        recoveryDiv.remove();
        localStorage.removeItem(AUTOSAVE_KEY);
      };
    }
  }

  // Re-render recent projects to show real saved data
  app.renderRecentProjects();
  return true;
}

export default installSaveLoad;

