import { NFLogger } from '../core/logger.js';
import { NODE_TYPE_MAP } from '../core/nodes.js';
import { CodeParser } from '../runtime/parser.js';
import { Viewer3D } from '../viewer/viewer3d.js';

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

// ============================================
// NODEFLOW AI — Logger Patch
// Monkey-patches key app methods to add logging
// Must load AFTER app.js
// ============================================

export function installLoggerPatch(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__loggerPatchInstalled) return true;
  targetApp.__loggerPatchInstalled = true;
  const app = targetApp;

  // ── Patch addNodeToCanvas ──
  var _origAddNode = app.addNodeToCanvas.bind(app);
  app.addNodeToCanvas = function(type, x, y) {
    var nd = _origAddNode(type, x, y);
    if (nd) NFLogger.graphNodeAdded(type, nd.id);
    return nd;
  };

  // ── Patch removeNode ──
  var _origRemoveNode = app.removeNode.bind(app);
  app.removeNode = function(id) {
    NFLogger.graphNodeRemoved(id);
    return _origRemoveNode(id);
  };

  // ── Patch addWire ──
  var _origAddWire = app.addWire.bind(app);
  app.addWire = function(fn, fp, tn, tp) {
    NFLogger.graphWireAdded(fn + ':' + fp, tn + ':' + tp);
    return _origAddWire(fn, fp, tn, tp);
  };

  // ── Patch sendChat ──
  var _origSendChat = app.sendChat.bind(app);
  app.sendChat = function(ch) {
    var inp = document.getElementById(ch === 'landing' ? 'landing-chat-input' : 'ws-chat-input');
    var txt = inp ? inp.value.trim() : '';
    NFLogger.userAction('chat-send', { channel: ch, message: txt });
    return _origSendChat(ch);
  };

  // ── Patch respond ──
  var _origRespond = app.respond.bind(app);
  app.respond = function(ch, txt, images) {
    NFLogger.info('app', 'respond called', {
      channel: ch,
      prompt: txt,
      images: images && images.length ? images.length : 0
    });
    return _origRespond.apply(app, arguments);
  };

  // ── Patch approveCode ──
  var _origApprove = app.approveCode.bind(app);
  app.approveCode = function() {
    var codeEl = document.getElementById('cv-code');
    var code = codeEl ? codeEl.value : '';
    NFLogger.codeApproved(code);
    return _origApprove();
  };

  // ── Patch cancelCode ──
  var _origCancel = app.cancelCode.bind(app);
  app.cancelCode = function() {
    NFLogger.codeCancelled();
    return _origCancel();
  };

  // ── Patch runEditedCode ──
  var _origRunEdited = app.runEditedCode.bind(app);
  app.runEditedCode = function() {
    var codeEl = document.getElementById('cv-code');
    var code = codeEl ? codeEl.value : '';
    NFLogger.info('app', 'runEditedCode called', { code_length: code.length, code_preview: code.substring(0, 300) });
    try {
      var result = _origRunEdited();
      NFLogger.graphParsed(app.nodes.length, app.wires.length, 
        app.nodes.map(function(n) { return n.type; }));
      return result;
    } catch(e) {
      NFLogger.graphParseError(e, code);
      throw e;
    }
  };

  // ── Patch runGraph ──
  var _origRunGraph = app.runGraph.bind(app);
  app.runGraph = function() {
    NFLogger.codeGenerated(app.codeLang, app.nodes.length, 0);
    return _origRunGraph();
  };

  // ── Patch newProject — force full reset even if already in workspace ──
  app.newProject = function() {
    NFLogger.userAction('new-project', null);
    // Full reset
    this.nodes = [];
    this.wires = [];
    this.selectedNodes = [];
    this.nextNodeId = 1;
    this.nodeZCounter = 10;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    var c = document.getElementById('node-canvas');
    if (c) c.innerHTML = '';
    var svg = document.getElementById('wire-svg');
    if (svg) svg.innerHTML = '';
    // Reset chat history so welcome message shows again
    this.chatHistories.workspace = [];
    // Reset code viewer
    var codeEl = document.getElementById('cv-code');
    if (codeEl) codeEl.value = '';
    var panel = document.getElementById('code-viewer-panel');
    if (panel) panel.style.display = 'none';
    this.codeViewerOpen = false;
    // Clear 3D
    if (Viewer3D.isInitialized) {
      Viewer3D.clearGeometry();
      Viewer3D._needsRebuild = true;
    }
    // Switch to workspace and re-init chat
    this.switchPage('workspace');
    this.initWorkspaceChat();
    this.updateMenuState();
    // Reset zoom indicator
    var zi = document.getElementById('zoom-indicator');
    if (zi) zi.textContent = '100%';
    this.applyTransform();
  };

  // ── Override openTemplate with real architectural examples ──
  app.openTemplate = function(id) {
    NFLogger.userAction('open-template', { template: id });
    this.newProject();

    var templates = {
      // ── Geometry Test: every basic type spread on XZ plane ──
      blank: {
        code: 'import math\n\n# === ROW 1: SOLID PRIMITIVES spaced along X ===\nbox = Geo.createBox(Geo.Point3(0, 0, 4), 8, 8, 8)\nsphere = Geo.createSphere(Geo.Point3(20, 0, 4), 4)\ncylinder = Geo.createCylinder(Geo.Point3(40, 0, 0), 3, 8)\ncone = Geo.createCone(Geo.Point3(60, 0, 0), 4, 8)\ntorus = Geo.createTorus(Geo.Point3(80, 0, 4), 5, 1.5)\n\n# === ROW 2: OPERATIONS spaced along X, offset in Y ===\nextrude_circle = Geo.Circle3(Geo.Point3(0, 25, 0), 4)\nextrude_dir = Geo.Vector3(0, 0, 10)\ntest_extrude = Geo.extrude(extrude_circle, extrude_dir)\nmoved_box = Geo.move(Geo.createBox(Geo.Point3(20, 25, 2.5), 5, 5, 5), Geo.Vector3(0, 0, 3))\nthick_surface = Geo.thicken(Geo.createBox(Geo.Point3(40, 25, 1), 10, 10, 0.1), 2)\n\nprint(box)\nprint(sphere)\nprint(cylinder)\nprint(cone)\nprint(torus)\nprint(test_extrude)\nprint(moved_box)\nprint(thick_surface)',
        msg: '🔬 **Geometry Test** loaded!\n\nSwitch to **3D** and verify each shape:\n\n**Row 1 (y=0):** Box → Sphere → Cylinder → Cone → Torus (spaced at x=0,20,40,60,80)\n**Row 2 (y=-25):** Extruded circle → Lofted vase → Moved box\n**Row 3 (y=-50):** Surface grid → Thickened\n\nAll shapes should be separate, visible, and clean. Report which ones are missing or broken.'
      }
    };

    var tmpl = templates[id];
    if (!tmpl || !tmpl.code) return;

    // Show code and build graph
    this.showCodeViewer(tmpl.code, null);

    // Parse code into nodes
    try {
      var graph = CodeParser.parseToGraph(tmpl.code);
      if (graph.nodes.length > 0) {
        graph.nodes.forEach(function(gn) {
          var def = NODE_TYPE_MAP[gn.type];
          if (!def) return;
          app.nodeZCounter++;
          var nd = {
            id: gn.id, type: gn.type, x: gn.x, y: gn.y,
            def: Object.assign({}, def), controlValues: {}, dataPanelOpen: false, zIndex: app.nodeZCounter
          };
          def.controls.forEach(function(c) { nd.controlValues[c.id] = c.default; });
          Object.keys(gn.controls).forEach(function(k) {
            if (k !== '_dynInputs') nd.controlValues[k] = gn.controls[k];
          });
          if ((gn.type === 'custom-python' || gn.type === 'Custom.Python') && gn.rawCode) nd.controlValues.code = gn.rawCode;
          if ((gn.type === 'custom-python' || gn.type === 'Custom.Python') && gn.controls._dynInputs) nd._dynInputs = gn.controls._dynInputs;
          if (gn.outputVars && gn.outputVars.length > 0) nd._dynOutputs = gn.outputVars;
          app.nodes.push(nd);
          app.renderNode(nd);
        });
        graph.wires.forEach(function(w) { app.wires.push(w); });
        app.nextNodeId = graph.nextId;
        app.updatePortDots();
        setTimeout(function() { app.renderWires(); }, 50);
        app.updateMenuState();
      }
    } catch(e) {
      NFLogger.error('template', 'Failed to parse template', { id: id, error: e.message });
    }

    // Show description
    if (tmpl.msg) {
      this.addAIMessage('workspace', tmpl.msg);
    }
    this.setChatSuggestions('workspace', ['Switch to 3D view', 'Explain the code', 'Modify the parameters', 'Create something new']);
  };

  // ── Patch setView ──
  if (typeof app.setView === 'function') {
    var _origSetView = app.setView.bind(app);
    app.setView = function(mode) {
      NFLogger.userAction('set-view', { mode: mode });
      return _origSetView(mode);
    };
  }

  // ── Update landing page template cards ──
  setTimeout(function() {
    var grid = document.getElementById('templates-grid');
    if (!grid) return;
    var cards = [
      { id: 'blank', name: 'Geometry Test', desc: 'Test all geometry types', icon: '🔬', color: 'var(--accent-teal)' }
    ];
    grid.innerHTML = cards.map(function(x) {
      return '<div class="template-card" style="--card-accent:' + x.color + '" onclick="app.openTemplate(\'' + x.id + '\')">' +
        '<div class="template-icon" style="background:' + x.color + '22;color:' + x.color + '">' + x.icon + '</div>' +
        '<h4>' + x.name + '</h4><p>' + x.desc + '</p></div>';
    }).join('');
  }, 200);

  // ── Add "Export Logs" button to menu ──
  // Creates a hidden element that stores logs for retrieval
  var logStore = document.createElement('div');
  logStore.id = 'nf-log-store';
  logStore.style.display = 'none';
  document.body.appendChild(logStore);

  // Update log store periodically
  setInterval(function() {
    var el = document.getElementById('nf-log-store');
    if (el) el.textContent = NFLogger.getLogsJSON();
  }, 2000);

  // Also store in window for direct access
  if (typeof window !== 'undefined') {
    window.getNFLogs = function() { return NFLogger.getLogsJSON(); };
  }

  // ══════════════════════════════════════
  // CLICK-BASED WIRE SYSTEM
  // Click port → wire follows mouse → click target port or canvas
  // Click connected port → picks up existing wire → drop to reconnect or disconnect
  // ══════════════════════════════════════

  // Override onPortDown to use click-based wiring
  app.onPortDown = function(e, nid, pid, dir) {
    e.stopPropagation();
    e.preventDefault();

    var area = document.getElementById('canvas-area').getBoundingClientRect();
    var dr = e.target.getBoundingClientRect();
    var startX = dr.left + dr.width / 2 - area.left;
    var startY = dr.top + dr.height / 2 - area.top;

    // Check if this port already has a wire connected
    var existingWire = null;
    if (dir === 'input') {
      existingWire = app.wires.find(function(w) { return w.toNode === nid && w.toPort === pid; });
    }

    if (existingWire && dir === 'input') {
      // PICK UP existing wire from this input — detach from input, hold from the output end
      var fromNode = existingWire.fromNode;
      var fromPort = existingWire.fromPort;
      app.wires = app.wires.filter(function(w) { return w !== existingWire; });
      app.updatePortDots();
      var outDot = document.querySelector('#' + fromNode + ' .port-dot[data-port="' + fromPort + '"][data-dir="output"]');
      if (outDot) { var outRect = outDot.getBoundingClientRect(); startX = outRect.left + outRect.width / 2 - area.left; startY = outRect.top + outRect.height / 2 - area.top; }
      app.connectingWire = { fromNode: fromNode, fromPort: fromPort, fromDir: 'output', startX: startX, startY: startY, endX: e.clientX - area.left, endY: e.clientY - area.top };
      NFLogger.info('wire', 'Picked up wire from input', { from: fromNode + ':' + fromPort, detached: nid + ':' + pid });
    } else if (dir === 'output') {
      // Check if output has wires — if so, pick up the last one
      var outWires = app.wires.filter(function(w) { return w.fromNode === nid && w.fromPort === pid; });
      if (outWires.length > 0) {
        var lastWire = outWires[outWires.length - 1];
        var toNode = lastWire.toNode;
        var toPort = lastWire.toPort;
        app.wires = app.wires.filter(function(w) { return w !== lastWire; });
        app.updatePortDots();
        // Hold from output, drag to reconnect
        app.connectingWire = { fromNode: nid, fromPort: pid, fromDir: 'output', startX: startX, startY: startY, endX: e.clientX - area.left, endY: e.clientY - area.top };
        NFLogger.info('wire', 'Picked up wire from output', { from: nid + ':' + pid, detached: toNode + ':' + toPort });
      } else {
        // No existing wire — start new wire from output
        app.connectingWire = { fromNode: nid, fromPort: pid, fromDir: dir, startX: startX, startY: startY, endX: startX, endY: startY };
      }
    } else {
      // START new wire from this port
      app.connectingWire = {
        fromNode: nid, fromPort: pid, fromDir: dir,
        startX: startX, startY: startY,
        endX: startX, endY: startY
      };
    }

    app.renderWires();
  };

  // Override onWireEnd to handle click-based connection rules
  app.onWireEnd = function(e) {
    if (!app.connectingWire) return;

    var tgt = document.elementFromPoint(e.clientX, e.clientY);

    if (tgt && tgt.classList.contains('port-dot')) {
      var tn = tgt.dataset.node;
      var tp = tgt.dataset.port;
      var td = tgt.dataset.dir;

      // Rule 1: Can't connect same direction (output→output or input→input)
      if (app.connectingWire.fromDir === td) {
        NFLogger.warn('wire', 'Cannot connect: same direction', { fromDir: app.connectingWire.fromDir, toDir: td });
        app.connectingWire = null;
        app.renderWires();
        return;
      }

      // Rule 2: Can't connect to same node
      if (app.connectingWire.fromNode === tn) {
        NFLogger.warn('wire', 'Cannot connect: same node', { node: tn });
        app.connectingWire = null;
        app.renderWires();
        return;
      }

      // Valid connection — determine from/to based on direction
      var w;
      if (app.connectingWire.fromDir === 'output') {
        w = { fromNode: app.connectingWire.fromNode, fromPort: app.connectingWire.fromPort, toNode: tn, toPort: tp };
      } else {
        w = { fromNode: tn, fromPort: tp, toNode: app.connectingWire.fromNode, toPort: app.connectingWire.fromPort };
      }
      app.addWire(w.fromNode, w.fromPort, w.toNode, w.toPort);
      app.updatePortDots();
      NFLogger.graphWireAdded(w.fromNode + ':' + w.fromPort, w.toNode + ':' + w.toPort);
    } else {
      // Dropped on empty canvas → disconnect (wire is already removed if it was picked up)
      if (typeof NFLogger !== 'undefined') {
        NFLogger.info('wire', 'Wire dropped on canvas — disconnected', null);
      }
    }

    app.connectingWire = null;
    app.renderWires();
  };

  // Cancel wire on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && app.connectingWire) {
      app.connectingWire = null;
      app.renderWires();
    }
  });

  NFLogger.info('patch', 'Logger patch applied to app methods');
  return true;
}

export default installLoggerPatch;
