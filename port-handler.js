// ═══════════════════════════════════════════════════
// UNIVERSAL PORT HANDLER — Clean drag state architecture
//
// app._dragState = null when idle, or:
// {
//   type: 'new' | 'move' | 'reconnect' | 'branch',
//   fromNode, fromPort, fromDir,   // where the connecting line starts
//   cursorX, cursorY,               // current mouse position (canvas coords)
//   startClientX, startClientY,     // initial mouse position (screen coords)
//   affectedWireIndices: [],        // for 'move': indices into app.wires
//   isNew: bool                     // show AI badge?
// }
//
// app.wires is NEVER modified during drag — only on drop.
// ═══════════════════════════════════════════════════

(function() {

  function install() {
    if (!app || !app.onPortDown) return false;

    // ════════════════════════════
    // app.onPortDown — start drag
    // ════════════════════════════
    app.onPortDown = function(e, nid, pid, dir) {
      var area = document.getElementById('canvas-area').getBoundingClientRect();
      var dotRect = e.target.getBoundingClientRect();
      var startX = dotRect.left + dotRect.width / 2 - area.left;
      var startY = dotRect.top + dotRect.height / 2 - area.top;
      var mouseX = e.clientX - area.left;
      var mouseY = e.clientY - area.top;
      var ctrl = e.ctrlKey || e.metaKey;

      app._dragState = null;

      if (dir === 'output') {
        var hasWires = this.wires.some(function(w) { return w.fromNode === nid && w.fromPort === pid; });

        if (ctrl && hasWires) {
          // MOVE: pick up all wires from this output
          var indices = [];
          this.wires.forEach(function(w, i) { if (w.fromNode === nid && w.fromPort === pid) indices.push(i); });
          app._dragState = {
            type: 'move',
            fromNode: nid, fromPort: pid, fromDir: 'output',
            cursorX: mouseX, cursorY: mouseY,
            startClientX: e.clientX, startClientY: e.clientY,
            affectedWireIndices: indices,
            origStartX: startX, origStartY: startY,
            isNew: false
          };
          this.renderWires();
        } else {
          // NEW wire (fan-out)
          app._dragState = {
            type: 'new',
            fromNode: nid, fromPort: pid, fromDir: 'output',
            cursorX: mouseX, cursorY: mouseY,
            startClientX: e.clientX, startClientY: e.clientY,
            startX: startX, startY: startY,
            affectedWireIndices: [],
            isNew: true
          };
          _setPortType(nid, pid, 'output');
          _showAIBadge(e);
          // Also set legacy connectingWire for backward compat with wire renderer
          this.connectingWire = { fromNode: nid, fromPort: pid, fromDir: 'output',
            startX: startX, startY: startY, endX: mouseX, endY: mouseY };
          this.renderWires();
        }
        return;
      }

      if (dir === 'input') {
        var existingIdx = -1;
        this.wires.forEach(function(w, i) { if (w.toNode === nid && w.toPort === pid) existingIdx = i; });

        if (existingIdx >= 0) {
          var wire = this.wires[existingIdx];
          var srcNode = wire.fromNode, srcPort = wire.fromPort;
          // Get source port position
          var srcDot = document.querySelector('#' + srcNode + ' .port-dot[data-port="' + srcPort + '"][data-dir="output"]');
          var srcX = startX, srcY = startY;
          if (srcDot) { var sr = srcDot.getBoundingClientRect(); srcX = sr.left + sr.width/2 - area.left; srcY = sr.top + sr.height/2 - area.top; }

          if (ctrl) {
            // BRANCH: keep existing wire, start new from same source
            app._dragState = {
              type: 'branch',
              fromNode: srcNode, fromPort: srcPort, fromDir: 'output',
              cursorX: mouseX, cursorY: mouseY,
              startClientX: e.clientX, startClientY: e.clientY,
              startX: srcX, startY: srcY,
              affectedWireIndices: [],
              isNew: true
            };
            _setPortType(srcNode, srcPort, 'output');
            _showAIBadge(e);
            this.connectingWire = { fromNode: srcNode, fromPort: srcPort, fromDir: 'output',
              startX: srcX, startY: srcY, endX: mouseX, endY: mouseY };
          } else {
            // RECONNECT: disconnect wire, hold from source
            app._dragState = {
              type: 'reconnect',
              fromNode: srcNode, fromPort: srcPort, fromDir: 'output',
              cursorX: mouseX, cursorY: mouseY,
              startClientX: e.clientX, startClientY: e.clientY,
              startX: srcX, startY: srcY,
              removedWire: { fromNode: wire.fromNode, fromPort: wire.fromPort, toNode: wire.toNode, toPort: wire.toPort },
              affectedWireIndices: [],
              isNew: false
            };
            // Remove wire immediately
            this.wires.splice(existingIdx, 1);
            this.updatePortDots();
            _refreshNode(nid);
            this.connectingWire = { fromNode: srcNode, fromPort: srcPort, fromDir: 'output',
              startX: srcX, startY: srcY, endX: mouseX, endY: mouseY };
          }
          this.renderWires();
          return;
        }

        // Empty input: NEW wire from input
        app._dragState = {
          type: 'new',
          fromNode: nid, fromPort: pid, fromDir: 'input',
          cursorX: mouseX, cursorY: mouseY,
          startClientX: e.clientX, startClientY: e.clientY,
          startX: startX, startY: startY,
          affectedWireIndices: [],
          isNew: true
        };
        _setPortType(nid, pid, 'input');
        _showAIBadge(e);
        this.connectingWire = { fromNode: nid, fromPort: pid, fromDir: 'input',
          startX: startX, startY: startY, endX: mouseX, endY: mouseY };
        this.renderWires();
        return;
      }
    };

    // ════════════════════════════
    // app.onWireEnd — drop (for new/reconnect/branch — NOT move)
    // ════════════════════════════
    app.onWireEnd = function(e) {
      _hideAIBadge();
      var ds = app._dragState;
      if (!this.connectingWire || !ds) { app._dragState = null; this.connectingWire = null; return; }

      var tgt = document.elementFromPoint(e.clientX, e.clientY);

      if (tgt && tgt.classList.contains('port-dot')) {
        var tn = tgt.dataset.node, tp = tgt.dataset.port, td = tgt.dataset.dir;
        if (ds.fromDir !== td && ds.fromNode !== tn) {
          var w = ds.fromDir === 'output'
            ? { fromNode: ds.fromNode, fromPort: ds.fromPort, toNode: tn, toPort: tp }
            : { fromNode: tn, fromPort: tp, toNode: ds.fromNode, toPort: ds.fromPort };
          this.addWire(w.fromNode, w.fromPort, w.toNode, w.toPort);
          this.updatePortDots();
        }
      } else {
        // Dropped on empty
        var dx = e.clientX - ds.startClientX, dy = e.clientY - ds.startClientY;
        if (ds.isNew && Math.sqrt(dx*dx + dy*dy) > 20 && typeof showPortSuggest === 'function') {
          var nid = ds.fromNode, pid = ds.fromPort, pDir = ds.fromDir;
          var pType = app._dragPortType || 'any';
          this.connectingWire = null;
          app._dragState = null;
          this.renderWires();
          setTimeout(function() { showPortSuggest(e, nid, pid, pType, pDir); }, 50);
          return;
        }
      }

      this.connectingWire = null;
      app._dragState = null;
      this.renderWires();
    };

    console.log('[NodeFlow] Universal port handler installed');
    return true;
  }

  // ════════════════════════════
  // Global mouseup — handles MOVE drop (no connectingWire for move)
  // ════════════════════════════
  document.addEventListener('mouseup', function(e) {
    if (!app || !app._dragState || app._dragState.type !== 'move') return;
    var ds = app._dragState;
    _hideAIBadge();

    var tgt = document.elementFromPoint(e.clientX, e.clientY);
    var dx = e.clientX - ds.startClientX, dy = e.clientY - ds.startClientY;
    var dragged = Math.sqrt(dx*dx + dy*dy) > 20;

    if (tgt && tgt.classList.contains('port-dot') && tgt.dataset.dir === 'output') {
      // Dropped on output port — reconnect all affected wires
      var newNode = tgt.dataset.node, newPort = tgt.dataset.port;
      ds.affectedWireIndices.forEach(function(i) {
        if (app.wires[i]) {
          app.wires[i].fromNode = newNode;
          app.wires[i].fromPort = newPort;
        }
      });
      app.updatePortDots();
    } else if (dragged) {
      // Dropped on empty — destroy affected wires (reverse order to keep indices valid)
      var sorted = ds.affectedWireIndices.slice().sort(function(a,b){return b-a;});
      sorted.forEach(function(i) { app.wires.splice(i, 1); });
      app.updatePortDots();
    }
    // else: just a click — do nothing, wires stay

    ds.affectedWireIndices.forEach(function() {}); // no-op, just clear
    app._dragState = null;
    app.renderWires();
  }, true);

  // ════════════════════════════
  // Global mousemove — update cursor + AI badge + connectingWire
  // ════════════════════════════
  document.addEventListener('mousemove', function(e) {
    if (!app || !app._dragState) return;
    var ds = app._dragState;
    var area = document.getElementById('canvas-area');
    if (!area) return;
    var ar = area.getBoundingClientRect();
    ds.cursorX = e.clientX - ar.left;
    ds.cursorY = e.clientY - ar.top;

    // AI badge follows cursor for new connections
    if (ds.isNew) {
      var badge = document.getElementById('wire-ai-badge');
      if (badge && badge.style.display !== 'none') {
        badge.style.left = e.clientX + 'px';
        badge.style.top = e.clientY + 'px';
      }
    }

    // Update legacy connectingWire for renderer (new/reconnect/branch)
    if (app.connectingWire) {
      app.connectingWire.endX = ds.cursorX;
      app.connectingWire.endY = ds.cursorY;
    }

    // For move: trigger re-render so wires follow cursor
    if (ds.type === 'move') {
      app.renderWires();
    }
  });

  // ════════════════════════════
  // Helpers
  // ════════════════════════════
  function _showAIBadge(e) {
    var badge = document.getElementById('wire-ai-badge');
    if (badge) { badge.style.left = e.clientX + 'px'; badge.style.top = e.clientY + 'px'; badge.style.display = 'block'; }
  }
  function _hideAIBadge() {
    var badge = document.getElementById('wire-ai-badge');
    if (badge) badge.style.display = 'none';
  }
  function _setPortType(nid, pid, dir) {
    var nd = app.nodes.find(function(n) { return n.id === nid; });
    if (nd) {
      var ports = dir === 'output' ? nd.def.outputs : nd.def.inputs;
      var p = (ports || []).find(function(o) { return o.id === pid; });
      app._dragPortType = p ? (p.type || 'any') : 'any';
    }
  }
  function _refreshNode(nid) {
    if (app._universalInspector) {
      var nd = app.nodes.find(function(n) { return n.id === nid; });
      if (nd && (nd._inspOpen || nd.inspectorOpen)) {
        var content = document.getElementById(nid + '-insp-content');
        if (content) content.innerHTML = app._universalInspector(nd);
      }
    }
  }

  // ════════════════════════════
  // Install
  // ════════════════════════════
  install();
  document.addEventListener('DOMContentLoaded', function() { setTimeout(install, 200); });
  setTimeout(install, 1000);

})();
