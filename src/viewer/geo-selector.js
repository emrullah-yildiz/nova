import { Geo } from '../geometry/index.js';
import { setNodePreviewState, setPreviewItemVisibility, showAllPreviews } from './preview-sync.js';
import { Viewer3D as RuntimeViewer3D } from './viewer3d.js';
import { isSelectionModeActive, selectionModeClick, selectionModeHover, selectionMeshClick, selectionMeshHover, getSelectedItems, clearSelection } from './selection-mode.js';

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getRuntimeGlobal() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

// ============================================
// NODEFLOW AI — Geometry Selector & Visibility System
//
// Features:
// 1. Each node output → separate Three.js group with metadata
// 2. Python nodes: each output variable → own group
// 3. Click-to-select in 3D viewport (raycasting)
// 4. Geometry List panel with per-item visibility toggles
// 5. Selection syncs to 2D canvas node highlight
// ============================================

export function installGeoSelector(targetApp = getRuntimeApp(), viewer = RuntimeViewer3D, runtimeGlobal = getRuntimeGlobal()) {
  if (!targetApp || !viewer) return false;
  if (viewer.__geoSelectorInstalled) return true;
  const app = targetApp;
  const Viewer3D = viewer;
  const THREE = runtimeGlobal.THREE;

  if (typeof THREE === 'undefined') {
    console.warn('[NodeFlow] 3D selector disabled: Three.js viewer is not available');
    return false;
  }

  viewer.__geoSelectorInstalled = true;

  // ══════════════════════════════════════
  // 1. SCENE ITEM REGISTRY
  // Tracks all geometry groups with metadata
  // ══════════════════════════════════════

  // Each entry: { id, nodeId, varName, label, group (THREE.Group), visible, selected }
  Viewer3D._sceneItems = [];
  Viewer3D._selectedItem = null;
  Viewer3D._raycaster = null;
  Viewer3D._mouse = new THREE.Vector2();

  const DIM_OPACITY = 0.15;
  const NORMAL_OPACITY = 0.85;

  function findSceneItemForHit(hit) {
    if (!hit || !hit.object) return null;
    var taggedGroup = null;
    var current = hit.object;
    while (current) {
      if (current.userData && current.userData.isGeoItem) { taggedGroup = current; break; }
      current = current.parent;
    }
    if (!taggedGroup) return null;
    return Viewer3D._sceneItems.find(function(it) { return it.group === taggedGroup; }) || null;
  }

  // ══════════════════════════════════════
  // 2. TAGGED GROUP CREATION
  // Wraps Geo.addToScene to create per-item groups
  // ══════════════════════════════════════

  // Add a geometry value to the scene as a tagged group
  Viewer3D.addTaggedGeo = function(geoVal, nodeId, varName, label, color) {
    if (!geoVal || !this.geometryGroup) return null;
    const group = new THREE.Group();
    group.userData = { nodeId: nodeId, varName: varName || '', label: label || varName || nodeId, isGeoItem: true };

    // Add the actual Three.js geometry to this group
    if (geoVal && geoVal._type) {
      Geo.addToScene(group, geoVal, color);
    } else if (Array.isArray(geoVal) && geoVal.length > 0) {
      if (geoVal[0] && geoVal[0]._type) {
        geoVal.forEach(function(item) { Geo.addToScene(group, item, color); });
      } else if (geoVal[0] instanceof Geo.Point3) {
        var pts = geoVal.map(function(p) { return [p.x, p.y, p.z]; });
        // Use Viewer3D.addPoints into the group
        var geo = new THREE.SphereGeometry(0.08, 16, 12);
        var mat = new THREE.MeshPhongMaterial({ color: color || 0x94e2d5, emissive: color || 0x94e2d5, emissiveIntensity: 0.4, shininess: 60 });
        pts.forEach(function(p) {
          var mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(p[0] || 0, p[2] || 0, p[1] || 0);
          group.add(mesh);
        });
      } else if (Array.isArray(geoVal[0])) {
        // Nested list (e.g. Point3[][] from crossProduct lacing). Geo.addToScene
        // walks nested arrays and renders each leaf Point3/geometry as a sphere/
        // mesh, so defer the whole grid to it rather than flattening here.
        Geo.addToScene(group, geoVal, color);
      }
    }

    if (group.children.length === 0) return null;

    this.geometryGroup.add(group);

    var itemId = nodeId + (varName ? ':' + varName : '');
    var item = { id: itemId, nodeId: nodeId, varName: varName || '', label: label || varName || '', group: group, visible: true, selected: false };

    // Store the raw Mesh3 geometry value so that selection-mode.js can call
    // mesh3.groupFaces() + toSelectionMesh() for per-face selection (T09b).
    // The _Mesh3 instance carries _type === 'Mesh3' directly on the object.
    if (geoVal && geoVal._type === 'Mesh3') {
      item._mesh3 = geoVal;
    } else if (Array.isArray(geoVal) && geoVal.length === 1 && geoVal[0] && geoVal[0]._type === 'Mesh3') {
      item._mesh3 = geoVal[0];
    }

    this._sceneItems.push(item);
    return item;
  };

  // ══════════════════════════════════════
  // 2b. PANEL-OBJECT LIST RENDERER
  // Each panel in a { points, frame }[] list becomes its own scene item so
  // the existing _selectItem / hover-dim logic gives per-panel highlighting.
  // ══════════════════════════════════════

  Viewer3D._addPanelObjectsAsSceneItems = function(panels, nodeId, baseLabel) {
    if (!panels || panels.length === 0 || !this.geometryGroup) return;

    // Delegate mesh construction to viewer3d.addPanelObjects which also
    // updates window._novaSceneObjectCount and data-panel-count.
    var meshes = Viewer3D.addPanelObjects(panels);

    meshes.forEach(function(meshObj) {
      var idx = meshObj.userData.panelId;
      // Wrap each mesh in its own tagged group so _selectItem can dim/highlight
      // it independently from all other panels.
      var group = new THREE.Group();
      group.userData = {
        nodeId: nodeId,
        varName: '',
        label: baseLabel + '[' + idx + ']',
        isGeoItem: true,
        isPanelGroup: true,
        panelId: idx
      };
      group.add(meshObj);
      Viewer3D.geometryGroup.add(group);

      var itemId = nodeId + ':panel:' + idx;
      Viewer3D._sceneItems.push({
        id: itemId,
        nodeId: nodeId,
        varName: '',
        label: baseLabel + '[' + idx + ']',
        group: group,
        visible: true,
        selected: false
      });
    });
  };

  // ══════════════════════════════════════
  // 3. PATCHED buildFromGraph
  // Uses tagged groups instead of flat addToScene
  // ══════════════════════════════════════

  Viewer3D.buildFromGraph = function(nodes, wires, computeFn) {
    // Do not clear and rebuild the scene while face-selection mode is active.
    // The swap meshes live in the scene items; destroying them would orphan the
    // selection-mode state and lose the user's in-progress face picks.
    if (isSelectionModeActive()) return;

    // Save previous visibility state so we can restore after rebuild
    var prevVisibility = {};
    if (this._sceneItems && this._sceneItems.length > 0) {
      this._sceneItems.forEach(function(it) {
        prevVisibility[it.id] = it.visible;
      });
    }

    this.clearGeometry();
    this._sceneItems = [];
    this._selectedItem = null;

    app.beginCompute();

    nodes.forEach(function(nd) {
      try {
        if (nd._preview3d === false) return;

        // Skip pass-through types (numbers, math, logic, etc.)
        var passTypes = ['output-watch','output-display','output-log','output-chart','output-export',
          'number-input','text-input','boolean-input','slider-input','integer-input',
          'math-add','math-subtract','math-multiply','math-divide','math-power',
          'logic-and','logic-or','logic-not','logic-compare','logic-if',
          'list-get','list-length','list-range','list-reverse','list-create',
          'custom-formula','custom-comment','custom-ainode',
          'Custom.Formula','Custom.Comment','Custom.AI'];
        if (passTypes.indexOf(nd.type) >= 0) return;

        // ── Python/Code nodes: render EACH output variable as separate group ──
        if ((nd.type === 'custom-python' || nd.type === 'custom-code' || nd.type === 'Custom.Python') && nd._pyResults) {
          var keys = Object.keys(nd._pyResults).filter(function(k) {
            return !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k';
          });
          keys.forEach(function(varKey) {
            var val = nd._pyResults[varKey];
            if (val === undefined || val === null) return;
            // Only add if it's geometry
            var isGeo = (val && val._type) ||
                        (Array.isArray(val) && val.length > 0 && val[0] && (val[0]._type || val[0] instanceof Geo.Point3));
            if (isGeo) {
              var label = nd.def.name + '.' + varKey;
              Viewer3D.addTaggedGeo(val, nd.id, varKey, label);
            }
          });
          return;
        }

        // ── Revit & non-geometry nodes: skip ──
        if (nd.type.startsWith('revit-')) return;

        // ── Visual Geo nodes: compute and add as single tagged group ──
        var val = computeFn(nd);
        if (val === undefined || val === null) return;

        // ── Panel-object list: { points: Point[], frame: Plane }[] ──
        // Detected before the generic isGeo path so each panel becomes its own
        // independently-selectable scene item rather than a merged group.
        // Format guard mirrors the T04b contract: Array.isArray(item.points).
        if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0] && val[0].points)) {
          var panelLabel = (nd.def && nd.def.name) ? nd.def.name : nd.type;
          Viewer3D._addPanelObjectsAsSceneItems(val, nd.id, panelLabel);
          return;
        }

        var isGeo = (val && val._type) ||
                    (Array.isArray(val) && val.length > 0 && val[0] && (val[0]._type || val[0] instanceof Geo.Point3)) ||
                    // Nested geometry list — e.g. Point3[][] from a node with
                    // crossProduct lacing (Surface.PointAtParameter over a u-list ×
                    // v-list). Here val[0] is itself a list, so the one-level check
                    // above misses it. addTaggedGeo → Geo.addToScene recurses fully,
                    // so route the whole grid through the same tagged-geo path
                    // (which also registers it in the Geometry panel).
                    (Array.isArray(val) && val.length > 0 && Array.isArray(val[0]) &&
                     val[0].length > 0 && val[0][0] && (val[0][0]._type || val[0][0] instanceof Geo.Point3));
        if (isGeo) {
          var label = nd.def.name + (nd.id ? ' (' + nd.id + ')' : '');
          Viewer3D.addTaggedGeo(val, nd.id, '', label);
          return;
        }

        // ── Legacy: flat numeric coordinate tuples [[x,y,z], …] as points ──
        // Require the tuples to be NUMERIC. A nested point list (point[][], e.g.
        // the profile rings from Pattern.TwistedEllipsePlates) also passes
        // Array.isArray(val[0]) && length>=2, but each "point" is a ring of Point3
        // objects — feeding those to position.set produced NaN positions that
        // blacked out the whole viewport. Such lists are consumed downstream
        // (Solid.ByLoft), so skip them here rather than mis-rendering.
        if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0]) && val[0].length >= 2 && typeof val[0][0] === 'number') {
          var group = new THREE.Group();
          group.userData = { nodeId: nd.id, varName: '', label: nd.def.name, isGeoItem: true };
          // Points
          var geo = new THREE.SphereGeometry(0.15, 8, 8);
          var mat = new THREE.MeshPhongMaterial({ color: 0x94e2d5, emissive: 0x94e2d5, emissiveIntensity: 0.3 });
          val.forEach(function(p) {
            var px = Number(p[0]), py = Number(p[1]), pz = Number(p[2] || 0);
            if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) return;
            var m = new THREE.Mesh(geo, mat);
            m.position.set(px, pz, py);
            group.add(m);
          });
          if (group.children.length > 0) {
            Viewer3D.geometryGroup.add(group);
            Viewer3D._sceneItems.push({ id: nd.id, nodeId: nd.id, varName: '', label: nd.def.name, group: group, visible: true, selected: false });
          }
        }

      } catch(e) { /* skip */ }
    });

    app.endCompute();

    // Restore previous visibility state
    if (Object.keys(prevVisibility).length > 0) {
      this._sceneItems.forEach(function(item) {
        if (prevVisibility[item.id] !== undefined) {
          item.visible = prevVisibility[item.id];
          item.group.visible = item.visible;
        }
      });
    }

    // Rebuild the geometry list panel
    Viewer3D._renderGeoList();
  };

  // ══════════════════════════════════════
  // 4. RAYCASTER — Click to Select in 3D
  // ══════════════════════════════════════

  Viewer3D._initRaycaster = function() {
    if (this._raycaster) return;
    this._raycaster = new THREE.Raycaster();

    var self = this;

    // ── Pointer-event drag guard ───────────────────────────────────────────
    // Use pointerdown/pointermove/pointerup instead of mousedown/mousemove/click.
    // OrbitControls captures the pointer on pointerdown internally, so the
    // browser's synthetic click event fires even after an orbit drag because
    // OrbitControls already handled the pointer and the click's clientX/Y may
    // equal the pointerdown position regardless of how far the user dragged.
    // Listening on pointer events guarantees we see the real displacement.
    this.renderer.domElement.addEventListener('pointerdown', function(e) {
      self._lastPointerDown = { x: e.clientX, y: e.clientY };
      self._isDragging = false;
    });

    // ── pointerup — fires selection when no drag occurred ─────────────────
    this.renderer.domElement.addEventListener('pointerup', function(e) {
      if (!self.isVisible) return;
      // If the pointer moved > 3px since pointerdown, the user was orbiting —
      // clear the drag flag and skip selection.
      if (self._isDragging) {
        self._isDragging = false;
        return;
      }

      var rect = self.renderer.domElement.getBoundingClientRect();
      self._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      self._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      self._raycaster.setFromCamera(self._mouse, self.camera);

      // Only intersect VISIBLE geometry-group descendants. THREE.Object3D
      // .traverse() walks into invisible subtrees, and Raycaster's per-mesh
      // intersect routine doesn't check object.visible — so a hidden mesh
      // would still be clickable and select its panel row. traverseVisible
      // skips any subtree rooted at an invisible Object3D.
      //
      // When face-selection meshes are active, restrict raycasting to those
      // meshes only. LineSegments (edge wires) have a default THREE.js
      // raycaster threshold of 1 world-unit — large enough to intercept every
      // hit on a default 1×1×1 box and prevent face selection from working.
      var _anyFaceSelMesh = self._sceneItems && self._sceneItems.some(function(it) { return !!it._selectionSwappedMesh; });
      var allMeshes = [];
      self.geometryGroup.traverseVisible(function(obj) {
        if (_anyFaceSelMesh) {
          if (obj.isMesh && obj.userData && obj.userData.isSelectionMesh) allMeshes.push(obj);
        } else {
          if (obj.isMesh || obj.isLine || obj.isLineSegments) allMeshes.push(obj);
        }
      });

      var intersects = self._raycaster.intersectObjects(allMeshes, false);
      if (intersects.length > 0) {
        var hit = intersects[0];

        // ── Per-face-group selection mesh click (T09b) ──────────────────────
        // When the hit is on a selection mesh (swapped in by _swapToFaceMeshes),
        // route to the face-group click handler rather than the whole-item path.
        if (isSelectionModeActive() && hit.object && hit.object.userData && hit.object.userData.isSelectionMesh) {
          var selMeshItem = null;
          for (var si = 0; si < self._sceneItems.length; si++) {
            if (self._sceneItems[si]._selectionSwappedMesh === hit.object) { selMeshItem = self._sceneItems[si]; break; }
          }
          if (selMeshItem) {
            selectionMeshClick(hit, selMeshItem);
            return;
          }
        }

        var item = findSceneItemForHit(hit);
        if (item) {
          // When selection mode is active, route to the selection accumulator
          // instead of the normal single-select flow.
          if (isSelectionModeActive()) {
            selectionModeClick(item, hit);
          } else {
            self._selectItem(item);
          }
          return;
        }
      }
      // Clicked empty space — clear the relevant selection.
      // In selection mode: reset the accumulated items to zero (AC-10 extension).
      // In normal mode: deselect the 3D-highlighted item.
      if (isSelectionModeActive()) {
        clearSelection();
      } else {
        self._deselectAll();
      }
    });

    // ── Per-panel hover highlight (AC-4) ──
    // When the cursor moves over a panel mesh (userData.isPanelMesh), apply
    // the accent-green highlight (#a6e3a1) to that panel only and restore all
    // others. This is separate from the click-select path; it does not change
    // _selectedItem so the user's click-selection is preserved.
    //
    // AC-8: When selection mode is active, extend hover to ALL candidate meshes
    // and apply blue (#89b4fa) to the hovered face, teal (#94e2d5) to other
    // candidates, green (#a6e3a1) to already-selected items. This lets the user
    // see which face they are about to pick before clicking.
    this.renderer.domElement.addEventListener('pointermove', function(e) {
      // Set drag flag when pointer moves > 3px after pointerdown — used by
      // pointerup to distinguish orbit drags from genuine point clicks.
      if (self._lastPointerDown &&
          (Math.abs(e.clientX - self._lastPointerDown.x) > 3 ||
           Math.abs(e.clientY - self._lastPointerDown.y) > 3)) {
        self._isDragging = true;
      }
      if (!self.isVisible) return;
      var rect = self.renderer.domElement.getBoundingClientRect();
      self._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      self._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      self._raycaster.setFromCamera(self._mouse, self.camera);

      // ── AC-8: Selection-mode face hover ──────────────────────────────────
      // When 3D selection mode is active, apply the blue hover colour to the
      // mesh under the cursor; other candidate meshes stay teal; already-
      // selected items stay green. Exit early so the panel-hover path below
      // does not conflict.
      if (isSelectionModeActive()) {
        // T09f debug trace — record that selection mode is active this frame
        if (typeof window !== 'undefined' && window.__novaHoverDebug) {
          window.__novaHoverDebug.lastHoverTrace.selectionModeActive = true;
          // Reset per-frame fields so stale values don't mislead
          window.__novaHoverDebug.lastHoverTrace.anySelMesh = false;
          window.__novaHoverDebug.lastHoverTrace.candidateCount = 0;
          window.__novaHoverDebug.lastHoverTrace.hitFound = false;
          window.__novaHoverDebug.lastHoverTrace.hitOnSelMesh = false;
          window.__novaHoverDebug.lastHoverTrace.sceneItemFound = false;
          window.__novaHoverDebug.lastHoverTrace.selectionMeshHoverCalled = false;
          window.__novaHoverDebug.lastHoverTrace.materialSet = false;
          window.__novaHoverDebug.lastHoverTrace.renderRequested = false;
        }

        // Determine whether face-selection meshes are active before building
        // the candidate list. When they are, restrict raycasting to those
        // meshes only. LineSegments (edge wires) have a default THREE.js
        // raycaster threshold of 1 world-unit — on a default 1×1×1 box that
        // threshold covers every face-interior point, so edge lines would
        // always win the raycast and prevent any face from being highlighted.
        var anySelMesh = self._sceneItems && self._sceneItems.some(function(it) { return !!it._selectionSwappedMesh; });

        // T09f debug trace — record whether any selection mesh is swapped in
        if (typeof window !== 'undefined' && window.__novaHoverDebug) {
          window.__novaHoverDebug.lastHoverTrace.anySelMesh = !!anySelMesh;
        }

        var candidateMeshes = [];
        self.geometryGroup.traverseVisible(function(obj) {
          if (anySelMesh) {
            if (obj.isMesh && obj.userData && obj.userData.isSelectionMesh) candidateMeshes.push(obj);
          } else {
            if (obj.isMesh || obj.isLine || obj.isLineSegments) candidateMeshes.push(obj);
          }
        });

        // T09f debug trace — record candidate mesh count for the raycast
        if (typeof window !== 'undefined' && window.__novaHoverDebug) {
          window.__novaHoverDebug.lastHoverTrace.candidateCount = candidateMeshes.length;
        }

        var intersects = self._raycaster.intersectObjects(candidateMeshes, false);
        var hit = intersects.length > 0 ? intersects[0] : null;

        // T09f debug trace — record whether raycast produced a hit
        if (typeof window !== 'undefined' && window.__novaHoverDebug) {
          window.__novaHoverDebug.lastHoverTrace.hitFound = hit !== null;
        }

        var hitMesh = hit ? hit.object : null;
        var hitFaceIndex = hit && hit.faceIndex !== undefined ? hit.faceIndex : null;

        if (!anySelMesh && hitMesh === self._hoveredSelectionMesh && hitFaceIndex === self._hoveredSelectionFaceIndex) return; // nothing changed
        self._hoveredSelectionMesh = hitMesh;
        self._hoveredSelectionFaceIndex = hitFaceIndex;
        // Expose for E2E assertions (AC-8)
        if (typeof window !== 'undefined') window.__geoSelectorHoveredFaceMesh = hitMesh || null;

        // ── Per-face-group hover (T09b) ─────────────────────────────────────
        // When the hit is on a selection mesh (swapped in by _swapToFaceMeshes),
        // call selectionMeshHover for group-level hover coloring instead of the
        // whole-item hover path below. Also call it (with null) when the cursor
        // leaves a selection mesh, so the previously hovered group is restored.
        if (anySelMesh) {
          var selMeshHoverItem = null;
          if (hit && hit.object && hit.object.userData && hit.object.userData.isSelectionMesh) {
            // T09f debug trace — record whether the hit was on a selection mesh
            if (typeof window !== 'undefined' && window.__novaHoverDebug) {
              window.__novaHoverDebug.lastHoverTrace.hitOnSelMesh = true;
            }
            for (var smi = 0; smi < self._sceneItems.length; smi++) {
              if (self._sceneItems[smi]._selectionSwappedMesh === hit.object) { selMeshHoverItem = self._sceneItems[smi]; break; }
            }
          }
          // T09f debug trace — record whether the scene item was found
          if (typeof window !== 'undefined' && window.__novaHoverDebug) {
            window.__novaHoverDebug.lastHoverTrace.sceneItemFound = selMeshHoverItem !== null;
          }
          // Pass hit only when it is on a selection mesh (selMeshHoverItem found),
          // otherwise null so selectionMeshHover clears the previously hovered group.
          // T09f debug trace — record that selectionMeshHover is about to be called
          if (typeof window !== 'undefined' && window.__novaHoverDebug) {
            window.__novaHoverDebug.lastHoverTrace.selectionMeshHoverCalled = true;
          }
          selectionMeshHover(selMeshHoverItem ? hit : null, selMeshHoverItem);
          return;
        }

        selectionModeHover(findSceneItemForHit(hit), hit);
        if (typeof window !== 'undefined') return; // don't run the panel-hover path below in selection mode

        // Rebuild the highlight using the same selected-item set that
        // _applySelectionHighlight uses, then overlay the blue hover.
        // We only touch materials here — no state changes to _state.items.
        var selectedItems = getSelectedItems();
        var selectedIds = new Set();
        if (selectedItems && selectedItems.length) {
          selectedItems.forEach(function(it) { selectedIds.add(it.id); });
        }

        candidateMeshes.forEach(function(m) {
          if (!m.material) return;
          // Determine which scene item owns this mesh
          var ownerItem = null;
          if (self._sceneItems) {
            for (var i = 0; i < self._sceneItems.length; i++) {
              var found = false;
              self._sceneItems[i].group.traverse(function(child) { if (child === m) found = true; });
              if (found) { ownerItem = self._sceneItems[i]; break; }
            }
          }
          var isSelected = ownerItem && selectedIds.has(ownerItem.id);

          // Clone shared materials before mutating so we never corrupt other
          // meshes that reference the same material instance.
          if (m.material && !m.material.__novaOwned) {
            m.material = m.material.clone();
            m.material.__novaOwned = true;
          }

          if (isSelected) {
            // Already selected: keep green
            if (m.material.color && typeof m.material.color.setHex === 'function') m.material.color.setHex(0xa6e3a1);
            if (m.material.emissive && typeof m.material.emissive.setHex === 'function') m.material.emissive.setHex(0xa6e3a1);
            if (m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = 0.6;
            if (m.material.opacity !== undefined) m.material.opacity = 1.0;
            m.material.needsUpdate = true;
          } else if (m === hitMesh) {
            // Hovered candidate: blue highlight (AC-8)
            if (m.material.color && typeof m.material.color.setHex === 'function') m.material.color.setHex(0x89b4fa);
            if (m.material.emissive && typeof m.material.emissive.setHex === 'function') m.material.emissive.setHex(0x89b4fa);
            if (m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = 0.5;
            if (m.material.opacity !== undefined) m.material.opacity = 1.0;
            m.material.needsUpdate = true;
          } else {
            // Other candidate: teal
            if (m.material.color && typeof m.material.color.setHex === 'function') m.material.color.setHex(0x94e2d5);
            if (m.material.emissive && typeof m.material.emissive.setHex === 'function') m.material.emissive.setHex(0x000000);
            if (m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = 0.3;
            if (m.material.opacity !== undefined) m.material.opacity = 0.75;
            m.material.needsUpdate = true;
          }
        });
        return; // don't run the panel-hover path below in selection mode
      }

      // ── Normal mode: per-panel hover ──────────────────────────────────────
      // Clear any stale selection-mode hover mesh reference when mode is off.
      self._hoveredSelectionMesh = null;
      self._hoveredSelectionFaceIndex = null;

      var panelMeshes = [];
      self.geometryGroup.traverseVisible(function(obj) {
        if (obj.isMesh && obj.userData && obj.userData.isPanelMesh) panelMeshes.push(obj);
      });
      if (panelMeshes.length === 0) {
        // No panel meshes in scene — clear any stale hover state
        if (self._hoveredPanelId !== undefined && self._hoveredPanelId !== null) {
          self._clearPanelHover();
        }
        return;
      }

      var panelIntersects = self._raycaster.intersectObjects(panelMeshes, false);
      var hitId = panelIntersects.length > 0 ? panelIntersects[0].object.userData.panelId : null;

      // Only update materials if the hovered panel changed
      if (hitId === self._hoveredPanelId) return;
      self._hoveredPanelId = hitId;

      panelMeshes.forEach(function(m) {
        if (!m.material) return;
        if (hitId !== null && m.userData.panelId === hitId) {
          // Hovered panel: use accent-green (0xa6e3a1) as per STYLE.md
          m.material.color.setHex(0xa6e3a1);
          m.material.emissive.setHex(0xa6e3a1);
          m.material.emissiveIntensity = 0.45;
          m.material.opacity = 1.0;
        } else {
          // Non-hovered panels: restore default colour
          m.material.color.setHex(0xa6e3a1);
          m.material.emissive.setHex(0x000000);
          m.material.emissiveIntensity = 0.0;
          m.material.opacity = 0.85;
        }
      });
    });
  };

  // Clear panel hover state (called when mouse leaves canvas or hover moves off all panels)
  Viewer3D._clearPanelHover = function() {
    this._hoveredPanelId = null;
    if (!this.geometryGroup) return;
    this.geometryGroup.traverseVisible(function(obj) {
      if (obj.isMesh && obj.userData && obj.userData.isPanelMesh && obj.material) {
        obj.material.color.setHex(0xa6e3a1);
        obj.material.emissive.setHex(0x000000);
        obj.material.emissiveIntensity = 0.0;
        obj.material.opacity = 0.85;
      }
    });
  };

  // ══════════════════════════════════════
  // 5. SELECTION & VISIBILITY LOGIC
  // ══════════════════════════════════════

  Viewer3D._selectItem = function(item) {
    // Deselect previous
    this._deselectAll();

    item.selected = true;
    this._selectedItem = item;

    // When the user selects a hidden row the focal item won't appear in
    // the scene, so dimming everything else just washes out the visible
    // geometry for no gain — skip the dim pass in that case.
    if (!item.visible) {
      this._renderGeoList();
      if (item.nodeId && typeof app !== 'undefined') {
        app.deselectAll();
        app.selectNode(item.nodeId, false);
        var hiddenNodeEl = document.getElementById(item.nodeId);
        if (hiddenNodeEl) hiddenNodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Highlight: make selected opaque/bright, dim all others
    this._sceneItems.forEach(function(it) {
      if (!it.visible) return;
      it.group.traverse(function(obj) {
        if (obj.material) {
          if (it === item) {
            if (obj.material.opacity !== undefined) obj.material.opacity = 1.0;
            if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.5;
          } else {
            if (obj.material.opacity !== undefined) obj.material.opacity = DIM_OPACITY;
            if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.05;
          }
        }
      });
    });

    // Highlight in geo list panel
    this._renderGeoList();

    // Sync to 2D canvas: highlight the source node
    if (item.nodeId && typeof app !== 'undefined') {
      app.deselectAll();
      app.selectNode(item.nodeId, false);
      // Scroll the node into view
      var nodeEl = document.getElementById(item.nodeId);
      if (nodeEl) nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  Viewer3D._deselectAll = function() {
    this._selectedItem = null;
    // Restore all materials to normal
    this._sceneItems.forEach(function(it) {
      it.selected = false;
      if (!it.visible) return;
      it.group.traverse(function(obj) {
        if (obj.material) {
          if (obj.material.opacity !== undefined) obj.material.opacity = NORMAL_OPACITY;
          if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = 0.3;
        }
      });
    });
    this._renderGeoList();
  };

  Viewer3D._toggleItemVisibility = function(item) {
    var wasSelected = item && item.selected;
    setPreviewItemVisibility(app, this, item, !item.visible);

    // If hiding the selected item, deselect
    if (!item.visible && wasSelected) {
      this._deselectAll();
    }
  };

  // Isolate: hide all except this item
  Viewer3D._isolateItem = function(item) {
    this._sceneItems.forEach(function(it) {
      if (it === item) {
        it.visible = true;
        it.group.visible = true;
      } else {
        it.visible = false;
        it.group.visible = false;
      }
    });
    this._selectItem(item);
    this._renderGeoList();
  };

  // Sync a node's _preview3d state to the 3D scene items (no rebuild)
  // Called from the 2D canvas eye toggle button
  Viewer3D._syncNodePreview = function(nodeId, visible) {
    var wasSelected = this._selectedItem && this._selectedItem.nodeId === nodeId;
    setNodePreviewState(app, this, nodeId, visible);
    if (visible === false && wasSelected) this._deselectAll();
  };

  // Show all
  Viewer3D._showAll = function() {
    showAllPreviews(app, this, { renderList: false });
    this._deselectAll();
    this._renderGeoList();
  };

  // ══════════════════════════════════════
  // 6. GEOMETRY LIST PANEL (overlay in 3D view)
  // ══════════════════════════════════════

  Viewer3D._renderGeoList = function() {
    var panel = document.getElementById('geo-list-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'geo-list-panel';
      var viewport = document.getElementById('viewport-3d');
      if (viewport) viewport.appendChild(panel);
      else return;
    }

    if (this._sceneItems.length === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';

    // ── Position the panel: default top-left of the viewport. If the AI
    // chat is docked on the left and visible, push the panel to the right
    // of the chat so they don't overlap.
    var chatDock = (typeof app !== 'undefined') ? app.chatDock : 'right';
    var chatVisible = (typeof app !== 'undefined') ? app.chatVisible : false;
    var chatWidth = (typeof app !== 'undefined') ? app.chatWidth : 360;

    // Reset positioning
    panel.style.left = '';
    panel.style.right = '';
    panel.style.top = '12px';

    if (chatDock === 'left' && chatVisible) {
      // Chat is on the left — place panel just after the chat panel
      panel.style.left = (chatWidth + 16) + 'px';
      panel.style.right = '';
    } else {
      // Chat is on the right, bottom, float, or hidden — panel pins left
      panel.style.left = '12px';
      panel.style.right = '';
    }

    var html = '<div class="geolist-header">' +
      '<span class="geolist-title">\uD83C\uDFAD Geometry</span>' +
      '<span class="geolist-count">' + this._sceneItems.length + '</span>' +
      '<button class="geolist-btn geolist-btn--showall" onclick="Viewer3D._showAll()" title="Preview All">\uD83D\uDC41 All</button>' +
      '</div>';

    html += '<div class="geolist-items">';
    this._sceneItems.forEach(function(item, idx) {
      var cls = 'geolist-item';
      if (item.selected) cls += ' selected';
      if (!item.visible) cls += ' hidden-item';

      // Icon based on geometry type
      var icon = '\u25C6'; // diamond
      if (item.group.children.length > 0) {
        var first = item.group.children[0];
        if (first.isLine || first.isLineSegments) icon = '\u2571'; // slash
        else if (first.isGroup && first.children.length > 0) icon = '\u25A3'; // mesh
        else icon = '\u25CF'; // circle for mesh
      }

      // Short label
      var label = item.label;
      if (label.length > 24) label = label.substring(0, 22) + '\u2026';

      // Child count info
      var childCount = 0;
      item.group.traverse(function(obj) { if (obj.isMesh) childCount++; });
      var info = childCount > 1 ? childCount + ' meshes' : '';

      // Visible / hidden eye glyphs: open eye for ON, prohibition symbol for
      // OFF \u2014 the previous "eye in speech bubble" variant was nearly
      // identical to the open eye at this font size.
      // Show the full label as a native browser tooltip on the info area so
      // users can read names that were truncated by the 22-char cap.
      var fullLabel = escapeAttr(item.label || '');
      html += '<div class="' + cls + '" data-idx="' + idx + '">' +
        '<button class="geolist-eye" onclick="event.stopPropagation();Viewer3D._toggleItemVisibility(Viewer3D._sceneItems[' + idx + '])" title="' + (item.visible ? 'Hide' : 'Show') + '">' +
        (item.visible ? '\uD83D\uDC41' : '\u2298') + '</button>' +
        '<div class="geolist-info" title="' + fullLabel + '" onclick="Viewer3D._selectItem(Viewer3D._sceneItems[' + idx + '])">' +
        '<span class="geolist-icon">' + icon + '</span>' +
        '<span class="geolist-label">' + escapeHtml(label) + '</span>' +
        (info ? '<span class="geolist-meta">' + escapeHtml(info) + '</span>' : '') +
        '</div>' +
        '<button class="geolist-isolate" onclick="event.stopPropagation();Viewer3D._isolateItem(Viewer3D._sceneItems[' + idx + '])" title="Isolate (solo)">\u25CE</button>' +
        '</div>';
    });
    html += '</div>';

    panel.innerHTML = html;
  };

  // ══════════════════════════════════════
  // 7. INIT HOOK — attach raycaster when 3D view opens
  // ══════════════════════════════════════

  var origShow = Viewer3D.show.bind(Viewer3D);
  Viewer3D.show = function() {
    origShow();
    this._initRaycaster();
  };

  // ══════════════════════════════════════
  // 8. REPOSITION PANEL WHEN CHAT DOCK CHANGES
  // Patch dockChat, detachChat, toggleChat to update geo panel position
  // ══════════════════════════════════════

  var origDockChat = app.dockChat.bind(app);
  app.dockChat = function(pos) {
    origDockChat(pos);
    if (Viewer3D._sceneItems && Viewer3D._sceneItems.length > 0) Viewer3D._renderGeoList();
  };

  var origDetachChat = app.detachChat.bind(app);
  app.detachChat = function() {
    origDetachChat();
    if (Viewer3D._sceneItems && Viewer3D._sceneItems.length > 0) Viewer3D._renderGeoList();
  };

  var origToggleChat = app.toggleChat.bind(app);
  app.toggleChat = function() {
    origToggleChat();
    if (Viewer3D._sceneItems && Viewer3D._sceneItems.length > 0) Viewer3D._renderGeoList();
  };

  // Also reposition when chat is resized (drag handle)
  var origOnChatResize = app.onChatResize.bind(app);
  app.onChatResize = function(e) {
    origOnChatResize(e);
    if (app.currentView === '3d' && Viewer3D._sceneItems && Viewer3D._sceneItems.length > 0) Viewer3D._renderGeoList();
  };

  return true;
}

export default installGeoSelector;
