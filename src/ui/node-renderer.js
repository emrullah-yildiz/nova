// ═══════════════════════════════════════════════════
// NODE RENDERER (node-renderer)
// ONE renderer for ALL nodes. Unified system — no versions.
// Features: ports (left/right), formula properties,
// collapsible inspector with indexed lists,
// Number/Slider/Integer properties, dropdown controls
// ═══════════════════════════════════════════════════

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

export function installNodeRenderer(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__nodeRendererInstalled) return true;
  targetApp.__nodeRendererInstalled = true;
  var app = targetApp;

  // ── Override renderNode — single universal renderer ──
  app.renderNode = function(nd) {
    var canvas = document.getElementById('node-canvas');
    var def = nd.def, cc = def.categoryColor || '#a6adc8';
    var controlIds = def.controls ? def.controls.map(function(c) { return c.id; }) : [];

    var el = document.createElement('div');
    el.className = 'node';
    el.id = nd.id;
    el.style.left = nd.x + 'px';
    el.style.top = nd.y + 'px';
    el.style.zIndex = nd.zIndex;
    el.style.setProperty('--node-color', cc);
    el.style.setProperty('--node-select-color', cc);
    el.style.setProperty('--node-glow-mid', this.hexToGlow(cc, 0.40));
    el.style.setProperty('--node-glow-soft', this.hexToGlow(cc, 0.20));
    el.style.setProperty('--node-glow-wide', this.hexToGlow(cc, 0.08));

    var h = '';

    // ── HEADER ──
    h += '<div class="node-header" style="background:' + cc + '12">';
    h += '<span class="node-header-icon" style="color:' + cc + ';background:' + cc + '20">' + def.icon + '</span>';
    h += '<span class="node-header-title">' + def.name + '</span>';
    h += '<button class="node-header-menu" onclick="event.stopPropagation();app.showNodeMenu(\'' + nd.id + '\')">⋮</button>';
    h += '</div>';

    // ── BODY: Ports + inline controls ──
    h += '<div class="node-body">';

    // Port rows: inputs left, outputs right, aligned at same level
    var allInputs = def.inputs || [];
    var allOutputs = def.outputs || [];
    var mx = Math.max(allInputs.length, allOutputs.length);
    for (var i = 0; i < mx; i++) {
      var inp = allInputs[i], out = allOutputs[i];
      var rc = 'node-port-row';
      if (inp && !out) rc += ' input-only';
      if (!inp && out) rc += ' output-only';
      h += '<div class="' + rc + '">';
      if (inp) {
        var ipt = 'port-type-' + (inp.type || 'any');
        var inpHasData = app.wires.some(function(w) { return w.toNode === nd.id && w.toPort === inp.id; });
        if (!inpHasData && controlIds.indexOf(inp.id) >= 0) {
          var cv = nd.controlValues[inp.id];
          if (cv !== undefined && cv !== null && cv !== '') inpHasData = true;
        }
        h += '<div class="node-port input ' + ipt + '">';
        h += '<span class="port-dot ' + ipt + (inpHasData ? ' has-data' : '') + '" data-port="' + inp.id + '" data-dir="input" data-node="' + nd.id + '"></span>';
        h += '<span class="port-label">' + inp.name + '</span>';
        h += '</div>';
      }
      if (out) {
        var opt = 'port-type-' + (out.type || 'any');
        h += '<div class="node-port output ' + opt + '">';
        h += '<span class="port-label">' + out.name + '</span>';
        h += '<span class="port-dot ' + opt + '" data-port="' + out.id + '" data-dir="output" data-node="' + nd.id + '"></span>';
        h += '</div>';
      }
      h += '</div>';
    }

    // Dynamic inputs: + / − buttons
    if (def.dynamicInputs) {
      h += '<div style="display:flex;gap:4px;padding:2px 12px;justify-content:center">';
      h += '<button style="width:22px;height:18px;border-radius:4px;background:var(--bg-surface-hover);border:1px solid var(--border-color);color:var(--accent-green);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0" onclick="event.stopPropagation();app._addDynInput(\'' + nd.id + '\')" title="Add input">+</button>';
      h += '<button style="width:22px;height:18px;border-radius:4px;background:var(--bg-surface-hover);border:1px solid var(--border-color);color:var(--accent-red);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0" onclick="event.stopPropagation();app._removeDynInput(\'' + nd.id + '\')" title="Remove last input">−</button>';
      h += '</div>';
    }

    // Inline controls for Slider (special layout: value box + slider bar)
    if (nd.type === 'slider-input') {
      var sMin = nd.controlValues['_min'] !== undefined ? nd.controlValues['_min'] : (nd.controlValues['min'] || 0);
      var sMax = nd.controlValues['_max'] !== undefined ? nd.controlValues['_max'] : (nd.controlValues['max'] || 100);
      var sStep = nd.controlValues['_step'] !== undefined ? nd.controlValues['_step'] : 1;
      var sVal = nd.controlValues['val'] !== undefined ? nd.controlValues['val'] : 50;
      h += '<div class="node-control" style="padding:4px 12px">';
      h += '<div class="num-spin-wrap" style="width:100%;margin-bottom:5px">';
      h += '<input type="number" id="' + nd.id + '-sval" value="' + sVal + '" step="' + sStep + '" min="' + sMin + '" max="' + sMax + '" ';
      h += 'oninput="app.onCtrl(\'' + nd.id + '\',\'val\',this.value);var s=document.querySelector(\'#' + nd.id + ' input[type=range]\');if(s)s.value=this.value" ';
      h += 'style="width:100%;padding:3px 20px 3px 8px;font-size:11px;height:24px;box-sizing:border-box;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:4px" ';
      h += 'onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">';
      h += '<div class="num-spin-btns">';
      h += '<button class="num-spin-btn" onclick="event.stopPropagation();app._spinSlider(\'' + nd.id + '\',1,this)" onmousedown="event.stopPropagation()">▲</button>';
      h += '<button class="num-spin-btn" onclick="event.stopPropagation();app._spinSlider(\'' + nd.id + '\',-1,this)" onmousedown="event.stopPropagation()">▼</button>';
      h += '</div></div>';
      h += '<input type="range" min="' + sMin + '" max="' + sMax + '" step="' + sStep + '" value="' + sVal + '" oninput="app.onCtrl(\'' + nd.id + '\',\'val\',this.value);var d=document.getElementById(\'' + nd.id + '-sval\');if(d)d.value=this.value">';
      h += '</div>';
    } else {
      // Generic controls: number (with spin), dropdown, text, range
      var self = this;
      (def.controls || []).forEach(function(c) {
        // Skip controls that go in Properties section
        if (c.type === 'formula' || c.type === 'dropdown') return;
        if (controlIds.indexOf(c.id) >= 0 && allInputs.some(function(inp) { return inp.id === c.id; })) return;
        h += '<div class="node-control">';
        if (c.type === 'dropdown') {
          h += '<select onchange="app.onCtrl(\'' + nd.id + '\',\'' + c.id + '\',this.value)">';
          (c.options || []).forEach(function(o) { h += '<option value="' + o + '"' + (o === nd.controlValues[c.id] ? ' selected' : '') + '>' + o + '</option>'; });
          h += '</select>';
        } else if (c.type === 'number') {
          var numStep = nd.controlValues['_step'] !== undefined ? nd.controlValues['_step'] : 1;
          h += '<div class="num-spin-wrap" style="width:100%">';
          h += '<input type="number" value="' + nd.controlValues[c.id] + '" step="' + numStep + '" oninput="app.onCtrl(\'' + nd.id + '\',\'' + c.id + '\',this.value)" placeholder="' + c.label + '" style="width:100%;padding:3px 20px 3px 8px;font-size:11px;height:24px;box-sizing:border-box;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:4px">';
          h += '<div class="num-spin-btns">';
          h += '<button class="num-spin-btn" onclick="event.stopPropagation();app._spinCtrlDyn(\'' + nd.id + '\',\'' + c.id + '\',1,this)" onmousedown="event.stopPropagation()">▲</button>';
          h += '<button class="num-spin-btn" onclick="event.stopPropagation();app._spinCtrlDyn(\'' + nd.id + '\',\'' + c.id + '\',-1,this)" onmousedown="event.stopPropagation()">▼</button>';
          h += '</div></div>';
        } else if (c.type === 'text') {
          h += '<input type="text" value="' + nd.controlValues[c.id] + '" onchange="app.onCtrl(\'' + nd.id + '\',\'' + c.id + '\',this.value)" placeholder="' + c.label + '">';
        } else if (c.type === 'range') {
          var rMin = nd.controlValues['_min'] !== undefined ? nd.controlValues['_min'] : 0;
          var rMax = nd.controlValues['_max'] !== undefined ? nd.controlValues['_max'] : 100;
          var rStep = nd.controlValues['_step'] !== undefined ? nd.controlValues['_step'] : 1;
          h += '<input type="range" min="' + rMin + '" max="' + rMax + '" step="' + rStep + '" value="' + nd.controlValues[c.id] + '" oninput="app.onCtrl(\'' + nd.id + '\',\'' + c.id + '\',this.value)">';
        }
        h += '</div>';
      });
    }
    h += '</div>'; // end node-body

    // ── PROPERTIES (collapsible) — shown for nodes with controls ──
    var propsControls = (def.controls || []).filter(function(c) {
      // Show: formula controls, Number/Integer step, Slider min/max/step
      return c.type === 'formula' || c.type === 'dropdown';
    });
    // Also add step property for Number/Integer nodes
    if (nd.type === 'number-input' || nd.type === 'integer-input') {
      var isInt = nd.type === 'integer-input';
      propsControls = [{ id: '_step', type: 'formula', default: isInt ? '1' : '0.1', label: 'Step', _custom: true }];
      if (nd.controlValues['_step'] === undefined) nd.controlValues['_step'] = isInt ? 1 : 0.1;
    }
    // Slider properties
    if (nd.type === 'slider-input') {
      propsControls = [
        { id: '_min', type: 'formula', default: '0', label: 'Min', _custom: true },
        { id: '_max', type: 'formula', default: '100', label: 'Max', _custom: true },
        { id: '_step', type: 'formula', default: '1', label: 'Step', _custom: true }
      ];
      if (nd.controlValues['_min'] === undefined) nd.controlValues['_min'] = 0;
      if (nd.controlValues['_max'] === undefined) nd.controlValues['_max'] = 100;
      if (nd.controlValues['_step'] === undefined) nd.controlValues['_step'] = 1;
    }

    if (propsControls.length > 0 || (def.controls || []).some(function(c) { return c.type === 'formula'; })) {
      var allPropsControls = (def.controls || []).filter(function(c) { return c.type === 'formula' || c.type === 'dropdown'; });
      // Add custom props (step, min, max)
      if (nd.type === 'number-input' || nd.type === 'integer-input' || nd.type === 'slider-input') {
        allPropsControls = allPropsControls.concat(propsControls.filter(function(c) { return c._custom; }));
      }

      if (allPropsControls.length > 0) {
        var propsOpen = nd._propsOpen || nd.propsPanelOpen || false;
        h += '<div class="node-props-section' + (propsOpen ? ' open' : '') + '" id="' + nd.id + '-props-section">';
        h += '<button class="node-props-toggle" onclick="event.stopPropagation();app.toggleProps(\'' + nd.id + '\')">';
        h += '<span class="props-chevron">▸</span> Properties';
        h += '</button>';
        h += '<div class="node-props-body">';

        allPropsControls.forEach(function(ctrl) {
          var inp = allInputs.find(function(i) { return i.id === ctrl.id; });
          var val = nd.controlValues[ctrl.id];
          if (val === undefined || val === null) val = ctrl.default || '';
          var wire = inp ? app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === ctrl.id; }) : null;
          var axisClass = ctrl.axis ? ' prop-' + ctrl.axis : '';
          var inputClass = ctrl.axis ? ' prop-input-' + ctrl.axis : '';

          // Resolve display value from wire
          var displayVal = val;
          if (wire) {
            var srcNd = app.nodes.find(function(n) { return n.id === wire.fromNode; });
            if (srcNd) {
              var srcVal = app.computeNodeValue(srcNd);
              if (typeof srcVal === 'number') displayVal = srcVal;
              else if (srcVal !== undefined && srcVal !== null) displayVal = srcVal;
            }
          }

          var wireStyle = wire ? 'border-color:var(--accent-teal);color:var(--accent-teal);' : '';
          var isFormula = ctrl.type === 'formula';
          var isDropdown = ctrl.type === 'dropdown';

          h += '<div class="prop-row">';
          h += '<span class="prop-label' + axisClass + '">' + (ctrl.label || ctrl.id) + '</span>';

          if (isDropdown) {
            h += '<select class="prop-input" style="font-size:10px;height:24px" ';
            h += 'onchange="app.onCtrl(\'' + nd.id + '\',\'' + ctrl.id + '\',this.value);if(app.invalidateCompute)app.invalidateCompute()" ';
            h += 'onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">';
            (ctrl.options || []).forEach(function(opt) {
              h += '<option value="' + opt + '"' + (String(displayVal) === String(opt) ? ' selected' : '') + '>' + opt + '</option>';
            });
            h += '</select>';
          } else if (isFormula) {
            var rawVal = String(displayVal);
            var evalResult = (typeof FormulaEval !== 'undefined') ? FormulaEval.eval(rawVal) : { value: parseFloat(rawVal) || 0, isFormula: false };
            h += '<div style="flex:1;display:flex;flex-direction:column;gap:1px;min-width:0">';
            h += '<input type="text" class="prop-input' + inputClass + '" value="' + rawVal + '" ';
            h += 'style="' + wireStyle + 'font-family:var(--font-mono);font-size:10px;height:24px;box-sizing:border-box" ';
            h += 'oninput="app._onFormulaInput(\'' + nd.id + '\',\'' + ctrl.id + '\',this.value,this)" ';
            h += 'onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">';
            if (evalResult.isFormula) h += '<div id="' + nd.id + '-feval-' + ctrl.id + '" style="font-size:8px;color:var(--accent-green);padding-left:2px;font-family:var(--font-mono)">= ' + evalResult.value.toFixed(4).replace(/\.?0+$/, '') + '</div>';
            else h += '<div id="' + nd.id + '-feval-' + ctrl.id + '" style="font-size:8px;min-height:0"></div>';
            h += '</div>';
          } else {
            // Number input with spin
            h += '<div class="num-spin-wrap" style="flex:1">';
            h += '<input type="number" class="prop-input' + inputClass + '" value="' + displayVal + '" step="0.1" ';
            h += 'style="' + wireStyle + 'height:24px;box-sizing:border-box" ';
            h += 'oninput="app.onCtrl(\'' + nd.id + '\',\'' + ctrl.id + '\',this.value)" ';
            h += 'onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">';
            h += '<div class="num-spin-btns">';
            h += '<button class="num-spin-btn" onclick="event.stopPropagation();app._spinCtrlDyn(\'' + nd.id + '\',\'' + ctrl.id + '\',1,this)" onmousedown="event.stopPropagation()">▲</button>';
            h += '<button class="num-spin-btn" onclick="event.stopPropagation();app._spinCtrlDyn(\'' + nd.id + '\',\'' + ctrl.id + '\',-1,this)" onmousedown="event.stopPropagation()">▼</button>';
            h += '</div></div>';
          }
          h += '</div>';
        });
        h += '</div></div>';
      }
    }

    // ── DATA INSPECTOR (collapsible) ──
    if (def.preview) {
      var inspOpen = nd._inspOpen || nd.inspectorOpen || false;
      h += '<div class="node-inspector-section' + (inspOpen ? ' open' : '') + '" id="' + nd.id + '-insp-section">';
      h += '<button class="node-inspector-toggle" onclick="event.stopPropagation();app.toggleInspector(\'' + nd.id + '\')">';
      h += '<span class="insp-chevron">▸</span> Data Inspector';
      h += '</button>';
      h += '<div class="node-inspector-body">';
      h += '<div class="node-inspector-content" id="' + nd.id + '-insp-content">';
      h += _universalInspector(nd);
      h += '</div></div></div>';
    }

    el.innerHTML = h;

    // ── Event listeners ──
    var header = el.querySelector('.node-header');
    if (header) header.addEventListener('mousedown', function(e) { app.bringToFront(nd); app.onNodeDragStart(e, nd); });
    el.addEventListener('mousedown', function(e) { e.stopPropagation(); app.bringToFront(nd); app.selectNode(nd.id, e.shiftKey); });
    el.querySelectorAll('.port-dot').forEach(function(d) {
      d.addEventListener('mousedown', function(e) { e.stopPropagation(); e.preventDefault(); app.onPortDown(e, d.dataset.node, d.dataset.port, d.dataset.dir); });
    });
    canvas.appendChild(el);
  };

  // ── Toggle Properties (universal) ──
  app.toggleProps = function(id) {
    var nd = this.nodes.find(function(n) { return n.id === id; }); if (!nd) return;
    nd._propsOpen = !nd._propsOpen;
    nd.propsPanelOpen = nd._propsOpen;
    var section = document.getElementById(id + '-props-section');
    if (section) section.classList.toggle('open', nd._propsOpen);
  };

  // ── Toggle Data Inspector (universal) ──
  app.toggleInspector = function(id) {
    var nd = this.nodes.find(function(n) { return n.id === id; }); if (!nd) return;
    nd._inspOpen = !nd._inspOpen;
    nd.inspectorOpen = nd._inspOpen;
    var section = document.getElementById(id + '-insp-section');
    if (section) section.classList.toggle('open', nd._inspOpen);
    if (nd._inspOpen) {
      var content = document.getElementById(id + '-insp-content');
      if (content) content.innerHTML = _universalInspector(nd);
    }
  };

  // ── Legacy alias ──
  app.toggleDataPanel = function(id) { this.toggleInspector(id); };

  // ── Formula input handler ──
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
      var fe2 = FormulaEval.eval(value);
      nd.controlValues['_eval_' + ctrlId] = fe2.value;
    }
    this.onCtrl(nodeId, ctrlId, value);
  };

  // ── Spin buttons ──
  app._spinCtrlDyn = function(nid, cid, direction, btnEl) {
    var nd = this.nodes.find(function(n) { return n.id === nid; }); if (!nd) return;
    var step = nd.controlValues['_step'] !== undefined ? parseFloat(nd.controlValues['_step']) : 1;
    if (nd.type === 'integer-input') step = Math.max(1, Math.round(step));
    var cur = parseFloat(nd.controlValues[cid]) || 0;
    var newVal = Math.round((cur + direction * step) * 10000) / 10000;
    if (nd.type === 'integer-input') newVal = Math.round(newVal);
    nd.controlValues[cid] = newVal;
    var wrap = btnEl.closest('.num-spin-wrap');
    if (wrap) { var inp = wrap.querySelector('input'); if (inp) inp.value = newVal; }
    if (this.invalidateCompute) this.invalidateCompute();
  };

  app._spinSlider = function(nid, direction, btnEl) {
    var nd = this.nodes.find(function(n) { return n.id === nid; }); if (!nd) return;
    var step = nd.controlValues['_step'] !== undefined ? parseFloat(nd.controlValues['_step']) : 1;
    var mn = nd.controlValues['_min'] !== undefined ? parseFloat(nd.controlValues['_min']) : 0;
    var mx = nd.controlValues['_max'] !== undefined ? parseFloat(nd.controlValues['_max']) : 100;
    var cur = parseFloat(nd.controlValues['val']) || 0;
    var newVal = Math.max(mn, Math.min(mx, Math.round((cur + direction * step) * 10000) / 10000));
    nd.controlValues['val'] = newVal;
    var numEl = document.getElementById(nid + '-sval');
    if (numEl) numEl.value = newVal;
    var el = document.getElementById(nid);
    if (el) { var slider = el.querySelector('input[type="range"]'); if (slider) slider.value = newVal; }
    if (this.invalidateCompute) this.invalidateCompute();
  };

  app._onNumPropChange = function(nid, key, val) {
    var nd = this.nodes.find(function(n) { return n.id === nid; }); if (!nd) return;
    var num = parseFloat(val) || 0;
    if (nd.type === 'integer-input' && key === '_step') num = Math.max(1, Math.round(num));
    nd.controlValues[key] = num;
  };

  // ── Universal Inspector Builder ──
  function _universalInspector(nd) {
      var r = '';
      var controlIds = nd.def.controls ? nd.def.controls.map(function(c) { return c.id; }) : [];
      if (!nd._inspStates) nd._inspStates = { inputs: true, output: true };

      // Inputs (collapsible)
      if (nd.def.inputs && nd.def.inputs.length > 0) {
        var inpOpen = nd._inspStates.inputs;
        r += '<div class="insp-group-toggle' + (inpOpen ? ' open' : '') + '" onclick="app._toggleInspGroup(\'' + nd.id + '\',\'inputs\')">';
        r += '<span class="insp-group-chevron">▸</span> Inputs</div>';
        r += '<div class="insp-group-body" style="display:' + (inpOpen ? 'block' : 'none') + '">';
        nd.def.inputs.forEach(function(inp) {
          var wire = app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === inp.id; });
          var valHtml;
          if (wire) {
            var srcNd = app.nodes.find(function(n) { return n.id === wire.fromNode; });
            var srcVal = undefined;

            if (srcNd) {

              app.computeNodeValue(srcNd);

              if (srcNd._portValues && srcNd._portValues[wire.fromPort] !== undefined) srcVal = srcNd._portValues[wire.fromPort];

              else srcVal = app.computeNodeValue(srcNd);

            }

            valHtml = app.formatValue(srcVal);
          } else if (controlIds.indexOf(inp.id) >= 0) {
            var evalKey = '_eval_' + inp.id;
            if (nd.controlValues[evalKey] !== undefined) {
              valHtml = app.formatValue(nd.controlValues[evalKey]);
            } else {
              var cv = nd.controlValues[inp.id];
              if (cv !== undefined && cv !== null && typeof FormulaEval !== 'undefined' && typeof cv === 'string') {
                valHtml = app.formatValue(FormulaEval.eval(cv).value);
              } else {
                valHtml = app.formatValue(cv);
              }
            }
          } else {
            valHtml = '<span style="color:var(--text-muted)">—</span>';
          }
          r += '<div class="insp-row"><span class="insp-key"><span class="insp-icon">⊙</span> ' + inp.name + '</span>' + valHtml + '</div>';
        });
        r += '</div>';
      }

      // Settings (non-formula, non-input controls like dropdowns)
      var settings = (nd.def.controls || []).filter(function(c) { return c.type === 'dropdown' && controlIds.indexOf(c.id) >= 0; });
      if (settings.length > 0) {
        r += '<div class="insp-group-label">Settings</div>';
        settings.forEach(function(c) {
          r += '<div class="insp-row"><span class="insp-key"><span class="insp-icon">⚙</span> ' + (c.label || c.id) + '</span><span style="color:var(--accent-purple)">' + nd.controlValues[c.id] + '</span></div>';
        });
      }

      // Output (collapsible)
      if (nd.def.outputs && nd.def.outputs.length > 0) {
        var outOpen = nd._inspStates.output;
        r += '<div class="insp-group-toggle' + (outOpen ? ' open' : '') + '" onclick="app._toggleInspGroup(\'' + nd.id + '\',\'output\')">';
        r += '<span class="insp-group-chevron">▸</span> Output</div>';
        r += '<div class="insp-group-body" style="display:' + (outOpen ? 'block' : 'none') + '">';
        var computed = app.computeNodeValue(nd);
        if (nd.def.outputs.length === 1) {
          r += '<div class="insp-row"><span class="insp-key"><span class="insp-icon">▸</span> ' + nd.def.outputs[0].name + '</span>' + app.formatValue(computed) + '</div>';
        } else {
          nd.def.outputs.forEach(function(out) {
            var portVal = (nd._portValues && nd._portValues[out.id] !== undefined) ? nd._portValues[out.id] : undefined;
            r += '<div class="insp-row"><span class="insp-key"><span class="insp-icon">▸</span> ' + out.name + '</span>' + app.formatValue(portVal) + '</div>';
          });
        }
        r += '</div>';
      }

      return r || '<span style="color:var(--text-muted);font-style:italic">No data</span>';
  }

  // Expose as a permanent reference that can't be overwritten by engine.js
  app._universalInspector = _universalInspector;
  app.buildInspectorHTML = _universalInspector;

  // Toggle inspector group
  app._toggleInspGroup = function(nodeId, group) {
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    if (!nd) return;
    if (!nd._inspStates) nd._inspStates = { inputs: true, output: true };
    nd._inspStates[group] = !nd._inspStates[group];
    var content = document.getElementById(nodeId + '-insp-content');
    if (content) content.innerHTML = _universalInspector(nd);
  };

  // ── Dynamic inputs: add/remove ports ──
  app._addDynInput = function(nid) {
    var nd = this.nodes.find(function(n) { return n.id === nid; });
    if (!nd || !nd.def.dynamicInputs) return;
    var idx = nd.def.inputs.length;
    nd.def.inputs.push({ id: 'item' + idx, name: 'Item ' + idx, type: 'any' });
    // Track dynamic input ids for compute
    if (!nd._dynInputIds) nd._dynInputIds = nd.def.inputs.map(function(inp) { return inp.id; });
    else nd._dynInputIds.push('item' + idx);
    // Re-render node
    var el = document.getElementById(nid);
    if (el) el.remove();
    app.renderNode(nd);
    app.updatePortDots();
    setTimeout(function() { app.renderWires(); }, 30);
  };

  app._removeDynInput = function(nid) {
    var nd = this.nodes.find(function(n) { return n.id === nid; });
    if (!nd || !nd.def.dynamicInputs || nd.def.inputs.length <= 1) return;
    var removed = nd.def.inputs.pop();
    // Remove any wire connected to this port
    app.wires = app.wires.filter(function(w) { return !(w.toNode === nid && w.toPort === removed.id); });
    if (nd._dynInputIds) nd._dynInputIds.pop();
    // Re-render node
    var el = document.getElementById(nid);
    if (el) el.remove();
    app.renderNode(nd);
    app.updatePortDots();
    setTimeout(function() { app.renderWires(); }, 30);
  };

  console.log('[NodeFlow] Universal node renderer loaded');
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    installNodeRenderer();
  });
}

export default installNodeRenderer;
