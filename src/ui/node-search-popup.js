import { NODE_LIBRARY, NODE_TYPE_MAP, visibleCategories } from '../core/nodes.js';

// ============================================
// NODEFLOW AI — Canvas Node Search Popup
// Replaces right-click context menu with a search bar.
// Shows recently used nodes (max 5) when search is empty.
// Runs on DOMContentLoaded + delay to override engine.js.
// ============================================

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

export function installNodeSearchPopup(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__nodeSearchPopupInstalled) return true;
  targetApp.__nodeSearchPopupInstalled = true;
  var app = targetApp;

  setTimeout(function() {

  var _popup = null;
  var _clickCanvasX = 0;
  var _clickCanvasY = 0;
  var _activeIndex = 0;
  var _currentResults = [];

  // ── Recently used nodes (persisted in memory, max 5) ──
  var _recentTypes = []; // ordered newest-first

  function addRecent(type) {
    var idx = _recentTypes.indexOf(type);
    if (idx >= 0) _recentTypes.splice(idx, 1); // remove if exists
    _recentTypes.unshift(type); // add to front
    if (_recentTypes.length > 5) _recentTypes.length = 5;
  }

  function getRecentNodes() {
    var results = [];
    _recentTypes.forEach(function(type) {
      var def = NODE_TYPE_MAP[type];
      if (def) {
        var cat = null;
        NODE_LIBRARY.categories.forEach(function(c) { c.nodes.forEach(function(n) { if (n.type === type) cat = c; }); });
        results.push({ type: def.type, name: def.name, icon: def.icon, catName: cat ? cat.name : '', catColor: cat ? cat.color : '#a6adc8' });
      }
    });
    return results;
  }

  function getAllNodes() {
    var results = [];
    // Search corpus = discovery surface: exclude hidden categories (Host, Rhino).
    visibleCategories().forEach(function(cat) {
      cat.nodes.forEach(function(node) {
        results.push({ type: node.type, name: node.name, icon: node.icon, catName: cat.name, catColor: cat.color });
      });
    });
    return results;
  }

  function filterNodes(query, allNodes) {
    if (!query) return []; // empty = show recents instead
    var q = query.toLowerCase();
    var scored = [];
    allNodes.forEach(function(n) {
      var name = n.name.toLowerCase();
      var cat = n.catName.toLowerCase();
      var score = 0;
      if (name.indexOf(q) === 0) score = 100;
      else if (name.indexOf(q) >= 0) score = 80;
      else if ((cat + ' ' + name).indexOf(q) >= 0) score = 70;
      else {
        var words = name.split(/[.\s]/);
        for (var i = 0; i < words.length; i++) {
          if (words[i].toLowerCase().indexOf(q) === 0) { score = 60; break; }
        }
      }
      if (score > 0) scored.push({ node: n, score: score });
    });
    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.map(function(s) { return s.node; });
  }

  function renderResults(container, nodes, isRecent) {
    container.innerHTML = '';

    // Section header for recents
    if (isRecent && nodes.length > 0) {
      var header = document.createElement('div');
      header.className = 'nsp-section-header';
      header.textContent = 'Recently Used';
      container.appendChild(header);
    }

    if (nodes.length === 0 && isRecent) {
      container.innerHTML = '<div style="padding:12px 14px;color:var(--text-muted);font-size:11px;text-align:center;font-style:italic">Right-click canvas to add nodes.\nStart typing to search.</div>';
      return;
    }

    if (nodes.length === 0 && !isRecent) {
      container.innerHTML = '<div style="padding:12px 14px;color:var(--text-muted);font-size:12px;text-align:center">No nodes found</div>';
      return;
    }

    nodes.forEach(function(n, i) {
      var item = document.createElement('button');
      item.className = 'nsp-item' + (i === _activeIndex ? ' nsp-item-active' : '');
      item.setAttribute('data-type', n.type);
      item.innerHTML = '<span class="nsp-item-icon" style="color:' + n.catColor + '">' + n.icon + '</span>' +
        '<span class="nsp-item-name">' + n.name + '</span>' +
        '<span class="nsp-item-cat">' + n.catName + '</span>';
      item.addEventListener('click', function(e) { e.stopPropagation(); placeNode(n.type); });
      item.addEventListener('mouseenter', function() {
        container.querySelectorAll('.nsp-item').forEach(function(el) { el.classList.remove('nsp-item-active'); });
        item.classList.add('nsp-item-active');
        _activeIndex = i;
      });
      container.appendChild(item);
    });
  }

  function placeNode(type) {
    closePopup();
    addRecent(type);
    var nd = app.addNodeToCanvas(type, _clickCanvasX, _clickCanvasY);
    if (nd) app.selectNode(nd.id, false);
  }

  function openPopup(screenX, screenY) {
    closePopup();
    var area = document.getElementById('canvas-area');
    if (!area) return;
    var areaRect = area.getBoundingClientRect();
    _clickCanvasX = (screenX - areaRect.left - app.panX) / app.zoom;
    _clickCanvasY = (screenY - areaRect.top - app.panY) / app.zoom;
    var allNodes = getAllNodes();
    _activeIndex = 0;

    _popup = document.createElement('div');
    _popup.id = 'node-search-popup';
    _popup.className = 'nsp-container';

    var searchWrap = document.createElement('div');
    searchWrap.className = 'nsp-search-wrap';
    searchWrap.innerHTML = '<svg class="nsp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'nsp-search-input';
    input.placeholder = 'Search nodes\u2026';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    searchWrap.appendChild(input);
    _popup.appendChild(searchWrap);

    var results = document.createElement('div');
    results.className = 'nsp-results';
    _popup.appendChild(results);

    _popup.style.left = screenX + 'px';
    _popup.style.top = screenY + 'px';
    document.body.appendChild(_popup);

    var pr = _popup.getBoundingClientRect();
    if (pr.right > window.innerWidth - 10) _popup.style.left = (window.innerWidth - pr.width - 10) + 'px';
    if (pr.bottom > window.innerHeight - 10) _popup.style.top = (window.innerHeight - pr.height - 10) + 'px';
    if (pr.left < 10) _popup.style.left = '10px';
    if (pr.top < 10) _popup.style.top = '10px';

    // Show recents when empty
    var recents = getRecentNodes();
    _currentResults = recents;
    renderResults(results, recents, true);

    setTimeout(function() { input.focus(); }, 20);

    input.addEventListener('input', function() {
      var q = input.value.trim();
      if (!q) {
        var recents = getRecentNodes();
        _currentResults = recents;
        _activeIndex = 0;
        renderResults(results, recents, true);
      } else {
        _currentResults = filterNodes(q, allNodes);
        _activeIndex = 0;
        renderResults(results, _currentResults, false);
      }
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { closePopup(); e.preventDefault(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); _activeIndex = Math.min(_activeIndex + 1, _currentResults.length - 1); updateActive(results); }
      if (e.key === 'ArrowUp') { e.preventDefault(); _activeIndex = Math.max(_activeIndex - 1, 0); updateActive(results); }
      if (e.key === 'Enter') { e.preventDefault(); if (_currentResults.length > 0 && _activeIndex < _currentResults.length) placeNode(_currentResults[_activeIndex].type); }
    });

    setTimeout(function() { document.addEventListener('mousedown', _outsideHandler); }, 50);
  }

  function updateActive(container) {
    var items = container.querySelectorAll('.nsp-item');
    items.forEach(function(el, i) { el.classList.toggle('nsp-item-active', i === _activeIndex); });
    var active = container.querySelector('.nsp-item-active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function _outsideHandler(e) { if (_popup && !_popup.contains(e.target)) closePopup(); }

  function closePopup() {
    if (_popup) { _popup.remove(); _popup = null; }
    document.removeEventListener('mousedown', _outsideHandler);
  }

  // ── Override context menu ──
  app.showContextMenu = function(x, y) {
    var oldMenu = document.getElementById('context-menu');
    if (oldMenu) oldMenu.classList.remove('visible');
    openPopup(x, y);
  };

  app.hideContextMenu = function() {
    var oldMenu = document.getElementById('context-menu');
    if (oldMenu) oldMenu.classList.remove('visible');
    closePopup();
  };

  // ── Portal zoom scaling — update portal size with canvas zoom ──
  function updatePortalScale() {
    var overlay = document.getElementById('portal-overlay');
    if (!overlay) return;
    var z = app.zoom || 1;
    // Scale portals inversely: at zoom 1 = full size, at zoom 0.5 = half, hide below 0.3
    var scale = Math.max(0, Math.min(1, z));
    overlay.style.setProperty('--portal-scale', scale.toFixed(2));
    // Hide entirely when very zoomed out
    overlay.style.opacity = z < 0.35 ? '0' : '1';
  }

  // Patch applyTransform to update portals on zoom
  var _origApplyTransform = app.applyTransform ? app.applyTransform.bind(app) : null;
  if (_origApplyTransform) {
    app.applyTransform = function() {
      _origApplyTransform();
      updatePortalScale();
    };
  }

  console.log('[NodeFlow] Node Search Popup active (with recents)');

  }, 200);

  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    installNodeSearchPopup();
  });
}

export default installNodeSearchPopup;
