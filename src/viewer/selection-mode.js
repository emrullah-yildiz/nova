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
//   getSelectedFaces()          — returns per-face group data for Select.Faces
//   selectionMeshClick(hit)     — called by geo-selector for isSelectionMesh hits
//   selectionMeshHover(hit)     — called by geo-selector for isSelectionMesh hover
//
// The "mode" parameter controls what geometry types count as selectable:
//   'faces'  — surface / solid meshes, with per-face-group granularity via
//               mesh3.toSelectionMesh() (T09a). Each logical face (coplanar
//               triangle group) is independently hoverable and selectable.
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
  items: [],          // accumulated selection (scene-item or face-group objects)
  onApprove: null,
  onCancel: null,
  hoveredGroup: null, // { item, groupIndex } — currently hovered face group
};

const FACE_HOVER_COLOR = 0x89b4fa;
const SELECTED_COLOR = 0xa6e3a1;
const CANDIDATE_COLOR = 0x94e2d5;

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

function _cloneMaterial(mat) {
  if (!mat) return mat;
  const cloned = typeof mat.clone === 'function' ? mat.clone() : mat;
  if (cloned) cloned.__novaSelectionOwned = true;
  return cloned;
}

function _ensureFaceMaterials(mesh) {
  if (!mesh || !mesh.isMesh || !mesh.geometry || !mesh.material) return false;
  const geo = mesh.geometry;
  const posAttr = geo.attributes && geo.attributes.position;
  const faceCount = geo.index ? Math.floor(geo.index.count / 3) : (posAttr ? Math.floor(posAttr.count / 3) : 0);
  if (!faceCount) return false;

  if (!mesh.userData) mesh.userData = {};
  if (!mesh.userData.__novaSelectionFaceMaterials) {
    const base = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    mesh.userData.__novaSelectionBaseMaterial = base;
    mesh.userData.__novaSelectionBaseColor = base && base.color && typeof base.color.getHex === 'function' ? base.color.getHex() : CANDIDATE_COLOR;
    const materials = [];
    for (let i = 0; i < faceCount; i++) materials.push(_cloneMaterial(base));
    mesh.material = materials;

    if (typeof geo.clearGroups === 'function') geo.clearGroups();
    if (typeof geo.addGroup === 'function') {
      for (let i = 0; i < faceCount; i++) geo.addGroup(i * 3, 3, i);
    }
    mesh.userData.__novaSelectionFaceMaterials = true;
  }
  return true;
}

function _setMaterialColor(material, color, opacity, emissiveIntensity) {
  if (!material) return;
  if (material.color && typeof material.color.set === 'function') material.color.set(color);
  if (material.emissive && typeof material.emissive.set === 'function') material.emissive.set(color);
  if (material.emissiveIntensity !== undefined) material.emissiveIntensity = emissiveIntensity;
  if (material.opacity !== undefined) material.opacity = opacity;
  material.needsUpdate = true;
}

function _setMeshFaceColor(mesh, faceIndex, color, opacity, emissiveIntensity) {
  if (!mesh || faceIndex == null || faceIndex < 0) return false;
  if (!_ensureFaceMaterials(mesh) || !Array.isArray(mesh.material)) return false;
  const material = mesh.material[faceIndex];
  if (!material) return false;
  _setMaterialColor(material, color, opacity, emissiveIntensity);
  return true;
}

function _getSelectionKey(item) {
  if (!item) return '';
  if (item.selectionKey) return item.selectionKey;
  if (item.faceIndex !== undefined && item.faceIndex !== null) return item.id + ':face:' + item.faceIndex;
  if (item.edgeIndex !== undefined && item.edgeIndex !== null) return item.id + ':edge:' + item.edgeIndex;
  return item.id || '';
}

function _makeSelectionItem(item, hit) {
  if (!hit || _state.mode !== 'faces' || hit.faceIndex === undefined || hit.faceIndex === null || !hit.object || !hit.object.isMesh) {
    return item;
  }
  const faceIndex = hit.faceIndex;
  const label = (item.label || item.id || 'Mesh') + ' face ' + (faceIndex + 1);
  return {
    id: item.id,
    selectionKey: item.id + ':face:' + faceIndex,
    nodeId: item.nodeId,
    varName: item.varName || '',
    label: label,
    group: item.group,
    visible: item.visible,
    selected: item.selected,
    mesh: hit.object,
    faceIndex: faceIndex,
    point: hit.point && typeof hit.point.clone === 'function' ? hit.point.clone() : hit.point || null,
  };
}

// ── Face-group mesh swap helpers (T09b) ────────────────────────────────────────
//
// When mode === 'faces' and a scene item has a _mesh3 with groupFaces() /
// toSelectionMesh() (added by T09a), swap the body mesh out for a multi-group
// selection mesh so each logical face (coplanar triangle set) gets its own
// MeshPhongMaterial and can be individually hovered / selected.

/**
 * Swap body meshes to selection meshes for all scene items.
 * Called by activateSelectionMode when mode === 'faces'.
 * Defensive: if mesh3 or its methods are absent, the item is skipped and
 * the existing whole-mesh selection path still works.
 */
function _swapToFaceMeshes() {
  const viewer = getViewer();
  if (!viewer || !viewer._sceneItems) return;
  viewer._sceneItems.forEach(function (item) {
    if (!item.group) return;
    const mesh3 = item._mesh3;
    if (!mesh3 || typeof mesh3.groupFaces !== 'function' || typeof mesh3.toSelectionMesh !== 'function') return;

    // Find the body mesh (isMeshBody) — must NOT touch LineSegments (edge lines).
    let bodyMesh = null;
    item.group.traverse(function (obj) {
      if (!bodyMesh && obj.isMesh && obj.userData && obj.userData.isMeshBody) {
        bodyMesh = obj;
      }
    });
    if (!bodyMesh) return;

    try {
      const faceGroups = mesh3.groupFaces();
      const result = mesh3.toSelectionMesh(faceGroups);
      if (!result || !result.mesh) return;

      // Initialise all materials to teal (candidate color).
      // Materials are MeshBasicMaterial (flat/unlit) — no emissive properties.
      if (result.materials && Array.isArray(result.materials)) {
        result.materials.forEach(function (mat) {
          if (mat && mat.color && typeof mat.color.set === 'function') {
            mat.color.set(CANDIDATE_COLOR);
            if (mat.opacity !== undefined) mat.opacity = 0.85;
            mat.needsUpdate = true;
          }
        });
      }

      // Swap: remove body mesh, insert selection mesh.
      const parent = bodyMesh.parent;
      if (!parent) return;
      parent.remove(bodyMesh);
      parent.add(result.mesh);

      item._selectionOriginalMesh = bodyMesh;
      item._selectionSwappedMesh = result.mesh;
      item._selectionMeshResult = result;
      item._selectionFaceGroups = faceGroups;

      // When Box (or any mesh) is wired to Select.Faces it is treated as
      // intermediate geometry and hidden: item.visible = false,
      // item.group.visible = false. traverseVisible() in the hover and click
      // handlers would skip it, making the selection mesh unreachable.
      // Force-show the item for the duration of selection mode; restore on exit.
      item._selectionOriginalVisible = item.visible;
      if (!item.visible) {
        item.visible = true;
        item.group.visible = true;
      }
    } catch (err) {
      // T09a not yet merged or error in groupFaces — fall back gracefully.
      if (typeof window !== 'undefined') window.__novaSwapError = err && err.message;
      console.warn('[Nova] _swapToFaceMeshes: skipping item', item.id, err && err.message);
    }
  });
}

/**
 * Restore original body meshes and dispose selection mesh resources.
 * Called by deactivateSelectionMode.
 */
function _restoreFaceMeshes() {
  const viewer = getViewer();
  if (!viewer || !viewer._sceneItems) return;
  viewer._sceneItems.forEach(function (item) {
    if (!item._selectionOriginalMesh || !item._selectionSwappedMesh) return;
    const parent = item._selectionSwappedMesh.parent;
    if (parent) {
      parent.remove(item._selectionSwappedMesh);
      parent.add(item._selectionOriginalMesh);
    }
    if (item._selectionMeshResult) {
      if (item._selectionMeshResult.mesh && item._selectionMeshResult.mesh.geometry) {
        item._selectionMeshResult.mesh.geometry.dispose();
      }
      if (item._selectionMeshResult.materials && Array.isArray(item._selectionMeshResult.materials)) {
        item._selectionMeshResult.materials.forEach(function (m) { if (m && typeof m.dispose === 'function') m.dispose(); });
      }
    }
    // Restore the visibility state that was saved when the swap happened.
    if (item._selectionOriginalVisible !== undefined) {
      item.visible = item._selectionOriginalVisible;
      if (item.group) item.group.visible = item._selectionOriginalVisible;
    }
    delete item._selectionOriginalMesh;
    delete item._selectionSwappedMesh;
    delete item._selectionMeshResult;
    delete item._selectionFaceGroups;
    delete item._selectionOriginalVisible;
  });

  // Clear hovered face group state.
  _state.hoveredGroup = null;
  if (typeof window !== 'undefined') window.__geoSelectorHoveredFaceGroup = null;
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

  const selectedKeys = new Set(_state.items.map(_getSelectionKey));

  viewer._sceneItems.forEach(function (item) {
    if (!item.visible || !item.group) return;

    // ── Face-group selection mesh path (T09b) ──────────────────────────────
    // When a selection mesh has been swapped in, colorise per group rather than
    // the whole item — this is the fine-grained face selection visual.
    if (item._selectionMeshResult && item._selectionMeshResult.materials) {
      const result = item._selectionMeshResult;
      // Materials are MeshBasicMaterial (flat/unlit) — no emissive properties.
      result.materials.forEach(function (mat, groupIndex) {
        if (!mat) return;
        const selKey = item.id + ':group:' + groupIndex;
        const isSelected = selectedKeys.has(selKey);
        const color = isSelected ? SELECTED_COLOR : CANDIDATE_COLOR;
        const opacity = isSelected ? 1.0 : 0.85;
        if (mat.color && typeof mat.color.set === 'function') mat.color.set(color);
        if (mat.opacity !== undefined) mat.opacity = opacity;
        mat.needsUpdate = true;
      });
      return; // handled by per-group path
    }

    const matches = _itemMatchesMode(item, _state.mode);
    const selected = selectedKeys.has(item.id);

    item.group.traverse(function (obj) {
      if (!obj.material) return;
      if (matches && _state.mode === 'faces' && obj.isMesh && _ensureFaceMaterials(obj) && Array.isArray(obj.material)) {
        obj.material.forEach(function (mat, faceIndex) {
          const faceSelected = selected || selectedKeys.has(item.id + ':face:' + faceIndex);
          _setMaterialColor(mat, faceSelected ? SELECTED_COLOR : CANDIDATE_COLOR, faceSelected ? 1.0 : 0.75, faceSelected ? 0.6 : 0.3);
        });
      } else if (selected) {
        // Selected item: bright green
        if (obj.material.color && typeof obj.material.color.set === 'function') obj.material.color.set(SELECTED_COLOR);
        if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.6;
        if (obj.material.opacity !== undefined) obj.material.opacity = 1.0;
      } else if (matches) {
        // Candidate item: teal, slightly opaque to show it's selectable
        if (obj.material.color && typeof obj.material.color.set === 'function') obj.material.color.set(CANDIDATE_COLOR);
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
      if (Array.isArray(obj.material)) {
        const color = obj.userData && obj.userData.__novaSelectionBaseColor !== undefined ? obj.userData.__novaSelectionBaseColor : CANDIDATE_COLOR;
        obj.material.forEach(function (mat) {
          _setMaterialColor(mat, color, 0.85, 0.3);
        });
        return;
      }
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
  if (!el) return;
  const n = _state.items.length;
  if (_state.mode === 'faces') {
    el.textContent = n === 1 ? '1 face selected' : n + ' faces selected';
  } else {
    el.textContent = n + ' selected';
  }
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
  _state.hoveredGroup = null;
  _state.onApprove = onApprove || function () {};
  _state.onCancel = onCancel || function () {};

  // When in faces mode, swap each eligible scene item's body mesh with a
  // multi-group selection mesh (one material per logical face). This requires
  // T09a's _Mesh3.groupFaces() + toSelectionMesh() — if absent, falls back to
  // the existing whole-mesh path.
  if (_state.mode === 'faces') {
    _swapToFaceMeshes();
  }

  if (typeof document !== 'undefined') {
    _showToolbar();
    _applySelectionHighlight();
    // Force an immediate render so the teal candidate color is visible right
    // away. The rAF animate loop may not have fired yet at this point.
    _requestRender();
  }

  // Reset the viewer's drag flag. After an orbit the flag stays true until
  // the next canvas mousedown — if the user clicks "Select" (outside the
  // canvas) that reset never fires, so the first face-click is swallowed.
  const _vwr = getViewer();
  if (_vwr) _vwr._isDragging = false;
}

/**
 * Deactivate selection mode without calling any callback.
 */
export function deactivateSelectionMode() {
  // Restore original body meshes before clearing state.
  _restoreFaceMeshes();

  _state.active = false;
  _state.nodeId = null;
  _state.mode = null;
  _state.items = [];
  _state.hoveredGroup = null;
  _state.onApprove = null;
  _state.onCancel = null;

  if (typeof document !== 'undefined') {
    _removeToolbar();
    _restoreNormalHighlight();
  }

  // Trigger a 3D scene rebuild so the restored body meshes get re-rendered
  // correctly. The rebuild was blocked while selection mode was active to
  // protect the swap meshes; mark it needed again now that we're done.
  const viewer = getViewer();
  if (viewer) viewer._needsRebuild = true;
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

export function getSelectionMode() {
  return _state.mode;
}

/**
 * Returns the selected face groups for Select.Faces mode.
 * Each entry has: { itemId, groupIndex, faceGroups, mesh3 }
 * — the T09a consumer (geometry.js Select.Faces node) uses these to extract
 * face vertex geometry via mesh3.getFaceVertices(groupIndex, faceGroups).
 *
 * @returns {Array<{itemId:string, groupIndex:number, faceGroups:object[], mesh3:object}>}
 */
export function getSelectedFaces() {
  return _state.items
    .filter(function (it) { return it.groupIndex !== undefined; })
    .map(function (it) {
      return {
        itemId: it.id,
        groupIndex: it.groupIndex,
        faceGroups: it.faceGroups,
        mesh3: it.mesh3,
      };
    });
}

/**
 * Called by geo-selector.js click handler when selection mode is active and
 * the hit object is a selection mesh (userData.isSelectionMesh === true).
 *
 * Toggles the face group into/out of the accumulated selection set and
 * updates the group's material color (green selected / teal unselected).
 *
 * @param {object} hit            THREE.js raycaster intersection result.
 * @param {object} sceneItem      The Viewer3D._sceneItems entry whose
 *                                _selectionSwappedMesh === hit.object.
 */
export function selectionMeshClick(hit, sceneItem) {
  if (!_state.active || !hit || !sceneItem) return;
  const result = sceneItem._selectionMeshResult;
  if (!result || !result.triangleToGroup || !result.materials) return;

  const triIndex = Math.floor(hit.faceIndex != null ? hit.faceIndex : 0);
  const groupIndex = result.triangleToGroup[triIndex];
  if (groupIndex === undefined || groupIndex === null) return;

  const selKey = sceneItem.id + ':group:' + groupIndex;
  const existingIdx = _state.items.findIndex(function (it) { return it.selectionKey === selKey; });

  if (existingIdx >= 0) {
    // Deselect: remove and revert to teal.
    // Materials are MeshBasicMaterial (flat/unlit) — no emissive properties.
    _state.items.splice(existingIdx, 1);
    const mat = result.materials[groupIndex];
    if (mat) {
      if (mat.color && typeof mat.color.set === 'function') mat.color.set(CANDIDATE_COLOR);
      if (mat.opacity !== undefined) mat.opacity = 0.85;
      mat.needsUpdate = true;
    }
  } else {
    // Select: add and paint green.
    // Materials are MeshBasicMaterial (flat/unlit) — no emissive properties.
    _state.items.push({
      id: sceneItem.id,
      selectionKey: selKey,
      nodeId: sceneItem.nodeId,
      varName: sceneItem.varName || '',
      label: (sceneItem.label || sceneItem.id || 'Mesh') + ' face group ' + groupIndex,
      groupIndex: groupIndex,
      faceGroups: sceneItem._selectionFaceGroups,
      mesh3: sceneItem._mesh3,
    });
    const mat = result.materials[groupIndex];
    if (mat) {
      if (mat.color && typeof mat.color.set === 'function') mat.color.set(SELECTED_COLOR);
      if (mat.opacity !== undefined) mat.opacity = 1.0;
      mat.needsUpdate = true;
    }
  }

  _updateToolbarCount();
}

/**
 * Called by geo-selector.js mousemove handler when selection mode is active
 * and the cursor is over (or has just left) a selection mesh.
 *
 * Applies blue hover color to the hovered face group, restoring any
 * previously hovered group back to teal or green (if selected).
 *
 * @param {object|null} hit        THREE.js intersection, or null if nothing hit.
 * @param {object|null} sceneItem  Scene item for the hit, or null.
 */
export function selectionMeshHover(hit, sceneItem) {
  if (!_state.active) return;

  const prevHovered = _state.hoveredGroup;

  // Restore previously hovered group to its correct color (green or teal).
  // Materials are MeshBasicMaterial (flat/unlit) — no emissive properties.
  if (prevHovered) {
    const prevResult = prevHovered.item._selectionMeshResult;
    if (prevResult && prevResult.materials) {
      const mat = prevResult.materials[prevHovered.groupIndex];
      if (mat) {
        const selKey = prevHovered.item.id + ':group:' + prevHovered.groupIndex;
        const isSelected = _state.items.some(function (it) { return it.selectionKey === selKey; });
        const color = isSelected ? SELECTED_COLOR : CANDIDATE_COLOR;
        if (mat.color && typeof mat.color.set === 'function') mat.color.set(color);
        if (mat.opacity !== undefined) mat.opacity = isSelected ? 1.0 : 0.85;
        mat.needsUpdate = true;
      }
    }
    _state.hoveredGroup = null;
  }

  if (!hit || !sceneItem) {
    // Not hovering any selection mesh — expose null for E2E assertions.
    if (typeof window !== 'undefined') window.__geoSelectorHoveredFaceGroup = null;
    return;
  }

  const result = sceneItem._selectionMeshResult;
  if (!result || !result.triangleToGroup || !result.materials) return;

  const triIndex = Math.floor(hit.faceIndex != null ? hit.faceIndex : 0);
  const groupIndex = result.triangleToGroup[triIndex];
  if (groupIndex === undefined || groupIndex === null) return;

  const selKey = sceneItem.id + ':group:' + groupIndex;
  const isSelected = _state.items.some(function (it) { return it.selectionKey === selKey; });

  // Selected group takes priority: keep green, don't apply blue hover.
  // Materials are MeshBasicMaterial (flat/unlit) — no emissive properties.
  if (!isSelected) {
    const mat = result.materials[groupIndex];
    if (mat) {
      if (mat.color && typeof mat.color.set === 'function') mat.color.set(FACE_HOVER_COLOR);
      if (mat.opacity !== undefined) mat.opacity = 1.0;
      mat.needsUpdate = true;
    }
  }

  _state.hoveredGroup = { item: sceneItem, groupIndex: groupIndex };
  if (typeof window !== 'undefined') {
    window.__geoSelectorHoveredFaceGroup = { itemId: sceneItem.id, groupIndex: groupIndex };
  }

  // Bug C fix: trigger a single render frame so the blue hover color is visible
  // immediately, even if the viewer animate loop hasn't fired yet this tick.
  _requestRender();
}

/**
 * Request a single render from the viewer. Covers the case where the rAF loop
 * has not yet fired this event-loop tick so material changes would sit invisible
 * until the next frame. Safe to call even when the loop is running — the extra
 * render is a no-op cost (one draw call).
 */
function _requestRender() {
  const viewer = getViewer();
  if (viewer && viewer.renderer && viewer.scene && viewer.camera) {
    try { viewer.renderer.render(viewer.scene, viewer.camera); } catch (_e) { /* best-effort render — ignore WebGL errors */ }
  }
}

/**
 * Called by geo-selector.js click handler when selection mode is active.
 * Toggles the item into/out of the accumulated selection set.
 * For face-group selection meshes, use selectionMeshClick() instead.
 *
 * @param {object} item  A Viewer3D._sceneItems entry.
 */
export function selectionModeClick(item, hit) {
  if (!_state.active) return;
  if (!_itemMatchesMode(item, _state.mode)) return;

  const selectionItem = _makeSelectionItem(item, hit);
  const selectionKey = _getSelectionKey(selectionItem);
  const existingIdx = _state.items.findIndex(function (it) { return _getSelectionKey(it) === selectionKey; });
  if (existingIdx >= 0) {
    _state.items.splice(existingIdx, 1);
  } else {
    _state.items.push(selectionItem);
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
  // Fire callback BEFORE deactivate so getSelectedFaces() still has state
  if (typeof cb === 'function') cb(items);
  deactivateSelectionMode();
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

  // Reset all selection mesh materials to teal (candidate color).
  const viewer = getViewer();
  if (viewer && viewer._sceneItems) {
    viewer._sceneItems.forEach(function (item) {
      if (!item._selectionMeshResult || !item._selectionMeshResult.materials) return;
      item._selectionMeshResult.materials.forEach(function (mat) {
        if (!mat) return;
        if (mat.color && typeof mat.color.set === 'function') mat.color.set(CANDIDATE_COLOR);
        if (mat.emissive && typeof mat.emissive.set === 'function') mat.emissive.set(CANDIDATE_COLOR);
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0.3;
        if (mat.opacity !== undefined) mat.opacity = 0.85;
        mat.needsUpdate = true;
      });
    });
  }

  _applySelectionHighlight();
  _updateToolbarCount();
}

export function selectionModeHover(item, hit) {
  if (!_state.active) return;
  _applySelectionHighlight();
  if (!_itemMatchesMode(item, _state.mode)) return;
  if (_state.mode !== 'faces' || !hit || hit.faceIndex === undefined || hit.faceIndex === null || !hit.object || !hit.object.isMesh) return;

  const key = item.id + ':face:' + hit.faceIndex;
  const selected = _state.items.some(function (it) { return _getSelectionKey(it) === key; });
  if (!selected) _setMeshFaceColor(hit.object, hit.faceIndex, FACE_HOVER_COLOR, 1.0, 0.5);
}

// Expose for testing without DOM
export const _internals = { _state, _itemMatchesMode, _ensureFaceMaterials, _setMeshFaceColor, _getSelectionKey, _makeSelectionItem };
