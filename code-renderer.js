// ============================================
Nova
// NODEFLOW AI — Code-Based 3D Renderer

// 3D updates ONLY when user clicks Run.

// Switching 2D↔3D just shows/hides — no re-execute.

// ============================================



document.addEventListener('DOMContentLoaded', function() {



  // Track which wires existed at last Run (for animation control)

  app._lastRunWires = [];

  app._lastRunTime = 0;



  // Core render — execute code and populate 3D scene

  app._renderFromCode = function() {

    if (!Viewer3D.isInitialized) {

      var viewport = document.getElementById('viewport-3d');

      if (viewport) Viewer3D.init(viewport);

      else return;

    }



    Viewer3D.clearGeometry();



    var codeEl = document.getElementById('cv-code');

    var code = codeEl ? codeEl.value : '';

    if (!code || code.trim().length < 10) {

      code = this.generateFullScript();

    }

    if (!code || code.trim().length < 5) return;



    var result = PythonRunner.execute(code, {});

    if (result.error) {

      if (typeof NFLogger !== 'undefined') {

        NFLogger.error('3d-render', 'Code execution failed', { error: result.error });

      }

      return;

    }



    var rendered = 0;

    var keys = Object.keys(result.outputs);

    for (var i = 0; i < keys.length; i++) {

      rendered += app._addGeoToScene(result.outputs[keys[i]]);

    }



    if (rendered > 0) Viewer3D.fitAll();



    if (typeof NFLogger !== 'undefined') {

      NFLogger.info('3d-render', 'Rendered', { objects: rendered });

    }

  };



  app._addGeoToScene = function(val) {

    if (!val) return 0;

    if (val._type) { Geo.addToScene(Viewer3D.geometryGroup, val); return 1; }

    if (Array.isArray(val)) {

      var count = 0;

      for (var i = 0; i < val.length; i++) {

        if (val[i] && (val[i]._type || val[i] instanceof Geo.Point3)) {

          Geo.addToScene(Viewer3D.geometryGroup, val[i]);

          count++;

        }

      }

      return count;

    }

    return 0;

  };



  // ═══════════════════════════════════════

  // 3D SCENE TREE PANEL

  // Lists all rendered objects with type, position, vertex/face count

  // ═══════════════════════════════════════



  app._updateSceneTree = function() {

    var panel = document.getElementById('scene-tree-panel');

    if (!panel) {

      // Create the panel

      panel = document.createElement('div');

      panel.id = 'scene-tree-panel';

      panel.style.cssText = 'position:absolute;top:8px;left:8px;z-index:10;background:rgba(24,24,37,0.92);backdrop-filter:blur(12px);border:1px solid rgba(69,71,90,0.5);border-radius:10px;max-width:260px;max-height:400px;overflow-y:auto;font-family:var(--font-sans);display:none;';

      var viewport = document.getElementById('viewport-3d');

      if (viewport) viewport.appendChild(panel);

    }



    if (!Viewer3D.geometryGroup) { panel.style.display = 'none'; return; }



    var items = [];

    var group = Viewer3D.geometryGroup;



    function scanObject(obj, depth) {

      if (!obj) return;

      // Skip wireframe overlays and helpers

      if (obj.type === 'LineSegments' && obj.material && obj.material.color && obj.material.color.getHex() === 0x45475a) return;



      if (obj.type === 'Mesh' || obj.type === 'Line' || obj.type === 'Group') {

        var item = { name: '', type: '', details: '', depth: depth };



        if (obj.type === 'Mesh') {

          var geo = obj.geometry;

          var verts = geo && geo.attributes && geo.attributes.position ? geo.attributes.position.count : 0;

          var faces = geo && geo.index ? geo.index.count / 3 : verts / 3;

          var color = obj.material && obj.material.color ? '#' + obj.material.color.getHexString() : '#89b4fa';

          item.name = 'Mesh';

          item.type = 'mesh';

          item.details = verts + ' verts, ' + Math.round(faces) + ' faces';

          item.color = color;

          items.push(item);

        } else if (obj.type === 'Line') {

          var pts = obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position ? obj.geometry.attributes.position.count : 0;

          item.name = 'Curve';

          item.type = 'curve';

          item.details = pts + ' points';

          item.color = obj.material && obj.material.color ? '#' + obj.material.color.getHexString() : '#94e2d5';

          items.push(item);

        } else if (obj.type === 'Group') {

          // Recurse into groups

          for (var i = 0; i < obj.children.length; i++) {

            scanObject(obj.children[i], depth + 1);

          }

          return;

        }

      }



      // Also check InstancedMesh (point clouds)

      if (obj.type === 'InstancedMesh') {

        items.push({ name: 'Points', type: 'points', details: obj.count + ' instances', depth: depth, color: '#89b4fa' });

      }

    }



    for (var i = 0; i < group.children.length; i++) {

      scanObject(group.children[i], 0);

    }



    if (items.length === 0) {

      panel.style.display = 'none';

      return;

    }



    panel.style.display = 'block';

    var h = '<div style="padding:8px 12px;border-bottom:1px solid rgba(69,71,90,0.4);display:flex;align-items:center;gap:6px">';

    h += '<span style="font-size:12px">🎬</span>';

    h += '<span style="font-size:11px;font-weight:700;color:var(--text-primary)">Scene</span>';

    h += '<span style="font-size:10px;color:var(--text-muted);margin-left:auto">' + items.length + ' objects</span>';

    h += '</div>';



    items.forEach(function(item, idx) {

      var icon = item.type === 'mesh' ? '▣' : item.type === 'curve' ? '〰' : '•';

      var bg = idx % 2 === 0 ? 'transparent' : 'rgba(49,50,68,0.25)';

      h += '<div style="display:flex;align-items:center;gap:6px;padding:4px 12px;background:' + bg + '">';

      h += '<span style="width:8px;height:8px;border-radius:2px;background:' + (item.color || '#89b4fa') + ';flex-shrink:0"></span>';

      h += '<span style="font-size:11px;font-weight:600;color:var(--text-primary)">' + icon + ' ' + item.name + '</span>';

      h += '<span style="font-size:9px;color:var(--text-muted);margin-left:auto;white-space:nowrap">' + item.details + '</span>';

      h += '</div>';

    });



    panel.innerHTML = h;

  };



  // Show/hide scene tree when switching views

  var origSetViewForTree = app.setView.bind(app);

  app.setView = function(mode) {

    origSetViewForTree(mode);

    var panel = document.getElementById('scene-tree-panel');

    if (panel) panel.style.display = (mode === '3d' && Viewer3D.geometryGroup && Viewer3D.geometryGroup.children.length > 0) ? 'block' : 'none';

  };



  // ── Fix zoom isolation ──

  // viewport-3d is INSIDE canvas-area. Wheel events bubble up and zoom the node canvas.

  // Fix: stop propagation on viewport-3d so canvas-area never sees 3D scroll.

  setTimeout(function() {

    var viewport = document.getElementById('viewport-3d');

    if (viewport) {

      // Stop wheel from bubbling to canvas-area — OrbitControls already processed it

      viewport.addEventListener('wheel', function(e) { e.stopPropagation(); }, false);

      // Stop mouse events from triggering node drag/pan in 3D mode

      viewport.addEventListener('mousedown', function(e) { e.stopPropagation(); }, false);

      viewport.addEventListener('mousemove', function(e) { if (app.currentView === '3d') e.stopPropagation(); }, false);

    }



    // Improve node canvas zoom: toward mouse position instead of center

    var area = document.getElementById('canvas-area');

    if (area) {

      area.addEventListener('wheel', function(e) {

        if (app.currentView === '3d') return; // safety

        e.preventDefault();

        e.stopImmediatePropagation(); // block the original handler too



        var rect = area.getBoundingClientRect();

        var mouseX = e.clientX - rect.left;

        var mouseY = e.clientY - rect.top;



        var oldZoom = app.zoom;

        var delta = e.deltaY > 0 ? -0.08 : 0.08;

        var newZoom = Math.max(0.25, Math.min(3, oldZoom + delta));



        var scale = newZoom / oldZoom;

        app.panX = mouseX - scale * (mouseX - app.panX);

        app.panY = mouseY - scale * (mouseY - app.panY);

        app.zoom = newZoom;



        app.applyTransform();

        var zi = document.getElementById('zoom-indicator');

        if (zi) zi.textContent = Math.round(app.zoom * 100) + '%';

      }, { passive: false, capture: true });

    }

  }, 500);



  // ── Override setView — NO re-execute, just show/hide ──

  var origSetView = app.setView.bind(app);

  app.setView = function(mode) {

    this.currentView = mode;

    var nodeCanvas = document.getElementById('node-canvas');

    var wireSvg = document.getElementById('wire-svg');

    var gridSvg = document.getElementById('canvas-grid-svg');

    var viewport = document.getElementById('viewport-3d');

    var btn2D = document.getElementById('btn-view-nodes');

    var btn3D = document.getElementById('btn-view-3d');



    if (mode === '3d') {

      if (nodeCanvas) nodeCanvas.style.display = 'none';

      if (wireSvg) wireSvg.style.display = 'none';

      if (gridSvg) gridSvg.style.display = 'none';

      if (viewport) viewport.style.display = 'block';

      if (btn2D) { btn2D.style.color = ''; btn2D.style.fontWeight = ''; }

      if (btn3D) { btn3D.style.color = 'var(--accent-blue)'; btn3D.style.fontWeight = '700'; }

      if (!Viewer3D.isInitialized && viewport) Viewer3D.init(viewport);

      Viewer3D.show();

    } else {

      if (nodeCanvas) nodeCanvas.style.display = '';

      if (wireSvg) wireSvg.style.display = '';

      if (gridSvg) gridSvg.style.display = '';

      if (viewport) viewport.style.display = 'none';

      if (btn2D) { btn2D.style.color = 'var(--accent-blue)'; btn2D.style.fontWeight = '700'; }

      if (btn3D) { btn3D.style.color = ''; btn3D.style.fontWeight = ''; }

      Viewer3D.hide();

      setTimeout(function() { app.renderWires(); }, 50);

    }

  };



  // ── Override runGraph — THE trigger for code + 3D update ──

  var origRunGraph = app.runGraph.bind(app);

  app.runGraph = function() {

    // Generate code from graph

    var code = this.generateFullScript();

    this.showCodeViewer(code);



    // Snapshot current wires for animation

    app._lastRunWires = app.wires.map(function(w) {

      return w.fromNode + ':' + w.fromPort + '→' + w.toNode + ':' + w.toPort;

    });

    app._lastRunTime = Date.now();



    // Execute and render 3D

    app._renderFromCode();



    // Refresh all open Data Inspectors

    if (app.beginCompute) app.beginCompute();

    app.nodes.forEach(function(nd) {

      if (nd.dataPanelOpen) {

        var dc = document.getElementById(nd.id + '-dc');

        if (dc) dc.innerHTML = app.nodeDataHTML(nd);

      }

    });

    if (app.endCompute) app.endCompute();



    // Update 3D scene tree panel

    app._updateSceneTree();



    // Auto-open Data Inspectors for all nodes with outputs

    app.nodes.forEach(function(nd) {

      if (!nd.dataPanelOpen) {

        nd.dataPanelOpen = true;

        var p = document.getElementById(nd.id + '-data');

        if (p) p.classList.add('open');

        var a = document.getElementById(nd.id + '-arrow');

        if (a) a.textContent = '▾';

      }

      var dc = document.getElementById(nd.id + '-dc');

      if (dc) dc.innerHTML = app.nodeDataHTML(nd);

    });



    // Re-render wires (with animation state)

    app.renderWires();



    this.addAIMessage('workspace', '▶️ **Graph executed!** Code generated from ' + this.nodes.length + ' nodes. 3D updated.');

  };



  // ── Override renderWires — only animate wires from last Run ──

  var origRenderWires = app.renderWires.bind(app);

  app.renderWires = function() {

    var svg = document.getElementById('wire-svg');

    if (!svg) return;

    var ar = document.getElementById('canvas-area');

    if (!ar) return;

    ar = ar.getBoundingClientRect();

    var s = '';



    app.wires.forEach(function(w, i) {

      var fd = document.querySelector('#' + w.fromNode + ' .port-dot[data-port="' + w.fromPort + '"][data-dir="output"]');

      var td = document.querySelector('#' + w.toNode + ' .port-dot[data-port="' + w.toPort + '"][data-dir="input"]');

      if (!fd || !td) return;

      var fr = fd.getBoundingClientRect(), tr = td.getBoundingClientRect();

      var x1 = fr.left + fr.width / 2 - ar.left, y1 = fr.top + fr.height / 2 - ar.top;

      var x2 = tr.left + tr.width / 2 - ar.left, y2 = tr.top + tr.height / 2 - ar.top;

      var dx = Math.max(Math.abs(x2 - x1) * 0.5, 50);

      var c = app.getWireColor(w);

      var d = 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2;



      // Wire path

      s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.5" opacity="0.7"/>';



      // Animate ONLY wires that existed at last Run

      var wireKey = w.fromNode + ':' + w.fromPort + '→' + w.toNode + ':' + w.toPort;

      var wasInLastRun = app._lastRunWires.indexOf(wireKey) >= 0;



      if (wasInLastRun) {

        var dur = (2.5 + i * 0.4).toFixed(1);

        s += '<circle r="3" fill="' + c + '" opacity="0">';

        s += '<animateMotion dur="' + dur + 's" repeatCount="indefinite" path="' + d + '"/>';

        s += '<animate attributeName="opacity" values="0;0;0.9;0.9;0.9;0;0" keyTimes="0;0.05;0.15;0.5;0.85;0.95;1" dur="' + dur + 's" repeatCount="indefinite"/>';

        s += '</circle>';

      }

    });



    // Connecting wire preview

    if (app.connectingWire) {

      var cw = app.connectingWire;

      var cdx = Math.max(Math.abs(cw.endX - cw.startX) * 0.5, 40);

      if (cw.fromDir === 'output') {

        s += '<path class="wire-connecting" d="M' + cw.startX + ',' + cw.startY + ' C' + (cw.startX + cdx) + ',' + cw.startY + ' ' + (cw.endX - cdx) + ',' + cw.endY + ' ' + cw.endX + ',' + cw.endY + '" fill="none" stroke="#89b4fa" stroke-width="2"/>';

      } else {

        s += '<path class="wire-connecting" d="M' + cw.endX + ',' + cw.endY + ' C' + (cw.endX + cdx) + ',' + cw.endY + ' ' + (cw.startX - cdx) + ',' + cw.startY + ' ' + cw.startX + ',' + cw.startY + '" fill="none" stroke="#89b4fa" stroke-width="2"/>';

      }

    }



    var defs = '<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

    svg.innerHTML = defs + s;

  };



  // ── Override approveCode — also triggers Run ──

  var origApproveCode = app.approveCode.bind(app);

  app.approveCode = function() {

    origApproveCode();

    // After building graph from code, run it

    setTimeout(function() { app.runGraph(); }, 300);

  };

});

