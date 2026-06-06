// mini-canvas.js — self-contained DOM+SVG mini-canvas exercise component.
//
// Uses real Nova node CSS classes (.node, .node-header, .node-body,
// .node-port, .port-dot) so nodes look identical to the main canvas.
// Wire positions are derived from actual DOM bounding rects (no manual
// math), and the pending wire tracks the cursor via a document-level
// mousemove listener so it follows the cursor even outside the canvas.
//
// Public API:
//   createMiniCanvas(containerEl, exercise, { onSolve })
//
// Data attributes on port dots (for Playwright):
//   data-node-id, data-port-role="output"|"input", data-port-name

// ---------------------------------------------------------------------------
// Static port schema for the node types used in exercises.
// ---------------------------------------------------------------------------
const PORT_SCHEMA = {
  'Input.Number': {
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'number' }]
  },
  'Output.Watch': {
    inputs: [{ id: 'value', name: 'value', type: 'any' }],
    outputs: []
  },
  'Math.Add': {
    inputs: [
      { id: 'a', name: 'a', type: 'number' },
      { id: 'b', name: 'b', type: 'number' }
    ],
    outputs: [{ id: 'result', name: 'result', type: 'number' }]
  },
  'Math.Subtract': {
    inputs: [
      { id: 'a', name: 'a', type: 'number' },
      { id: 'b', name: 'b', type: 'number' }
    ],
    outputs: [{ id: 'result', name: 'result', type: 'number' }]
  },
  'Math.Multiply': {
    inputs: [
      { id: 'a', name: 'a', type: 'number' },
      { id: 'b', name: 'b', type: 'number' }
    ],
    outputs: [{ id: 'result', name: 'result', type: 'number' }]
  },
  'Math.Divide': {
    inputs: [
      { id: 'a', name: 'a', type: 'number' },
      { id: 'b', name: 'b', type: 'number' }
    ],
    outputs: [{ id: 'result', name: 'result', type: 'number' }]
  },
  'Math.Power': {
    inputs: [
      { id: 'base', name: 'base', type: 'number' },
      { id: 'exp', name: 'exp', type: 'number' }
    ],
    outputs: [{ id: 'result', name: 'result', type: 'number' }]
  },
  'Math.Round': {
    inputs: [
      { id: 'a', name: 'value', type: 'number' },
      { id: 'digits', name: 'digits', type: 'number' }
    ],
    outputs: [{ id: 'result', name: 'result', type: 'number' }]
  },
  'Point.ByCoordinates': {
    inputs: [
      { id: 'x', name: 'x', type: 'number' },
      { id: 'y', name: 'y', type: 'number' },
      { id: 'z', name: 'z', type: 'number' }
    ],
    outputs: [{ id: 'point', name: 'point', type: 'point' }]
  },
  'Point.X': {
    inputs: [{ id: 'point', name: 'point', type: 'point' }],
    outputs: [{ id: 'x', name: 'x', type: 'number' }]
  },
  'List.Range': {
    inputs: [
      { id: 'start', name: 'start', type: 'number' },
      { id: 'end', name: 'end', type: 'number' },
      { id: 'step', name: 'step', type: 'number' }
    ],
    outputs: [{ id: 'list', name: 'list', type: 'list' }]
  },
  'List.Count': {
    inputs: [{ id: 'list', name: 'list', type: 'list' }],
    outputs: [{ id: 'count', name: 'count', type: 'number' }]
  },
  'List.Sequence': {
    inputs: [
      { id: 'start', name: 'start', type: 'number' },
      { id: 'step', name: 'step', type: 'number' },
      { id: 'count', name: 'count', type: 'number' }
    ],
    outputs: [{ id: 'list', name: 'list', type: 'list' }]
  },
  'List.Sum': {
    inputs: [{ id: 'list', name: 'list', type: 'list' }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }]
  }
};

// Visual meta: icon + accent color per node type (matches Nova's categories).
const NODE_META = {
  'Input.Number':       { icon: '#',  color: '#89b4fa' },
  'Output.Watch':       { icon: '◉',  color: '#cba6f7' },
  'Math.Add':           { icon: '+',  color: '#a6e3a1' },
  'Math.Subtract':      { icon: '−',  color: '#a6e3a1' },
  'Math.Multiply':      { icon: '×',  color: '#a6e3a1' },
  'Math.Divide':        { icon: '÷',  color: '#a6e3a1' },
  'Math.Power':         { icon: 'xⁿ', color: '#a6e3a1' },
  'Math.Round':         { icon: '≈',  color: '#a6e3a1' },
  'Point.ByCoordinates':{ icon: '·',  color: '#89b4fa' },
  'Point.X':            { icon: 'X',  color: '#89b4fa' },
  'List.Range':         { icon: '…',  color: '#fab387' },
  'List.Count':         { icon: 'n',  color: '#fab387' },
  'List.Sequence':      { icon: '⋮',  color: '#fab387' },
  'List.Sum':           { icon: 'Σ',  color: '#fab387' }
};

function _getSchema(nodeType) {
  return PORT_SCHEMA[nodeType] || {
    inputs: [{ id: 'input', name: 'in', type: 'any' }],
    outputs: [{ id: 'output', name: 'out', type: 'any' }]
  };
}

function _getMeta(nodeType) {
  return NODE_META[nodeType] || { icon: '⬡', color: '#6c7086' };
}

// ---------------------------------------------------------------------------
// Type compatibility.
// ---------------------------------------------------------------------------
function _typesCompatible(outType, inType) {
  if (!outType || !inType) return true;
  if (outType === 'any' || inType === 'any') return true;
  return outType === inType;
}

// ---------------------------------------------------------------------------
// SVG wire path.
// ---------------------------------------------------------------------------
function _bezierPath(from, to) {
  const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 40);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

// ---------------------------------------------------------------------------
// Main factory.
// ---------------------------------------------------------------------------

/**
 * Render a mini-canvas wiring exercise into containerEl.
 *
 * @param {HTMLElement} containerEl
 * @param {object}      exercise      one entry from exercises[]
 * @param {object}      opts
 * @param {Function}    opts.onSolve  called as onSolve(passed: boolean, message: string)
 */
export function createMiniCanvas(containerEl, exercise, { onSolve } = {}) {
  const userWires = [];
  let pendingWire = null; // { nodeId, portId, portType, dotEl }

  const nodes = exercise.nodes || [];

  // ── Wrapper ──────────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'mini-canvas';

  // ── SVG overlay for wires ─────────────────────────────────────────────────
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1';

  const preWireGroup = document.createElementNS(svgNS, 'g');
  preWireGroup.classList.add('mini-canvas-prewires');
  svg.appendChild(preWireGroup);

  const userWireGroup = document.createElementNS(svgNS, 'g');
  userWireGroup.classList.add('mini-canvas-userwires');
  svg.appendChild(userWireGroup);

  const pendingLine = document.createElementNS(svgNS, 'path');
  pendingLine.classList.add('mini-canvas-pending-wire');
  pendingLine.setAttribute('stroke', '#89b4fa');
  pendingLine.setAttribute('stroke-width', '2');
  pendingLine.setAttribute('fill', 'none');
  pendingLine.setAttribute('stroke-dasharray', '6,3');
  pendingLine.style.display = 'none';
  svg.appendChild(pendingLine);

  // Canvas area: relative container so absolute nodes sit within it.
  const canvasEl = document.createElement('div');
  canvasEl.className = 'mini-canvas-area';
  canvasEl.appendChild(svg);
  wrapper.appendChild(canvasEl);

  // ── Port element registry ─────────────────────────────────────────────────
  // key: `${nodeId}:${role}:${portId}` → port dot element
  const portEls = new Map();

  // ── Render nodes ──────────────────────────────────────────────────────────
  nodes.forEach((node) => {
    const schema = _getSchema(node.type);
    const meta = _getMeta(node.type);
    const shortName = node.type.split('.').pop();
    const mx = Math.max(schema.inputs.length, schema.outputs.length, 1);

    const box = document.createElement('div');
    // Use real Nova `.node` class — gets border-top, background, border-radius.
    box.className = 'node mini-canvas-node';
    box.style.cssText = `left:${node.x}px;top:${node.y}px;--node-color:${meta.color};width:140px;position:absolute;cursor:default`;

    // Header
    const header = document.createElement('div');
    header.className = 'node-header';
    header.style.cursor = 'default';
    header.innerHTML =
      `<span class="node-header-icon" style="color:${meta.color};background:${meta.color}20">${meta.icon}</span>` +
      `<span class="node-header-title">${shortName}</span>`;
    box.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'node-body';

    for (let i = 0; i < mx; i++) {
      const inp = schema.inputs[i];
      const out = schema.outputs[i];
      let rowClass = 'node-port-row';
      if (inp && !out) rowClass += ' input-only';
      if (!inp && out) rowClass += ' output-only';

      const row = document.createElement('div');
      row.className = rowClass;

      if (inp) {
        const portDiv = document.createElement('div');
        portDiv.className = `node-port input port-type-${inp.type}`;

        const dot = document.createElement('span');
        dot.className = `port-dot port-type-${inp.type}`;
        dot.dataset.nodeId = node.id;
        dot.dataset.portRole = 'input';
        dot.dataset.portName = inp.id;
        dot.dataset.portType = inp.type;
        dot.title = `${inp.name} (${inp.type})`;

        const label = document.createElement('span');
        label.className = 'port-label';
        label.textContent = inp.name;

        portDiv.appendChild(dot);
        portDiv.appendChild(label);
        row.appendChild(portDiv);
        portEls.set(`${node.id}:input:${inp.id}`, dot);
      }

      if (out) {
        const portDiv = document.createElement('div');
        portDiv.className = `node-port output port-type-${out.type}`;

        const label = document.createElement('span');
        label.className = 'port-label';
        label.textContent = out.name;

        const dot = document.createElement('span');
        dot.className = `port-dot port-type-${out.type}`;
        dot.dataset.nodeId = node.id;
        dot.dataset.portRole = 'output';
        dot.dataset.portName = out.id;
        dot.dataset.portType = out.type;
        dot.title = `${out.name} (${out.type})`;

        portDiv.appendChild(label);
        portDiv.appendChild(dot);
        row.appendChild(portDiv);
        portEls.set(`${node.id}:output:${out.id}`, dot);
      }

      body.appendChild(row);
    }

    box.appendChild(body);
    canvasEl.appendChild(box);
  });

  // ── Port position (from live DOM rects) ───────────────────────────────────
  function _dotCenter(dotEl) {
    const dr = dotEl.getBoundingClientRect();
    const cr = canvasEl.getBoundingClientRect();
    return {
      x: dr.left - cr.left + dr.width / 2 + canvasEl.scrollLeft,
      y: dr.top  - cr.top  + dr.height / 2 + canvasEl.scrollTop
    };
  }

  // ── Wire state helpers ────────────────────────────────────────────────────
  function _allWires() {
    return [...(exercise.preDrawnWires || []), ...userWires];
  }

  function _isInputWired(nodeId, portId) {
    return _allWires().some((w) => w.toNode === nodeId && w.toPort === portId);
  }

  function _updateUnwiredClasses() {
    portEls.forEach((el, key) => {
      const [nodeId, role, portId] = key.split(':');
      if (role === 'input') {
        el.classList.toggle('unwired', !_isInputWired(nodeId, portId));
      }
    });
  }

  // ── SVG wire rendering ────────────────────────────────────────────────────
  function _makePath(from, to, stroke, width) {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', _bezierPath(from, to));
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', width);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    return p;
  }

  function _redrawWires() {
    while (preWireGroup.firstChild) preWireGroup.removeChild(preWireGroup.firstChild);
    while (userWireGroup.firstChild) userWireGroup.removeChild(userWireGroup.firstChild);

    (exercise.preDrawnWires || []).forEach((w) => {
      const fromDot = portEls.get(`${w.fromNode}:output:${w.fromPort}`);
      const toDot   = portEls.get(`${w.toNode}:input:${w.toPort}`);
      if (!fromDot || !toDot) return;
      preWireGroup.appendChild(_makePath(_dotCenter(fromDot), _dotCenter(toDot), '#6c7086', 2));
    });

    userWires.forEach((w) => {
      const fromDot = portEls.get(`${w.fromNode}:output:${w.fromPort}`);
      const toDot   = portEls.get(`${w.toNode}:input:${w.toPort}`);
      if (!fromDot || !toDot) return;
      userWireGroup.appendChild(_makePath(_dotCenter(fromDot), _dotCenter(toDot), '#89b4fa', 2));
    });

    _updateUnwiredClasses();
  }

  // ── Wire interaction ──────────────────────────────────────────────────────
  // Track cursor globally so the pending wire follows even outside the canvas.
  function _onDocMouseMove(e) {
    if (!pendingWire) return;
    const fromDot = portEls.get(`${pendingWire.nodeId}:output:${pendingWire.portId}`);
    if (!fromDot) return;
    const from = _dotCenter(fromDot);
    const cr = canvasEl.getBoundingClientRect();
    const to = {
      x: e.clientX - cr.left + canvasEl.scrollLeft,
      y: e.clientY - cr.top  + canvasEl.scrollTop
    };
    pendingLine.setAttribute('d', _bezierPath(from, to));
  }

  function _cancelPending() {
    if (pendingWire && pendingWire.dotEl) {
      pendingWire.dotEl.classList.remove('pending');
    }
    pendingWire = null;
    pendingLine.style.display = 'none';
    document.removeEventListener('mousemove', _onDocMouseMove);
  }

  function _startPending(dotEl) {
    _cancelPending();
    const nodeId  = dotEl.dataset.nodeId;
    const portId  = dotEl.dataset.portName;
    const portType = dotEl.dataset.portType;
    pendingWire = { nodeId, portId, portType, dotEl };
    dotEl.classList.add('pending');
    pendingLine.style.display = '';
    const from = _dotCenter(dotEl);
    pendingLine.setAttribute('d', _bezierPath(from, from));
    document.addEventListener('mousemove', _onDocMouseMove);
  }

  function _completeWire(toDotEl) {
    if (!pendingWire) return;
    const toNodeId  = toDotEl.dataset.nodeId;
    const toPortId  = toDotEl.dataset.portName;
    const toPortType = toDotEl.dataset.portType;

    if (toNodeId === pendingWire.nodeId) { _cancelPending(); return; }
    if (!_typesCompatible(pendingWire.portType, toPortType)) { return; } // no-op on mismatch

    // Remove any existing wire into this input.
    const idx = userWires.findIndex((w) => w.toNode === toNodeId && w.toPort === toPortId);
    if (idx >= 0) userWires.splice(idx, 1);

    userWires.push({ fromNode: pendingWire.nodeId, fromPort: pendingWire.portId, toNode: toNodeId, toPort: toPortId });
    _cancelPending();
    _redrawWires();
    _clearFeedback();
  }

  canvasEl.addEventListener('click', function (e) {
    const dotEl = e.target.closest('[data-port-role]');

    if (!dotEl) {
      _cancelPending();
      return;
    }

    const role = dotEl.dataset.portRole;

    if (role === 'output') {
      if (pendingWire) _cancelPending();
      _startPending(dotEl);
      e.stopPropagation();
      return;
    }

    if (role === 'input') {
      if (pendingWire) {
        _completeWire(dotEl);
        e.stopPropagation();
        return;
      }
      // Re-route: remove existing user wire to this port.
      const nodeId = dotEl.dataset.nodeId;
      const portId = dotEl.dataset.portName;
      const idx = userWires.findIndex((w) => w.toNode === nodeId && w.toPort === portId);
      if (idx >= 0) {
        userWires.splice(idx, 1);
        _redrawWires();
        _clearFeedback();
      }
      e.stopPropagation();
    }
  });

  // ── Feedback banner ───────────────────────────────────────────────────────
  let bannerEl = null;

  function _clearFeedback() {
    if (bannerEl) { bannerEl.remove(); bannerEl = null; }
  }

  function _showFeedback(passed) {
    _clearFeedback();
    bannerEl = document.createElement('div');
    bannerEl.className = passed ? 'mini-canvas-success' : 'mini-canvas-error';
    bannerEl.textContent = passed
      ? 'Correct! Well done.'
      : 'Not quite — check your connections and try again.';
    wrapper.insertBefore(bannerEl, submitBtn);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitBtn = document.createElement('button');
  submitBtn.className = 'mini-canvas-submit';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', function () {
    _cancelPending();
    const graphState = { nodes: exercise.nodes, wires: [...(exercise.preDrawnWires || []), ...userWires] };
    let passed = false;
    try { passed = exercise.accept(graphState); } catch (_) { /* */ }
    _showFeedback(passed);
    if (typeof onSolve === 'function') {
      onSolve(passed, passed ? 'Correct! Well done.' : 'Not quite — check your connections and try again.');
    }
  });
  wrapper.appendChild(submitBtn);

  // ── Mount and initial draw ────────────────────────────────────────────────
  containerEl.appendChild(wrapper);

  // Wait one frame for layout to settle before computing wire positions.
  requestAnimationFrame(() => _redrawWires());

  return {
    refresh() { _redrawWires(); },
    get userWires() { return userWires.slice(); }
  };
}
