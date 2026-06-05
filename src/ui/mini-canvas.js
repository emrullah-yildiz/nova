// mini-canvas.js — self-contained DOM+SVG mini-canvas exercise component.
//
// Renders a wiring exercise: pre-placed nodes, pre-drawn wires, and interactive
// wire drawing. No imports from src/app/app.js; no global state mutation.
//
// Public API:
//   createMiniCanvas(containerEl, exercise, { onSolve })
//
// Data attributes on port elements (for Playwright):
//   data-node-id, data-port-role="output"|"input", data-port-name

// ---------------------------------------------------------------------------
// Static port schema for the node types used in exercises.
// Maps node type → { inputs: [{id, name, type}], outputs: [{id, name, type}] }
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

// Fallback schema for unknown node types (treat everything as 'any').
function _fallbackSchema(nodeType) {
  return {
    inputs: [{ id: 'input', name: 'in', type: 'any' }],
    outputs: [{ id: 'output', name: 'out', type: 'any' }]
  };
}

function _getSchema(nodeType) {
  return PORT_SCHEMA[nodeType] || _fallbackSchema(nodeType);
}

// ---------------------------------------------------------------------------
// Type compatibility check for wire drawing.
// Compatible = types match OR either side is 'any'.
// ---------------------------------------------------------------------------
function _typesCompatible(outType, inType) {
  if (!outType || !inType) return true;
  if (outType === 'any' || inType === 'any') return true;
  return outType === inType;
}

// ---------------------------------------------------------------------------
// Layout helpers — compute canvas bounding box to scale nodes into view.
// ---------------------------------------------------------------------------
const NODE_WIDTH = 130;
const NODE_HEADER_H = 26;
const PORT_RADIUS = 6;
const PORT_SPACING = 22;
const MIN_NODE_HEIGHT = 48;

function _nodeHeight(nodeType) {
  const schema = _getSchema(nodeType);
  const portCount = Math.max(schema.inputs.length, schema.outputs.length, 1);
  return Math.max(MIN_NODE_HEIGHT, NODE_HEADER_H + portCount * PORT_SPACING + 8);
}

// ---------------------------------------------------------------------------
// Port position helpers (relative to node's top-left x,y).
// ---------------------------------------------------------------------------
function _inputPortY(schema, portIdx) {
  return NODE_HEADER_H + portIdx * PORT_SPACING + PORT_SPACING / 2;
}

function _outputPortY(schema, portIdx) {
  return NODE_HEADER_H + portIdx * PORT_SPACING + PORT_SPACING / 2;
}

// Absolute position of a port in canvas coordinates.
function _portAbsPos(node, role, portIdx) {
  const schema = _getSchema(node.type);
  if (role === 'output') {
    return {
      x: node.x + NODE_WIDTH,
      y: node.y + _outputPortY(schema, portIdx)
    };
  } else {
    return {
      x: node.x,
      y: node.y + _inputPortY(schema, portIdx)
    };
  }
}

// Find port index by id in schema list.
function _portIndex(schema, role, portId) {
  const list = role === 'output' ? schema.outputs : schema.inputs;
  return list.findIndex((p) => p.id === portId);
}

// ---------------------------------------------------------------------------
// Wire position helpers.
// ---------------------------------------------------------------------------
function _wireCoords(nodes, wire) {
  const fromNode = nodes.find((n) => n.id === wire.fromNode);
  const toNode = nodes.find((n) => n.id === wire.toNode);
  if (!fromNode || !toNode) return null;

  const fromSchema = _getSchema(fromNode.type);
  const toSchema = _getSchema(toNode.type);

  const fromIdx = _portIndex(fromSchema, 'output', wire.fromPort);
  const toIdx = _portIndex(toSchema, 'input', wire.toPort);

  if (fromIdx < 0 || toIdx < 0) return null;

  const from = _portAbsPos(fromNode, 'output', fromIdx);
  const to = _portAbsPos(toNode, 'input', toIdx);
  return { from, to };
}

// Build an SVG cubic bezier path string between two points.
function _bezierPath(from, to) {
  const dx = Math.abs(to.x - from.x) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

// ---------------------------------------------------------------------------
// Main factory.
// ---------------------------------------------------------------------------

/**
 * Create a mini-canvas exercise widget inside containerEl.
 *
 * @param {HTMLElement} containerEl
 * @param {object}      exercise      one entry from exercises[]
 * @param {object}      opts
 * @param {Function}    opts.onSolve  called as onSolve(passed: boolean, message: string)
 */
export function createMiniCanvas(containerEl, exercise, { onSolve } = {}) {
  // Track user-drawn wires separately from pre-drawn wires.
  const userWires = [];

  // Pending wire state: { nodeId, portRole, portName, portType, portEl }
  let pendingWire = null;

  // Build canvas bounding box so we can know the SVG dimensions.
  const nodes = exercise.nodes || [];
  let maxX = 0;
  let maxY = 0;
  nodes.forEach((n) => {
    maxX = Math.max(maxX, n.x + NODE_WIDTH + 20);
    maxY = Math.max(maxY, n.y + _nodeHeight(n.type) + 20);
  });
  const canvasW = Math.max(maxX, 300);
  const canvasH = Math.max(maxY, 240);

  // ── DOM skeleton ──────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'mini-canvas';

  // SVG layer for wires (sits behind node boxes via z-index).
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', canvasW);
  svg.setAttribute('height', canvasH);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';

  // Pre-drawn wire group.
  const preWireGroup = document.createElementNS(svgNS, 'g');
  preWireGroup.classList.add('mini-canvas-prewires');
  svg.appendChild(preWireGroup);

  // User wire group.
  const userWireGroup = document.createElementNS(svgNS, 'g');
  userWireGroup.classList.add('mini-canvas-userwires');
  svg.appendChild(userWireGroup);

  // Pending wire (animated line following cursor — not yet connected).
  const pendingLine = document.createElementNS(svgNS, 'path');
  pendingLine.classList.add('mini-canvas-pending-wire');
  pendingLine.setAttribute('stroke', '#89b4fa');
  pendingLine.setAttribute('stroke-width', '2');
  pendingLine.setAttribute('fill', 'none');
  pendingLine.setAttribute('stroke-dasharray', '5,3');
  pendingLine.style.display = 'none';
  svg.appendChild(pendingLine);

  // Canvas container (positioned so nodes and SVG can overlap).
  const canvasEl = document.createElement('div');
  canvasEl.className = 'mini-canvas-area';
  canvasEl.style.position = 'relative';
  canvasEl.style.width = canvasW + 'px';
  canvasEl.style.height = canvasH + 'px';
  canvasEl.style.overflow = 'auto';
  canvasEl.appendChild(svg);

  wrapper.appendChild(canvasEl);

  // ── Render all nodes ───────────────────────────────────────────────────────
  const portEls = new Map(); // key: `${nodeId}:${role}:${portId}` → Element

  nodes.forEach((node) => {
    const schema = _getSchema(node.type);
    const nodeH = _nodeHeight(node.type);

    const box = document.createElement('div');
    box.className = 'mini-canvas-node';
    box.style.left = node.x + 'px';
    box.style.top = node.y + 'px';
    box.style.width = NODE_WIDTH + 'px';
    box.style.height = nodeH + 'px';

    // Header
    const header = document.createElement('div');
    header.className = 'mini-canvas-node-header';
    header.textContent = node.type.split('.').pop(); // short label e.g. "Add"
    header.title = node.type;
    box.appendChild(header);

    // Port rows container
    const portsEl = document.createElement('div');
    portsEl.className = 'mini-canvas-ports';
    portsEl.style.position = 'relative';
    portsEl.style.height = (nodeH - NODE_HEADER_H) + 'px';
    box.appendChild(portsEl);

    // Input ports
    schema.inputs.forEach((p, idx) => {
      const dot = document.createElement('div');
      dot.className = 'mini-canvas-port input';
      dot.dataset.nodeId = node.id;
      dot.dataset.portRole = 'input';
      dot.dataset.portName = p.id;
      dot.dataset.portType = p.type;
      dot.title = p.name + ' (' + p.type + ')';
      dot.style.top = _inputPortY(schema, idx) + 'px';
      dot.style.left = (-PORT_RADIUS) + 'px';

      const label = document.createElement('span');
      label.className = 'mini-canvas-port-label mini-canvas-port-label--input';
      label.textContent = p.name;
      dot.appendChild(label);

      portsEl.appendChild(dot);
      portEls.set(node.id + ':input:' + p.id, dot);
    });

    // Output ports
    schema.outputs.forEach((p, idx) => {
      const dot = document.createElement('div');
      dot.className = 'mini-canvas-port output';
      dot.dataset.nodeId = node.id;
      dot.dataset.portRole = 'output';
      dot.dataset.portName = p.id;
      dot.dataset.portType = p.type;
      dot.title = p.name + ' (' + p.type + ')';
      dot.style.top = _outputPortY(schema, idx) + 'px';
      dot.style.right = (-PORT_RADIUS) + 'px';

      const label = document.createElement('span');
      label.className = 'mini-canvas-port-label mini-canvas-port-label--output';
      label.textContent = p.name;
      dot.appendChild(label);

      portsEl.appendChild(dot);
      portEls.set(node.id + ':output:' + p.id, dot);
    });

    canvasEl.appendChild(box);
  });

  // ── Helpers to query wired state ──────────────────────────────────────────
  function _allWires() {
    return [...(exercise.preDrawnWires || []), ...userWires];
  }

  function _isInputWired(nodeId, portId) {
    return _allWires().some(
      (w) => w.toNode === nodeId && w.toPort === portId
    );
  }

  // ── Mark unwired input ports as hollow ────────────────────────────────────
  function _updateUnwiredClasses() {
    portEls.forEach((el, key) => {
      const [nodeId, role, portId] = key.split(':');
      if (role === 'input') {
        if (_isInputWired(nodeId, portId)) {
          el.classList.remove('unwired');
        } else {
          el.classList.add('unwired');
        }
      }
    });
  }

  // ── Draw SVG wires ────────────────────────────────────────────────────────
  function _drawSvgWire(parentGroup, wire, strokeColor, strokeWidth) {
    const coords = _wireCoords(nodes, wire);
    if (!coords) return;
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', _bezierPath(coords.from, coords.to));
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', strokeWidth);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    parentGroup.appendChild(path);
    return path;
  }

  function _redrawWires() {
    // Clear previous
    while (preWireGroup.firstChild) preWireGroup.removeChild(preWireGroup.firstChild);
    while (userWireGroup.firstChild) userWireGroup.removeChild(userWireGroup.firstChild);

    // Pre-drawn wires: slightly dimmer
    (exercise.preDrawnWires || []).forEach((w) => {
      _drawSvgWire(preWireGroup, w, '#6c7086', 2);
    });

    // User wires: bright
    userWires.forEach((w) => {
      _drawSvgWire(userWireGroup, w, '#89b4fa', 2);
    });

    _updateUnwiredClasses();
  }

  // ── Wire interaction ──────────────────────────────────────────────────────
  function _cancelPending() {
    if (pendingWire) {
      const el = pendingWire.portEl;
      if (el) el.classList.remove('pending');
      pendingWire = null;
    }
    pendingLine.style.display = 'none';
  }

  function _startPending(portEl) {
    _cancelPending();
    const nodeId = portEl.dataset.nodeId;
    const portId = portEl.dataset.portName;
    const portType = portEl.dataset.portType;
    pendingWire = { nodeId, portId, portType, portEl };
    portEl.classList.add('pending');
    pendingLine.style.display = '';

    // Initial position for the pending line (will update on mousemove).
    const node = nodes.find((n) => n.id === nodeId);
    const schema = _getSchema(node.type);
    const idx = _portIndex(schema, 'output', portId);
    const pos = _portAbsPos(node, 'output', idx >= 0 ? idx : 0);
    pendingLine.setAttribute('d', _bezierPath(pos, pos));
  }

  function _completeWire(toPortEl) {
    if (!pendingWire) return;

    const toNodeId = toPortEl.dataset.nodeId;
    const toPortId = toPortEl.dataset.portName;
    const toPortType = toPortEl.dataset.portType;

    // Must not wire to same node.
    if (toNodeId === pendingWire.nodeId) {
      _cancelPending();
      return;
    }

    // Type compatibility check.
    if (!_typesCompatible(pendingWire.portType, toPortType)) {
      _cancelPending();
      return;
    }

    // Remove any existing wire to this input port (one wire per input).
    const existingIdx = userWires.findIndex(
      (w) => w.toNode === toNodeId && w.toPort === toPortId
    );
    if (existingIdx >= 0) userWires.splice(existingIdx, 1);

    // Add new wire.
    userWires.push({
      fromNode: pendingWire.nodeId,
      fromPort: pendingWire.portId,
      toNode: toNodeId,
      toPort: toPortId
    });

    _cancelPending();
    _redrawWires();
    _clearFeedback();
  }

  // Delegate click events on the canvas area.
  canvasEl.addEventListener('click', function (e) {
    const portEl = e.target.closest('[data-port-role]');

    if (!portEl) {
      // Clicked canvas background or node header — cancel.
      _cancelPending();
      return;
    }

    const role = portEl.dataset.portRole;

    if (role === 'output') {
      if (pendingWire) {
        // Second output click — cancel and start new.
        _cancelPending();
      }
      _startPending(portEl);
      e.stopPropagation();
      return;
    }

    if (role === 'input') {
      if (pendingWire) {
        _completeWire(portEl);
        e.stopPropagation();
        return;
      }
      // Clicking an input with no pending — if it already has a user wire,
      // remove that wire so the user can re-route.
      const nodeId = portEl.dataset.nodeId;
      const portId = portEl.dataset.portName;
      const existingIdx = userWires.findIndex(
        (w) => w.toNode === nodeId && w.toPort === portId
      );
      if (existingIdx >= 0) {
        userWires.splice(existingIdx, 1);
        _redrawWires();
        _clearFeedback();
      }
      e.stopPropagation();
    }
  });

  // Move pending line to follow cursor.
  canvasEl.addEventListener('mousemove', function (e) {
    if (!pendingWire) return;
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const node = nodes.find((n) => n.id === pendingWire.nodeId);
    const schema = _getSchema(node.type);
    const idx = _portIndex(schema, 'output', pendingWire.portId);
    const from = _portAbsPos(node, 'output', idx >= 0 ? idx : 0);
    pendingLine.setAttribute('d', _bezierPath(from, { x: mx, y: my }));
  });

  // ── Feedback banner ───────────────────────────────────────────────────────
  let bannerEl = null;

  function _clearFeedback() {
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
  }

  function _showFeedback(passed) {
    _clearFeedback();
    bannerEl = document.createElement('div');
    if (passed) {
      bannerEl.className = 'mini-canvas-success';
      bannerEl.textContent = 'Correct! Well done.';
    } else {
      bannerEl.className = 'mini-canvas-error';
      bannerEl.textContent = 'Not quite — check your connections and try again.';
    }
    wrapper.appendChild(bannerEl);
  }

  // ── Submit button ─────────────────────────────────────────────────────────
  const submitBtn = document.createElement('button');
  submitBtn.className = 'mini-canvas-submit';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', function () {
    _cancelPending();
    const graphState = {
      nodes: exercise.nodes,
      wires: [...(exercise.preDrawnWires || []), ...userWires]
    };
    let passed = false;
    try {
      passed = exercise.accept(graphState);
    } catch (_) {
      passed = false;
    }
    const message = passed
      ? 'Correct! Well done.'
      : 'Not quite — check your connections and try again.';

    _showFeedback(passed);

    if (typeof onSolve === 'function') {
      onSolve(passed, message);
    }
  });

  wrapper.appendChild(submitBtn);

  // ── Initial render ────────────────────────────────────────────────────────
  _redrawWires();

  // ── Return public API (for tests if needed) ───────────────────────────────
  return {
    /** Force a re-render of wires (useful after external state changes). */
    refresh() { _redrawWires(); },
    /** Current user-drawn wires. */
    get userWires() { return userWires.slice(); }
  };
}
