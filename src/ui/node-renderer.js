// ═══════════════════════════════════════════════════

// NODE RENDERER (node-renderer)

// ONE renderer for ALL nodes. Unified system — no versions.

// Features: ports (left/right), formula properties,

// collapsible inspector with indexed lists,

// Number/Slider/Integer properties, dropdown controls

// ═══════════════════════════════════════════════════



import { getWiredControlDisplay, removeControlInputWires } from './property-wire-controls.js';
import { isAutoLaceable } from '../core/lacing.js';
import { NODE_VERSION_MAP } from '../core/nodes.js';
import { availableVersions, getDefVersion } from '../core/node-versions.js';

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

// ── Pure inspector type-warning helpers ──
// Data-driven so adding a kernel type is a one-line table edit. Pure (no app
// state) so they're unit-testable in isolation. See _collectInspectorWarnings.

// Kernel `_type` -> inferred inspector port-type. Keys are lower-cased _type
// names; matched by substring against the lower-cased value._type. Order
// matters: more specific names ('compressedmesh', 'nurbssurface') first so they
// win before broader substrings ('mesh', 'surface').
var KERNEL_TYPE_MAP = [
  ['point3', 'point'],
  ['vector3', 'vector'],
  ['polyline3', 'curve'],
  ['line3', 'line'],
  ['arc3', 'curve'],
  ['circle3', 'circle'],
  ['ellipse3', 'curve'],
  ['nurbscurve', 'curve'],
  ['curve3', 'curve'],
  ['nurbssurface', 'surface'],
  ['surface', 'surface'],
  ['compressedmesh', 'mesh'],
  ['mesh3', 'mesh'],
  ['plane', 'plane'],
  ['datatree', 'datatree']
];

// Compatibility families: a port whose type is in `ports` accepts any actual
// inferred type in `actuals`. Bidirectional within the curve family because a
// 'circle' port can take a 'curve' value and vice-versa.
var TYPE_FAMILIES = [
  { ports: ['curve', 'line', 'circle', 'arc', 'ellipse'], actuals: ['line', 'curve', 'circle', 'arc', 'ellipse'] },
  { ports: ['mesh', 'surface', 'solid'], actuals: ['mesh', 'surface', 'solid', 'geometry'] }
];

// Infer the inspector port-type of a runtime value. Reads only the value (and
// its `type`/`_type` tags) — never app state.
export function inferValueType(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (value && value.type === 'GeometryRef') return 'geometry';
  if (value && value.type === 'ElementRef') return 'element';
  if (value && value._type) {
    var t = String(value._type).toLowerCase();
    for (var i = 0; i < KERNEL_TYPE_MAP.length; i++) {
      if (t.indexOf(KERNEL_TYPE_MAP[i][0]) >= 0) return KERNEL_TYPE_MAP[i][1];
    }
  }
  return typeof value === 'object' ? 'object' : typeof value;
}

// Does a port declared as `expected` accept a value whose inferred type is
// `actual`? `value` is the raw value, used only for the numeric-string case.
export function portAcceptsType(expected, actual, value) {
  if (!expected || expected === 'any' || actual === 'missing' || actual === 'null') return true;
  if (expected === actual) return true;
  if (expected === 'number' && actual === 'string' && value !== '' && !isNaN(Number(value))) return true;
  for (var i = 0; i < TYPE_FAMILIES.length; i++) {
    var fam = TYPE_FAMILIES[i];
    if (fam.ports.indexOf(expected) >= 0 && fam.actuals.indexOf(actual) >= 0) return true;
  }
  return false;
}

export function installNodeRenderer(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__nodeRendererInstalled) return true;
  targetApp.__nodeRendererInstalled = true;
  var app = targetApp;

  app._disconnectControlInputWire = function(nodeId, controlId) {
    var result = removeControlInputWires(this.wires, nodeId, controlId);
    if (!result.removed) return false;
    this.wires = result.wires;
    if (this.invalidateCompute) this.invalidateCompute();
    if (typeof Viewer3D !== 'undefined') Viewer3D._needsRebuild = true;
    if (this.renderWires) this.renderWires();
    // Re-render node to remove green "wired" border on property controls
    if (this._refreshRenderedNode) this._refreshRenderedNode(nodeId);
    return true;
  };

  app._onPropertyControlInput = function(nodeId, controlId, value) {
    if (this._pushHistory) this._pushHistory();
    this._historySuspended = true;
    try {
      this._disconnectControlInputWire(nodeId, controlId);
      this.onCtrl(nodeId, controlId, value);
    } finally {
      this._historySuspended = false;
    }
  };

  app._onPropertyFormulaInput = function(nodeId, controlId, value, inputEl) {
    if (this._pushHistory) this._pushHistory();
    this._historySuspended = true;
    try {
      this._disconnectControlInputWire(nodeId, controlId);
      this._onFormulaInput(nodeId, controlId, value, inputEl);
    } finally {
      this._historySuspended = false;
    }
  };

  app._spinPropertyControl = function(nodeId, controlId, direction, btnEl) {
    if (this._pushHistory) this._pushHistory();
    this._historySuspended = true;
    try {
      this._disconnectControlInputWire(nodeId, controlId);
      this._spinCtrlDyn(nodeId, controlId, direction, btnEl);
    } finally {
      this._historySuspended = false;
    }
  };

  app._inputHasPropertyControl = function(nodeId, inputId) {
    var nd = this.nodes.find(function(node) { return node.id === nodeId; });
    if (!nd || !nd.def) return false;
    var hasInput = (nd.def.inputs || []).some(function(input) { return input.id === inputId; });
    var hasControl = (nd.def.controls || []).some(function(control) { return control.id === inputId; });
    return hasInput && hasControl;
  };

  app._refreshRenderedNode = function(nodeId) {
    var nd = this.nodes.find(function(node) { return node.id === nodeId; });
    var el = document.getElementById(nodeId);
    if (!nd || !el) return false;
    el.remove();
    this.renderNode(nd);
    if (this.updatePortDots) this.updatePortDots();
    if (this.renderWires) this.renderWires();
    return true;
  };

  if (!app.__propertyWireAddWireWrapped && app.addWire) {
    var baseAddWire = app.addWire.bind(app);
    app.addWire = function(fromNode, fromPort, toNode, toPort) {
      baseAddWire(fromNode, fromPort, toNode, toPort);
      if (this._inputHasPropertyControl && this._inputHasPropertyControl(toNode, toPort)) {
        this._refreshRenderedNode(toNode);
      }
    };
    app.__propertyWireAddWireWrapped = true;
  };


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



    var h = '<button class="node-warning-badge" title="" style="display:none" onclick="event.stopPropagation();app.openNodeWarningDropdown(\'' + nd.id + '\')">!</button>';



    // ── HEADER ──

    h += '<div class="node-header" style="background:' + cc + '12">';

    h += '<span class="node-header-icon" style="color:' + cc + ';background:' + cc + '20">' + def.icon + '</span>';

    h += '<span class="node-header-title">' + def.name + '</span>';

    // Version picker — only rendered when the type has shipped more than one
    // behavior version, so it stays invisible for every single-version node.
    var versions = availableVersions(NODE_VERSION_MAP, nd.type);
    if (versions.length > 1) {
      var curV = nd.version || getDefVersion(def);
      h += '<select class="node-header-version" title="Node version — changing it preserves old graphs" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onchange="event.stopPropagation();app.setNodeVersion(\'' + nd.id + '\', parseInt(this.value,10))">';
      versions.forEach(function(v) { h += '<option value="' + v + '"' + (v === curV ? ' selected' : '') + '>v' + v + '</option>'; });
      h += '</select>';
    }

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

        h += '<span class="port-dot ' + ipt + (app._hasRun && inpHasData ? ' has-data' : '') + '" data-port="' + inp.id + '" data-dir="input" data-node="' + nd.id + '"></span>';

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

    // Show the Lacing dropdown (and pre-select a default) for any node that the
    // engine will implicitly fan out over lists. Keep this predicate in sync
    // with the runtime via the shared isAutoLaceable helper.
    var declaredLacing = def.lacing && def.lacing.mode && def.lacing.mode !== 'none' ? def.lacing.mode : null;
    var defaultLacingMode = declaredLacing || (isAutoLaceable(def) ? 'shortest' : null);

    if (propsControls.length > 0 || (def.controls || []).some(function(c) { return c.type === 'formula'; }) || (defaultLacingMode && defaultLacingMode !== 'none')) {

      var allPropsControls = (def.controls || []).filter(function(c) { return c.type === 'formula' || c.type === 'dropdown'; });

      if (defaultLacingMode && defaultLacingMode !== 'none') {

        if (nd.controlValues['_lacingMode'] === undefined || nd.controlValues['_lacingMode'] === null || nd.controlValues['_lacingMode'] === '') {
          nd.controlValues['_lacingMode'] = defaultLacingMode;
        }

        allPropsControls.push({
          id: '_lacingMode',
          type: 'dropdown',
          default: defaultLacingMode,
          label: 'Lacing',
          options: ['none', 'shortest', 'longest', 'crossProduct'],
          _system: true
        });

      }

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

          var wiredControl = inp
            ? getWiredControlDisplay(app, nd, ctrl.id, val)
            : { wired: false, displayValue: val, isList: false };

          var wire = wiredControl.wire;
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



          displayVal = wiredControl.displayValue;

          var wireStyle = wiredControl.wired ? 'border-color:var(--accent-teal);color:var(--accent-teal);' : '';
          var isFormula = ctrl.type === 'formula';

          var isDropdown = ctrl.type === 'dropdown';



          h += '<div class="prop-row">';

          h += '<span class="prop-label' + axisClass + '">' + (ctrl.label || ctrl.id) + '</span>';



          if (isDropdown) {

            h += '<select class="prop-input" style="font-size:10px;height:24px" ';

            h += 'onchange="app._onPropertyControlInput(\'' + nd.id + '\',\'' + ctrl.id + '\',this.value)" ';
            h += 'onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">';

            (ctrl.options || []).forEach(function(opt) {

              h += '<option value="' + opt + '"' + (String(displayVal) === String(opt) ? ' selected' : '') + '>' + opt + '</option>';

            });

            h += '</select>';

          } else if (isFormula) {

            var rawVal = String(displayVal);

            var evalResult = (!wiredControl.isList && typeof FormulaEval !== 'undefined') ? FormulaEval.eval(rawVal) : { value: parseFloat(rawVal) || 0, isFormula: false };
            h += '<div style="flex:1;display:flex;flex-direction:column;gap:1px;min-width:0">';

            h += '<input type="text" class="prop-input' + inputClass + '" value="' + rawVal + '" ';

            h += 'style="' + wireStyle + 'font-family:var(--font-mono);font-size:10px;height:24px;box-sizing:border-box" ';

            h += 'oninput="app._onPropertyFormulaInput(\'' + nd.id + '\',\'' + ctrl.id + '\',this.value,this)" ';
            h += 'onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">';

            if (evalResult.isFormula) h += '<div id="' + nd.id + '-feval-' + ctrl.id + '" style="font-size:8px;color:var(--accent-green);padding-left:2px;font-family:var(--font-mono)">= ' + evalResult.value.toFixed(4).replace(/\.?0+$/, '') + '</div>';

            else h += '<div id="' + nd.id + '-feval-' + ctrl.id + '" style="font-size:8px;min-height:0"></div>';

            h += '</div>';

          } else {

            // Number input with spin

            h += '<div class="num-spin-wrap" style="flex:1">';

            h += '<input type="number" class="prop-input' + inputClass + '" value="' + displayVal + '" step="0.1" ';

            h += 'style="' + wireStyle + 'height:24px;box-sizing:border-box" ';

            h += 'oninput="app._onPropertyControlInput(\'' + nd.id + '\',\'' + ctrl.id + '\',this.value)" ';
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

    h += _warningPanel(nd);

    el.innerHTML = h;

    // ── Event listeners ──
    var header = el.querySelector('.node-header');
    if (header) header.addEventListener('mousedown', function(e) { app.bringToFront(nd); app.onNodeDragStart(e, nd); });
    el.addEventListener('mousedown', function(e) { e.stopPropagation(); app.bringToFront(nd); app.selectNode(nd.id, e.shiftKey); });
    el.querySelectorAll('.port-dot').forEach(function(d) {
      d.addEventListener('mousedown', function(e) { e.stopPropagation(); e.preventDefault(); app.onPortDown(e, d.dataset.node, d.dataset.port, d.dataset.dir); });
    });
    canvas.appendChild(el);
    // Custom body for Python/Code nodes (named ports, +/- inputs, read-only
    // preview, double-click to edit in the terminal). Called directly here —
    // node-renderer owns the winning renderNode, so this is independent of
    // load-order (a separate renderNode wrapper could be clobbered).
    if ((nd.type === 'custom-python' || nd.type === 'custom-code' ||
         nd.type === 'Custom.Python' || nd.type === 'Custom.Code') && app.enhancePythonNode) {
      app.enhancePythonNode(nd, el);
    }
    if (app.refreshNodeWarningBadges) setTimeout(function() { app.refreshNodeWarningBadges(); }, 0);
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

    if (this._disconnectControlInputWire) this._disconnectControlInputWire(nid, cid);
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
  function _collectInspectorWarnings(nd) {
    // No warnings until the graph has run, and only for nodes that were part of
    // the latest run — a freshly placed node hasn't run yet, so it must not show
    // "produced no output" or input-type warnings until the next Run includes it.
    if (!nd || !app._hasRun || nd._ranAtVersion !== app._lastRunVersion) return [];
    var warnings = [];
    var controlIds = nd.def && nd.def.controls ? nd.def.controls.map(function(c) { return c.id; }) : [];
    var typeOfValue = inferValueType;
    var matches = portAcceptsType;
    function hasOutputValue() {
      if (nd._lastRunValue !== undefined) return true;
      if (nd._lastRunPortValues && Object.keys(nd._lastRunPortValues).some(function(k) { return nd._lastRunPortValues[k] !== undefined; })) return true;
      if ((nd.type === 'custom-python' || nd.type === 'Custom.Python') && nd._pyResults) {
        return Object.keys(nd._pyResults).some(function(k) { return k && k.charAt(0) !== '_' && nd._pyResults[k] !== undefined; });
      }
      return false;
    }
    function inputValue(inp) {
      var wire = app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === inp.id; });
      if (wire) {
        var srcNd = app.nodes.find(function(n) { return n.id === wire.fromNode; });
        if (!srcNd) return { wired: true, value: undefined };
        if (srcNd._lastRunPortValues && srcNd._lastRunPortValues[wire.fromPort] !== undefined) return { wired: true, value: srcNd._lastRunPortValues[wire.fromPort] };
        return { wired: true, value: app.computeNodeValue(srcNd) };
      }
      if (controlIds.indexOf(inp.id) >= 0) return { wired: false, value: nd.controlValues['_eval_' + inp.id] !== undefined ? nd.controlValues['_eval_' + inp.id] : nd.controlValues[inp.id] };
      return { wired: false, value: undefined };
    }
    (nd.def && nd.def.inputs || []).forEach(function(inp) {
      if (!inp.type || inp.type === 'any') return;
      var input = inputValue(inp);
      if (!input.wired && input.value === undefined) return;
      var actual = typeOfValue(input.value);
      // A list arriving at a scalar port is valid when the node auto-laces —
      // it maps over each item rather than erroring. Don't flag that.
      if (actual === 'list' && inp.type !== 'list' && isAutoLaceable(nd.def)) return;
      // A single value arriving at a LIST port is valid too — it's auto-promoted
      // to a one-item list (see resolveInputs), so don't flag "expects list".
      if (inp.type === 'list' && actual !== 'list') return;
      if (!matches(inp.type, actual, input.value)) warnings.push({ port: inp.name || inp.id, expected: inp.type, actual: actual, message: (inp.name || inp.id) + ' expects ' + inp.type + ' but received ' + actual + '.' });
    });
    if (!hasOutputValue() && nd.def && nd.def.outputs && nd.def.outputs.length > 0) warnings.push({ port: 'Output', expected: 'value', actual: 'undefined', message: 'Node produced no output on the last Run.' });
    return warnings;
  }

  app._collectInspectorWarnings = _collectInspectorWarnings;

  app.refreshNodeWarningBadges = function() {
    (this.nodes || []).forEach(function(nd) {
      var el = document.getElementById(nd.id);
      if (!el) return;
      var warnings = _collectInspectorWarnings(nd);
      el.classList.toggle('node-has-warning', warnings.length > 0);
      var badge = el.querySelector('.node-warning-badge');
      if (badge) {
        badge.style.display = warnings.length ? 'flex' : 'none';
        badge.title = warnings.map(function(w) { return w.message; }).join('\n');
      }
      var panel = el.querySelector('.node-warning-section');
      if (!warnings.length && panel) {
        panel.remove();
      } else if (warnings.length) {
        var panelHtml = _warningPanel(nd);
        if (panel) panel.outerHTML = panelHtml;
        else el.insertAdjacentHTML('beforeend', panelHtml);
      }
    });
  };

  function _warningPanel(nd) {
    var warnings = app._collectInspectorWarnings ? app._collectInspectorWarnings(nd) : [];
    if (!warnings.length) return '';
    if (!nd._inspStates) nd._inspStates = { inputs: true, output: true };
    var warnOpen = nd._inspStates.warning === true;
    var r = '<div class="node-warning-section' + (warnOpen ? ' open' : '') + '" id="' + nd.id + '-warning-section">';
    r += '<button class="node-warning-toggle" onclick="event.stopPropagation();app.openNodeWarningDropdown(\'' + nd.id + '\')">';
    r += '<span class="warning-chevron">▸</span> Warning<span class="insp-debug-badge">' + warnings.length + '</span>';
    r += '</button>';
    r += '<div class="node-warning-body">';
    r += '<div class="node-warning-content" id="' + nd.id + '-warning-content">';
    r += '<div class="insp-warning-popover">';
    r += '<div class="insp-warning-title">Input warnings</div>';
    warnings.forEach(function(warning) {
      r += '<div class="insp-warning-item"><strong>' + warning.port + '</strong><br><span>' + warning.message + '</span></div>';
    });
    if (_canAskAiForNode(nd)) r += _askAiWarningButton(nd);
    r += '</div>';
    r += '</div></div></div>';
    return r;
  }

  function _canAskAiForNode(nd) {
    // Every warning gets an "Ask AI" affordance. The warning panel only renders
    // when there are warnings, so any node reaching here qualifies.
    return !!nd;
  }

  function _askAiWarningButton(nd) {
    return '<button class="insp-warning-ai-btn" onclick="event.stopPropagation();app.askAIAboutWarning(\'' + nd.id + '\')" '
      + 'style="margin-top:8px;width:100%;padding:6px 8px;border:1px solid rgba(137,180,250,0.35);border-radius:6px;'
      + 'background:rgba(137,180,250,0.12);color:var(--accent-blue,#89b4fa);font-size:11px;font-weight:700;cursor:pointer">'
      + 'Ask AI</button>';
  }

  app.openNodeWarningDropdown = function(nodeId) {
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    if (!nd) return;
    var warnings = this._collectInspectorWarnings ? this._collectInspectorWarnings(nd) : [];
    if (!warnings.length) return;
    if (!nd._inspStates) nd._inspStates = { inputs: true, output: true };
    var shouldOpenWarning = nd._inspStates.warning !== true;
    nd._inspStates.warning = shouldOpenWarning;
    var section = document.getElementById(nodeId + '-warning-section');
    if (!section) {
      var el = document.getElementById(nodeId);
      if (el) el.remove();
      this.renderNode(nd);
      section = document.getElementById(nodeId + '-warning-section');
    }
    if (section) section.classList.toggle('open', shouldOpenWarning);
  };

  app.toggleWarningPanels = function(nodeIds) {
    var ids = nodeIds && nodeIds.length ? nodeIds : (this.nodes || []).map(function(n) { return n.id; });
    if (this.refreshNodeWarningBadges) this.refreshNodeWarningBadges();
    var warningNodes = ids.map(function(id) {
      return app.nodes.find(function(n) { return n.id === id; });
    }).filter(function(nd) {
      return nd && app._collectInspectorWarnings && app._collectInspectorWarnings(nd).length > 0;
    });
    if (!warningNodes.length) return;
    var shouldOpen = warningNodes.some(function(nd) {
      return !(nd._inspStates && nd._inspStates.warning === true);
    });
    warningNodes.forEach(function(nd) {
      if (!nd._inspStates) nd._inspStates = { inputs: true, output: true };
      nd._inspStates.warning = shouldOpen;
      var section = document.getElementById(nd.id + '-warning-section');
      if (section) section.classList.toggle('open', shouldOpen);
    });
  };

  function _universalInspector(nd) {
      var r = '';
      if (app._manualRunMode && !app._hasRun) {
        return '<div class="insp-row"><span style="color:var(--text-muted)">Run to inspect data</span></div>';
      }
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

              if (srcNd._lastRunPortValues && srcNd._lastRunPortValues[wire.fromPort] !== undefined) srcVal = srcNd._lastRunPortValues[wire.fromPort];
              else if (srcNd._portValues && srcNd._portValues[wire.fromPort] !== undefined && app._isRunningGraph) srcVal = srcNd._portValues[wire.fromPort];

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
            var portVal = (nd._lastRunPortValues && nd._lastRunPortValues[out.id] !== undefined) ? nd._lastRunPortValues[out.id] : ((app._isRunningGraph && nd._portValues && nd._portValues[out.id] !== undefined) ? nd._portValues[out.id] : undefined);
            r += '<div class="insp-row"><span class="insp-key"><span class="insp-icon">▸</span> ' + out.name + '</span>' + app.formatValue(portVal) + '</div>';
          });
        }
        r += '</div>';
      }

      /*
        if (nd._inspStates.warning === undefined) nd._inspStates.warning = false;
        var warnOpen = nd._inspStates.warning;
        r += '<div id="' + nd.id + '-warning-section" class="insp-group-toggle insp-warning-toggle' + (warnOpen ? ' open' : '') + '" onclick="app._toggleInspGroup(\'' + nd.id + '\',\'warning\')">';
        r += '<span class="insp-group-chevron">▸</span> Warning<span class="insp-debug-badge">' + warnings.length + '</span></div>';
        r += '<div class="insp-group-body" style="display:' + (warnOpen ? 'block' : 'none') + '">';
        r += '<div class="insp-warning-popover">';
        r += '<div class="insp-warning-title">Input warnings</div>';
        warnings.forEach(function(warning) {
          r += '<div class="insp-warning-item"><strong>' + warning.port + '</strong><br><span>' + warning.message + '</span></div>';
        });
        r += '</div>';
        r += '</div>';
      */

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
