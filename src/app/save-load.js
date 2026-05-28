import { NODE_TYPE_MAP } from '../core/nodes.js';

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
    app.applyTransform();
    app.updatePortDots();
    setTimeout(() => app.renderWires(), 50);
    app.updateMenuState();

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
    app._novaCloudClient = factory ? factory() : null;
    return app._novaCloudClient;
  };

  app.loginNovaCloudDemo = async function(email = 'owner@demo.nova') {
    const client = app.getNovaCloudClient();
    if (!client) throw new Error('Nova Cloud client is not available.');
    const session = await client.devLogin({ email, organizationSlug: 'demo' });
    app._novaCloudUser = session.user;
    return session;
  };

  app.saveToCloud = async function(name = app._projectName || 'Untitled') {
    const client = app.getNovaCloudClient();
    if (!client) throw new Error('Nova Cloud client is not available.');
    if (!client.isAuthenticated()) await app.loginNovaCloudDemo();
    const graph = app.serializeGraph();
    let project;
    if (app._cloudProjectId) {
      project = await client.saveProjectGraph(app._cloudProjectId, { graph, message: 'Saved from Nova web' });
    } else {
      project = await client.createProject({ name, graph });
      app._cloudProjectId = project.id;
    }
    app._projectName = project.name || name;
    app.addAIMessage('workspace', 'Saved **' + app._projectName + '** to Nova Cloud.');
    return project;
  };

  app.openCloudProject = async function(projectId) {
    const client = app.getNovaCloudClient();
    if (!client) throw new Error('Nova Cloud client is not available.');
    if (!client.isAuthenticated()) await app.loginNovaCloudDemo();
    const project = await client.getProject(projectId);
    const versions = project.versions || [];
    const version = versions.find(item => item.id === project.currentVersionId) || versions[versions.length - 1];
    if (!version || !version.graph) throw new Error('Cloud project has no graph version.');
    if (app.currentPage !== 'workspace') app.newProject();
    app.deserializeGraph(version.graph);
    app._cloudProjectId = project.id;
    app._projectName = project.name;
    app.addAIMessage('workspace', 'Opened cloud project **' + project.name + '**.');
    return project;
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
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = '<div style="width:400px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.5);padding:24px;animation:slideUp 0.2s ease">' +
      '<h3 style="font-size:16px;font-weight:700;color:var(--text-bright);margin-bottom:16px">💾 Save Project</h3>' +
      '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">Project Name</label>' +
      '<input id="save-name-input" type="text" value="' + escapeHtml(app._projectName || 'Untitled') + '" style="width:100%;padding:10px 14px;font-size:14px;background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);outline:none;margin-bottom:16px" />' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button onclick="app.saveToLocal(document.getElementById(\'save-name-input\').value);document.getElementById(\'save-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;font-weight:600;background:var(--accent-blue);color:var(--bg-tertiary);border:none;border-radius:var(--radius-sm);cursor:pointer">Save to Browser</button>' +
        '<button onclick="app._projectName=document.getElementById(\'save-name-input\').value;app.saveToFile();document.getElementById(\'save-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;background:var(--bg-surface);color:var(--text-secondary);border:none;border-radius:var(--radius-sm);cursor:pointer">Download File</button>' +
        '<button onclick="document.getElementById(\'save-dialog-overlay\').remove()" style="padding:8px 16px;font-size:13px;background:var(--bg-surface);color:var(--text-muted);border:none;border-radius:var(--radius-sm);cursor:pointer">Cancel</button>' +
      '</div></div>';

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
  function _saveToRecent(name) {
    try {
      let recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      recent = recent.filter(r => r.name !== name);
      recent.unshift({ name: name, date: Date.now() });
      if (recent.length > 10) recent = recent.slice(0, 10);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (e) { /* ignore */ }
  }

  // Patch landing page recent projects to show real data
  const origRenderRecent = app.renderRecentProjects.bind(app);
  app.renderRecentProjects = function() {
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { /* ignore corrupt recent list */ }

    if (recent.length === 0) {
      origRenderRecent();
      return;
    }

    const el = document.getElementById('recent-list');
    if (!el) return;
    el.innerHTML = recent.map(r => {
      const ago = _timeAgo(r.date);
      return '<button class="recent-item" onclick="app.openFromLocal(\'' + escapeJsString(r.name) + '\')">' +
        '<span class="ri-icon">📄</span>' +
        '<span class="ri-name">' + escapeHtml(r.name) + '</span>' +
        '<span class="ri-date">' + escapeHtml(ago) + '</span></button>';
    }).join('');
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
  const miSave = document.getElementById('mi-save');
  const miSaveAs = document.getElementById('mi-saveas');
  const miOpen = document.getElementById('mi-open');
  const miExport = document.getElementById('mi-export');
  const miImport = document.getElementById('mi-import');

  if (miSave) { miSave.classList.remove('disabled'); miSave.onclick = function() { app.showSaveDialog(); }; }
  if (miSaveAs) { miSaveAs.classList.remove('disabled'); miSaveAs.onclick = function() { app.showSaveDialog(); }; }
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

