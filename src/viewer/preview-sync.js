export const PREVIEW_EYE_ON = '\uD83D\uDC41';
export const PREVIEW_EYE_OFF = '\uD83D\uDC41\u200D\uDDE8';

function getNode(app, nodeId) {
  return app && Array.isArray(app.nodes)
    ? app.nodes.find(function(node) { return node.id === nodeId; })
    : null;
}

function getDocument(options) {
  if (options && options.documentRef) return options.documentRef;
  return typeof document !== 'undefined' ? document : null;
}

export function updateNodePreviewControl(nodeId, visible, options) {
  var doc = getDocument(options);
  if (!doc || typeof doc.querySelector !== 'function') return false;

  var eyeBtn = doc.querySelector('#' + nodeId + ' .node-preview-eye');
  if (!eyeBtn) return false;

  eyeBtn.className = 'node-preview-eye' + (visible ? '' : ' off');
  eyeBtn.textContent = visible ? PREVIEW_EYE_ON : PREVIEW_EYE_OFF;
  eyeBtn.title = visible ? '3D Preview: ON' : '3D Preview: OFF';
  return true;
}

export function updateNodeHiddenClass(nodeId, hidden, options) {
  var doc = getDocument(options);
  if (!doc || typeof doc.getElementById !== 'function') return false;

  var nodeEl = doc.getElementById(nodeId);
  if (!nodeEl || !nodeEl.classList || typeof nodeEl.classList.toggle !== 'function') return false;

  nodeEl.classList.toggle('node-3d-hidden', !!hidden);
  return true;
}

function setSceneChildVisible(viewer, idx, visible) {
  if (!viewer || !viewer.geometryGroup || !viewer.geometryGroup.children) return false;
  var child = viewer.geometryGroup.children[idx];
  if (!child) return false;
  child.visible = visible;
  return true;
}

export function setNodePreviewState(app, viewer, nodeId, visible, options) {
  var nextVisible = visible !== false;
  var changed = false;
  var node = getNode(app, nodeId);

  if (node && node._preview3d !== nextVisible) {
    node._preview3d = nextVisible;
    changed = true;
  } else if (node && node._preview3d === undefined) {
    node._preview3d = nextVisible;
    changed = true;
  }

  if (viewer && Array.isArray(viewer._sceneItems)) {
    viewer._sceneItems.forEach(function(item) {
      if (item.nodeId !== nodeId) return;
      if (item.visible !== nextVisible) changed = true;
      item.visible = nextVisible;
      if (item.group) item.group.visible = nextVisible;
      if (!nextVisible && item.selected) item.selected = false;
    });
  }

  // engine._renderFromCompute tracks its scene items on app._sceneItems
  // (separate list from viewer._sceneItems), referencing THREE.js children
  // by index instead of group. Toggle them via the children array.
  if (app && viewer && Array.isArray(app._sceneItems)) {
    app._sceneItems.forEach(function(item) {
      if (item.nodeId !== nodeId) return;
      if (item.visible !== nextVisible) changed = true;
      item.visible = nextVisible;
      if (typeof item.idx === 'number') {
        setSceneChildVisible(viewer, item.idx, nextVisible);
      }
      if (typeof item.idxStart === 'number' && typeof item.idxEnd === 'number') {
        for (var i = item.idxStart; i <= item.idxEnd; i++) {
          setSceneChildVisible(viewer, i, nextVisible);
        }
      }
    });
  }

  if (viewer && !nextVisible && viewer._selectedItem && viewer._selectedItem.nodeId === nodeId) {
    viewer._selectedItem = null;
    changed = true;
  }

  updateNodePreviewControl(nodeId, nextVisible, options);
  updateNodeHiddenClass(nodeId, !nextVisible, options);

  // Re-render the in-viewport list by default; only skip when the caller
  // passes { renderList: false } (e.g. during a batched rebuild).
  if (viewer && changed && (!options || options.renderList !== false) && typeof viewer._renderGeoList === 'function') {
    viewer._renderGeoList();
  }

  return changed;
}

export function setPreviewItemVisibility(app, viewer, item, visible, options) {
  if (!item) return false;

  var nextVisible = visible !== false;
  var changed = item.visible !== nextVisible;
  item.visible = nextVisible;
  if (item.group) item.group.visible = nextVisible;

  if (!nextVisible && item.selected) {
    item.selected = false;
    changed = true;
  }
  if (viewer && !nextVisible && viewer._selectedItem === item) {
    viewer._selectedItem = null;
    changed = true;
  }

  if (item.nodeId) {
    var nodeItems = viewer && Array.isArray(viewer._sceneItems)
      ? viewer._sceneItems.filter(function(sceneItem) { return sceneItem.nodeId === item.nodeId; })
      : [item];
    var nodeVisible = nodeItems.some(function(sceneItem) { return sceneItem.visible !== false; });
    var node = getNode(app, item.nodeId);

    if (node && node._preview3d !== nodeVisible) {
      node._preview3d = nodeVisible;
      changed = true;
    }

    updateNodePreviewControl(item.nodeId, nodeVisible, options);
    updateNodeHiddenClass(item.nodeId, !nodeVisible, options);
  }

  // Re-render the in-viewport list by default; only skip when the caller
  // passes { renderList: false } (e.g. during a batched rebuild).
  if (viewer && changed && (!options || options.renderList !== false) && typeof viewer._renderGeoList === 'function') {
    viewer._renderGeoList();
  }

  return changed;
}

export function showAllPreviews(app, viewer, options) {
  var changed = false;

  if (viewer && Array.isArray(viewer._sceneItems)) {
    viewer._sceneItems.forEach(function(item) {
      if (item.visible !== true) changed = true;
      item.visible = true;
      if (item.group) item.group.visible = true;
      item.selected = false;
    });
  }

  // Engine-tracked items live in app._sceneItems and reference THREE.js
  // children by index; restore those too.
  if (app && viewer && Array.isArray(app._sceneItems)) {
    app._sceneItems.forEach(function(item) {
      if (item.visible !== true) changed = true;
      item.visible = true;
      if (typeof item.idx === 'number') {
        setSceneChildVisible(viewer, item.idx, true);
      }
      if (typeof item.idxStart === 'number' && typeof item.idxEnd === 'number') {
        for (var i = item.idxStart; i <= item.idxEnd; i++) {
          setSceneChildVisible(viewer, i, true);
        }
      }
    });
  }

  if (app && Array.isArray(app.nodes)) {
    app.nodes.forEach(function(node) {
      if (node._preview3d !== true) changed = true;
      node._preview3d = true;
      updateNodePreviewControl(node.id, true, options);
      updateNodeHiddenClass(node.id, false, options);
    });
  }

  if (viewer) viewer._selectedItem = null;
  // Re-render the in-viewport list by default; only skip when the caller
  // passes { renderList: false } (e.g. during a batched rebuild).
  if (viewer && changed && (!options || options.renderList !== false) && typeof viewer._renderGeoList === 'function') {
    viewer._renderGeoList();
  }

  return changed;
}
