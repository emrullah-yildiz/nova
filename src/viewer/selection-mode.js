// Nova — Geometry Selection Mode
//
// State machine for interactive 3D geometry selection driven by a node's
// "Select" button. When active, clicks in the 3D viewport accumulate geometry
// items into a selection set; an Approve/Cancel toolbar lets the user confirm
// or discard the pick.
//
// Public API:
//   activateSelectionMode(nodeId, mode, onApprove, onCancel)
//   deactivateSelectionMode()
//   isSelectionModeActive()
//   getSelectedItems()
//
// The "mode" parameter controls what geometry types count as selectable:
//   'faces'  — surface / solid meshes
//   'edges'  — line / curve geometry
//   'points' — point / vertex geometry
//
// Works with Nova geometry only (items tracked by geo-selector.js via
// Viewer3D._sceneItems). Items that match the mode are highlighted in
// green; non-matching items are dimmed. Multi-select: each click toggles
// an item into/out of the selection set. Approve fires onApprove(items[])
// where items is a list of scene-item labels; Cancel fires onCancel().

const _state = {
  active: false,
  nodeId: null,
  mode: null,         // 'faces' | 'edges' | 'points'
  items: [],          // accumulated selection (scene-item objects)
  onApprove: null,
  onCancel: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getViewer() {
  if (typeof window !== 'undefined' && window.Viewer3D) return window.Viewer3D;
  if (typeof globalThis !== 'undefined' && globalThis.Viewer3D) return globalThis.Viewer3D;
  return null;
}

/**
 * Determine whether a scene item's geometry matches the current selection mode.
 * We inspect the first THREE.js child to determine the type:
 *   - isMesh → faces
 *   - isLine / isLineSegments → edges
 *   - SphereGeometry (small mesh used for points) → points
 */
function _itemMatchesMode(item, mode) {
  if (!item || !item.group) return false;
  let first = null;
  item.group.traverse(function (obj) {
    if (!first && (obj.isMesh || obj.isLine || obj.isLineSegments)) first = obj;
  });
  if (!first) return false;
  // For 'faces': any mesh qualifies (Nova renders face/solid geometry as meshes).
  // We intentionally do NOT try to exclude sphere meshes here — the distinction
  // between "face mesh" and "point sphere mesh" is made by the user's workflow,
  // and the mode label communicates intent. If a future version needs to exclude
  // sphere-rendered points from face selection, check geometry.type === 'SphereGeometry'.
  if (mode === 'faces') return !!(first.isMesh);
  if (mode === 'edges') return !!(first.isLine || first.isLineSegments);
  if (mode === 'points') return !!(first.isMesh); // points are rendered as tiny sphere meshes
  return true; // unknown mode — accept everything
}

/**
 * Apply visual highlighting to all scene items:
 * - matching items that are selected: bright green (#a6e3a1)
 * - matching items that are unselected: normal opacity, teal tint
 * - non-matching items: heavily dimmed
 */
function _applySelectionHighlight() {
  const viewer = getViewer();
  if (!viewer || !viewer._sceneItems) return;
  // THREE is only needed for type-guards; if not present, skip colour changes.
  // The state logic (item accumulation) still works without THREE.

  const selectedIds = new Set(_state.items.map(function (it) { return it.id; }));

  viewer._sceneItems.forEach(function (item) {
    if (!item.visible || !item.group) return;
    const matches = _itemMatchesMode(item, _state.mode);
    const selected = selectedIds.has(item.id);

    item.group.traverse(function (obj) {
      if (!obj.material) return;
      if (selected) {
        // Selected item: bright green
        if (obj.material.color && typeof obj.material.color.set === 'function') obj.material.color.set(0xa6e3a1);
        if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.6;
        if (obj.material.opacity !== undefined) obj.material.opacity = 1.0;
      } else if (matches) {
        // Candidate item: teal, slightly opaque to show it's selectable
        if (obj.material.color && typeof obj.material.color.set === 'function') obj.material.color.set(0x94e2d5);
        if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.3;
        if (obj.material.opacity !== undefined) obj.material.opacity = 0.75;
      } else {
        // Non-matching item: heavily dimmed
        if (obj.material.opacity !== undefined) obj.material.opacity = 0.08;
        if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.02;
      }
    });
  });
}

function _restoreNormalHighlight() {
  const viewer = getViewer();
  if (!viewer || !viewer._sceneItems) return;
  viewer._sceneItems.forEach(function (item) {
    if (!item.visible || !item.group) return;
    item.group.traverse(function (obj) {
      if (!obj.material) return;
      if (obj.material.opacity !== undefined) obj.material.opacity = 0.85;
      if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.3;
    });
  });
}

// ── Toolbar ────────────────────────────────────────────────────────────────────

const TOOLBAR_ID = 'selection-mode-toolbar';

function _showToolbar() {
  _removeToolbar();
  const toolbar = document.createElement('div');
  toolbar.id = TOOLBAR_ID;
  toolbar.className = 'selection-mode-toolbar';
  toolbar.innerHTML =
    '<span class="sel-toolbar-label">'
    + _modeLabel(_state.mode) + ' selection active'
    + ' <span class="sel-count" id="sel-mode-count">0 selected</span>'
    + '</span>'
    + '<button class="sel-toolbar-btn sel-toolbar-btn--approve" onclick="window.__selectionApprove()" title="Confirm selection">'
    + '&#10003; Approve'
    + '</button>'
    + '<button class="sel-toolbar-btn sel-toolbar-btn--cancel" onclick="window.__selectionCancel()" title="Cancel selection">'
    + '&#10007; Cancel'
    + '</button>';

  // Append the toolbar to canvas-area (the shared parent of #viewport-3d and
  // .canvas-toolbar). This keeps the toolbar outside the #viewport-3d stacking
  // context (z-index: 5), so the toolbar's own z-index: 200 wins over the
  // canvas-toolbar's z-index: 20 and pointer events reach the buttons.
  // Falls back to document.body if canvas-area is absent (e.g. unit tests).
  const canvasArea = document.getElementById('canvas-area') || document.getElementById('viewport-3d') || document.body;
  canvasArea.appendChild(toolbar);

  if (typeof window !== 'undefined') {
    window.__selectionApprove = function () { approveSelection(); };
    window.__selectionCancel = function () { cancelSelection(); };
  }
}

function _removeToolbar() {
  const existing = document.getElementById(TOOLBAR_ID);
  if (existing) existing.remove();
  if (typeof window !== 'undefined') {
    delete window.__selectionApprove;
    delete window.__selectionCancel;
  }
}

function _updateToolbarCount() {
  const el = document.getElementById('sel-mode-count');
  if (el) el.textContent = _state.items.length + ' selected';
}

function _modeLabel(mode) {
  if (mode === 'faces') return 'Face';
  if (mode === 'edges') return 'Edge';
  if (mode === 'points') return 'Point';
  return 'Geometry';
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Activate interactive 3D selection mode for the given node.
 *
 * @param {string}   nodeId     The node requesting selection (used to restore
 *                              highlight on the source node after confirm).
 * @param {string}   mode       'faces' | 'edges' | 'points'
 * @param {Function} onApprove  Called with (items: SceneItem[]) when user clicks Approve.
 *                              items is an array of full scene-item objects (id, nodeId,
 *                              varName, label, group, visible, selected).
 * @param {Function} onCancel   Called with no arguments when user clicks Cancel.
 */
export function activateSelectionMode(nodeId, mode, onApprove, onCancel) {
  if (_state.active) deactivateSelectionMode();

  _state.active = true;
  _state.nodeId = nodeId;
  _state.mode = mode || 'faces';
  _state.items = [];
  _state.onApprove = onApprove || function () {};
  _state.onCancel = onCancel || function () {};

  if (typeof document !== 'undefined') {
    _showToolbar();
    _applySelectionHighlight();
  }
}

/**
 * Deactivate selection mode without calling any callback.
 */
export function deactivateSelectionMode() {
  _state.active = false;
  _state.nodeId = null;
  _state.mode = null;
  _state.items = [];
  _state.onApprove = null;
  _state.onCancel = null;

  if (typeof document !== 'undefined') {
    _removeToolbar();
    _restoreNormalHighlight();
  }
}

/**
 * @returns {boolean} Whether selection mode is currently active.
 */
export function isSelectionModeActive() {
  return _state.active;
}

/**
 * @returns {object[]} The currently accumulated scene items (copies, read-only).
 */
export function getSelectedItems() {
  return _state.items.slice();
}

/**
 * Called by geo-selector.js click handler when selection mode is active.
 * Toggles the item into/out of the accumulated selection set.
 *
 * @param {object} item  A Viewer3D._sceneItems entry.
 */
export function selectionModeClick(item) {
  if (!_state.active) return;
  if (!_itemMatchesMode(item, _state.mode)) return;

  const existingIdx = _state.items.findIndex(function (it) { return it.id === item.id; });
  if (existingIdx >= 0) {
    _state.items.splice(existingIdx, 1);
  } else {
    _state.items.push(item);
  }

  _applySelectionHighlight();
  _updateToolbarCount();
}

/**
 * Confirm the selection. Calls onApprove with the list of selected scene items,
 * then deactivates.
 *
 * The callback receives: (items: SceneItem[]) — full scene-item objects, each with
 *   { id, nodeId, varName, label, group (THREE.Group), visible, selected }
 *
 * The group.userData.label is the human-readable name (e.g. "Box.ByCenterWidthDepthHeight (node-1)").
 * The caller (node-renderer.js _activateNodeSelection) builds a structured descriptor
 * per item ({ _type: 'FaceSelection', label, nodeId, varName }) and stores it in
 * nd.controlValues._selectedGeo — satisfying TICK-002 AC-9.
 */
export function approveSelection() {
  if (!_state.active) return;
  // Pass full scene-item objects so the caller can build structured descriptors.
  // Previously this mapped to labels (strings) — changed for AC-9.
  const items = _state.items.slice();
  const cb = _state.onApprove;
  deactivateSelectionMode();
  if (typeof cb === 'function') cb(items);
}

/**
 * Cancel the selection. Calls onCancel then deactivates.
 */
export function cancelSelection() {
  if (!_state.active) return;
  const cb = _state.onCancel;
  deactivateSelectionMode();
  if (typeof cb === 'function') cb();
}

/**
 * Clear all accumulated items from the active selection without leaving
 * selection mode. Called by geo-selector.js when the user clicks empty space
 * while selection mode is active (AC-10 extension: empty-area click → reset to 0).
 *
 * Reapplies the visual highlight (so previously-green items go back to teal)
 * and updates the toolbar counter to "0 selected".
 */
export function clearSelection() {
  if (!_state.active) return;
  _state.items = [];
  _applySelectionHighlight();
  _updateToolbarCount();
}

// Expose for testing without DOM
export const _internals = { _state, _itemMatchesMode };
