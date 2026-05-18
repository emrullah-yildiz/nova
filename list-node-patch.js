// ============================================
Nova
// NODEFLOW AI — Create List Node Dynamic Inputs

// + Node Help Dialog (right-click → Help)

// ============================================



document.addEventListener('DOMContentLoaded', function() {



  // ═══════════════════════════════════════

  // DYNAMIC CREATE LIST NODE

  // Supports add/remove inputs, empty = empty list

  // ═══════════════════════════════════════



  var origRenderNode = app.renderNode.bind(app);

  app.renderNode = function(nd) {

    origRenderNode(nd);

    // Enhance Create List nodes with dynamic inputs

    if (nd.type === 'list-create' || (nd.def && nd.def.dynamicInputs && nd.type === 'list-create')) {

      var el = document.getElementById(nd.id);

      if (el) app.enhanceListNode(nd, el);

    }

  };



  app.enhanceListNode = function(nd, el) {

    // Initialize dynamic inputs if not set

    if (!nd._listInputs) nd._listInputs = [];

    // Sync with any existing wired inputs

    app.wires.forEach(function(w) {

      if (w.toNode === nd.id && nd._listInputs.indexOf(w.toPort) < 0) {

        nd._listInputs.push(w.toPort);

      }

    });



    var body = el.querySelector('.node-body');

    if (!body) return;

    var h = '';



    // Render existing dynamic input ports

    nd._listInputs.forEach(function(pid, i) {

      h += '<div class="node-port-row input-only"><div class="node-port input port-type-any">';

      h += '<span class="port-dot port-type-any" data-port="' + pid + '" data-dir="input" data-node="' + nd.id + '"></span>';

      h += '<span class="port-label">' + pid + '</span></div>';

      h += '<button class="py-node-btn port" onclick="event.stopPropagation();app.listRemoveInput(\'' + nd.id + '\',' + i + ')" title="Remove input">−</button></div>';

    });



    // Add input button

    h += '<div class="py-port-dynamic"><button class="py-node-btn port" onclick="event.stopPropagation();app.listAddInput(\'' + nd.id + '\')">+ Item</button></div>';



    // Output port

    h += '<div class="node-port-row output-only"><div class="node-port output port-type-list">';

    h += '<span class="port-label">List</span>';

    h += '<span class="port-dot port-type-list" data-port="list" data-dir="output" data-node="' + nd.id + '"></span>';

    h += '</div></div>';



    // Status

    var count = nd._listInputs.length;

    h += '<div style="padding:2px 8px;font-size:10px;color:var(--text-muted);text-align:center">';

    h += count === 0 ? 'Empty list [ ]' : count + ' item' + (count !== 1 ? 's' : '');

    h += '</div>';



    body.innerHTML = h;



    // Re-attach port event listeners

    el.querySelectorAll('.port-dot').forEach(function(d) {

      d.addEventListener('mousedown', function(e) {

        e.stopPropagation(); e.preventDefault();

        app.onPortDown(e, d.dataset.node, d.dataset.port, d.dataset.dir);

      });

    });

  };



  app.listAddInput = function(nodeId) {

    var nd = app.nodes.find(function(n) { return n.id === nodeId; });

    if (!nd) return;

    if (!nd._listInputs) nd._listInputs = [];

    nd._listInputs.push('item' + nd._listInputs.length);

    var el = document.getElementById(nodeId);

    if (el) app.enhanceListNode(nd, el);

    app.renderWires();

  };



  app.listRemoveInput = function(nodeId, idx) {

    var nd = app.nodes.find(function(n) { return n.id === nodeId; });

    if (!nd || !nd._listInputs || nd._listInputs.length <= 0) return;

    var removed = nd._listInputs.splice(idx, 1)[0];

    app.wires = app.wires.filter(function(w) { return !(w.toNode === nodeId && w.toPort === removed); });

    var el = document.getElementById(nodeId);

    if (el) app.enhanceListNode(nd, el);

    app.renderWires();

  };



  // Override computeNodeValue for list-create to handle dynamic inputs

  var origCompute = app.computeNodeValue.bind(app);

  app.computeNodeValue = function(nd) {

    if (nd.type === 'list-create') {

      var items = [];

      var inputs = nd._listInputs || [];

      for (var i = 0; i < inputs.length; i++) {

        var pid = inputs[i];

        var wire = app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === pid; });

        if (wire) {

          var srcNd = app.nodes.find(function(n) { return n.id === wire.fromNode; });

          if (srcNd) {

            var val = origCompute(srcNd);

            if (val !== undefined) items.push(val);

          }

        }

      }

      return items; // empty array if no inputs connected

    }

    return origCompute(nd);

  };



  // Override generateNodeCode for list-create to handle dynamic inputs

  var origGenCode = app.generateNodeCode.bind(app);

  app.generateNodeCode = function(nd) {

    if (nd.type === 'list-create') {

      var varName = app.varName(nd.id, 'list');

      var inputs = nd._listInputs || [];

      if (inputs.length === 0) {

        return varName + ' = []';

      }

      var items = inputs.map(function(pid) { return app.resolveInput(nd.id, pid); });

      return varName + ' = [' + items.join(', ') + ']';

    }

    return origGenCode(nd);

  };



  // ═══════════════════════════════════════

  // NODE HELP DIALOG

  // Right-click → Help shows metadata

  // ═══════════════════════════════════════



  // Patch showNodeMenu to add Help option

  var origShowNodeMenu = app.showNodeMenu.bind(app);

  app.showNodeMenu = function(id) {

    var nd = app.nodes.find(function(n) { return n.id === id; });

    if (!nd) return;

    var el = document.getElementById(id);

    if (!el) return;

    var r = el.getBoundingClientRect();



    var menuItems = [

      { label: 'Help', icon: '❓', action: function() { app.showNodeHelp(id); } },

      { label: 'View Code', icon: '{ }', action: function() { app.showNodeCode(id); } },

      { label: 'Inspect Data', icon: '🔍', action: function() { app.toggleDataPanel(id); } },

      { label: 'Duplicate', icon: '📋', action: function() { app.duplicateNode(id); } },

      { label: 'Delete', icon: '🗑', action: function() { app.removeNode(id); } }

    ];

    app.showContextMenuAt(r.right + 4, r.top, menuItems);

  };



  app.showNodeHelp = function(nodeId) {

    var nd = app.nodes.find(function(n) { return n.id === nodeId; });

    if (!nd) return;



    // Get metadata

    var meta = (typeof NODE_META !== 'undefined') ? NODE_META[nd.type] : null;

    var def = nd.def;



    // Remove existing help popup

    var existing = document.getElementById('node-help-popup');

    if (existing) existing.remove();



    var popup = document.createElement('div');

    popup.id = 'node-help-popup';

    popup.style.cssText = 'position:fixed;z-index:10000;background:rgba(24,24,37,0.97);backdrop-filter:blur(16px);border:1px solid rgba(137,180,250,0.3);border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.5);max-width:440px;min-width:320px;font-family:var(--font-sans);overflow:hidden;';



    var cc = def.categoryColor || '#89b4fa';

    var h = '';



    // Header

    h += '<div style="padding:12px 16px;border-bottom:1px solid rgba(69,71,90,0.5);display:flex;align-items:center;gap:10px;background:' + cc + '08">';

    h += '<span style="font-size:20px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:' + cc + '15;border-radius:8px;color:' + cc + '">' + (def.icon || '?') + '</span>';

    h += '<div style="flex:1"><div style="font-size:14px;font-weight:700;color:var(--text-primary)">' + def.name + '</div>';

    h += '<div style="font-size:11px;color:var(--text-muted)">' + nd.type + '</div></div>';

    h += '<button onclick="document.getElementById(\'node-help-popup\').remove()" style="width:24px;height:24px;border-radius:6px;background:transparent;color:var(--text-muted);border:none;cursor:pointer;font-size:13px">✕</button>';

    h += '</div>';



    // Body

    h += '<div style="padding:14px 16px;max-height:400px;overflow-y:auto">';



    if (meta) {

      // Description

      h += '<div style="margin-bottom:12px">';

      h += '<div style="font-size:10px;font-weight:600;color:' + cc + ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Description</div>';

      h += '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + meta.description + '</div>';

      h += '</div>';



      // Python usage

      h += '<div style="margin-bottom:12px">';

      h += '<div style="font-size:10px;font-weight:600;color:#a6e3a1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Python</div>';

      h += '<pre style="font-size:11px;font-family:var(--font-mono);color:#a6e3a1;background:rgba(166,227,161,0.06);padding:8px 10px;border-radius:6px;border:1px solid rgba(166,227,161,0.1);margin:0;white-space:pre-wrap">' + meta.python.replace(/</g, '&lt;') + '</pre>';

      h += '</div>';



      // C# usage

      h += '<div style="margin-bottom:12px">';

      h += '<div style="font-size:10px;font-weight:600;color:#89b4fa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">C#</div>';

      h += '<pre style="font-size:11px;font-family:var(--font-mono);color:#89b4fa;background:rgba(137,180,250,0.06);padding:8px 10px;border-radius:6px;border:1px solid rgba(137,180,250,0.1);margin:0;white-space:pre-wrap">' + meta.csharp.replace(/</g, '&lt;') + '</pre>';

      h += '</div>';



      // Example

      h += '<div style="margin-bottom:12px">';

      h += '<div style="font-size:10px;font-weight:600;color:#fab387;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Example</div>';

      h += '<pre style="font-size:11px;font-family:var(--font-mono);color:#fab387;background:rgba(250,179,135,0.06);padding:8px 10px;border-radius:6px;border:1px solid rgba(250,179,135,0.1);margin:0;white-space:pre-wrap">' + meta.example.replace(/</g, '&lt;') + '</pre>';

      h += '</div>';



      // When to use

      h += '<div style="margin-bottom:4px">';

      h += '<div style="font-size:10px;font-weight:600;color:#f5c2e7;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">When to Use</div>';

      h += '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + meta.whenToUse + '</div>';

      h += '</div>';

    } else {

      // No metadata — show basic info

      h += '<div style="font-size:12px;color:var(--text-muted);padding:10px 0">No detailed help available for this node type.</div>';

    }



    // Ports info

    if (def.inputs.length > 0 || def.outputs.length > 0) {

      h += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(69,71,90,0.5)">';

      h += '<div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Ports</div>';

      if (def.inputs.length > 0) {

        h += '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px"><strong>Inputs:</strong> ';

        h += def.inputs.map(function(p) { return '<span style="color:' + (TYPE_COLORS[p.type] || '#a6adc8') + '">' + p.name + '</span> (' + p.type + ')'; }).join(', ');

        h += '</div>';

      }

      if (def.outputs.length > 0) {

        h += '<div style="font-size:11px;color:var(--text-secondary)"><strong>Outputs:</strong> ';

        h += def.outputs.map(function(p) { return '<span style="color:' + (TYPE_COLORS[p.type] || '#a6adc8') + '">' + p.name + '</span> (' + p.type + ')'; }).join(', ');

        h += '</div>';

      }

      h += '</div>';

    }



    h += '</div>';

    popup.innerHTML = h;

    document.body.appendChild(popup);



    // Position near the node

    var nodeEl = document.getElementById(nodeId);

    if (nodeEl) {

      var r = nodeEl.getBoundingClientRect();

      popup.style.left = Math.min(r.right + 8, window.innerWidth - 460) + 'px';

      popup.style.top = Math.max(8, r.top - 20) + 'px';

    } else {

      popup.style.left = Math.round((window.innerWidth - 440) / 2) + 'px';

      popup.style.top = '80px';

    }



    // Close on outside click

    setTimeout(function() {

      document.addEventListener('click', function handler(e) {

        if (!popup.contains(e.target)) {

          popup.remove();

          document.removeEventListener('click', handler);

        }

      });

    }, 100);

  };

});

