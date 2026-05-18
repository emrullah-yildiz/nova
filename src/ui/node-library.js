// ============================================
// NODEFLOW AI — Runtime Behaviors
// Node definitions are in nodes.js (single source of truth)
// This file provides: UI handlers, inspectors, port suggestions,
// codegen overrides, test templates, keyboard shortcuts,
// live 3D updates, wire interaction helpers
// ============================================

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

export function installNodeLibrary(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__nodeLibraryInstalled) return true;
  targetApp.__nodeLibraryInstalled = true;
  var app = targetApp;

  // ═══════════════════════════════════════
  // UI HANDLERS
  // ═══════════════════════════════════════

  // Aliases for backward compat
  app.toggleV2Props = function(nid) { app.toggleProps(nid); };
  app.toggleV2Inspector = function(nid) { app.toggleInspector(nid); };

  // Re-render a node in-place (preserves position, panel states)
  function reRenderV2Node(nd) {
    var el = document.getElementById(nd.id);
    if (el) el.remove();
    app.renderNode(nd);
    app.updatePortDots();
    setTimeout(function() { app.renderWires(); }, 30);
  }

  // Update has-data class on all port dots based on computed values
  function updatePortDataStates() {
    app.nodes.forEach(function(nd) {
      if (!nd.def || !nd.def.inputs || !nd.def.outputs) return;
      var el = document.getElementById(nd.id);
      if (!el) return;
      var controlIds = nd.def.controls ? nd.def.controls.map(function(c) { return c.id; }) : [];
      nd.def.inputs.forEach(function(inp) {
        var dot = el.querySelector('.port-dot[data-port="' + inp.id + '"][data-dir="input"]');
        if (!dot) return;
        var hasWire = app.wires.some(function(w) { return w.toNode === nd.id && w.toPort === inp.id; });
        var hasCtrl = controlIds.indexOf(inp.id) >= 0 && nd.controlValues[inp.id] !== undefined && nd.controlValues[inp.id] !== null && nd.controlValues[inp.id] !== '';
        dot.classList.toggle('has-data', hasWire || hasCtrl);
      });
      var computed = app.computeNodeValue(nd);
      var hasOutput = computed !== undefined && computed !== null;
      nd.def.outputs.forEach(function(out) {
        var dot = el.querySelector('.port-dot[data-port="' + out.id + '"][data-dir="output"]');
        if (!dot) return;
        var portVal = hasOutput;
        if (nd._portValues && nd._portValues[out.id] !== undefined) portVal = true;
        dot.classList.toggle('has-data', portVal);
      });
    });
  }

  // Refresh every open inspector
  function refreshAllOpenInspectors() {
    var inspFn = app._universalInspector || function() { return ''; };
    app.nodes.forEach(function(nd) {
      if (nd._inspOpen || nd.inspectorOpen) {
        var content = document.getElementById(nd.id + '-insp-content');
        if (content) content.innerHTML = inspFn(nd);
      }
    });
  }

  // Formula input handler — evaluates and shows result inline
  app._onFormulaInput = function(nodeId, ctrlId, value, inputEl) {
    var evalDiv = document.getElementById(nodeId + '-feval-' + ctrlId);
    if (evalDiv && typeof FormulaEval !== 'undefined') {
      var fe = FormulaEval.eval(value);
      if (fe.isFormula && !fe.error) {
        evalDiv.textContent = '= ' + fe.value.toFixed(4).replace(/\.?0+$/, '');
        evalDiv.style.color = 'var(--accent-green)';
      } else if (fe.error) {
        evalDiv.textContent = '⚠ ' + fe.error;
        evalDiv.style.color = 'var(--accent-red)';
      } else {
        evalDiv.textContent = '';
      }
    }
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    if (nd && typeof FormulaEval !== 'undefined') {
      nd.controlValues['_eval_' + ctrlId] = FormulaEval.eval(value).value;
    }
    this.onV2Ctrl(nodeId, ctrlId, value);
  };

  // Custom spin button handler
  app._spinV2 = function(nodeId, ctrlId, delta, btnEl) {
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    if (!nd) return;
    var cur = parseFloat(nd.controlValues[ctrlId]) || 0;
    var newVal = Math.round((cur + delta) * 1000) / 1000;
    nd.controlValues[ctrlId] = newVal;
    var wrap = btnEl.closest('.num-spin-wrap');
    if (wrap) { var inp = wrap.querySelector('.prop-input'); if (inp) inp.value = newVal; }
    this.onV2Ctrl(nodeId, ctrlId, String(newVal));
  };

  app.onV2Ctrl = function(nodeId, ctrlId, value) {
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    if (!nd) return;
    nd.controlValues[ctrlId] = value;
    var wireIdx = this.wires.findIndex(function(w) { return w.toNode === nodeId && w.toPort === ctrlId; });
    if (wireIdx >= 0) { this.wires.splice(wireIdx, 1); this.updatePortDots(); this.renderWires(); }
    var ctrl = nd.def.controls ? nd.def.controls.find(function(c) { return c.id === ctrlId; }) : null;
    if (ctrl && ctrl.type === 'formula' && typeof FormulaEval !== 'undefined') {
      nd.controlValues['_eval_' + ctrlId] = FormulaEval.eval(value).value;
    } else { delete nd.controlValues['_eval_' + ctrlId]; }
    if (this.invalidateCompute) this.invalidateCompute();
    if (typeof Viewer3D !== 'undefined') Viewer3D._needsRebuild = true;
    refreshAllOpenInspectors();
    updatePortDataStates();
    scheduleLive3DUpdate();
  };

  // ═══════════════════════════════════════
  // LIVE 3D UPDATE
  // ═══════════════════════════════════════
  var _liveUpdateTimer = null;
  function scheduleLive3DUpdate() {
    if (_liveUpdateTimer) clearTimeout(_liveUpdateTimer);
    _liveUpdateTimer = setTimeout(function() { _liveUpdateTimer = null; live3DUpdate(); }, 150);
  }

  function live3DUpdate() {
    if (typeof Viewer3D === 'undefined' || !Viewer3D.isInitialized || !Viewer3D.geometryGroup) return;
    while (Viewer3D.geometryGroup.children.length > 0) Viewer3D.geometryGroup.remove(Viewer3D.geometryGroup.children[0]);
    app.beginCompute();
    var rendered = 0;
    app.nodes.forEach(function(nd) {
      var val = app.computeNodeValue(nd);
      if (nd._preview3d === false) return;
      if (val && val._type) { Geo.addToScene(Viewer3D.geometryGroup, val); rendered++; }
      else if (Array.isArray(val)) { val.forEach(function(v) { if (v && (v._type || v instanceof Geo.Point3)) { Geo.addToScene(Viewer3D.geometryGroup, v); rendered++; } }); }
      if (nd._portValues) { Object.keys(nd._portValues).forEach(function(key) { var pv = nd._portValues[key]; if (pv && pv._type) { Geo.addToScene(Viewer3D.geometryGroup, pv); rendered++; } }); }
    });
    app.endCompute();
    if (rendered > 0 && Viewer3D._lastLiveCount === 0) Viewer3D.fitAll();
    Viewer3D._lastLiveCount = rendered;
  }
  if (typeof Viewer3D !== 'undefined') Viewer3D._lastLiveCount = 0;

  // ═══════════════════════════════════════
  // CODE GENERATION OVERRIDE
  // ═══════════════════════════════════════
  var origGenNodeCode = app.generateNodeCode.bind(app);
  app.generateNodeCode = function(nd) {
    if (!nd.def || !nd.def.codegen) return origGenNodeCode(nd);
    var cg = nd.def.codegen;
    if (!cg) return '# No codegen';
    var template = cg[this.codeLang] || cg.python || '';
    nd.def.outputs.forEach(function(out) { template = template.split('{{' + out.id + '}}').join(app.varName(nd.id, out.id)); });
    nd.def.inputs.forEach(function(inp) {
      var wire = app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === inp.id; });
      var resolved;
      if (wire) { resolved = app.varName(wire.fromNode, wire.fromPort); }
      else {
        var ctrl = nd.def.controls.find(function(c) { return c.id === inp.id; });
        if (ctrl) {
          var val = nd.controlValues[ctrl.id];
          if (val !== undefined && val !== null) {
            if (typeof FormulaEval !== 'undefined' && typeof val === 'string') { resolved = String(FormulaEval.eval(val).value); }
            else { resolved = String(val); }
          } else { resolved = String(ctrl.default); }
        } else { resolved = '0'; }
      }
      template = template.split('{{' + inp.id + '}}').join(resolved);
    });
    return template;
  };

  // ═══════════════════════════════════════
  // PARSER PATCH — Geo.Point3 → point-bycoordinates
  // ═══════════════════════════════════════
  if (typeof CodeParser !== 'undefined' && CodeParser.analyzeExpr) {
    var origAnalyzeExpr = CodeParser.analyzeExpr.bind(CodeParser);
    CodeParser.analyzeExpr = function(expr) {
      expr = expr.trim();
      var m = expr.match(/^Geo\.Point3\((.*)??\)$/);
      if (m) {
        var args = this.splitArgs(m[1] || '');
        return { type: 'point-bycoordinates', inputs: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0' }, controls: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0' } };
      }
      return origAnalyzeExpr(expr);
    };
  }

  // ═══════════════════════════════════════
  // LIVE REFRESH — wire changes + ctrl changes
  // ═══════════════════════════════════════
  var origAddWire = app.addWire.bind(app);
  app.addWire = function(fn, fp, tn, tp) {
    origAddWire(fn, fp, tn, tp);
    setTimeout(function() { refreshAllOpenInspectors(); updatePortDataStates(); }, 50);
    scheduleLive3DUpdate();
  };

  var origOnCtrl = app.onCtrl ? app.onCtrl.bind(app) : null;
  if (origOnCtrl) {
    app.onCtrl = function(nid, cid, val) {
      origOnCtrl(nid, cid, val);
      if (this.invalidateCompute) this.invalidateCompute();
      refreshAllOpenInspectors();
      updatePortDataStates();
      scheduleLive3DUpdate();
    };
  }

  // ═══════════════════════════════════════
  // PORT INTERACTION STATE
  // ═══════════════════════════════════════
  app._wireIsNewConnection = false;
  app._wireSourceType = 'any';
  app._wireSourceDir = 'output';
  app._wireSourceNode = null;
  app._wireSourcePort = null;

  // ═══════════════════════════════════════
  // SMART PORT SUGGESTIONS
  // ═══════════════════════════════════════
  function buildOutputTypeMap() {
    var map = {};
    NODE_LIBRARY.categories.forEach(function(cat) {
      cat.nodes.forEach(function(node) {
        (node.outputs || []).forEach(function(out) {
          var t = out.type || 'any';
          if (!map[t]) map[t] = [];
          map[t].push({ nodeType: node.type, name: node.name, icon: node.icon, color: cat.color, outputPort: out.id });
        });
      });
    });
    return map;
  }
  var _outputTypeMap = null;
  function getOutputTypeMap() { if (!_outputTypeMap) _outputTypeMap = buildOutputTypeMap(); return _outputTypeMap; }

  function getInputSuggestions(portType) {
    var results = [], seen = {};
    NODE_LIBRARY.categories.forEach(function(cat) {
      cat.nodes.forEach(function(node) {
        (node.inputs || []).forEach(function(inp) {
          var t = inp.type || 'any';
          if ((t === portType || t === 'any' || portType === 'any') && !seen[node.type]) {
            results.push({ nodeType: node.type, name: node.name, icon: node.icon, color: cat.color, inputPort: inp.id, outputPort: inp.id });
            seen[node.type] = true;
          }
        });
      });
    });
    return results.slice(0, 6);
  }

  function getSuggestions(portType) {
    var map = getOutputTypeMap(), results = [], seen = {};
    if (map[portType]) map[portType].forEach(function(s) { if (!seen[s.nodeType]) { results.push(s); seen[s.nodeType] = true; } });
    if (map['any'] && portType !== 'any') map['any'].forEach(function(s) { if (!seen[s.nodeType]) { results.push(s); seen[s.nodeType] = true; } });
    if (portType === 'number') {
      ['number-input', 'integer-input', 'slider-input'].forEach(function(nt) {
        if (!seen[nt] && NODE_TYPE_MAP[nt]) { var def = NODE_TYPE_MAP[nt]; results.unshift({ nodeType: nt, name: def.name, icon: def.icon, color: def.categoryColor, outputPort: 'value' }); seen[nt] = true; }
      });
    }
    return results.slice(0, 6);
  }

  app._showPortSuggest = function(e, nid, pid, portType, portDir) { showPortSuggest(e, nid, pid, portType, portDir || 'input'); };
  window.showPortSuggest = showPortSuggest;

  function showPortSuggest(e, nid, pid, portType, portDir) {
    closePortSuggest();
    var suggestions = portDir === 'output' ? getInputSuggestions(portType) : getSuggestions(portType);
    var nd = app.nodes.find(function(n) { return n.id === nid; });
    var nodeName = nd ? nd.def.name : '?';
    var portName = '';
    if (nd) { var ports = portDir === 'output' ? nd.def.outputs : nd.def.inputs; var port = ports.find(function(p) { return p.id === pid; }); if (port) portName = port.name; }
    var dirLabel = portDir === 'output' ? (nodeName + '.' + portName + ' →') : ('→ ' + nodeName + '.' + portName);
    var popup = document.createElement('div'); popup.className = 'port-suggest'; popup.id = 'port-suggest-popup';
    var h = '<div class="port-suggest-header">' + dirLabel + '</div>';
    h += '<div id="port-suggest-ai" style="padding:4px 10px 2px;border-bottom:1px solid var(--border-color);margin-bottom:2px"><div style="display:flex;align-items:center;gap:6px;padding:2px 0 4px"><span style="font-size:9px;color:var(--accent-purple)">✦ AI</span><span id="port-suggest-ai-status" style="font-size:9px;color:var(--text-muted)">thinking…</span></div></div>';
    if (suggestions.length > 0) {
      h += '<div class="port-suggest-header" style="font-size:8px;opacity:0.6;border:none;margin:0;padding:3px 10px 2px">BY TYPE</div>';
      suggestions.forEach(function(s) { h += '<button class="port-suggest-item" data-ntype="' + s.nodeType + '" data-oport="' + s.outputPort + '"><span class="port-suggest-icon" style="background:' + s.color + '20;color:' + s.color + '">' + s.icon + '</span><span class="port-suggest-name">' + s.name + '</span><span class="port-suggest-type">' + s.outputPort + '</span></button>'; });
    }
    popup.innerHTML = h;
    popup.style.left = (e.clientX || 100) + 'px'; popup.style.top = (e.clientY || 100) + 'px';
    document.body.appendChild(popup);
    var pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth - 10) popup.style.left = (window.innerWidth - pr.width - 10) + 'px';
    if (pr.bottom > window.innerHeight - 10) popup.style.top = (window.innerHeight - pr.height - 10) + 'px';
    popup.querySelectorAll('.port-suggest-item').forEach(function(btn) {
      btn.addEventListener('click', function() { createAndWireDir(btn.getAttribute('data-ntype'), btn.getAttribute('data-oport'), nid, pid, portDir); closePortSuggest(); });
    });
    setTimeout(function() { document.addEventListener('mousedown', _closeSuggestHandler); }, 50);

    // AI suggestion request
    if (typeof GPTClient !== 'undefined' && GPTClient && GPTClient.hasApiKey()) {
      var graphDesc = app.nodes.map(function(n) { return n.def.name + '(' + n.id + ')'; }).join(', ');
      var wireDesc = app.wires.map(function(w) { return w.fromNode + '.' + w.fromPort + ' → ' + w.toNode + '.' + w.toPort; }).join('; ');
      var allNodeNames = [];
      NODE_LIBRARY.categories.forEach(function(cat) { cat.nodes.forEach(function(n) { allNodeNames.push(n.name + ' [outputs: ' + n.outputs.map(function(o){return o.name+'('+o.type+')';}).join(',') + ']'); }); });
      var prompt = 'I have a node graph with: ' + graphDesc + '. Wires: ' + wireDesc + '. I need to connect something to the "' + portName + '" input (type: ' + portType + ') on node "' + nodeName + '".\n\nAvailable nodes:\n' + allNodeNames.join('\n') + '\n\nSuggest the top 3 most useful nodes to connect here. Reply ONLY as a JSON array of objects: [{"name":"ExactNodeName","reason":"brief why"}]. No explanation, just JSON.';
      GPTClient.call(prompt, 'workspace', '').then(function(reply) {
        var aiSection = document.getElementById('port-suggest-ai'); if (!aiSection) return;
        try {
          var jsonMatch = reply.match(/\[[\s\S]*\]/); if (!jsonMatch) throw new Error('no json');
          var aiSuggestions = JSON.parse(jsonMatch[0]);
          var aiH = '<div style="display:flex;align-items:center;gap:6px;padding:2px 0 2px"><span style="font-size:9px;color:var(--accent-purple)">✦ AI suggests</span></div>';
          aiSuggestions.forEach(function(s) {
            var found = null;
            NODE_LIBRARY.categories.forEach(function(cat) { cat.nodes.forEach(function(n) { if (n.name === s.name || n.name.toLowerCase() === s.name.toLowerCase()) found = { nodeType: n.type, name: n.name, icon: n.icon, color: cat.color, outputPort: n.outputs.length > 0 ? n.outputs[0].id : 'value', reason: s.reason }; }); });
            if (found) aiH += '<button class="port-suggest-item" data-ntype="' + found.nodeType + '" data-oport="' + found.outputPort + '" title="' + (found.reason||'') + '"><span class="port-suggest-icon" style="background:' + found.color + '20;color:' + found.color + '">✦</span><span class="port-suggest-name">' + found.name + '</span><span class="port-suggest-type" style="color:var(--accent-purple)">' + found.outputPort + '</span></button>';
          });
          aiSection.innerHTML = aiH;
          aiSection.querySelectorAll('.port-suggest-item').forEach(function(btn) { btn.addEventListener('click', function() { createAndWireDir(btn.getAttribute('data-ntype'), btn.getAttribute('data-oport'), nid, pid, portDir); closePortSuggest(); }); });
        } catch(err) { var status = document.getElementById('port-suggest-ai-status'); if (status) status.textContent = 'no suggestions'; }
      }).catch(function() { var status = document.getElementById('port-suggest-ai-status'); if (status) status.textContent = 'offline'; });
    } else {
      var aiSection = document.getElementById('port-suggest-ai'); if (aiSection) aiSection.style.display = 'none';
    }
  }

  function _closeSuggestHandler(e) { var popup = document.getElementById('port-suggest-popup'); if (popup && !popup.contains(e.target)) closePortSuggest(); }
  function closePortSuggest() { var popup = document.getElementById('port-suggest-popup'); if (popup) popup.remove(); document.removeEventListener('mousedown', _closeSuggestHandler); }

  function createAndWireDir(nodeType, linkPort, nodeId, portId, portDir) {
    if (portDir === 'output') {
      var srcNd = app.nodes.find(function(n) { return n.id === nodeId; }); if (!srcNd) return;
      var newNd = app.addNodeToCanvas(nodeType, srcNd.x + 280, srcNd.y);
      if (newNd) { app.addWire(nodeId, portId, newNd.id, linkPort); app.updatePortDots(); setTimeout(function() { app.renderWires(); }, 50); }
    } else { createAndWire(nodeType, linkPort, nodeId, portId); }
  }

  function createAndWire(nodeType, outputPort, targetNodeId, targetPortId) {
    var targetNd = app.nodes.find(function(n) { return n.id === targetNodeId; }); if (!targetNd) return;
    var newX = targetNd.x - 260, newY = targetNd.y;
    var targetEl = document.getElementById(targetNodeId);
    if (targetEl) { var portDot = targetEl.querySelector('.port-dot[data-port="' + targetPortId + '"][data-dir="input"]'); if (portDot) { var nodeRect = targetEl.getBoundingClientRect(); var portRect = portDot.getBoundingClientRect(); newY = targetNd.y + (portRect.top - nodeRect.top) - 40; } }
    var newNd = app.addNodeToCanvas(nodeType, newX, newY);
    if (newNd) { app.addWire(newNd.id, outputPort, targetNodeId, targetPortId); app.updatePortDots(); setTimeout(function() { app.renderWires(); }, 50); }
  }

  // Refresh library sidebar after all scripts loaded
  setTimeout(function() { if (app.renderNodeLibrary) app.renderNodeLibrary(); _outputTypeMap = null; }, 300);

  // ═══════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════
  document.addEventListener('keydown', function(e) {
    if (app.currentPage !== 'workspace') return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(e.target.tagName) >= 0) return;
    var key = e.key.toLowerCase();
    if (key === 'p' || key === 'd') {
      var selIds = (app.selectedNodes && app.selectedNodes.length > 0) ? app.selectedNodes : app.nodes.map(function(n) { return n.id; });
      if (selIds.length === 0) return;
      e.preventDefault();
      selIds.forEach(function(nid) { var nd = app.nodes.find(function(n) { return n.id === nid; }); if (!nd) return; if (key === 'p') app.toggleProps(nid); else app.toggleInspector(nid); });
    }
    if (key === 'l' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (app.autoLayout) app.autoLayout(); }
  });

  // ═══════════════════════════════════════
  // TEST TEMPLATES
  // ═══════════════════════════════════════
  app._testMathNodes = function() {
    this.newProject();
    var tests = [
      ['math-add',[['a',25],['b',17]],'42'],['math-subtract',[['a',100],['b',37]],'63'],['math-multiply',[['a',6],['b',7]],'42'],['math-divide',[['a',355],['b',113]],'≈3.14'],
      ['math-power',[['base',2],['exp',10]],'1024'],['math-modulo',[['a',17],['b',5]],'2'],['math-negate',[['a',-42]],'42'],['math-abs',[['a',-3.7]],'3.7'],
      ['math-reciprocal',[['a',4]],'0.25'],['math-remap',[['value',0.5]],'50'],['math-floor',[['a',3.7]],'3'],['math-ceil',[['a',3.2]],'4'],
      ['math-round',[['a',3.14159]],'3'],['math-min',[['a',10],['b',3]],'3'],['math-max',[['a',10],['b',3]],'10'],['math-clamp',[['value',1.5]],'1']
    ];
    var created = [], self = this;
    tests.forEach(function(test, row) {
      var mathNd = self.addNodeToCanvas(test[0], 280, 60 + row * 200); if (!mathNd) return; created.push(mathNd);
      test[1].forEach(function(inp, j) {
        var numNd = self.addNodeToCanvas('number-input', -j * 20, 60 + row * 200 + j * 80);
        if (numNd) { numNd.controlValues.val = inp[1]; var el = document.getElementById(numNd.id); if (el) { var ni = el.querySelector('.node-control input[type="number"]'); if (ni) ni.value = inp[1]; } self.addWire(numNd.id, 'value', mathNd.id, inp[0]); created.push(numNd); }
      });
    });
    self.updatePortDots(); updatePortDataStates(); setTimeout(function() { self.renderWires(); }, 100);
    if (self.autoLayout) setTimeout(function() { self.autoLayout(); }, 200);
    self.addAIMessage('workspace', '🧪 **Math Node Test** — ' + tests.length + ' nodes created.\n\n**Shortcuts:** **P** = Properties, **D** = Data Inspector, **L** = Auto Layout');
    return created.length + ' nodes created';
  };

  app._testLogicNodes = function() {
    this.newProject();
    var self = this;
    var tests = [['logic-and',[['a',1],['b',1]],{}],['logic-or',[['a',0],['b',1]],{}],['logic-not',[['value',1]],{}],['logic-xor',[['a',1],['b',0]],{}],['logic-compare',[['a',10],['b',5]],{op:'>'}],['logic-if',[['condition',1],['ifTrue',42],['ifFalse',0]],{}],['logic-isnull',[['value',0]],{}],['logic-gate',[['value',99],['pass',1]],{}]];
    var created = [];
    tests.forEach(function(test, row) {
      var logicNd = self.addNodeToCanvas(test[0], 320, 60 + row * 200); if (!logicNd) return; created.push(logicNd);
      var extras = test[2] || {}; Object.keys(extras).forEach(function(k) { logicNd.controlValues[k] = extras[k]; });
      test[1].forEach(function(inp, j) {
        var numNd = self.addNodeToCanvas('number-input', 40, 60 + row * 200 + j * 80);
        if (numNd) { numNd.controlValues.val = inp[1]; self.addWire(numNd.id, 'value', logicNd.id, inp[0]); created.push(numNd); }
      });
      var watchNd = self.addNodeToCanvas('output-watch', 600, 60 + row * 200);
      if (watchNd && logicNd) { self.addWire(logicNd.id, logicNd.def.outputs[0] ? logicNd.def.outputs[0].id : 'result', watchNd.id, 'value'); created.push(watchNd); }
    });
    self.updatePortDots(); updatePortDataStates(); setTimeout(function() { self.renderWires(); }, 100);
    self.addAIMessage('workspace', '🧪 **Logic Test!** Created ' + tests.length + ' logic nodes.\n\n**Shortcuts:** **P** = Properties, **D** = Inspector, **L** = Auto Layout');
    return created.length + ' nodes created';
  };

  app._testListNodes = function() {
    this.newProject();
    var self = this, created = [], row = 0;
    function mkNum(x, y, val) { var nd = self.addNodeToCanvas('number-input', x, y); if (nd) { nd.controlValues.val = val; created.push(nd); } return nd; }
    function mkRange(x, y, s, e, st) {
      var rNd = self.addNodeToCanvas('list-range', x, y); if (!rNd) return null;
      var n1 = mkNum(x-260, y, s), n2 = mkNum(x-260, y+60, e), n3 = mkNum(x-260, y+120, st);
      if (n1) self.addWire(n1.id, 'value', rNd.id, 'start'); if (n2) self.addWire(n2.id, 'value', rNd.id, 'end'); if (n3) self.addWire(n3.id, 'value', rNd.id, 'step');
      created.push(rNd); return rNd;
    }
    var rangeA = mkRange(60, 60, 0, 10, 1), rangeB = mkRange(60, 300, 10, 40, 10);
    var nodes = ['list-first','list-last','list-take','list-skip','list-slice','list-sort','list-shuffle','list-unique','list-reverse','list-count','list-sum','list-average','list-minval','list-maxval','list-chunk','list-pairs'];
    nodes.forEach(function(type) {
      var nd = self.addNodeToCanvas(type, 400, 60 + row * 260);
      if (nd && rangeA) { self.addWire(rangeA.id, 'list', nd.id, 'list'); created.push(nd); } row++;
    });
    self.updatePortDots(); updatePortDataStates(); setTimeout(function() { self.renderWires(); }, 100);
    self.addAIMessage('workspace', '🧪 **List Test!** ' + created.length + ' nodes created.\n\n**Shortcuts:** **P** = Properties, **D** = Inspector, **L** = Auto Layout');
    return created.length + ' nodes created';
  };

  // ═══════════════════════════════════════
  // SURFACE TEST TEMPLATE
  // ═══════════════════════════════════════
  app._testSurfaceNodes = function() {
    this.newProject();
    var self = this, created = [], row = 0, rowH = 280;
    var srcCol = 60, nodeCol = 400;

    function mkNum(x, y, val) { var nd = self.addNodeToCanvas('number-input', x, y); if (nd) { nd.controlValues.val = val; created.push(nd); } return nd; }
    function mkPt(x, y, px, py, pz) {
      var nd = self.addNodeToCanvas('point-bycoordinates', x, y);
      if (nd) { nd.controlValues.x = px; nd.controlValues.y = py; nd.controlValues.z = pz; created.push(nd); }
      return nd;
    }

    // ── 1. Surface.Plane — origin + normal ──
    var planeY = 60 + row * rowH;
    var planeOrigin = mkPt(srcCol, planeY, 0, 0, 0);
    var planeNd = self.addNodeToCanvas('surf-plane', nodeCol, planeY);
    if (planeNd && planeOrigin) { self.addWire(planeOrigin.id, 'point', planeNd.id, 'origin'); created.push(planeNd); }
    row++;

    // ── 2. Surface.ByPointGrid — 5×5 grid of points ──
    var gridY = 60 + row * rowH;
    var gridOrigin = mkPt(srcCol - 200, gridY, 0, 0, 0);
    var gridNode = self.addNodeToCanvas('op-point-grid', srcCol, gridY);
    if (gridNode && gridOrigin) {
      self.addWire(gridOrigin.id, 'point', gridNode.id, 'origin');
      var uNum = mkNum(srcCol - 200, gridY + 80, 5);
      var vNum = mkNum(srcCol - 200, gridY + 140, 5);
      var spNum = mkNum(srcCol - 200, gridY + 200, 2);
      if (uNum) self.addWire(uNum.id, 'value', gridNode.id, 'uCount');
      if (vNum) self.addWire(vNum.id, 'value', gridNode.id, 'vCount');
      if (spNum) self.addWire(spNum.id, 'value', gridNode.id, 'spacing');
      created.push(gridNode);
    }
    var surfGridNd = self.addNodeToCanvas('surf-from-grid', nodeCol, gridY);
    if (surfGridNd && gridNode) {
      self.addWire(gridNode.id, 'points', surfGridNd.id, 'points');
      var uCnt = mkNum(nodeCol - 100, gridY + 80, 5);
      var vCnt = mkNum(nodeCol - 100, gridY + 140, 5);
      if (uCnt) self.addWire(uCnt.id, 'value', surfGridNd.id, 'uCount');
      if (vCnt) self.addWire(vCnt.id, 'value', surfGridNd.id, 'vCount');
      created.push(surfGridNd);
    }
    row++;

    // ── 3. Surface.ByRuledLoft — two lines as curves ──
    var ruledY = 60 + row * rowH;
    var pt1 = mkPt(srcCol - 200, ruledY, 0, 0, 0);
    var pt2 = mkPt(srcCol - 200, ruledY + 60, 10, 0, 0);
    var pt3 = mkPt(srcCol - 200, ruledY + 120, 0, 10, 5);
    var pt4 = mkPt(srcCol - 200, ruledY + 180, 10, 10, 5);
    var line1 = self.addNodeToCanvas('line-bystartpointendpoint', srcCol, ruledY);
    var line2 = self.addNodeToCanvas('line-bystartpointendpoint', srcCol, ruledY + 120);
    if (line1 && pt1 && pt2) { self.addWire(pt1.id, 'point', line1.id, 'startPoint'); self.addWire(pt2.id, 'point', line1.id, 'endPoint'); created.push(line1); }
    if (line2 && pt3 && pt4) { self.addWire(pt3.id, 'point', line2.id, 'startPoint'); self.addWire(pt4.id, 'point', line2.id, 'endPoint'); created.push(line2); }
    var ruledNd = self.addNodeToCanvas('op-ruled-surface', nodeCol, ruledY + 60);
    if (ruledNd && line1 && line2) { self.addWire(line1.id, 'line', ruledNd.id, 'curve1'); self.addWire(line2.id, 'line', ruledNd.id, 'curve2'); created.push(ruledNd); }
    row++;

    // ── 4. Surface.Isolines — from the grid surface ──
    var isoY = 60 + row * rowH;
    var isoNd = self.addNodeToCanvas('op-isolines', nodeCol, isoY);
    if (isoNd && surfGridNd) {
      self.addWire(surfGridNd.id, 'surface', isoNd.id, 'mesh');
      var isoCnt = mkNum(nodeCol - 100, isoY + 60, 8);
      if (isoCnt) self.addWire(isoCnt.id, 'value', isoNd.id, 'count');
      created.push(isoNd);
    }
    row++;

    // ── 5. Surface.ByNURBS — 3×3 control grid ──
    var nurbsY = 60 + row * rowH;
    var nurbsNd = self.addNodeToCanvas('nurbs-surface', nodeCol, nurbsY);
    if (nurbsNd) {
      var degU = mkNum(nodeCol - 100, nurbsY + 60, 2);
      var degV = mkNum(nodeCol - 100, nurbsY + 120, 2);
      if (degU) self.addWire(degU.id, 'value', nurbsNd.id, 'degU');
      if (degV) self.addWire(degV.id, 'value', nurbsNd.id, 'degV');
      created.push(nurbsNd);
    }
    row++;

    self.updatePortDots();
    setTimeout(function() { self.renderWires(); }, 100);
    if (self.autoLayout) setTimeout(function() { self.autoLayout(); }, 200);
    self.addAIMessage('workspace', '🧪 **Surface Test!** ' + created.length + ' nodes created.\n\n• **Surface.Plane** — origin + normal\n• **Surface.ByPointGrid** — 5×5 point grid → surface\n• **Surface.ByRuledLoft** — two lines → ruled surface\n• **Surface.Isolines** — extract U isolines from grid surface\n• **Surface.ByNURBS** — NURBS surface from control grid\n\n**Shortcuts:** **P** = Properties, **D** = Inspector, **L** = Auto Layout');
    return created.length + ' nodes created';
  };

  // Landing page template cards
  var origRenderTemplates = app.renderTemplates ? app.renderTemplates.bind(app) : null;
  app.renderTemplates = function() {
    if (origRenderTemplates) origRenderTemplates();
    var grid = document.getElementById('templates-grid'); if (!grid) return;
    var templates = [
      { fn: '_testMathNodes', color: 'var(--accent-green)', icon: 'Σ', name: 'Math Nodes Test', desc: 'All 16 math nodes with formulas' },
      { fn: '_testLogicNodes', color: 'var(--accent-red)', icon: '⊻', name: 'Logic Nodes Test', desc: 'AND, OR, XOR, Compare, If, Gate' },
      { fn: '_testListNodes', color: 'var(--accent-peach)', icon: '☰', name: 'List Nodes Test', desc: '16 list operations with Range source' },
      { fn: '_testSurfaceNodes', color: 'var(--accent-teal)', icon: '◇', name: 'Surface Nodes Test', desc: 'All 5 surface nodes with geometry' }
    ];
    templates.forEach(function(t) {
      var card = document.createElement('div'); card.className = 'template-card'; card.style.setProperty('--card-accent', t.color);
      card.onclick = function() { app[t.fn](); };
      card.innerHTML = '<div class="template-icon" style="background:' + t.color + '22;color:' + t.color + '">' + t.icon + '</div><h4>' + t.name + '</h4><p>' + t.desc + '</p>';
      grid.appendChild(card);
    });
  };
  if (app.currentPage === 'landing') setTimeout(function() { app.renderTemplates(); }, 400);

  if (typeof NFLogger !== 'undefined') NFLogger.info('node-lib', 'Runtime behaviors loaded');
  console.log('[NodeFlow] Runtime behaviors loaded (node-library.js)');

  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    installNodeLibrary();
  });
}

export default installNodeLibrary;
