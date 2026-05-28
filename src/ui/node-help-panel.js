import { NODE_TYPE_MAP } from '../core/nodes.js';
import { buildNodeHelpDoc } from './node-help-docs.js';

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

// ============================================
// NODEFLOW AI — Inline Node Help Panel
// SVG chevron opens help. SVG diagram for examples.
// Right-click on node body → context menu.
// ============================================

export function installNodeHelpPanel(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__nodeHelpPanelInstalled) return true;
  targetApp.__nodeHelpPanelInstalled = true;
  const app = targetApp;

  var _openHelpNodeId = null;

  var CHEVRON_RIGHT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  var CHEVRON_LEFT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  function closeHelp() {
    if (_openHelpNodeId) {
      var panel = document.getElementById(_openHelpNodeId + '-help');
      if (panel) panel.remove();
      var btn = document.querySelector('#' + _openHelpNodeId + ' .node-help-arrow');
      if (btn) btn.innerHTML = CHEVRON_RIGHT;
      _openHelpNodeId = null;
    }
  }

  // ═══════════════════════════════════════
  // SVG DIAGRAM — detailed node replica
  // ═══════════════════════════════════════
  function buildSVGDiagram(ex) {
    if (!ex || !ex.nodes) return '';

    var NW = 130, NH = 22, PORT_R = 4, HDR_H = 18, ROW_H = 14;

    // First pass: compute actual node heights based on port count
    var nodeInfo = ex.nodes.map(function(n) {
      var def = NODE_TYPE_MAP[n.type];
      if (!def) return { w: NW, h: NH, name: n.type, color: '#a6adc8', icon: '?', inputs: [], outputs: [] };
      var inputs = def.inputs || [];
      var outputs = def.outputs || [];
      var rows = Math.max(inputs.length, outputs.length, 1);
      var h = HDR_H + rows * ROW_H + 6;
      var name = def.name; if (name.length > 18) name = name.substring(0, 16) + '…';
      return { w: NW, h: h, name: name, color: def.categoryColor || '#a6adc8', icon: def.icon || '?', inputs: inputs, outputs: outputs };
    });

    // Auto-layout: topological column assignment
    var incoming = {}, depth = {}, visited = {};
    ex.nodes.forEach(function(n, i) { incoming[i] = []; });
    ex.wires.forEach(function(w) { if (incoming[w[2]] !== undefined) incoming[w[2]].push(w[0]); });
    function assignDepth(i) {
      if (visited[i]) return depth[i] || 0;
      visited[i] = true;
      var maxP = -1;
      (incoming[i] || []).forEach(function(src) { var d = assignDepth(src); if (d > maxP) maxP = d; });
      depth[i] = maxP + 1;
      return depth[i];
    }
    ex.nodes.forEach(function(n, i) { assignDepth(i); });

    var columns = {};
    ex.nodes.forEach(function(n, i) {
      var col = depth[i] || 0;
      if (!columns[col]) columns[col] = [];
      columns[col].push(i);
    });

    // Position nodes
    var positions = [];
    var MARGIN_X = 40, MARGIN_Y = 12, PAD = 16;
    var currentX = PAD;
    var maxCol = 0;
    Object.keys(columns).forEach(function(c) { if (parseInt(c) > maxCol) maxCol = parseInt(c); });

    for (var col = 0; col <= maxCol; col++) {
      var colIdxs = columns[col] || [];
      if (colIdxs.length === 0) continue;
      var maxW = 0;
      colIdxs.forEach(function(i) { if (nodeInfo[i].w > maxW) maxW = nodeInfo[i].w; });
      var currentY = PAD;
      colIdxs.forEach(function(i) {
        positions[i] = { x: currentX, y: currentY };
        currentY += nodeInfo[i].h + MARGIN_Y;
      });
      currentX += maxW + MARGIN_X;
    }

    // Compute SVG viewport
    var svgW = 0, svgH = 0;
    positions.forEach(function(p, i) {
      if (!p) return;
      var r = p.x + nodeInfo[i].w + PAD;
      var b = p.y + nodeInfo[i].h + PAD;
      if (r > svgW) svgW = r;
      if (b > svgH) svgH = b;
    });

    // Scale to fit panel width (240px max)
    var maxWidth = 240;
    var scale = Math.min(maxWidth / svgW, 1);
    var dispW = Math.ceil(svgW * scale);
    var dispH = Math.ceil(svgH * scale);

    var s = '<svg width="' + dispW + '" height="' + dispH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;background:rgba(0,0,0,0.25)">';

    // Helper: port Y position
    function portY(nodeIdx, portIdx, isOutput) {
      var info = nodeInfo[nodeIdx];
      var inputs = info.inputs, outputs = info.outputs;
      var maxRows = Math.max(inputs.length, outputs.length, 1);
      var idx = isOutput ? portIdx : portIdx;
      return positions[nodeIdx].y + HDR_H + 3 + idx * ROW_H + ROW_H / 2;
    }

    // Draw wires (behind nodes)
    ex.wires.forEach(function(w) {
      var fromIdx = w[0], toIdx = w[2];
      if (!positions[fromIdx] || !positions[toIdx]) return;
      var fromInfo = nodeInfo[fromIdx], toInfo = nodeInfo[toIdx];
      // Find output port index
      var fromPortIdx = 0;
      fromInfo.outputs.forEach(function(o, oi) { if (o.id === w[1]) fromPortIdx = oi; });
      var toPortIdx = 0;
      toInfo.inputs.forEach(function(inp, ii) { if (inp.id === w[3]) toPortIdx = ii; });

      var x1 = positions[fromIdx].x + fromInfo.w;
      var y1 = portY(fromIdx, fromPortIdx, true);
      var x2 = positions[toIdx].x;
      var y2 = portY(toIdx, toPortIdx, false);
      var dx = Math.max(Math.abs(x2 - x1) * 0.45, 25);
      s += '<path d="M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2 + '" fill="none" stroke="#6c7086" stroke-width="1.8" opacity="0.7"/>';
    });

    // Draw nodes
    positions.forEach(function(p, i) {
      if (!p) return;
      var info = nodeInfo[i];
      var x = p.x, y = p.y, w = info.w, h = info.h;

      // Node body
      s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" fill="#252538" stroke="#313244" stroke-width="1"/>';
      // Header accent bar
      s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="3" rx="6" fill="' + info.color + '" opacity="0.7"/>';
      // Header background
      s += '<rect x="' + (x + 1) + '" y="' + (y + 3) + '" width="' + (w - 2) + '" height="' + (HDR_H - 3) + '" fill="' + info.color + '" opacity="0.06" rx="0"/>';
      // Node name
      s += '<text x="' + (x + 8) + '" y="' + (y + HDR_H - 4) + '" fill="#cdd6f4" font-size="9" font-family="Inter,sans-serif" font-weight="600">' + info.name + '</text>';

      // Input ports
      info.inputs.forEach(function(inp, pi) {
        var py = portY(i, pi, false);
        var connected = ex.wires.some(function(w) { return w[2] === i && w[3] === inp.id; });
        s += '<circle cx="' + x + '" cy="' + py + '" r="' + PORT_R + '" fill="' + (connected ? '#89b4fa' : '#252538') + '" stroke="#89b4fa" stroke-width="1.5"/>';
        s += '<text x="' + (x + 8) + '" y="' + (py + 3) + '" fill="#a6adc8" font-size="7.5" font-family="Inter,sans-serif">' + inp.name + '</text>';
      });

      // Output ports
      info.outputs.forEach(function(out, oi) {
        var py = portY(i, oi, true);
        var connected = ex.wires.some(function(w) { return w[0] === i && w[1] === out.id; });
        s += '<circle cx="' + (x + w) + '" cy="' + py + '" r="' + PORT_R + '" fill="' + (connected ? '#a6e3a1' : '#252538') + '" stroke="#a6e3a1" stroke-width="1.5"/>';
        var label = out.name;
        s += '<text x="' + (x + w - 8) + '" y="' + (py + 3) + '" fill="#a6adc8" font-size="7.5" font-family="Inter,sans-serif" text-anchor="end">' + label + '</text>';
      });
    });

    s += '</svg>';
    return s;
  }

  // ═══════════════════════════════════════

  function openHelp(nodeId) {
    if (_openHelpNodeId === nodeId) { closeHelp(); return; }
    closeHelp();
    var nd = app.nodes.find(function(n) { return n.id === nodeId; });
    if (!nd) return;
    var explicitHelp = (window.NODE_HELP && window.NODE_HELP[nd.type]) ? window.NODE_HELP[nd.type] : null;
    var help = buildNodeHelpDoc(nd.def, explicitHelp);
    var el = document.getElementById(nodeId);
    if (!el) return;

    _openHelpNodeId = nodeId;
    var btn = el.querySelector('.node-help-arrow');
    if (btn) btn.innerHTML = CHEVRON_LEFT;

    var panel = document.createElement('div');
    panel.id = nodeId + '-help';
    panel.className = 'nhp-panel';

    var h = '<div class="nhp-header">';
    h += '<span class="nhp-title">' + nd.def.name + '</span>';
    h += '<button class="nhp-close" onclick="event.stopPropagation();app._closeNodeHelp()">✕</button>';
    h += '</div>';

    if (help) {
      h += '<div class="nhp-desc">' + escapeHtml(help.description) + '</div>';
      if (help.inputs && help.inputs.length > 0) {
        h += '<div class="nhp-section-title">Inputs</div><table class="nhp-table">';
        help.inputs.forEach(function(inp) { h += '<tr><td class="nhp-td-name">' + escapeHtml(inp.name) + '</td><td class="nhp-td-desc">' + escapeHtml(inp.desc) + '</td></tr>'; });
        h += '</table>';
      }
      if (help.outputs && help.outputs.length > 0) {
        h += '<div class="nhp-section-title">Outputs</div><table class="nhp-table">';
        help.outputs.forEach(function(out) { h += '<tr><td class="nhp-td-name">' + escapeHtml(out.name) + '</td><td class="nhp-td-desc">' + escapeHtml(out.desc) + '</td></tr>'; });
        h += '</table>';
      }
      if (help.example) {
        h += '<div class="nhp-section-title">Example: ' + help.example.title + '</div>';
        h += '<div class="nhp-example-svg">' + buildSVGDiagram(help.example) + '</div>';
        h += '<button class="nhp-add-btn" onclick="event.stopPropagation();app._addHelpExample(\'' + nd.type + '\')">+ Add to Canvas</button>';
      }
    } else {
      h += '<div class="nhp-desc" style="font-style:italic;color:var(--text-muted)">No documentation available yet.</div>';
      if (nd.def.inputs && nd.def.inputs.length > 0) {
        h += '<div class="nhp-section-title">Inputs</div><table class="nhp-table">';
        nd.def.inputs.forEach(function(inp) { h += '<tr><td class="nhp-td-name">' + inp.name + '</td><td class="nhp-td-desc"><span style="color:var(--text-disabled)">' + (inp.type||'any') + '</span></td></tr>'; });
        h += '</table>';
      }
      if (nd.def.outputs && nd.def.outputs.length > 0) {
        h += '<div class="nhp-section-title">Outputs</div><table class="nhp-table">';
        nd.def.outputs.forEach(function(out) { h += '<tr><td class="nhp-td-name">' + out.name + '</td><td class="nhp-td-desc"><span style="color:var(--text-disabled)">' + (out.type||'any') + '</span></td></tr>'; });
        h += '</table>';
      }
    }

    panel.innerHTML = h;
    panel.style.position = 'absolute';
    panel.style.left = (nd.x + el.offsetWidth + 8) + 'px';
    panel.style.top = nd.y + 'px';
    panel.style.zIndex = (nd.zIndex || 10) + 1;

    var canvas = document.getElementById('node-canvas');
    if (canvas) canvas.appendChild(panel);
    panel.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  }

  app._openNodeHelp = function(nodeId) { openHelp(nodeId); };
  app._closeNodeHelp = function() { closeHelp(); };
  app._addHelpExample = function(nodeType) {
    var explicitHelp = (window.NODE_HELP && window.NODE_HELP[nodeType]) ? window.NODE_HELP[nodeType] : null;
    var def = NODE_TYPE_MAP[nodeType];
    var help = buildNodeHelpDoc(def, explicitHelp);
    if (help && typeof window.buildExampleGraph === 'function') {
      var count = window.buildExampleGraph(help);
      closeHelp();
      if (app.autoLayout) setTimeout(function() { app.autoLayout(); }, 100);
      app.addAIMessage('workspace', '📖 **Example added!** ' + count + ' nodes placed on canvas.');
    }
  };

  // ── Patch renderNode ──
  var _origRenderNode = app.renderNode.bind(app);
  app.renderNode = function(nd) {
    _origRenderNode(nd);
    var el = document.getElementById(nd.id);
    if (!el) return;
    var menuBtn = el.querySelector('.node-header-menu');
    if (menuBtn) {
      menuBtn.innerHTML = CHEVRON_RIGHT;
      menuBtn.className = 'node-help-arrow';
      menuBtn.onclick = function(e) { e.stopPropagation(); app._openNodeHelp(nd.id); };
    }
    el.addEventListener('contextmenu', function(e) {
      if (e.target.closest('.node-help-arrow')) return;
      e.preventDefault(); e.stopPropagation();
      app.showNodeMenu(nd.id);
    });
  };

  var _origDeselectAll = app.deselectAll ? app.deselectAll.bind(app) : function() {};
  app.deselectAll = function() { _origDeselectAll(); closeHelp(); };

  console.log('[NodeFlow] Node Help Panel loaded (SVG diagrams)');

  return true;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default installNodeHelpPanel;
