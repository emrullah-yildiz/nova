/* eslint-disable no-redeclare */

import { resolvePythonPorts, nextPythonPorts, renamePythonPort, setInputHeader } from './python-port-decl.js';

// ============================================
// NODEFLOW AI — Python Runner (Local JS eval)
// Translates Python → JS and executes locally
// Supports: math, Geo library, loops, conditionals
// ============================================

const PythonRunner = {
  // Execute Python code with given inputs
  // Returns { outputs: { varName: value }, error: null|string }
  execute(code, inputs) {
    const runtimeGlobal = typeof window !== 'undefined' ? window : globalThis;

    try {
      const lines = code.split('\n');
      let jsCode = '';
      const indentStack = [];

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('import ')) return;

        let jsLine = trimmed;

        // Python → JS translations
        jsLine = jsLine.replace(/\bTrue\b/g, 'true');
        jsLine = jsLine.replace(/\bFalse\b/g, 'false');
        jsLine = jsLine.replace(/\bNone\b/g, 'null');
        jsLine = jsLine.replace(/\band\b/g, '&&');
        jsLine = jsLine.replace(/\bor\b/g, '||');
        jsLine = jsLine.replace(/\bnot\s/g, '!');

        // Math module
        jsLine = jsLine.replace(/\bmath\.pi\b/g, 'Math.PI');
        jsLine = jsLine.replace(/\bmath\.e\b/g, 'Math.E');
        jsLine = jsLine.replace(/\bmath\.sqrt\(/g, 'Math.sqrt(');
        jsLine = jsLine.replace(/\bmath\.pow\(/g, 'Math.pow(');
        jsLine = jsLine.replace(/\bmath\.sin\(/g, 'Math.sin(');
        jsLine = jsLine.replace(/\bmath\.cos\(/g, 'Math.cos(');
        jsLine = jsLine.replace(/\bmath\.tan\(/g, 'Math.tan(');
        jsLine = jsLine.replace(/\bmath\.atan2\(/g, 'Math.atan2(');
        jsLine = jsLine.replace(/\bmath\.acos\(/g, 'Math.acos(');
        jsLine = jsLine.replace(/\bmath\.asin\(/g, 'Math.asin(');
        jsLine = jsLine.replace(/\bmath\.radians\(/g, '__radians__(');
        jsLine = jsLine.replace(/\bmath\.degrees\(/g, '__degrees__(');
        jsLine = jsLine.replace(/\bmath\.dist\(/g, '__dist__(');
        jsLine = jsLine.replace(/\bmath\.factorial\(/g, '__factorial__(');
        jsLine = jsLine.replace(/\bmath\.log\(/g, 'Math.log(');
        jsLine = jsLine.replace(/\bmath\.abs\(/g, 'Math.abs(');
        jsLine = jsLine.replace(/\bmath\.floor\(/g, 'Math.floor(');
        jsLine = jsLine.replace(/\bmath\.ceil\(/g, 'Math.ceil(');
        jsLine = jsLine.replace(/\babs\(/g, 'Math.abs(');
        jsLine = jsLine.replace(/\blen\(/g, '__len__(');
        jsLine = jsLine.replace(/\brange\(/g, '__range__(');
        jsLine = jsLine.replace(/\bprint\(/g, '__print__(');
        jsLine = jsLine.replace(/\blist\(reversed\(/g, '__reversed__(');
        jsLine = jsLine.replace(/\bsorted\(/g, '__sorted__(');
        jsLine = jsLine.replace(/\bsum\(/g, '__sum__(');
        jsLine = jsLine.replace(/\bmin\(/g, 'Math.min(');
        jsLine = jsLine.replace(/\bmax\(/g, 'Math.max(');
        jsLine = jsLine.replace(/\bround\(/g, '__round__(');
        jsLine = jsLine.replace(/\bint\(/g, '__int__(');
        jsLine = jsLine.replace(/\bfloat\(/g, '__float__(');
        jsLine = jsLine.replace(/\blist\(/g, '__list__(');

        // Strip inline comments: remove # and everything after (but not inside strings)
        // Walk char by char to handle strings properly
        var commentIdx = -1;
        var inStr = false, strCh = '';
        for (var ci = 0; ci < jsLine.length; ci++) {
          var ch = jsLine[ci];
          if (inStr) { if (ch === '\\' && ci + 1 < jsLine.length) { ci++; continue; } if (ch === strCh) inStr = false; }
          else { if (ch === '"' || ch === "'") { inStr = true; strCh = ch; } else if (ch === '#') { commentIdx = ci; break; } }
        }
        if (commentIdx >= 0) jsLine = jsLine.substring(0, commentIdx).trimEnd();

        // Python ** operator → Math.pow()
        // Handle: a ** b, a**b, (expr) ** (expr)
        jsLine = jsLine.replace(/([a-zA-Z0-9_)\]]+)\s*\*\*\s*([a-zA-Z0-9_(]+(?:\([^)]*\))?)/g, 'Math.pow($1, $2)');

        // Geo library — pass through directly (Geo is global)
        // Geo.Point3, Geo.Vector3, etc. work as-is in JS since Geo is on window

        // isinstance check
        jsLine = jsLine.replace(/\bisinstance\s*\(\s*(\w+)\s*,\s*dict\s*\)/g, '(typeof $1 === "object")');
        jsLine = jsLine.replace(/\bisinstance\s*\(\s*(\w+)\s*,\s*list\s*\)/g, 'Array.isArray($1)');
        jsLine = jsLine.replace(/\bisinstance\s*\(\s*(\w+)\s*,\s*str\s*\)/g, '(typeof $1 === "string")');
        // dict .get() method → bracket access with fallback
        jsLine = jsLine.replace(/(\w+)\.get\(\s*"([^"]+)"\s*,\s*([^)]+)\)/g, '($1["$2"] !== undefined ? $1["$2"] : $3)');
        jsLine = jsLine.replace(/(\w+)\.get\(\s*"([^"]+)"\s*\)/g, '($1["$2"] || null)');

        // Handle for loops: for x in range(...):
        const forMatch = jsLine.match(/^for\s+(\w+)\s+in\s+(.+):$/);
        if (forMatch) {
          jsLine = 'for (let ' + forMatch[1] + ' of ' + forMatch[2] + ') {';
        }
        // Handle for with enumerate
        const enumMatch = jsLine.match(/^for\s+(\w+),\s*(\w+)\s+in\s+enumerate\((.+)\):$/);
        if (enumMatch) {
          jsLine = 'for (let [' + enumMatch[1] + ',' + enumMatch[2] + '] of ' + enumMatch[3] + '.entries()) {';
        }
        // Handle if/elif/else
        if (/^if\s+(.+):$/.test(jsLine)) jsLine = jsLine.replace(/^if\s+(.+):$/, 'if ($1) {');
        if (/^elif\s+(.+):$/.test(jsLine)) jsLine = jsLine.replace(/^elif\s+(.+):$/, '} else if ($1) {');
        if (jsLine === 'else:') jsLine = '} else {';
        // Handle while
        if (/^while\s+(.+):$/.test(jsLine)) jsLine = jsLine.replace(/^while\s+(.+):$/, 'while ($1) {');
        // Handle def
        const defMatch = jsLine.match(/^def\s+(\w+)\(([^)]*)\):$/);
        if (defMatch) jsLine = 'function ' + defMatch[1] + '(' + defMatch[2] + ') {';
        // .append() → .push()
        jsLine = jsLine.replace(/\.append\((.+)\)/, '.push($1)');

        // Indentation → track for block closing
        const indent = line.search(/\S/);
        const isContinuation = /^(elif |else:|except|finally:)/.test(trimmed);

        while (indentStack.length > 0) {
          const topIndent = indentStack[indentStack.length - 1];
          if (isContinuation ? indent < topIndent : indent <= topIndent) {
            jsCode += '  '.repeat(Math.max(0, Math.floor(topIndent / 4))) + '}\n';
            indentStack.pop();
          } else {
            break;
          }
        }
        jsCode += '  '.repeat(Math.max(0, Math.floor(indent / 4))) + jsLine + '\n';

        if (/\{\s*$/.test(jsLine)) indentStack.push(indent);
      });

      // Close any open blocks
      while (indentStack.length > 0) {
        const topIndent = indentStack.pop();
        jsCode += '  '.repeat(Math.max(0, Math.floor(topIndent / 4))) + '}\n';
      }


      // Build input declarations
      const inputDecls = Object.keys(inputs || {}).map(k => 'let ' + k + ' = __inputs__["' + k + '"];').join('\n');

      const wrappedCode = `
        (function(__inputs__, __runtimeGlobal__) {
          ${inputDecls}

          // Builtins
          const __range__ = function(a,b,c){ if(b===undefined){b=a;a=0;} if(c===undefined)c=1; const r=[]; for(let i=a;c>0?i<b:i>b;i+=c)r.push(i); return r; };
          const __len__ = function(x){ return x.length; };
          const __print__ = function(){ console.log(...arguments); };
          const __reversed__ = function(a){ return [...a].reverse(); };
          const __sorted__ = function(a){ return [...a].sort((a,b)=>a-b); };
          const __sum__ = function(a){ return a.reduce((s,v)=>s+v,0); };
          const __round__ = function(v,d){ const m=Math.pow(10,d||0); return Math.round(v*m)/m; };
          const __dist__ = function(a,b){ if(a instanceof Geo.Point3 && b instanceof Geo.Point3) return a.distanceTo(b); return Math.sqrt(a.reduce((s,v,i)=>(s+(v-b[i])**2),0)); };
          const __factorial__ = function(n){ let r=1; for(let i=2;i<=n;i++)r*=i; return r; };
          const __radians__ = function(d){ return d * Math.PI / 180; };
          const __degrees__ = function(r){ return r * 180 / Math.PI; };
          const __int__ = function(v){ return parseInt(v); };
          const __float__ = function(v){ return parseFloat(v); };
          const __list__ = function(v){ if(Array.isArray(v)) return v.slice(); if(v && typeof v[Symbol.iterator]==='function') return Array.from(v); return []; };

          // Geo library — wrap constructors so they work without 'new' keyword
          // Auto-proxy: copies ALL methods/classes from window.Geo so new additions are always available
          const _Geo = __runtimeGlobal__.Geo || {};
          const Geo = {};
          // Copy all static functions and properties
          Object.keys(_Geo).forEach(function(key) {
            if (typeof _Geo[key] === 'function') {
              // Check if it's a class constructor (has prototype with methods) vs plain function
              var proto = _Geo[key].prototype;
              var isClass = proto && Object.getOwnPropertyNames(proto).length > 1;
              if (isClass && /^[A-Z]/.test(key)) {
                // Wrap class constructors so they work without 'new'
                Geo[key] = function() {
                  var args = Array.prototype.slice.call(arguments);
                  switch(args.length) {
                    case 0: return new _Geo[key]();
                    case 1: return new _Geo[key](args[0]);
                    case 2: return new _Geo[key](args[0], args[1]);
                    case 3: return new _Geo[key](args[0], args[1], args[2]);
                    case 4: return new _Geo[key](args[0], args[1], args[2], args[3]);
                    case 5: return new _Geo[key](args[0], args[1], args[2], args[3], args[4]);
                    case 6: return new _Geo[key](args[0], args[1], args[2], args[3], args[4], args[5]);
                    default: return new _Geo[key](args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
                  }
                };
              } else {
                // Plain function — bind to _Geo context
                Geo[key] = _Geo[key].bind ? _Geo[key].bind(_Geo) : _Geo[key];
              }
            } else {
              // Constants (SUBDIVIDE_MAX_FACES, etc.)
              Geo[key] = _Geo[key];
            }
          });

          // RevitBridge — access pre-fetched Revit data
          const RevitBridge = __runtimeGlobal__.RevitBridge || {
            getData: function() { return {}; },
            getElements: function() { return []; },
            getTypes: function() { return []; },
            getLevels: function() { return []; },
            getSheets: function() { return []; },
            getSelection: function() { return []; },
            getActiveView: function() { return {}; },
            getProjectName: function() { return 'No Project'; },
            getParam: function(el, name) { return el && el.params ? el.params[name] || null : null; },
            filterByParam: function(els, p, op, v) { return (__runtimeGlobal__.RevitBridge || this).filterByParam(els, p, op, v); }
          };

          const HostRegistry = __runtimeGlobal__.HostRegistry || (__runtimeGlobal__.NodeFlow && __runtimeGlobal__.NodeFlow.hostRegistry) || {
            get: function() {
              return {
                getElements: function() { return []; },
                getGeometry: function() { return []; },
                sendGeometry: function() { return { ok: false, message: 'No host registry is available.' }; },
                getParameterValues: function() { return []; },
                setParameterValues: function() { return []; }
              };
            }
          };

          ${jsCode}

          // Collect all variables as outputs — use typeof check to avoid TDZ errors
          var __out__ = {};
          ${(function() {
            var builtins = ['__inputs__','__out__','__range__','__len__','__print__','__reversed__','__sorted__','__sum__','__round__','__dist__','__factorial__','__radians__','__degrees__','__int__','__float__','__list__','Geo','RevitBridge','HostRegistry','_Geo','i','j','k','_','s','v','r','m','d','n','a','b','c'];
            var varNames = (jsCode.match(/(?:^|[;\n{} ])([a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm) || [])
              .map(function(m) { return m.replace(/^[;\n{} ]+/, '').replace(/\s*=$/, '').trim(); })
              .filter(function(v) { return v && builtins.indexOf(v) < 0; });
            var unique = [];
            varNames.forEach(function(v) { if (unique.indexOf(v) < 0) unique.push(v); });
            return unique.map(function(v) { return 'try { if (typeof ' + v + ' !== "undefined") __out__["' + v + '"] = ' + v + '; } catch(_e) {}'; }).join('\n');
          })()}
          return __out__;
        })
      `;

      const fn = (0, eval)(wrappedCode);
      const result = fn(inputs || {}, runtimeGlobal);

      return { outputs: result || {}, error: null };
    } catch (e) {
      return { outputs: {}, error: e.message };
    }
  }
};

if (typeof window !== 'undefined') {
  window.PythonRunner = PythonRunner;
}

// ============================================
// PYTHON NODE UI — patches app after load
// ============================================
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const origRenderNode = app.renderNode.bind(app);

  app.renderNode = function(nd) {
    origRenderNode(nd);
    if (nd.type === 'custom-python' || nd.type === 'custom-code' || nd.type === 'Custom.Python' || nd.type === 'Custom.Code') {
      const el = document.getElementById(nd.id);
      if (el) app.enhancePythonNode(nd, el);
    }
  };

  app.enhancePythonNode = function(nd, el) {
    // Phase 14: prefer declared / inferred ports from the code itself
    // over the generic input0/output0 fallback.
    // Source of truth, in order:
    //  1. The plan or parser already populated _dynInputs/_dynOutputs
    //  2. The code's `# in:` / `# out:` header comments
    //  3. The last top-level assignment becomes the output port name
    //  4. Fall back to def's inputs/outputs (input0/output0)
    if (!nd._dynInputs || !nd._dynOutputs) {
      try {
        const codeForPorts = (nd.controlValues && nd.controlValues.code)
          || (nd.def.controls && nd.def.controls.find ? (nd.def.controls.find(c => c.id === 'code') || {}).default : '')
          || '';
        const resolved = resolvePythonPorts(codeForPorts);
        if (resolved && resolved.source !== 'default') {
          if (!nd._dynInputs && Array.isArray(resolved.inputs)) {
            nd._dynInputs = resolved.inputs.map(p => p.id);
            nd._dynInputTypes = {};
            resolved.inputs.forEach(p => { nd._dynInputTypes[p.id] = p.type || 'any'; });
          }
          if (!nd._dynOutputs && Array.isArray(resolved.outputs)) {
            nd._dynOutputs = resolved.outputs.map(p => p.id);
            nd._dynOutputTypes = {};
            resolved.outputs.forEach(p => { nd._dynOutputTypes[p.id] = p.type || 'any'; });
          }
        }
      } catch {
        // Defensive — port detection must never block node rendering.
      }
    }
    if (!nd._dynInputs) nd._dynInputs = nd.def.inputs.map(p => p.id);
    if (!nd._dynOutputs) nd._dynOutputs = nd.def.outputs.length > 0 ? nd.def.outputs.map(p => p.id) : ['output0'];
    const body = el.querySelector('.node-body');
    if (!body) return;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const btnBase = 'width:22px;height:18px;border-radius:4px;background:var(--bg-surface-hover);border:1px solid var(--border-color);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0';
    let h = '';

    // Input ports — named, renamable (double-click the label).
    nd._dynInputs.forEach(pid => {
      h += '<div class="node-port-row input-only"><div class="node-port input port-type-any">';
      h += '<span class="port-dot port-type-any" data-port="' + esc(pid) + '" data-dir="input" data-node="' + nd.id + '"></span>';
      h += '<span class="port-label py-port-label" data-port="' + esc(pid) + '" data-dir="input">' + esc(pid) + '</span></div></div>';
    });

    // Add / remove input — same control layout as List.Create: a centered
    // +/− pair. Adding/removing is a code edit (writes the `# in:` header).
    h += '<div style="display:flex;gap:4px;padding:2px 12px;justify-content:center">';
    h += '<button style="' + btnBase + ';color:var(--accent-green)" onclick="event.stopPropagation();app.pyAddInput(\'' + nd.id + '\')" onmousedown="event.stopPropagation()" title="Add input">+</button>';
    h += '<button style="' + btnBase + ';color:var(--accent-red)" onclick="event.stopPropagation();app.pyRemoveInput(\'' + nd.id + '\')" onmousedown="event.stopPropagation()" title="Remove last input">−</button>';
    h += '</div>';

    // No code preview — just a hint that double-clicking edits in the terminal.
    h += '<div class="py-node-toolbar" style="padding:4px 12px;display:flex;justify-content:space-between;align-items:center">'
      + '<span class="py-node-hint" style="font-size:10px;color:var(--text-muted)">{ } double-click to edit</span>'
      + '<span class="py-node-status" id="' + nd.id + '-pystatus"></span></div>';

    // Output ports — named.
    nd._dynOutputs.forEach(pid => {
      h += '<div class="node-port-row output-only"><div class="node-port output port-type-any">';
      h += '<span class="port-label py-port-label" data-port="' + esc(pid) + '" data-dir="output">' + esc(pid) + '</span>';
      h += '<span class="port-dot port-type-any" data-port="' + esc(pid) + '" data-dir="output" data-node="' + nd.id + '"></span>';
      h += '</div></div>';
    });

    body.innerHTML = h;
    el.querySelectorAll('.port-dot').forEach(d => {
      d.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); app.onPortDown(e, d.dataset.node, d.dataset.port, d.dataset.dir); });
    });
    // Double-click a port LABEL → rename it inline. Stops propagation so it
    // doesn't also trigger the body's "open in terminal" dblclick.
    el.querySelectorAll('.py-port-label').forEach(lbl => {
      lbl.title = 'Double-click to rename';
      lbl.addEventListener('dblclick', e => {
        e.stopPropagation();
        app.pyStartPortRename(lbl, nd.id, lbl.dataset.dir === 'output' ? 'output' : 'input', lbl.dataset.port);
      });
    });
    // Double-click the body → open this node's code in the terminal to edit.
    body.addEventListener('dblclick', e => { e.stopPropagation(); app.pyOpenInTerminal(nd.id); });
  };

  // Replace a port label with an inline text input for renaming.
  app.pyStartPortRename = function(labelEl, nodeId, direction, oldId) {
    if (!labelEl || labelEl._renaming) return;
    labelEl._renaming = true;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldId;
    input.className = 'py-port-rename';
    input.style.cssText = 'width:84px;font-size:11px;font-family:var(--font-mono,monospace);padding:1px 4px;'
      + 'background:var(--bg-tertiary);border:1px solid var(--accent-green,#94e2d5);border-radius:3px;color:var(--text-primary)';
    input.onclick = (e) => e.stopPropagation();
    input.onmousedown = (e) => e.stopPropagation();
    let done = false;
    const cancel = () => {
      if (done) return; done = true;
      const el = document.getElementById(nodeId);
      const nd = app.nodes.find(n => n.id === nodeId);
      if (el && nd) app.enhancePythonNode(nd, el);
    };
    const commit = () => {
      if (done) return; done = true;
      app.pyRenamePort(nodeId, direction, oldId, input.value);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
    input.onblur = commit;
    labelEl.replaceWith(input);
    input.focus();
    input.select();
  };

  // Apply a port rename: variable references + wires + port list, then
  // re-render. Returns true on success. No-ops (returns false) on a bad,
  // duplicate, or unknown name so the inline editor can just snap back.
  app.pyRenamePort = function(nodeId, direction, oldId, newId) {
    const nd = this.nodes.find(n => n.id === nodeId);
    if (!nd) return false;
    const res = renamePythonPort({
      direction, oldId, newId,
      code: nd.controlValues.code || '',
      dynInputs: nd._dynInputs || [],
      dynOutputs: nd._dynOutputs || [],
      wires: this.wires || [],
      nodeId
    });
    nd._dynInputs = res.dynInputs;
    nd._dynOutputs = res.dynOutputs;
    nd.controlValues.code = res.code;
    this.wires = res.wires;
    const el = document.getElementById(nodeId);
    if (el) this.enhancePythonNode(nd, el);
    if (this.renderWires) this.renderWires();
    return res.ok;
  };

  // Open a Python node's code in the code terminal for editing. (The tabbed
  // multi-node terminal arrives in a follow-up; for now this shows the node's
  // code in the single-node code viewer.)
  app.pyOpenInTerminal = function(nodeId) {
    const nd = this.nodes.find(n => n.id === nodeId);
    if (!nd || typeof this.showCodeViewer !== 'function') return;
    this.showCodeViewer(nd.controlValues.code || '', nd);
  };

  // ── SYNTAX HIGHLIGHTING ──
  app.pyHighlight = function(nodeId) {
    var textarea = document.getElementById(nodeId + '-pycode');
    var display = document.getElementById(nodeId + '-pydisplay');
    if (!textarea || !display) return;
    var code = textarea.value;
    display.innerHTML = app._pyColorize(code) + '\n';
    // Sync scroll
    display.scrollTop = textarea.scrollTop;
    display.scrollLeft = textarea.scrollLeft;
  };

  app.pySyncScroll = function(nodeId) {
    var textarea = document.getElementById(nodeId + '-pycode');
    var display = document.getElementById(nodeId + '-pydisplay');
    if (!textarea || !display) return;
    display.scrollTop = textarea.scrollTop;
    display.scrollLeft = textarea.scrollLeft;
  };

  app._pyColorize = function(code) {
    // Escape HTML
    var text = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Strings (single and double quoted) — must be done first
    text = text.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
      '<span class="pyh-str">$1</span>');

    // Comments
    text = text.replace(/(#[^\n]*)/g, '<span class="pyh-cmt">$1</span>');

    // Numbers (int, float)
    text = text.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, '<span class="pyh-num">$1</span>');

    // Keywords
    var kw = '\\b(import|from|as|def|class|return|if|elif|else|for|in|while|break|continue|pass|try|except|finally|with|yield|lambda|and|or|not|is|True|False|None|print|range|len|append|math)\\b';
    text = text.replace(new RegExp(kw, 'g'), '<span class="pyh-kw">$1</span>');

    // Geo calls (the important ones!)
    text = text.replace(/\b(Geo)\./g, '<span class="pyh-geo">$1</span>.');
    text = text.replace(/\.(Point3|Vector3|Line3|Polyline3|Circle3|Arc3|Mesh3|Plane|NurbsCurve|NurbsSurface)\b/g,
      '.<span class="pyh-cls">$1</span>');
    text = text.replace(/\.(create\w+|extrude|revolve|loft|sweep|pipe|thicken|subdivide|smooth|rotate|mirror|move|scaleGeo|boolean\w+|combine\w+|bezier|interpolate|surfaceFromGrid|pointGrid|ruledSurface|coonsPatch|fillet|trim\w+|offset\w+|array\w+|noiseDeform|sinDeform|attractorDeform|perlin[23]|fbm|pointAttractor|multiAttractor|curveAttractor|voronoi\w+|hexGrid|diamondGrid|phyllotaxis|fibonacciSphere|facadePanels|meshBounds|nurbsInterpolate|rebuildCurve|blendCurves|tweenCurves|stressField|evaluateSurface|getIsolines[UV]|extrudeSurface|toMesh|toPolyline|toPoints)\b/g,
      '.<span class="pyh-fn">$1</span>');

    // Built-in function calls
    text = text.replace(/\b(math)\./g, '<span class="pyh-lib">$1</span>.');

    return text;
  };

  // Trigger initial highlight for all Python nodes after a short delay
  setTimeout(function() {
    if (app.nodes) {
      app.nodes.forEach(function(nd) {
        if (nd.type === 'custom-python' || nd.type === 'custom-code' || nd.type === 'Custom.Python' || nd.type === 'Custom.Code') {
          app.pyHighlight(nd.id);
        }
      });
    }
  }, 500);

  // Re-derive a node's ports from its code (code is the source of truth for
  // ports) and re-render. Used after any edit that changes the code.
  app._pyResyncPortsFromCode = function(nd) {
    const resolved = resolvePythonPorts(nd.controlValues.code || '');
    nd._dynInputs = resolved.inputs.map(p => p.id);
    nd._dynOutputs = resolved.outputs.map(p => p.id);
    nd._dynInputTypes = {}; resolved.inputs.forEach(p => { nd._dynInputTypes[p.id] = p.type || 'any'; });
    nd._dynOutputTypes = {}; resolved.outputs.forEach(p => { nd._dynOutputTypes[p.id] = p.type || 'any'; });
    const el = document.getElementById(nd.id);
    if (el) this.enhancePythonNode(nd, el);
    if (this.renderWires) this.renderWires();
  };

  // Add an input port — expressed as a code edit: append a fresh name to the
  // `# in:` header (NOT a `name = None` assignment, which the runtime would
  // clobber). The port then follows from the code.
  app.pyAddInput = function(nodeId) {
    const nd = this.nodes.find(n => n.id === nodeId); if (!nd) return;
    const cur = Array.isArray(nd._dynInputs) ? nd._dynInputs.slice() : [];
    let n = cur.length, name = 'input' + n;
    while (cur.indexOf(name) >= 0) { n++; name = 'input' + n; }
    nd.controlValues.code = setInputHeader(nd.controlValues.code || '', cur.concat([name]));
    this._pyResyncPortsFromCode(nd);
  };

  // Remove the LAST input port (List.Create-style −): drop it from the
  // `# in:` header and unwire it.
  app.pyRemoveInput = function(nodeId) {
    const nd = this.nodes.find(n => n.id === nodeId); if (!nd) return;
    const cur = Array.isArray(nd._dynInputs) ? nd._dynInputs.slice() : [];
    if (cur.length === 0) return;
    const removed = cur.pop();
    nd.controlValues.code = setInputHeader(nd.controlValues.code || '', cur);
    this.wires = (this.wires || []).filter(w => !(w.toNode === nodeId && w.toPort === removed));
    this._pyResyncPortsFromCode(nd);
  };

  app.pyCodeChange = function(nodeId, code) {
    const nd = this.nodes.find(n => n.id === nodeId); if (nd) nd.controlValues.code = code;
  };

  // Re-derive the node's ports from its code and re-render if they changed.
  // Called on the textarea's `change` (commit) event — not on every
  // keystroke — so the editor keeps focus while typing, and the ports snap
  // to the declared `# in:`/`# out:` headers (or the inferred result name)
  // when the edit is committed. This is what lets the node be edited "to the
  // new design": change the header, the ports follow.
  app.pySyncPorts = function(nodeId, code) {
    const nd = this.nodes.find(n => n.id === nodeId);
    if (!nd) return;
    nd.controlValues.code = code;
    const next = nextPythonPorts(code, { inputs: nd._dynInputs, outputs: nd._dynOutputs });
    if (!next.inputsChanged && !next.outputsChanged) return;

    // Drop wires whose port no longer exists, then adopt the new ports.
    if (next.removedInputs.length) {
      this.wires = this.wires.filter(w => !(w.toNode === nodeId && next.removedInputs.indexOf(w.toPort) >= 0));
    }
    if (next.removedOutputs.length) {
      this.wires = this.wires.filter(w => !(w.fromNode === nodeId && next.removedOutputs.indexOf(w.fromPort) >= 0));
    }
    nd._dynInputs = next.inputs;
    nd._dynOutputs = next.outputs;
    if (next.inputTypes) nd._dynInputTypes = next.inputTypes;
    nd._dynOutputTypes = next.outputTypes;

    const el = document.getElementById(nodeId);
    if (el) this.enhancePythonNode(nd, el);
    this.renderWires();
  };

  // ── Global error registry — AI assistant can read this ──
  if (!app._nodeErrors) app._nodeErrors = {};

  // Get all current node errors (for AI context)
  app.getNodeErrors = function() {
    var errors = [];
    var self = this;
    Object.keys(this._nodeErrors).forEach(function(nid) {
      var err = self._nodeErrors[nid];
      if (err) {
        var nd = self.nodes.find(function(n) { return n.id === nid; });
        errors.push({
          nodeId: nid,
          nodeName: nd ? nd.def.name : 'Unknown',
          error: err.message,
          code: err.code || '',
          timestamp: err.timestamp
        });
      }
    });
    return errors;
  };

  // Clear error for a node
  app.clearNodeError = function(nodeId) {
    delete this._nodeErrors[nodeId];
    var el = document.getElementById(nodeId);
    if (el) el.classList.remove('node-error');
  };

  // Set error for a node — stores full error, shows on node, notifies AI
  app.setNodeError = function(nodeId, errorMessage, code) {
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    this._nodeErrors[nodeId] = {
      message: errorMessage,
      code: code || (nd && nd.controlValues ? nd.controlValues.code : ''),
      timestamp: Date.now()
    };
    // Add red glow to node
    var el = document.getElementById(nodeId);
    if (el) el.classList.add('node-error');
  };

  // Auto-notify AI about errors (debounced — waits 1s after last error)
  app._errorNotifyTimer = null;
  app.notifyAIAboutErrors = function() {
    var self = this;
    if (this._errorNotifyTimer) clearTimeout(this._errorNotifyTimer);
    this._errorNotifyTimer = setTimeout(function() {
      var errors = self.getNodeErrors();
      if (errors.length === 0) return;
      // Only notify about recent errors (last 5 seconds)
      var recent = errors.filter(function(e) { return Date.now() - e.timestamp < 5000; });
      if (recent.length === 0) return;
      var msg = '⚠️ **' + recent.length + ' node error' + (recent.length > 1 ? 's' : '') + ' detected:**\n\n';
      recent.forEach(function(e) {
        msg += '• **' + e.nodeName + '** (' + e.nodeId + '): `' + e.error + '`\n';
        if (e.code && e.code.length < 200) {
          msg += '  Code: `' + e.code.split('\n')[0] + (e.code.split('\n').length > 1 ? '...' : '') + '`\n';
        }
      });
      msg += '\nI can see the errors. Ask me to **fix** them or type "debug" for suggestions.';
      self.addAIMessage('workspace', msg);
    }, 1000);
  };

  // Resolve a wired input value — handles Python node outputs, list nodes, and built-in nodes
  app.resolveWiredValue = function(srcNode, srcPort) {
    if (!srcNode) return undefined;
    // Python/Code nodes: use stored _pyResults
    if ((srcNode.type === 'custom-python' || srcNode.type === 'custom-code' || srcNode.type === 'Custom.Python') && srcNode._pyResults) {
      // If a specific port is named, return that variable
      if (srcPort && srcNode._pyResults[srcPort] !== undefined) return srcNode._pyResults[srcPort];
      // Otherwise return the first output
      var keys = Object.keys(srcNode._pyResults).filter(function(k) { return !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k'; });
      if (keys.length > 0) return srcNode._pyResults[keys[0]];
    }
    // List Create node: build array from its inputs
    if (srcNode.type === 'list-create') {
      var items = [];
      var self = this;
      srcNode.def.inputs.forEach(function(inp) {
        var w = self.wires.find(function(ww) { return ww.toNode === srcNode.id && ww.toPort === inp.id; });
        if (w) {
          var s = self.nodes.find(function(n) { return n.id === w.fromNode; });
          if (s) {
            var val = self.resolveWiredValue(s, w.fromPort);
            if (val !== undefined) items.push(val);
          }
        }
      });
      return items.length > 0 ? items : undefined;
    }
    // Built-in nodes: use computeNodeValue
    return this.computeNodeValue(srcNode);
  };

  app.pyRunNode = function(nodeId) {
    const nd = this.nodes.find(n => n.id === nodeId); if (!nd) return;
    const statusEl = document.getElementById(nodeId + '-pystatus');
    try {
      const inputs = {};
      const self = this;
      (nd._dynInputs || ['input0']).forEach(pid => {
        const wire = self.wires.find(w => w.toNode === nodeId && w.toPort === pid);
        if (wire) {
          const src = self.nodes.find(n => n.id === wire.fromNode);
          if (src) inputs[pid] = self.resolveWiredValue(src, wire.fromPort);
        }
      });
      const result = PythonRunner.execute(nd.controlValues.code || '', inputs);
      if (result.error) {
        // Store full error on the node
        nd._lastError = result.error;
        app.setNodeError(nodeId, result.error, nd.controlValues.code);
        if (statusEl) {
          // Show truncated in status bar, full on hover via title attribute
          var shortErr = result.error.length > 60 ? result.error.substring(0, 57) + '...' : result.error;
          statusEl.textContent = '✕ ' + shortErr;
          statusEl.title = result.error; // full error on hover
          statusEl.className = 'py-node-status err';
          // Make error clickable to show full message
          statusEl.style.cursor = 'pointer';
          statusEl.onclick = function(e) { e.stopPropagation(); app.showNodeErrorDetail(nodeId); };
        }
        // Notify AI assistant
        app.notifyAIAboutErrors();
        return;
      }
      // Success — clear any previous error
      nd._lastError = null;
      app.clearNodeError(nodeId);
      const outKeys = Object.keys(result.outputs).filter(k => !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k');
      if (outKeys.length > 0) {
        nd._dynOutputs = outKeys;
        nd._pyResults = result.outputs;
        const el = document.getElementById(nodeId); if (el) this.enhancePythonNode(nd, el);
        this.renderWires();
      }
      if (statusEl) { statusEl.textContent = '✓ ' + outKeys.length + ' outputs'; statusEl.className = 'py-node-status ok'; statusEl.title = ''; statusEl.onclick = null; statusEl.style.cursor = ''; }
    } catch (e) {
      nd._lastError = e.message;
      app.setNodeError(nodeId, e.message, nd.controlValues.code);
      if (statusEl) {
        var shortErr = e.message.length > 60 ? e.message.substring(0, 57) + '...' : e.message;
        statusEl.textContent = '✕ ' + shortErr;
        statusEl.title = e.message;
        statusEl.className = 'py-node-status err';
        statusEl.style.cursor = 'pointer';
        statusEl.onclick = function(ev) { ev.stopPropagation(); app.showNodeErrorDetail(nodeId); };
      }
      app.notifyAIAboutErrors();
    }
  };

  // Show full error detail in a popup on the node
  app.showNodeErrorDetail = function(nodeId) {
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    if (!nd || !nd._lastError) return;
    // Remove existing popup
    var existing = document.getElementById('node-error-popup');
    if (existing) existing.remove();

    var popup = document.createElement('div');
    popup.id = 'node-error-popup';
    popup.style.cssText = 'position:fixed;z-index:10000;background:rgba(24,24,37,0.96);backdrop-filter:blur(12px);border:1px solid #f38ba8;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.6);padding:0;max-width:500px;min-width:320px;font-family:var(--font-sans);';

    var errText = nd._lastError.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var codeText = (nd.controlValues.code || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Try to extract line number from error
    var lineMatch = nd._lastError.match(/line (\d+)/i);
    var lineInfo = lineMatch ? ' (line ' + lineMatch[1] + ')' : '';

    popup.innerHTML =
      '<div style="padding:10px 14px;border-bottom:1px solid rgba(243,139,168,0.3);display:flex;align-items:center;gap:8px">' +
        '<span style="color:#f38ba8;font-size:14px">⚠</span>' +
        '<span style="font-size:12px;font-weight:700;color:#f38ba8;flex:1">Error in ' + nd.def.name + lineInfo + '</span>' +
        '<button onclick="document.getElementById(\'node-error-popup\').remove()" style="width:22px;height:22px;border-radius:4px;background:transparent;color:var(--text-muted);border:none;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>' +
      '</div>' +
      '<div style="padding:12px 14px">' +
        '<div style="font-size:12px;color:#f38ba8;font-family:var(--font-mono);line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:100px;overflow-y:auto;background:rgba(243,139,168,0.08);padding:8px 10px;border-radius:6px;margin-bottom:10px">' + errText + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">Source code:</div>' +
        '<pre style="font-size:10px;color:var(--text-secondary);font-family:var(--font-mono);line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow-y:auto;background:var(--bg-tertiary);padding:8px 10px;border-radius:6px;margin:0">' + codeText + '</pre>' +
      '</div>' +
      '<div style="padding:8px 14px 12px;display:flex;gap:6px;border-top:1px solid var(--border-color)">' +
        '<button onclick="app.askAIToFixError(\'' + nodeId + '\');document.getElementById(\'node-error-popup\').remove()" style="padding:5px 12px;font-size:11px;font-weight:600;background:rgba(137,180,250,0.15);color:var(--accent-blue);border:1px solid rgba(137,180,250,0.3);border-radius:5px;cursor:pointer">✦ Ask AI to Fix</button>' +
        '<button onclick="navigator.clipboard.writeText(\'' + nd._lastError.replace(/'/g, "\\'").replace(/\n/g, "\\n") + '\');this.textContent=\'Copied!\'" style="padding:5px 12px;font-size:11px;background:var(--bg-surface);color:var(--text-muted);border:none;border-radius:5px;cursor:pointer">📋 Copy Error</button>' +
      '</div>';

    document.body.appendChild(popup);
    // Position near the node
    var nodeEl = document.getElementById(nodeId);
    if (nodeEl) {
      var r = nodeEl.getBoundingClientRect();
      popup.style.left = Math.min(r.right + 8, window.innerWidth - 520) + 'px';
      popup.style.top = Math.max(8, r.top - 20) + 'px';
    } else {
      popup.style.left = Math.round((window.innerWidth - 400) / 2) + 'px';
      popup.style.top = '100px';
    }
    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function handler(e) {
        if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); }
      });
    }, 100);
  };

  // Ask AI to fix a specific node error
  app.askAIToFixError = function(nodeId) {
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    if (!nd || !nd._lastError) return;
    var prompt = 'Fix this error in my ' + nd.def.name + ' node:\n\nError: ' + nd._lastError + '\n\nCode:\n' + (nd.controlValues.code || '');
    // Put it in the chat input and send
    var inp = document.getElementById('ws-chat-input');
    if (inp) {
      inp.value = prompt;
      this.sendChat('workspace');
    }
  };

  // ══════════════════════════════════════
  // PERSISTENT ERROR LOG
  // Saves errors to localStorage so they survive sessions.
  // The OkPy AI assistant can read these to diagnose issues.
  // ══════════════════════════════════════
  var ERROR_LOG_KEY = 'nodeflow_error_log';
  var ERROR_LOG_MAX = 50; // keep last 50 errors

  app.logError = function(nodeId, nodeName, errorMessage, code) {
    var log = [];
    try { log = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch(e) { log = []; }
    log.push({
      nodeId: nodeId,
      nodeName: nodeName,
      error: errorMessage,
      code: (code || '').substring(0, 500), // truncate long code
      timestamp: new Date().toISOString(),
      provider: (typeof GPTClient !== 'undefined') ? GPTClient.getProvider() : 'unknown',
      model: (typeof GPTClient !== 'undefined') ? GPTClient.getModel() : 'unknown'
    });
    // Keep only the last N entries
    if (log.length > ERROR_LOG_MAX) log = log.slice(log.length - ERROR_LOG_MAX);
    try { localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log)); } catch(e) { /* storage full */ }
  };

  app.getErrorLog = function() {
    try { return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch(e) { return []; }
  };

  app.clearErrorLog = function() {
    localStorage.removeItem(ERROR_LOG_KEY);
  };

  app.getErrorLogSummary = function() {
    var log = this.getErrorLog();
    if (log.length === 0) return 'No errors logged.';
    var summary = '**Error Log** (' + log.length + ' entries):\n\n';
    // Show last 10
    var recent = log.slice(-10);
    recent.forEach(function(e) {
      var time = e.timestamp ? e.timestamp.substring(0, 16).replace('T', ' ') : '?';
      summary += '• [' + time + '] **' + e.nodeName + '**: `' + e.error + '`\n';
      if (e.code) summary += '  Code: `' + e.code.split('\n')[0] + '`\n';
    });
    if (log.length > 10) summary += '\n... and ' + (log.length - 10) + ' older errors.';
    return summary;
  };

  // Hook into setNodeError to also persist to log
  var origSetNodeError = app.setNodeError.bind(app);
  app.setNodeError = function(nodeId, errorMessage, code) {
    origSetNodeError(nodeId, errorMessage, code);
    var nd = this.nodes.find(function(n) { return n.id === nodeId; });
    var nodeName = nd ? nd.def.name : 'Unknown';
    this.logError(nodeId, nodeName, errorMessage, code);
  };

  // Make error log accessible from console for debugging
  window.NodeFlowErrorLog = {
    get: function() { return app.getErrorLog(); },
    summary: function() { console.log(app.getErrorLogSummary()); return app.getErrorLogSummary(); },
    clear: function() { app.clearErrorLog(); console.log('Error log cleared.'); }
  };
});

export { PythonRunner };
export default PythonRunner;
