// ============================================
// NOVA — Custom.CodeBlock on-node editor (UI half)
// ============================================
//
// Inline editor for the CodeBlock DSL node. Edited directly on the node body in
// an auto-growing textarea (no terminal, no scrollbars):
//
//   • Height grows per keystroke (scrollHeight); width grows to the longest line
//     clamped MIN..MAX with soft-wrap at MAX.
//   • Ports re-derive on edit-COMMIT (change/blur) via resolveCBPorts — free
//     variables become input ports, assignments become output ports.
//   • The DSL is plain JavaScript expressions (not Python): 0..10 series, math
//     builtins (sin/cos/sqrt…), string literals, dual bool output for 0/1.

import { resolveCBPorts } from '../runtime/codeblock-eval.js';

// The canonical CodeBlock type + its aliases. The on-node editor activates for any
// of these spellings (the engine routes them all through PythonRunner).
export const CODEBLOCK_TYPES = ['Custom.CodeBlock', 'custom-codeblock'];

// Width clamp for the inline editor, in px. At MAX the textarea soft-wraps and
// height absorbs the overflow — there is never a horizontal scrollbar.
export const CB_MIN_W = 180;
export const CB_MAX_W = 460;

// Is this node a CodeBlock the inline editor should own? v1 (legacy JavaScript
// Custom.Code) is NOT inline-edited — it keeps the old single-input behavior and
// the terminal hint, so we only claim v2+ (Python CodeBlock) instances.
export function isCodeBlockNode(nd) {
  if (!nd) return false;
  if (CODEBLOCK_TYPES.indexOf(nd.type) < 0) return false;
  // v1 = the preserved JS Custom.Code; only v2+ is the inline Python CodeBlock.
  return !(nd.version === 1);
}

// Measures the longest line of `code` in the editor's monospace font and returns a
// width clamped to [CB_MIN_W, CB_MAX_W]. Uses a shared canvas measurer (no DOM
// layout thrash). Falls back to a character-count estimate when canvas/measureText
// is unavailable (jsdom), so the function is unit-testable headlessly.
let _cbMeasureCtx = null;
export function codeBlockWidth(code, font) {
  const lines = String(code == null ? '' : code).split('\n');
  let longest = '';
  for (const l of lines) if (l.length > longest.length) longest = l;
  let textPx;
  try {
    if (!_cbMeasureCtx && typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas');
      _cbMeasureCtx = c.getContext ? c.getContext('2d') : null;
    }
    if (_cbMeasureCtx && typeof _cbMeasureCtx.measureText === 'function') {
      _cbMeasureCtx.font = font || '12px monospace';
      const m = _cbMeasureCtx.measureText(longest);
      textPx = m && typeof m.width === 'number' ? m.width : 0;
    }
  } catch {
    textPx = undefined;
  }
  // Fallback estimate: ~7.2px per monospace char at 12px.
  if (!textPx || !isFinite(textPx)) textPx = longest.length * 7.2;
  // +horizontal padding (the textarea has 8px each side) and a little slack so the
  // caret never sits against the edge.
  const w = Math.round(textPx + 22);
  return Math.max(CB_MIN_W, Math.min(CB_MAX_W, w));
}

// Resize the textarea to fit its content with NO scrollbars: height = scrollHeight
// (grows down, no max), width = longest line clamped to [MIN,MAX] (soft-wrap at
// MAX). Also sizes the node card to follow. Pure-ish (only touches the passed els).
export function autoGrowCodeBlock(textarea, nodeEl) {
  if (!textarea) return;
  // Width first so wrapping is correct before we measure height.
  let font = '12px monospace';
  try {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const cs = window.getComputedStyle(textarea);
      if (cs && cs.fontSize) font = (cs.fontStyle && cs.fontStyle !== 'normal' ? cs.fontStyle + ' ' : '')
        + cs.fontSize + ' ' + (cs.fontFamily || 'monospace');
    }
  } catch { /* jsdom — keep the default font string */ }
  const w = codeBlockWidth(textarea.value, font);
  textarea.style.width = w + 'px';
  // Height = content height. Reset to 'auto' first so it can SHRINK as well as grow.
  textarea.style.height = 'auto';
  let h = textarea.scrollHeight || 0;
  // scrollHeight excludes borders. With box-sizing:border-box, the set height
  // includes the border — so add the vertical border back, or the content overflows
  // by exactly the border width (a 1–2px phantom scroll). content-box adds nothing.
  try {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const cs = window.getComputedStyle(textarea);
      if (cs && cs.boxSizing === 'border-box') {
        h += (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      }
    }
  } catch { /* jsdom — leave h as scrollHeight */ }
  textarea.style.height = h + 'px';
  if (nodeEl) {
    // Let the node card width track the editor (+ padding). Height is driven by the
    // flowed content, so we only nudge width.
    nodeEl.style.width = Math.max(CB_MIN_W + 24, w + 24) + 'px';
  }
}

export function installCodeBlockNode(targetApp) {
  const app = targetApp || (typeof window !== 'undefined' ? window.app : null);
  if (!app) return false;
  if (app.__codeBlockNodeInstalled) return true;
  app.__codeBlockNodeInstalled = true;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Expose the predicate on app so the winning node-renderer can ask "is this a
  // CodeBlock?" without importing this module (keeps the renderer load-order free).
  app.isCodeBlockNode = isCodeBlockNode;

  // Seed the live ports (_dynInputs/_dynOutputs) from the code when not yet set.
  function seedPortsFromCode(nd) {
    if (nd._dynInputs && nd._dynOutputs) return;
    let code = (nd.controlValues && nd.controlValues.code);
    if (code == null && nd.def && nd.def.controls && nd.def.controls.find) {
      const cc = nd.def.controls.find(c => c.id === 'code');
      code = cc ? cc.default : '';
    }
    applyPortsFromCode(nd, code || '', { dropWires: false });
  }

  // Re-derive ports from the code and adopt them onto the node. Drops wires to
  // removed ports when dropWires is true (an edit commit), preserves them otherwise
  // (initial seed). Returns true when the port set changed.
  function applyPortsFromCode(nd, code, opts) {
    const dropWires = !opts || opts.dropWires !== false;
    let resolved;
    try {
      resolved = resolveCBPorts(code || '');
    } catch {
      resolved = { inputs: [], outputs: [{ id: 'output0', type: 'any' }] };
    }
    const nextIn = resolved.inputs.map(p => p.id);
    const nextOut = resolved.outputs.map(p => p.id);
    const curIn = Array.isArray(nd._dynInputs) ? nd._dynInputs : [];
    const curOut = Array.isArray(nd._dynOutputs) ? nd._dynOutputs : [];
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const changed = !same(nextIn, curIn) || !same(nextOut, curOut);

    if (dropWires && changed && Array.isArray(app.wires)) {
      const removedIn = curIn.filter(id => nextIn.indexOf(id) < 0);
      const removedOut = curOut.filter(id => nextOut.indexOf(id) < 0);
      if (removedIn.length) {
        app.wires = app.wires.filter(w => !(w.toNode === nd.id && removedIn.indexOf(w.toPort) >= 0));
      }
      if (removedOut.length) {
        app.wires = app.wires.filter(w => !(w.fromNode === nd.id && removedOut.indexOf(w.fromPort) >= 0));
      }
    }

    nd._dynInputs = nextIn;
    nd._dynOutputs = nextOut;
    nd._dynInputTypes = {}; resolved.inputs.forEach(p => { nd._dynInputTypes[p.id] = p.type || 'any'; });
    nd._dynOutputTypes = {}; resolved.outputs.forEach(p => { nd._dynOutputTypes[p.id] = p.type || 'any'; });
    return changed;
  }

  // Renders the inline CodeBlock body: paired port rows + the auto-grow editor.
  app.enhanceCodeBlockNode = function(nd, el) {
    if (!isCodeBlockNode(nd) || !el) return;
    seedPortsFromCode(nd);
    const body = el.querySelector('.node-body');
    if (!body) return;

    const code = (nd.controlValues && nd.controlValues.code != null) ? nd.controlValues.code : '';
    let h = '';

    // Ports — input on the left, output on the right, paired in rows (same visual
    // layout as Custom.Python so the two read alike).
    const rowCount = Math.max(nd._dynInputs.length, nd._dynOutputs.length);
    for (let i = 0; i < rowCount; i++) {
      const inputId = nd._dynInputs[i];
      const outputId = nd._dynOutputs[i];
      h += '<div class="node-port-row cb-port-row">';
      if (inputId) {
        h += '<div class="node-port input port-type-any">';
        h += '<span class="port-dot port-type-any" data-port="' + esc(inputId) + '" data-dir="input" data-node="' + nd.id + '"></span>';
        h += '<span class="port-label cb-port-label" data-port="' + esc(inputId) + '" data-dir="input">' + esc(inputId) + '</span></div>';
      } else {
        h += '<div></div>';
      }
      if (outputId) {
        h += '<div class="node-port output port-type-any">';
        h += '<span class="port-label cb-port-label" data-port="' + esc(outputId) + '" data-dir="output">' + esc(outputId) + '</span>';
        h += '<span class="port-dot port-type-any" data-port="' + esc(outputId) + '" data-dir="output" data-node="' + nd.id + '"></span>';
        h += '</div>';
      } else {
        h += '<div></div>';
      }
      h += '</div>';
    }

    // The inline auto-grow editor. overflow:hidden + soft-wrap = no scrollbars.
    h += '<div class="cb-editor-wrap">';
    h += '<textarea class="cb-editor" id="' + nd.id + '-cbcode" spellcheck="false" '
      + 'autocomplete="off" autocorrect="off" autocapitalize="off" wrap="soft">' + esc(code) + '</textarea>';
    h += '</div>';
    h += '<div class="cb-node-toolbar">';
    h += '<button class="cb-preset-btn" data-preset="series" title="Insert series: nums = 0..10">0..n</button>';
    h += '<span class="cb-node-status" id="' + nd.id + '-cbstatus"></span></div>';

    body.innerHTML = h;

    el.querySelectorAll('.port-dot').forEach(d => {
      d.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); app.onPortDown(e, d.dataset.node, d.dataset.port, d.dataset.dir); });
    });

    const seriesBtn = body.querySelector('.cb-preset-btn[data-preset="series"]');
    if (seriesBtn) {
      ['mousedown', 'click', 'dblclick'].forEach(ev => seriesBtn.addEventListener(ev, e => e.stopPropagation()));
      seriesBtn.addEventListener('click', function() {
        const ta = body.querySelector('.cb-editor');
        if (!ta) return;
        ta.value = 'nums = 0..10';
        if (nd.controlValues) nd.controlValues.code = ta.value;
        autoGrowCodeBlock(ta, el);
        app.codeBlockCommit(nd.id, ta.value);
        ta.focus();
      });
    }

    const ta = body.querySelector('.cb-editor');
    if (ta) {
      // Stop canvas drag/select when interacting with the editor.
      ['mousedown', 'click', 'dblclick'].forEach(ev =>
        ta.addEventListener(ev, e => e.stopPropagation()));
      // Auto-grow every keystroke (resize only — keeps focus, never re-renders).
      ta.addEventListener('input', () => {
        if (nd.controlValues) nd.controlValues.code = ta.value;
        autoGrowCodeBlock(ta, el);
      });
      // Re-derive ports on COMMIT (blur / change), not per keystroke.
      const commit = () => app.codeBlockCommit(nd.id, ta.value);
      ta.addEventListener('change', commit);
      ta.addEventListener('blur', commit);
      // Initial fit.
      autoGrowCodeBlock(ta, el);
    }
  };

  // Commit an edit: store the code, re-derive ports from it, and re-render the body
  // (so new/removed ports appear) plus the wires. Mirrors pySyncPorts.
  app.codeBlockCommit = function(nodeId, code) {
    const nd = this.nodes.find(n => n.id === nodeId);
    if (!nd) return false;
    nd.controlValues.code = code;
    delete nd._pyResults;
    const changed = applyPortsFromCode(nd, code, { dropWires: true });
    if (this.invalidateCompute) this.invalidateCompute();
    if (changed) {
      const el = document.getElementById(nodeId);
      if (el) this.enhanceCodeBlockNode(nd, el);
      if (this.renderWires) this.renderWires();
    }
    return changed;
  };

  // Load-time / external port seed for a CodeBlock node from its current code. Used
  // by save-load after a graph is restored so ports match the saved code without
  // requiring the user to edit. Safe + defensive.
  app.codeBlockSyncPortsFromCode = function(nd) {
    if (!isCodeBlockNode(nd)) return;
    applyPortsFromCode(nd, (nd.controlValues && nd.controlValues.code) || '', { dropWires: false });
  };

  // Drop a Custom.CodeBlock preset onto the canvas. A PRESET is the SAME node type
  // with a pre-filled `code` control override — NOT a new type (no-duplicate rule).
  // `code` defaults to a blank-ish CodeBlock. Returns the new node (or null).
  app.addCodeBlockPreset = function(code, x, y) {
    const area = (typeof document !== 'undefined') && document.getElementById('canvas-area');
    let cx = x, cy = y;
    if (cx == null || cy == null) {
      if (area && area.getBoundingClientRect) {
        const r = area.getBoundingClientRect();
        cx = (r.width / 2 - (this.panX || 0)) / (this.zoom || 1);
        cy = (r.height / 2 - (this.panY || 0)) / (this.zoom || 1);
      } else { cx = cx == null ? 0 : cx; cy = cy == null ? 0 : cy; }
      const off = (this.nodes ? this.nodes.length : 0) * 20;
      cx += off; cy += off;
    }
    const nd = this.addNodeToCanvas('Custom.CodeBlock', cx, cy,
      { controls: { code: code == null ? '' : String(code) } });
    if (!nd) return null;
    // Some installed wrappers (logger-patch / ExecutionEngine) re-bind
    // addNodeToCanvas with a (type,x,y) signature that drops the 4th opts arg, so
    // the controls override above may not stick. Set the code authoritatively here
    // and re-render so the inline editor + ports reflect the preset.
    nd.controlValues = nd.controlValues || {};
    nd.controlValues.code = code == null ? '' : String(code);
    delete nd._dynInputs; delete nd._dynOutputs;   // re-derive from the preset code
    const el = (typeof document !== 'undefined') && document.getElementById(nd.id);
    if (el && typeof this.enhanceCodeBlockNode === 'function') this.enhanceCodeBlockNode(nd, el);
    if (this.invalidateCompute) this.invalidateCompute();
    return nd;
  };

  // Quick blank CodeBlock drop.
  app.addBlankCodeBlock = function(x, y) {
    return this.addCodeBlockPreset('', x, y);
  };

  return true;
}

// Self-register. The winning node-renderer (src/ui/node-renderer.js) calls
// app.enhanceCodeBlockNode directly from renderNode, so this only needs to define
// the methods on app — it does NOT wrap renderNode (avoiding a load-order race).
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window !== 'undefined' && window.app) installCodeBlockNode(window.app);
  });
}

export default installCodeBlockNode;
