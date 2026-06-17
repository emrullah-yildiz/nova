// mini-canvas.js — self-contained DOM+SVG mini-canvas exercise component.
//
// Uses real Nova node CSS classes (.node, .node-header, .node-body,
// .node-port, .port-dot) so nodes look identical to the main canvas.
// Wire positions are derived from actual DOM bounding rects (no manual
// math), and the pending wire tracks the cursor via a document-level
// mousemove listener so it follows the cursor even outside the canvas.
//
// Pan/zoom: scroll-wheel zooms toward cursor (range 0.2–3.0).
//   Middle-mouse drag or Space+drag pans the viewport.
//   All node positions and SVG wire paths live inside .mini-canvas-viewport
//   so they transform together; _dotCenter() computes coords relative to
//   the SVG (which is also inside the viewport), so bezier endpoints are
//   always correct after any pan/zoom.
//
// Wire interaction: both click-to-connect (click output, click input) and
//   drag-to-connect (mousedown on output dot, drag, mouseup on input dot).
//
// Public API:
//   createMiniCanvas(containerEl, exercise, { onSolve })
//
// Data attributes on port dots (for Playwright):
//   data-node-id, data-port-role="output"|"input", data-port-name

// ---------------------------------------------------------------------------
// Inline control schema — nodes whose body shows a value control instead of
// (or in addition to) port rows.  Mirrors the real node-renderer.js behaviour:
//   type 'number' → num-spin-wrap with <input type="number">
//   type 'text'   → <input type="text">
// controlId is the key inside node.controlValues that holds the live value.
// ---------------------------------------------------------------------------
const CONTROL_SCHEMA = {
  'Input.Number':  { controlId: 'val', type: 'number' },
  'Input.Integer': { controlId: 'val', type: 'number' },
  'Input.Text':    { controlId: 'val', type: 'text'   }
};

// ---------------------------------------------------------------------------
// Static port schema for the node types used in exercises.
// Source-of-truth: src/nodes/categories/*.js (read, not guessed).
// ---------------------------------------------------------------------------
const PORT_SCHEMA = {
  'Input.Number': {
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'number' }]
  },
  'Input.Integer': {
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'number' }]
  },
  'Input.Text': {
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'string' }]
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
  'Point.Y': {
    inputs: [{ id: 'point', name: 'point', type: 'point' }],
    outputs: [{ id: 'y', name: 'y', type: 'number' }]
  },
  'Point.Z': {
    inputs: [{ id: 'point', name: 'point', type: 'point' }],
    outputs: [{ id: 'z', name: 'z', type: 'number' }]
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
  },
  'List.Create': {
    inputs: [
      { id: 'item0', name: 'item 0', type: 'any' },
      { id: 'item1', name: 'item 1', type: 'any' }
    ],
    outputs: [{ id: 'list', name: 'list', type: 'list' }]
  },
  'List.First': {
    inputs: [{ id: 'list', name: 'list', type: 'list' }],
    outputs: [{ id: 'item', name: 'item', type: 'any' }]
  },
  'List.Last': {
    inputs: [{ id: 'list', name: 'list', type: 'list' }],
    outputs: [{ id: 'item', name: 'item', type: 'any' }]
  }
};

// Visual meta: icon + accent color per node type (matches Nova's categories).
const NODE_META = {
  'Input.Number':        { icon: '#',  color: '#89b4fa' },
  'Input.Integer':       { icon: '#',  color: '#89b4fa' },
  'Input.Text':          { icon: '"',  color: '#89b4fa' },
  'Output.Watch':        { icon: '◉',  color: '#cba6f7' },
  'Math.Add':            { icon: '+',  color: '#a6e3a1' },
  'Math.Subtract':       { icon: '−',  color: '#a6e3a1' },
  'Math.Multiply':       { icon: '×',  color: '#a6e3a1' },
  'Math.Divide':         { icon: '÷',  color: '#a6e3a1' },
  'Math.Power':          { icon: 'xⁿ', color: '#a6e3a1' },
  'Math.Round':          { icon: '≈',  color: '#a6e3a1' },
  'Point.ByCoordinates': { icon: '·',  color: '#89b4fa' },
  'Point.X':             { icon: '→',  color: '#89b4fa' },
  'Point.Y':             { icon: '↑',  color: '#89b4fa' },
  'Point.Z':             { icon: '↗',  color: '#89b4fa' },
  'List.Range':          { icon: '…',  color: '#fab387' },
  'List.Count':          { icon: '#',  color: '#fab387' },
  'List.Sequence':       { icon: '⋮',  color: '#fab387' },
  'List.Sum':            { icon: 'Σ',  color: '#fab387' },
  'List.Create':         { icon: '⊞',  color: '#fab387' },
  'List.First':          { icon: '⊢',  color: '#fab387' },
  'List.Last':           { icon: '⊣',  color: '#fab387' }
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
  let _dragging = false;  // true while a drag gesture is in flight

  // ── Pan/zoom state ────────────────────────────────────────────────────────
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  const ZOOM_MIN = 0.2;
  const ZOOM_MAX = 3.0;

  // Space-key pan state
  let spaceDown = false;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;

  // Drag-wire: track whether the mouse moved enough to be a drag (vs click).
  // A drag is detected when the cursor moves > DRAG_THRESHOLD px from mousedown.
  const DRAG_THRESHOLD = 4;
  let dragStartX = 0;
  let dragStartY = 0;
  let isDragWire = false;

  const nodes = exercise.nodes || [];

  // ── Wrapper ──────────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'mini-canvas';

  // Canvas area: relative container so absolute nodes sit within it.
  const canvasEl = document.createElement('div');
  canvasEl.className = 'mini-canvas-area';
  wrapper.appendChild(canvasEl);

  // ── Viewport wrapper — all nodes + SVG live inside so pan/zoom transforms
  //    them together. transform-origin 0,0 so we can do cursor-based zoom.
  const viewport = document.createElement('div');
  viewport.className = 'mini-canvas-viewport';
  viewport.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;';
  canvasEl.appendChild(viewport);

  function _applyTransform() {
    viewport.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  }

  // ── SVG overlay for wires — inside the viewport so coords are in viewport space ─
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1';
  viewport.appendChild(svg);

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
    // data-node-id lets the E2E spec and CSS locate any descendant of this node.
    box.dataset.nodeId = node.id;
    // Set individual style properties so that the CSS custom property
    // --node-color is applied via the proper setProperty API (style.cssText
    // does not reliably set custom properties in all browsers).
    box.style.position = 'absolute';
    box.style.left = `${node.x}px`;
    box.style.top  = `${node.y}px`;
    box.style.width = '140px';
    box.style.cursor = 'default';
    box.style.setProperty('--node-color', meta.color);

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

    // ── Inline value control (e.g. Input.Number spinner) ─────────────────
    // Mirrors the num-spin-wrap rendered by the real node-renderer.js so
    // the node body looks identical to the main Nova canvas.
    const ctrlDef = CONTROL_SCHEMA[node.type];
    if (ctrlDef) {
      const cv = node.controlValues && node.controlValues[ctrlDef.controlId];
      const displayVal = cv !== undefined && cv !== null ? cv : 0;
      const controlDiv = document.createElement('div');
      controlDiv.className = 'node-control';

      if (ctrlDef.type === 'number') {
        const wrap = document.createElement('div');
        wrap.className = 'num-spin-wrap';
        wrap.style.width = '100%';

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.value = displayVal;
        numInput.step = '1';
        numInput.readOnly = true;
        numInput.dataset.miniCanvasValue = 'true';
        numInput.style.cssText =
          'width:100%;padding:3px 20px 3px 8px;font-size:11px;height:24px;' +
          'box-sizing:border-box;background:var(--bg-tertiary);' +
          'border:1px solid var(--border-color);border-radius:4px';
        // Prevent clicks on the input from bubbling to wire interaction.
        numInput.addEventListener('click', (e) => e.stopPropagation());
        numInput.addEventListener('mousedown', (e) => e.stopPropagation());

        const spinBtns = document.createElement('div');
        spinBtns.className = 'num-spin-btns';

        const upBtn = document.createElement('button');
        upBtn.className = 'num-spin-btn';
        upBtn.textContent = '▲';
        upBtn.addEventListener('click', (e) => e.stopPropagation());
        upBtn.addEventListener('mousedown', (e) => e.stopPropagation());

        const downBtn = document.createElement('button');
        downBtn.className = 'num-spin-btn';
        downBtn.textContent = '▼';
        downBtn.addEventListener('click', (e) => e.stopPropagation());
        downBtn.addEventListener('mousedown', (e) => e.stopPropagation());

        spinBtns.appendChild(upBtn);
        spinBtns.appendChild(downBtn);
        wrap.appendChild(numInput);
        wrap.appendChild(spinBtns);
        controlDiv.appendChild(wrap);
      } else if (ctrlDef.type === 'text') {
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.value = displayVal;
        textInput.readOnly = true;
        textInput.dataset.miniCanvasValue = 'true';
        textInput.addEventListener('click', (e) => e.stopPropagation());
        textInput.addEventListener('mousedown', (e) => e.stopPropagation());
        controlDiv.appendChild(textInput);
      }

      body.appendChild(controlDiv);
    }

    box.appendChild(body);
    viewport.appendChild(box);
  });

  // ── Port position (from live DOM rects, SVG-relative) ────────────────────
  // Both the SVG and the port dots are inside the viewport, so their bounding
  // rects share the same scale. We still use the SVG rect as the origin so
  // SVG <path> d-attribute values map correctly to screen coordinates.
  function _dotCenter(dotEl) {
    const dr = dotEl.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    return {
      x: dr.left - sr.left + dr.width  / 2,
      y: dr.top  - sr.top  + dr.height / 2
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
  // Used for both click-to-connect (cursor tracking) and drag-to-connect (visual).
  function _onDocMouseMove(e) {
    if (!_dragging || !pendingWire) return;
    const fromDot = portEls.get(`${pendingWire.nodeId}:output:${pendingWire.portId}`);
    if (!fromDot) return;
    const from = _dotCenter(fromDot);
    const sr = svg.getBoundingClientRect();
    const to = { x: e.clientX - sr.left, y: e.clientY - sr.top };
    pendingLine.style.display = '';
    pendingLine.setAttribute('d', _bezierPath(from, to));
  }

  function _cancelPending() {
    if (pendingWire && pendingWire.dotEl) {
      pendingWire.dotEl.classList.remove('pending');
    }
    pendingWire = null;
    _dragging = false;
    isDragWire = false;
    pendingLine.style.display = 'none';
    document.removeEventListener('mousemove', _onDocMouseMove);
  }

  function _startPending(dotEl) {
    _cancelPending();
    const nodeId  = dotEl.dataset.nodeId;
    const portId  = dotEl.dataset.portName;
    const portType = dotEl.dataset.portType;
    pendingWire = { nodeId, portId, portType, dotEl };
    _dragging = true;
    dotEl.classList.add('pending');
    const from = _dotCenter(dotEl);
    pendingLine.setAttribute('d', _bezierPath(from, from));
    // Ensure visibility via both CSS style and SVG display attribute so no
    // residual SVG-level display="none" from a prior setAttribute can hide it.
    pendingLine.style.display = '';
    pendingLine.removeAttribute('display');
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

  // ── Port mousedown — initiates drag-wire tracking ────────────────────────
  // Records the start position. If the cursor moves beyond DRAG_THRESHOLD
  // before mouseup, it is treated as a drag-to-connect gesture.
  // Simple click-to-connect is handled entirely by the click handler below.
  canvasEl.addEventListener('mousedown', function (e) {
    // Ignore middle-mouse (pan) and right-click.
    if (e.button !== 0) return;
    // Ignore space-pan drag.
    if (spaceDown) return;

    const dotEl = e.target.closest('[data-port-role]');
    if (!dotEl || dotEl.dataset.portRole !== 'output') return;

    dragStartX = e.clientX;
    dragStartY = e.clientY;
    isDragWire = false;

    const dotRef = dotEl;
    let dragStarted = false;
    let dragCancelled = false;

    function onDragMove(ev) {
      if (dragCancelled) return;
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      if (!dragStarted && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragStarted = true;
        isDragWire = true;
        _cancelPending();
        _startPending(dotRef);
      }
    }

    function onDragUp(ev) {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragUp);
      if (!dragStarted || !pendingWire) return;
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetDot = target && target.closest('[data-port-role]');
      if (targetDot && targetDot.dataset.portRole === 'input') {
        _completeWire(targetDot);
      } else {
        _cancelPending();
      }
    }

    function onClickCancel() {
      dragCancelled = true;
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragUp);
    }
    dotRef.addEventListener('click', onClickCancel, { once: true });

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
  });

  canvasEl.addEventListener('click', function (e) {
    const dotEl = e.target.closest('[data-port-role]');
    if (!dotEl) return;

    if (!dotEl) {
      if (!isDragWire) _cancelPending();
      return;
    }

    if (isDragWire) {
      isDragWire = false;
      e.stopPropagation();
      return;
    }

    const role = dotEl.dataset.portRole;

    if (role === 'output') {
      if (pendingWire) _cancelPending();
      _startPending(dotEl);
      e.preventDefault();
      e.stopPropagation();
    } else if (role === 'input' && pendingWire) {
      _completeWire(dotEl);
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // ── Pan: middle-mouse drag or Space+left-drag ─────────────────────────────
  canvasEl.addEventListener('mousedown', function (e) {
    const isMiddle = e.button === 1;
    const isSpaceDrag = e.button === 0 && spaceDown;
    if (!isMiddle && !isSpaceDrag) return;
    e.preventDefault();
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPanX = panX;
    panStartPanY = panY;
    canvasEl.style.cursor = 'grabbing';

    function onMove(ev) {
      if (!isPanning) return;
      panX = panStartPanX + (ev.clientX - panStartX);
      panY = panStartPanY + (ev.clientY - panStartY);
      _applyTransform();
    }
    function onUp() {
      isPanning = false;
      canvasEl.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Space key enables pan-drag mode. Escape cancels in-flight pending wire.
  function _onKeyDown(e) {
    if (e.code === 'Space' && e.target === document.body) {
      spaceDown = true;
      canvasEl.style.cursor = 'grab';
      e.preventDefault();
    }
    if (e.key === 'Escape' && _dragging) {
      _cancelPending();
    }
  }
  function _onKeyUp(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      if (!isPanning) canvasEl.style.cursor = '';
    }
  }
  document.addEventListener('keydown', _onKeyDown);
  document.addEventListener('keyup', _onKeyUp);

  // ── Zoom: scroll wheel zooms toward cursor ─────────────────────────────────
  canvasEl.addEventListener('wheel', function (e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta));
    if (newZoom === zoom) return;

    const rect = canvasEl.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    panX = cursorX - (cursorX - panX) * (newZoom / zoom);
    panY = cursorY - (cursorY - panY) * (newZoom / zoom);
    zoom = newZoom;
    _applyTransform();
    _redrawWires();
  }, { passive: false });

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

  // Apply initial transform and wait one frame for layout to settle before
  // computing wire positions.
  _applyTransform();
  requestAnimationFrame(() => _redrawWires());

  // ── Cleanup: remove document-level listeners when the component is removed ─
  // (Uses a MutationObserver on the wrapper so cleanup is automatic.)
  const _cleanup = new MutationObserver(() => {
    if (!document.contains(wrapper)) {
      document.removeEventListener('keydown', _onKeyDown);
      document.removeEventListener('keyup', _onKeyUp);
      _cleanup.disconnect();
    }
  });
  _cleanup.observe(document.body, { childList: true, subtree: true });

  return {
    refresh() { _redrawWires(); },
    get userWires() { return userWires.slice(); }
  };
}
