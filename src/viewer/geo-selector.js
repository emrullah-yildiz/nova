import { Geo } from '../geometry/index.js';
import { Viewer3D as RuntimeViewer3D } from './viewer3d.js';

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
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

  // Colors for selection highlight
  const SEL_COLOR = 0x89b4fa;
  const SEL_EMISSIVE = 0x89b4fa;
  const DIM_OPACITY = 0.15;
  const NORMAL_OPACITY = 0.85;

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
        var geo = new THREE.SphereGeometry(0.15, 8, 8);
        var mat = new THREE.MeshPhongMaterial({ color: color || 0x94e2d5, emissive: color || 0x94e2d5, emissiveIntensity: 0.3 });
        pts.forEach(function(p) {
          var mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(p[0] || 0, p[2] || 0, p[1] || 0);
          group.add(mesh);
        });
      }
    }

    if (group.children.length === 0) return null;

    this.geometryGroup.add(group);

    var itemId = nodeId + (varName ? ':' + varName : '');
    var item = { id: itemId, nodeId: nodeId, varName: varName || '', label: label || varName || '', group: group, visible: true, selected: false };
    this._sceneItems.push(item);
    return item;
  };

  // ══════════════════════════════════════
  // 3. PATCHED buildFromGraph
  // Uses tagged groups instead of flat addToScene
  // ══════════════════════════════════════

  const origBuildPatched = Viewer3D.buildFromGraph.bind(Viewer3D);

  Viewer3D.buildFromGraph = function(nodes, wires, computeFn) {
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
          'custom-formula','custom-comment','custom-ainode'];
        if (passTypes.indexOf(nd.type) >= 0) return;

        // ── Python/Code nodes: render EACH output variable as separate group ──
        if ((nd.type === 'custom-python' || nd.type === 'custom-code') && nd._pyResults) {
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

        var isGeo = (val && val._type) ||
                    (Array.isArray(val) && val.length > 0 && val[0] && (val[0]._type || val[0] instanceof Geo.Point3));
        if (isGeo) {
          var label = nd.def.name + (nd.id ? ' (' + nd.id + ')' : '');
          Viewer3D.addTaggedGeo(val, nd.id, '', label);
          return;
        }

        // ── Legacy: tuple arrays as points ──
        if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0]) && val[0].length >= 2) {
          var group = new THREE.Group();
          group.userData = { nodeId: nd.id, varName: '', label: nd.def.name, isGeoItem: true };
          // Points
          var geo = new THREE.SphereGeometry(0.15, 8, 8);
          var mat = new THREE.MeshPhongMaterial({ color: 0x94e2d5, emissive: 0x94e2d5, emissiveIntensity: 0.3 });
          val.forEach(function(p) {
            var m = new THREE.Mesh(geo, mat);
            m.position.set(p[0]||0, p[2]||0, p[1]||0);
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
    this.renderer.domElement.addEventListener('click', function(e) {
      if (!self.isVisible) return;
      // Ignore if user was orbiting (mouse moved significantly)
      if (self._lastMouseDown && (Math.abs(e.clientX - self._lastMouseDown.x) > 5 || Math.abs(e.clientY - self._lastMouseDown.y) > 5)) return;

      var rect = self.renderer.domElement.getBoundingClientRect();
      self._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      self._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      self._raycaster.setFromCamera(self._mouse, self.camera);

      // Only intersect geometry group children
      var allMeshes = [];
      self.geometryGroup.traverse(function(obj) {
        if (obj.isMesh || obj.isLine || obj.isLineSegments) allMeshes.push(obj);
      });

      var intersects = self._raycaster.intersectObjects(allMeshes, false);
      if (intersects.length > 0) {
        // Walk up to find the tagged group
        var hit = intersects[0].object;
        var taggedGroup = null;
        var current = hit;
        while (current) {
          if (current.userData && current.userData.isGeoItem) { taggedGroup = current; break; }
          current = current.parent;
        }
        if (taggedGroup) {
          var item = self._sceneItems.find(function(it) { return it.group === taggedGroup; });
          if (item) {
            self._selectItem(item);
            return;
          }
        }
      }
      // Clicked empty space — deselect
      self._deselectAll();
    });

    // Track mousedown position to distinguish click from orbit
    this.renderer.domElement.addEventListener('mousedown', function(e) {
      self._lastMouseDown = { x: e.clientX, y: e.clientY };
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
    item.visible = !item.visible;
    item.group.visible = item.visible;

    // If hiding the selected item, deselect
    if (!item.visible && item.selected) {
      this._deselectAll();
    }

    // Also sync the node's _preview3d flag
    if (item.nodeId && typeof app !== 'undefined') {
      // If ALL items for this node are hidden, set _preview3d = false
      var nodeItems = this._sceneItems.filter(function(it) { return it.nodeId === item.nodeId; });
      var allHidden = nodeItems.every(function(it) { return !it.visible; });
      var nd = app.nodes.find(function(n) { return n.id === item.nodeId; });
      if (nd) nd._preview3d = !allHidden;

      // Update the eye button on the node if it exists
      var eyeBtn = document.querySelector('#' + item.nodeId + ' .node-preview-eye');
      if (eyeBtn) {
        eyeBtn.className = 'node-preview-eye' + (nd._preview3d ? '' : ' off');
        eyeBtn.textContent = nd._preview3d ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8';
      }
    }

    this._renderGeoList();
  };

  // Isolate: hide all except this item
  Viewer3D._isolateItem = function(item) {
    var self = this;
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
    if (!this._sceneItems || this._sceneItems.length === 0) return;
    var changed = false;
    this._sceneItems.forEach(function(item) {
      if (item.nodeId === nodeId) {
        item.visible = visible;
        item.group.visible = visible;
        if (!visible && item.selected) {
          item.selected = false;
        }
        changed = true;
      }
    });
    if (changed) {
      // If we hid the selected item, restore others to normal opacity
      if (!visible && this._selectedItem && this._selectedItem.nodeId === nodeId) {
        this._deselectAll();
      }
      this._renderGeoList();
    }
  };

  // Show all
  Viewer3D._showAll = function() {
    this._sceneItems.forEach(function(it) {
      it.visible = true;
      it.group.visible = true;
    });
    this._deselectAll();
    // Restore all node _preview3d
    if (typeof app !== 'undefined') {
      app.nodes.forEach(function(nd) { nd._preview3d = true; });
    }
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

    // ── Position the panel based on AI chat dock location ──
    // Default: top-right. If chat is docked right and visible, move panel to left of chat.
    var chatDock = (typeof app !== 'undefined') ? app.chatDock : 'right';
    var chatVisible = (typeof app !== 'undefined') ? app.chatVisible : false;
    var chatWidth = (typeof app !== 'undefined') ? app.chatWidth : 360;

    // Reset positioning
    panel.style.left = '';
    panel.style.right = '';
    panel.style.top = '12px';

    if (chatDock === 'right' && chatVisible) {
      // Chat is on the right — place panel just before the chat panel
      panel.style.right = (chatWidth + 16) + 'px';
      panel.style.left = '';
    } else {
      // Chat is on left, bottom, float, or hidden — panel goes to top-right
      panel.style.right = '12px';
      panel.style.left = '';
    }

    var html = '<div class="geolist-header">' +
      '<span class="geolist-title">\uD83C\uDFAD Geometry</span>' +
      '<span class="geolist-count">' + this._sceneItems.length + '</span>' +
      '<button class="geolist-btn" onclick="Viewer3D._showAll()" title="Show All">\uD83D\uDC41</button>' +
      '</div>';

    html += '<div class="geolist-items">';
    var self = this;
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

      html += '<div class="' + cls + '" data-idx="' + idx + '">' +
        '<button class="geolist-eye" onclick="event.stopPropagation();Viewer3D._toggleItemVisibility(Viewer3D._sceneItems[' + idx + '])" title="Toggle Visibility">' +
        (item.visible ? '\uD83D\uDC41' : '\uD83D\uDC41\u200D\uD83D\uDDE8') + '</button>' +
        '<div class="geolist-info" onclick="Viewer3D._selectItem(Viewer3D._sceneItems[' + idx + '])">' +
        '<span class="geolist-icon">' + icon + '</span>' +
        '<span class="geolist-label">' + label + '</span>' +
        (info ? '<span class="geolist-meta">' + info + '</span>' : '') +
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
