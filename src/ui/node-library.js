// ============================================
// NODEFLOW AI — Runtime Behaviors
// Node definitions are in nodes.js (single source of truth)
// This file provides: UI handlers, inspectors, port suggestions,
// codegen overrides, test templates, keyboard shortcuts,
// live 3D updates, wire interaction helpers
// ============================================

import { wrapPythonNodeCode } from '../runtime/python-port-decl.js';
import { desugarSeries } from '../runtime/codeblock-syntax.js';
import { buildNoGeometryGraph, buildGeometryGraph } from '../app/stress-graphs.js';
import { visibleCategories } from '../core/nodes.js';

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
        dot.classList.toggle('has-data', !!app._hasRun && (hasWire || hasCtrl));
      });
      var computed = app.getLastRunNodeValue ? app.getLastRunNodeValue(nd) : undefined;
      var hasOutput = computed !== undefined && computed !== null;
      nd.def.outputs.forEach(function(out) {
        var dot = el.querySelector('.port-dot[data-port="' + out.id + '"][data-dir="output"]');
        if (!dot) return;
        var portVal = hasOutput;
        if (nd._lastRunPortValues && nd._lastRunPortValues[out.id] !== undefined) portVal = true;
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
    if (app._manualRunMode && !app._hasRun) return;
    if (app._manualRunMode && app._graphDirty) return;
    while (Viewer3D.geometryGroup.children.length > 0) Viewer3D.geometryGroup.remove(Viewer3D.geometryGroup.children[0]);
    app.beginCompute();
    var rendered = 0;
    app.nodes.forEach(function(nd) {
      var val = app.computeNodeValue(nd);
      if (nd._preview3d === false) return;
      if (val && val._type) { Geo.addToScene(Viewer3D.geometryGroup, val); rendered++; }
      else if (Array.isArray(val)) { val.forEach(function(v) { if (v && (v._type || v instanceof Geo.Point3)) { Geo.addToScene(Viewer3D.geometryGroup, v); rendered++; } }); }
      if (nd._lastRunPortValues) { Object.keys(nd._lastRunPortValues).forEach(function(key) { var pv = nd._lastRunPortValues[key]; if (pv && pv._type) { Geo.addToScene(Viewer3D.geometryGroup, pv); rendered++; } }); }
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

    // Custom.Python: the cell reads its inputs and assigns its outputs as bare
    // variables, and those names are the node's LIVE ports (_dynInputs /
    // _dynOutputs) after a rename or `# in:`/`# out:` header edit — NOT the
    // static def ports. Generating off the def would feed the cell variables it
    // never reads. Bind each wired input to the cell's input variable, and
    // export each output under its canonical downstream name, using the live
    // ports so codegen stays in sync with what the node actually renders/runs.
    // Custom.CodeBlock (v2): emit the DESUGARED code (G-1) so the series shorthand
    // becomes a valid Python list literal — not the raw `0..10` or `{{ctrl.code}}`.
    // This is the live codegen path (overrides app.generateNodeCode); the same
    // short-circuit lives in app.js for the base path. v1 (legacy JS) falls through
    // to the def template below.
    if ((nd.type === 'Custom.CodeBlock' || nd.type === 'custom-codeblock') && nd.version !== 1 && nd.controlValues.code) {
      try { return desugarSeries(nd.controlValues.code); } catch (e) { return nd.controlValues.code; }
    }

    if ((nd.type === 'Custom.Python' || nd.type === 'custom-python') && this.codeLang === 'python') {
      var liveIn = (nd._dynInputs && nd._dynInputs.length) ? nd._dynInputs : nd.def.inputs.map(function(i) { return i.id; });
      var liveOut = (nd._dynOutputs && nd._dynOutputs.length) ? nd._dynOutputs : nd.def.outputs.map(function(o) { return o.id; });
      var inputBindings = liveIn.map(function(id) {
        var wire = app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === id; });
        return { name: id, source: wire ? app.varName(wire.fromNode, wire.fromPort) : null };
      });
      var outputBindings = liveOut.map(function(id) { return { name: id, alias: app.varName(nd.id, id) }; });
      return wrapPythonNodeCode(nd.controlValues.code || '', { inputBindings: inputBindings, outputBindings: outputBindings });
    }

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
    // Port suggestions are a discovery surface — don't suggest hidden-category
    // (Host, Rhino) nodes. Their nodes still register/resolve for saved graphs.
    visibleCategories().forEach(function(cat) {
      cat.nodes.forEach(function(node) {
        if (node.metadata && node.metadata.deprecated) return; // G-2b: hide deprecated
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
    // Discovery surface — exclude hidden-category (Host, Rhino) nodes.
    visibleCategories().forEach(function(cat) {
      cat.nodes.forEach(function(node) {
        if (node.metadata && node.metadata.deprecated) return; // G-2b: hide deprecated
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
      // Suggestion candidates fed to the AI are a discovery surface — skip hidden
      // categories and deprecated nodes (G-2b: Custom.Formula must not be suggested).
      visibleCategories().forEach(function(cat) { cat.nodes.forEach(function(n) { if (n.metadata && n.metadata.deprecated) return; allNodeNames.push(n.name + ' [outputs: ' + n.outputs.map(function(o){return o.name+'('+o.type+')';}).join(',') + ']'); }); });
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

  app.copySelectedNodes = function() {
    var selected = (this.selectedNodes || []).map(function(id) {
      return app.nodes.find(function(n) { return n.id === id; });
    }).filter(Boolean);
    if (!selected.length) return false;
    var selectedIds = selected.map(function(nd) { return nd.id; });
    this._nodeClipboard = {
      pasteCount: 0,
      ids: selectedIds,
      nodes: selected.map(function(nd) {
        return {
          type: nd.type,
          x: nd.x,
          y: nd.y,
          def: JSON.parse(JSON.stringify(nd.def)),
          controlValues: JSON.parse(JSON.stringify(nd.controlValues || {})),
          dataPanelOpen: !!nd.dataPanelOpen,
          propsPanelOpen: !!nd.propsPanelOpen,
          inspectorOpen: !!nd.inspectorOpen
        };
      }),
      wires: (this.wires || []).filter(function(w) {
        return selectedIds.indexOf(w.toNode) >= 0;
      }).map(function(w) {
        return {
          fromNode: w.fromNode,
          fromPort: w.fromPort,
          toNode: w.toNode,
          toPort: w.toPort,
          toCopied: selectedIds.indexOf(w.toNode) >= 0
        };
      })
    };
    return true;
  };

  app.pasteCopiedNodes = function() {
    var clip = this._nodeClipboard;
    if (!clip || !clip.nodes || !clip.nodes.length) return false;
    if (this._pushHistory) this._pushHistory();
    this._historySuspended = true;
    clip.pasteCount = (clip.pasteCount || 0) + 1;
    var offset = 40 * clip.pasteCount;
    var idMap = {};
    var pasted = [];
    clip.nodes.forEach(function(src, index) {
      var id = 'node-' + app.nextNodeId++;
      app.nodeZCounter++;
      var nd = {
        id: id,
        type: src.type,
        x: Math.round(src.x + offset),
        y: Math.round(src.y + offset),
        def: JSON.parse(JSON.stringify(src.def)),
        controlValues: JSON.parse(JSON.stringify(src.controlValues || {})),
        dataPanelOpen: src.dataPanelOpen,
        propsPanelOpen: src.propsPanelOpen,
        inspectorOpen: src.inspectorOpen,
        _propsOpen: src.propsPanelOpen,
        _inspOpen: src.inspectorOpen,
        zIndex: app.nodeZCounter
      };
      idMap[clip.ids[index]] = id;
      app.nodes.push(nd);
      app.renderNode(nd);
      pasted.push(nd);
    });
    clip.wires.forEach(function(w) {
      var fromNode = idMap[w.fromNode] || w.fromNode;
      var toNode = idMap[w.toNode] || w.toNode;
      if (!toNode) return;
      if (!app.nodes.some(function(n) { return n.id === fromNode; })) return;
      if (!app.nodes.some(function(n) { return n.id === toNode; })) return;
      if (!w.toCopied && app.wires.some(function(existing) { return existing.toNode === toNode && existing.toPort === w.toPort; })) return;
      if (app.addWire) app.addWire(fromNode, w.fromPort, toNode, w.toPort);
      else app.wires.push({ fromNode: fromNode, fromPort: w.fromPort, toNode: toNode, toPort: w.toPort });
    });
    app.deselectAll();
    pasted.forEach(function(nd) { app.selectNode(nd.id, true); });
    if (app.invalidateCompute) app.invalidateCompute();
    if (typeof Viewer3D !== 'undefined') Viewer3D._needsRebuild = true;
    if (app.updatePortDots) app.updatePortDots();
    if (app.renderWires) {
      app.renderWires();
      setTimeout(function() { app.renderWires(); }, 50);
    }
    app._historySuspended = false;
    if (app.updateMenuState) app.updateMenuState();
    if (app._updateHistoryMenuState) app._updateHistoryMenuState();
    return true;
  };

  app._historySnapshot = function() {
    return {
      nodes: JSON.parse(JSON.stringify(this.nodes || [])),
      wires: JSON.parse(JSON.stringify(this.wires || [])),
      selectedNodes: (this.selectedNodes || []).slice(),
      nextNodeId: this.nextNodeId,
      nodeZCounter: this.nodeZCounter,
      hasRun: !!this._hasRun,
      lastRunVersion: this._lastRunVersion || 0
    };
  };

  app._restoreHistorySnapshot = function(snapshot) {
    if (!snapshot) return;
    this._historyRestoring = true;
    this.nodes = JSON.parse(JSON.stringify(snapshot.nodes || []));
    this.wires = JSON.parse(JSON.stringify(snapshot.wires || []));
    this.selectedNodes = [];
    this.nextNodeId = snapshot.nextNodeId || 1;
    this.nodeZCounter = snapshot.nodeZCounter || 10;
    this._hasRun = !!snapshot.hasRun;
    this._lastRunVersion = snapshot.lastRunVersion || 0;
    var canvas = document.getElementById('node-canvas');
    if (canvas) canvas.innerHTML = '';
    var svg = document.getElementById('wire-svg');
    if (svg) svg.innerHTML = '';
    this.nodes.forEach(function(nd) { app.renderNode(nd); });
    (snapshot.selectedNodes || []).forEach(function(id) {
      if (app.nodes.some(function(nd) { return nd.id === id; })) app.selectNode(id, true);
    });
    if (this.updatePortDots) this.updatePortDots();
    if (this.renderWires) {
      this.renderWires();
      setTimeout(function() { app.renderWires(); }, 50);
    }
    if (this.invalidateCompute) this.invalidateCompute();
    if (typeof Viewer3D !== 'undefined') Viewer3D._needsRebuild = true;
    this._historyRestoring = false;
    if (this.updateMenuState) this.updateMenuState();
    if (this._updateHistoryMenuState) this._updateHistoryMenuState();
  };

  app._pushHistory = function() {
    if (this._historyRestoring || this._historySuspended) return false;
    if (!this._undoStack) this._undoStack = [];
    if (!this._redoStack) this._redoStack = [];
    var snapshot = this._historySnapshot();
    var encoded = JSON.stringify(snapshot);
    if (this._lastHistorySnapshot === encoded) return false;
    this._undoStack.push(snapshot);
    if (this._undoStack.length > 100) this._undoStack.shift();
    this._redoStack = [];
    this._lastHistorySnapshot = encoded;
    if (this._updateHistoryMenuState) this._updateHistoryMenuState();
    return true;
  };

  app._updateHistoryMenuState = function() {
    var undo = document.getElementById('mi-undo');
    var redo = document.getElementById('mi-redo');
    var ws = this.currentPage === 'workspace';
    if (undo) undo.classList.toggle('disabled', !ws || !(this._undoStack && this._undoStack.length));
    if (redo) redo.classList.toggle('disabled', !ws || !(this._redoStack && this._redoStack.length));
  };

  app.undo = function() {
    if (!this._undoStack || !this._undoStack.length) return false;
    if (!this._redoStack) this._redoStack = [];
    this._redoStack.push(this._historySnapshot());
    var snapshot = this._undoStack.pop();
    this._lastHistorySnapshot = JSON.stringify(snapshot);
    this._restoreHistorySnapshot(snapshot);
    return true;
  };

  app.redo = function() {
    if (!this._redoStack || !this._redoStack.length) return false;
    if (!this._undoStack) this._undoStack = [];
    this._undoStack.push(this._historySnapshot());
    var snapshot = this._redoStack.pop();
    this._lastHistorySnapshot = JSON.stringify(snapshot);
    this._restoreHistorySnapshot(snapshot);
    return true;
  };

  app._wrapHistoryMethod = function(name) {
    if (!this[name] || this['__historyWrapped_' + name]) return;
    var original = this[name].bind(this);
    this['__historyWrapped_' + name] = true;
    this[name] = function() {
      app._pushHistory();
      return original.apply(app, arguments);
    };
  };

  ['addNodeToCanvas','removeNode','addWire','onCtrl','_addDynInput','_removeDynInput','_spinCtrlDyn','_spinSliderDyn','onNodeDragStart'].forEach(function(name) {
    app._wrapHistoryMethod(name);
  });

  // ═══════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════
  document.addEventListener('keydown', function(e) {
    if (app.currentPage !== 'workspace') return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(e.target.tagName) >= 0) return;
    var key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      if (app.undo) app.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'y') {
      e.preventDefault();
      if (app.redo) app.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'c') {
      if (app.copySelectedNodes && app.copySelectedNodes()) e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'v') {
      if (app.pasteCopiedNodes && app.pasteCopiedNodes()) e.preventDefault();
      return;
    }
    if (key === 'p' || key === 'd' || key === 'w') {
      var selIds = (app.selectedNodes && app.selectedNodes.length > 0) ? app.selectedNodes : app.nodes.map(function(n) { return n.id; });
      if (selIds.length === 0) return;
      e.preventDefault();
      if (key === 'w') {
        if (app.toggleWarningPanels) app.toggleWarningPanels(selIds);
      } else {
        selIds.forEach(function(nid) { var nd = app.nodes.find(function(n) { return n.id === nid; }); if (!nd) return; if (key === 'p') app.toggleProps(nid); else app.toggleInspector(nid); });
      }
    }
    if (key === 'l' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (app.autoLayout) app.autoLayout(); }
    if (key === 'z' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (app.fitAll) app.fitAll(); }
  });

  // ═══════════════════════════════════════
  // SHOWCASE TEMPLATES — pure-JS, no Python required
  // Each template wires modern Surface/Pattern nodes into an
  // Output.Watch so the 3D viewer renders immediately.
  // ═══════════════════════════════════════

  function makeTemplateHelpers(self) {
    var created = [];
    function add(type, x, y) {
      var nd = self.addNodeToCanvas(type, x, y);
      if (nd) created.push(nd);
      return nd;
    }
    function setCtrl(nd, key, val) {
      if (!nd) return;
      nd.controlValues[key] = val;
      var el = document.getElementById(nd.id);
      if (!el) return;
      var inputs = el.querySelectorAll('.node-control input, .node-control select');
      inputs.forEach(function(inp) {
        if (inp.dataset && inp.dataset.ctrl === key) inp.value = val;
      });
    }
    function wire(a, ap, b, bp) {
      if (a && b) self.addWire(a.id, ap, b.id, bp);
    }
    function num(x, y, val) {
      var nd = add('Input.Number', x, y);
      setCtrl(nd, 'val', val);
      return nd;
    }
    function intInput(x, y, val) {
      var nd = add('Input.Integer', x, y);
      setCtrl(nd, 'val', val);
      return nd;
    }
    function finish(message) {
      self.updatePortDots();
      if (typeof updatePortDataStates === 'function') updatePortDataStates();
      setTimeout(function() { self.renderWires(); }, 100);
      if (self.autoLayout) setTimeout(function() { self.autoLayout(); }, 200);
      if (message) self.addAIMessage('workspace', message);
      return created.length + ' nodes created';
    }
    return { add: add, setCtrl: setCtrl, wire: wire, num: num, intInput: intInput, finish: finish, created: created };
  }

  // ── 1. Hyperboloid Tower (cooling-tower aesthetic) ──
  app._templateHyperboloidTower = function() {
    this.newProject();
    var h = makeTemplateHelpers(this);
    var radius = h.num(40, 60, 8);
    var waist  = h.num(40, 160, 4);
    var height = h.num(40, 260, 20);
    var tower  = h.add('Surface.Hyperboloid', 320, 160);
    var smooth = h.add('Surface.Subdivide', 600, 160);
    h.setCtrl(smooth, 'iterations', 1);
    var watch  = h.add('Output.Watch', 880, 160);
    h.wire(radius, 'value', tower, 'radius');
    h.wire(waist,  'value', tower, 'waist');
    h.wire(height, 'value', tower, 'height');
    h.wire(tower,  'surface', smooth, 'mesh');
    h.wire(smooth, 'result', watch, 'value');
    return h.finish('🗼 **Hyperboloid Tower** loaded. Tweak Radius, Waist and Height to morph the cooling-tower silhouette; the Subdivide node smooths the tessellation.');
  };

  // ── 5. Large Mesh Geometry (10k mesh refs, kept as a performance test) ──
  app._templateLargeMesh = function() {
    this.newProject();
    var self = this;
    var created = [];

    function add(type, x, y) {
      var nd = self.addNodeToCanvas(type, x, y);
      if (nd) created.push(nd);
      return nd;
    }

    function setCtrl(nd, key, value) {
      if (!nd) return;
      nd.controlValues[key] = value;
    }

    function customize(nd, options) {
      if (!nd) return;
      options = options || {};
      if (options.name) nd.def.name = options.name;
      if (options.outputs) nd.def.outputs = options.outputs;
      if (options.inputs) nd.def.inputs = options.inputs;
      var el = document.getElementById(nd.id);
      if (el) {
        el.remove();
        self.renderNode(nd);
      }
    }

    var title = add('Custom.Comment', 40, 40);
    setCtrl(title, 'text', 'Pure mesh stress template: generate 10,000 Nova geometry refs, show bounds first, then preview meshes. Full mesh sample is left unconnected for on-demand loading.');
    customize(title);

    var boundsGenerator = add('Custom.Python', 80, 165);
    setCtrl(boundsGenerator, 'code', [
      '_count = 10000',
      'bounds_refs = []',
      'for i in range(_count):',
      '    _x = i % 100',
      '    _y = int(i / 100) % 100',
      '    _z = int(i / 10000)',
      '    bounds_refs.append({"type":"GeometryRef","host":"nova","id":"mesh-" + i,"versionId":"synthetic-v1","bounds":{"min":[_x,_y,_z],"max":[_x+0.8,_y+0.8,_z+0.8]},"metadata":{"geometryKind":"mesh","level":"Bounds"}})'
    ].join('\n'));
    customize(boundsGenerator, {
      name: 'Mesh.BoundsRefs 10k',
      outputs: [{ id: 'output0', name: 'Bounds Refs', type: 'list' }]
    });

    var previewGenerator = add('Custom.Python', 395, 165);
    setCtrl(previewGenerator, 'code', [
      'preview_meshes = []',
      'for ref in input0:',
      '    _min = ref.bounds.min',
      '    _max = ref.bounds.max',
      '    _cx = (_min[0] + _max[0]) / 2',
      '    _cy = (_min[1] + _max[1]) / 2',
      '    _cz = (_min[2] + _max[2]) / 2',
      '    preview_meshes.append(Geo.createBox(Geo.Point3(_cx,_cy,_cz), 0.8, 0.8, 0.8))'
    ].join('\n'));
    customize(previewGenerator, {
      name: 'Mesh.PreviewMeshes',
      inputs: [{ id: 'input0', name: 'Bounds Refs', type: 'list' }],
      outputs: [{ id: 'output0', name: 'Preview Meshes', type: 'list' }]
    });

    var fullGenerator = add('Custom.Python', 395, 440);
    setCtrl(fullGenerator, 'code', [
      '# Connect Bounds Refs to this input only when you want the heavier mesh sample.',
      'full_mesh_sample = []',
      'for ref in input0.slice(0, 100):',
      '    _min = ref.bounds.min',
      '    _max = ref.bounds.max',
      '    _cx = (_min[0] + _max[0]) / 2',
      '    _cy = (_min[1] + _max[1]) / 2',
      '    _cz = (_min[2] + _max[2]) / 2',
      '    _box = Geo.createBox(Geo.Point3(_cx,_cy,_cz), 0.8, 0.8, 0.8)',
      '    full_mesh_sample.append(Geo.subdivide(_box, 1))'
    ].join('\n'));
    customize(fullGenerator, {
      name: 'Mesh.FullMeshSample',
      inputs: [{ id: 'input0', name: 'Bounds Refs', type: 'list' }],
      outputs: [{ id: 'output0', name: 'Full Mesh Sample', type: 'list' }]
    });

    var fullNote = add('Custom.Comment', 705, 440);
    setCtrl(fullNote, 'text', 'Full mesh is intentionally unconnected. Wire Bounds Refs into Mesh.FullMeshSample and then to a Watch when you want to test the expensive path.');
    customize(fullNote);

    var boundsWatch = add('Output.Watch', 705, 115);
    var previewWatch = add('Output.Watch', 705, 260);

    if (boundsGenerator && previewGenerator) self.addWire(boundsGenerator.id, 'output0', previewGenerator.id, 'input0');
    if (boundsGenerator && boundsWatch) self.addWire(boundsGenerator.id, 'output0', boundsWatch.id, 'value');
    if (previewGenerator && previewWatch) self.addWire(previewGenerator.id, 'output0', previewWatch.id, 'value');

    self.updatePortDots();
    if (typeof updatePortDataStates === 'function') updatePortDataStates();
    setTimeout(function() { self.renderWires(); }, 100);
    if (self.autoLayout) setTimeout(function() { self.autoLayout(); }, 200);
    self.addAIMessage('workspace', 'Large Mesh Geometry template loaded.\n\nThis is host-free: it creates synthetic Nova mesh geometry refs, then converts them to preview meshes. The full mesh sample node is available but intentionally unconnected for on-demand testing.');
    return created.length + ' nodes created';
  };

  // ── 6. 1000 Nodes, No Geometry (node/wire/eval stress) ──
  // Loads the same graph as stress-tests/stress-1000-nodes-no-geometry.nodeflow
  // via the shared builder, so the card and the on-disk file stay identical.
  app._templateStressNoGeometry = function() {
    this.newProject();
    var ok = this.deserializeGraph(buildNoGeometryGraph(1000));
    if (ok) this.addAIMessage('workspace', '▦ **1000 Nodes · No Geometry** loaded — one Input feeding a 998-deep Math.Add chain (1997 wires) into an Output.Watch. A pure node/wire/eval stress with no 3D geometry. Hit **Run**; the Watch should read 999.');
    return '1000 nodes loaded';
  };

  // ── 7. 1000 Nodes, 10k Meshes (geometry/viewer stress) ──
  // Loads the same graph as stress-tests/stress-1000-nodes-10k-geometry.nodeflow.
  app._templateStressGeometry = function() {
    this.newProject();
    var ok = this.deserializeGraph(buildGeometryGraph(1000, 2, 5));
    if (ok) this.addAIMessage('workspace', '⬢ **1000 Nodes · Geometry** loaded — 1000 box nodes, each emitting a mesh. A geometry + 3D-viewer stress. Switch to **3D** and hit **Run** (expect a heavy load).');
    return '1000 nodes / 10,000 meshes loaded';
  };

  // Landing page template cards
  var origRenderTemplates = app.renderTemplates ? app.renderTemplates.bind(app) : null;
  app.renderTemplates = function() {
    if (origRenderTemplates) origRenderTemplates();
    var grid = document.getElementById('templates-grid'); if (!grid) return;
    var templates = [
      { fn: '_templateHyperboloidTower', color: 'var(--accent-teal)',   icon: '⧘', name: 'Hyperboloid Tower',  desc: 'Cooling-tower silhouette, smoothed via Subdivide' },
      { fn: '_templateLargeMesh',        color: 'var(--accent-blue)',   icon: '⚡', name: 'Large Mesh Stress',  desc: '10 000 mesh refs — performance test for the engine' },
      { fn: '_templateStressNoGeometry', color: 'var(--accent-yellow)', icon: '▦', name: '1000 Nodes · No Geometry', desc: '1000 value/math nodes, 1997 wires — node/wire/eval stress' },
      { fn: '_templateStressGeometry',   color: 'var(--accent-pink)',   icon: '⬢', name: '1000 Nodes · Geometry', desc: '1000 box nodes emitting meshes — geometry stress' }
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
