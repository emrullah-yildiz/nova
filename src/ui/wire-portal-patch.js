// ═══════════════════════════════════════════════════
/* eslint-disable no-inner-declarations */
import {
  PORTAL_DEFAULT_IN_T,
  PORTAL_DEFAULT_OUT_T,
  findPortalRingTarget,
  movePortalDrag,
  startPortalDrag
} from './wire-portal-drag.js';

// WIRE PORTAL PATCH v6
// Crossing wires: shorter wire gets 3D portal rings.
// Each portal moves independently along the wire.
// Dashed line always visible between portals.
// ═══════════════════════════════════════════════════

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

export function installWirePortalPatch(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__wirePortalPatchInstalled) return true;
  targetApp.__wirePortalPatchInstalled = true;
  var app = targetApp;

  var INSTALLED = false;
  var DEFAULT_IN = PORTAL_DEFAULT_IN_T;   // portal-in default t (near output port)
  var DEFAULT_OUT = PORTAL_DEFAULT_OUT_T;  // portal-out default t (near input port)

  // Per-wire per-side margins: key = wireKey+':in' or wireKey+':out', value = t
  var portalT = {};

  var dragKey = null;    // e.g. 'node-1:value>node-3:x:in'
  var dragState = null;

  function install() {
    if (INSTALLED) return;
    if (!app || !app.renderWires) return;
    INSTALLED = true;

    var _lastPortalFlags = {};

    app.renderWires = function() {
      var svg = document.getElementById('wire-svg');
      var area = document.getElementById('canvas-area');
      var overlay = document.getElementById('portal-overlay');
      if (!svg || !area) return;
      var ar = area.getBoundingClientRect();
      var self = this;

      // Clean wires
      var nm = {};
      this.nodes.forEach(function(n) { nm[n.id] = true; });
      this.wires = this.wires.filter(function(w) { return nm[w.fromNode] && nm[w.toNode]; });

      // Build wire data
      var wds = [];
      this.wires.forEach(function(w, i) {
        if (!document.getElementById(w.fromNode) || !document.getElementById(w.toNode)) return;
        var fd = document.querySelector('#' + w.fromNode + ' .port-dot[data-port="' + w.fromPort + '"][data-dir="output"]');
        var td = document.querySelector('#' + w.toNode + ' .port-dot[data-port="' + w.toPort + '"][data-dir="input"]');
        if (!fd || !td) return;
        var fr = fd.getBoundingClientRect(), tr = td.getBoundingClientRect();
        if ((fr.width === 0 && fr.height === 0) || (tr.width === 0 && tr.height === 0)) return;
        var x1 = fr.left + fr.width/2 - ar.left, y1 = fr.top + fr.height/2 - ar.top;
        var x2 = tr.left + tr.width/2 - ar.left, y2 = tr.top + tr.height/2 - ar.top;

        // Check if this wire is being moved (Ctrl+output drag)
        var isBeingMoved = false;
        var ds = app._dragState;
        if (ds && ds.type === 'move' && ds.affectedWireIndices.indexOf(i) >= 0) {
          isBeingMoved = true;
          x1 = ds.cursorX; y1 = ds.cursorY; // output end follows cursor
        }

        var dx = Math.max(Math.abs(x2 - x1) * 0.5, 50);
        wds.push({
          i: i, w: w, c: self.getWireColor(w),
          p0:{x:x1,y:y1}, p1:{x:x1+dx,y:y1}, p2:{x:x2-dx,y:y2}, p3:{x:x2,y:y2},
          len: Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1)),
          portal: false, isMoving: isBeingMoved
        });
      });

      // Check if portals are enabled in preferences
      var portalsEnabled = localStorage.getItem('nodeflow_wire_portals') !== 'false';
      var animationsEnabled = localStorage.getItem('nodeflow_wire_animations') !== 'false';

      // Detect crossings — cache results, only recompute when not dragging
      var isDragging = !!self.draggingNode;
      if (!isDragging) {
        // Full crossing detection
        _lastPortalFlags = {};
        for (var a = 0; a < wds.length; a++) {
          for (var b = a + 1; b < wds.length; b++) {
            var wa = wds[a], wb = wds[b];
            if (wa.w.fromNode === wb.w.fromNode) continue;
            if (crosses(wa, wb)) {
              if (wa.len <= wb.len) _lastPortalFlags[wkey(wa.w)] = true;
              else _lastPortalFlags[wkey(wb.w)] = true;
            }
          }
        }
      }
      // Apply cached flags — only if portals are enabled
      if (portalsEnabled) {
        wds.forEach(function(wd) {
          if (_lastPortalFlags[wkey(wd.w)]) wd.portal = true;
        });
      }

      // Render
      var s = '<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
      var ph = '';

      wds.forEach(function(wd) {
        var c = wd.c;
        var fp = 'M'+wd.p0.x+','+wd.p0.y+' C'+wd.p1.x+','+wd.p1.y+' '+wd.p2.x+','+wd.p2.y+' '+wd.p3.x+','+wd.p3.y;
        var wk = wkey(wd.w);

        if (!wd.portal) {
          var isMoving = wd.isMoving;
          var wireStyle = isMoving ? 'stroke-dasharray="6 3" opacity="0.5"' : 'opacity="0.7"';
          s += '<path d="'+fp+'" fill="none" stroke="'+c+'" stroke-width="2.5" '+wireStyle+'/>';
        } else {
          var tIn = portalT[wk+':in'] !== undefined ? portalT[wk+':in'] : DEFAULT_IN;
          var tOut = portalT[wk+':out'] !== undefined ? portalT[wk+':out'] : DEFAULT_OUT;

          // Clamp: in must be < out
          if (tIn >= tOut - 0.04) { tIn = tOut - 0.04; }

          // Solid wire: output port → portal-in
          s += '<path d="'+seg(wd,0,tIn)+'" fill="none" stroke="'+c+'" stroke-width="2.5" opacity="0.7"/>';
          // Solid wire: portal-out → input port
          s += '<path d="'+seg(wd,tOut,1)+'" fill="none" stroke="'+c+'" stroke-width="2.5" opacity="0.7"/>';
          // Dashed tunnel between portals (always visible)
          s += '<path d="'+seg(wd,tIn,tOut)+'" fill="none" stroke="'+c+'" stroke-width="1.2" opacity="0.25" stroke-dasharray="4 4"/>';

          // Wire direction for drag axis
          var ddx = (wd.p3.x - wd.p0.x).toFixed(1);
          var ddy = (wd.p3.y - wd.p0.y).toFixed(1);

          // Build portal HTML helper
          function portalHTML(wk, side, pt, c, ddx, ddy, wlen) {
            var h = '<div class="portal-ring" data-pk="'+wk+':'+side+'" data-wlen="'+wlen+'" data-dx="'+ddx+'" data-dy="'+ddy+'" style="left:'+f(pt.x)+'px;top:'+f(pt.y)+'px;color:'+c+';">';
            h += '<div class="portal-body" style="border-color:'+c+'; color:'+c+';"></div>';
            h += '<div class="p-orbit">';
            h += '<div class="p-particle p-p0" style="background:'+c+'; box-shadow:0 0 4px '+c+';"></div>';
            h += '<div class="p-particle p-p1" style="background:'+c+'; box-shadow:0 0 3px '+c+';"></div>';
            h += '<div class="p-particle p-p2" style="background:'+c+'; box-shadow:0 0 4px '+c+';"></div>';
            h += '<div class="p-particle p-p3" style="background:'+c+'; box-shadow:0 0 3px '+c+';"></div>';
            h += '<div class="p-particle p-p4" style="background:'+c+'; box-shadow:0 0 5px '+c+';"></div>';
            h += '</div>';
            h += '<div class="portal-dot" style="color:'+c+';"></div>';
            h += '</div>';
            return h;
          }

          var pIn = bpt(wd, tIn);
          ph += portalHTML(wk, 'in', pIn, c, ddx, ddy, wd.len.toFixed(0));

          var pOut = bpt(wd, tOut);
          ph += portalHTML(wk, 'out', pOut, c, ddx, ddy, wd.len.toFixed(0));
        }

        // Flow animation — only after Run, and only if animations enabled
        var dur = (2.5 + wd.i * 0.4).toFixed(1);
        var hasRun = animationsEnabled && self._lastRunWires && self._lastRunWires.indexOf(wk) >= 0 && !self._graphDirty;
        if (!hasRun) {
          // No animation before Run
        } else if (wd.portal) {
          var tI = portalT[wk+':in'] !== undefined ? portalT[wk+':in'] : DEFAULT_IN;
          var tO = portalT[wk+':out'] !== undefined ? portalT[wk+':out'] : DEFAULT_OUT;
          // Ensure keyTimes are strictly ascending
          var k1 = Math.max(0.02, tI - 0.02);
          var k2 = Math.min(k1 + 0.03, tI + 0.01);
          var k3 = Math.max(k2 + 0.01, tO - 0.01);
          var k4 = Math.min(k3 + 0.03, tO + 0.02);
          // Clamp all between 0 and 1, strictly ascending
          k1 = Math.max(0.02, Math.min(0.95, k1));
          k2 = Math.max(k1 + 0.01, Math.min(0.96, k2));
          k3 = Math.max(k2 + 0.01, Math.min(0.97, k3));
          k4 = Math.max(k3 + 0.01, Math.min(0.98, k4));
          s += '<circle r="3" fill="'+c+'" opacity="0">';
          s += '<animateMotion dur="'+dur+'s" repeatCount="indefinite" path="'+fp+'"/>';
          s += '<animate attributeName="opacity" values="0;0.8;0.8;0.05;0.05;0.8;0.8;0" ';
          s += 'keyTimes="0;'+k1.toFixed(3)+';'+k2.toFixed(3)+';'+(k2+0.005).toFixed(3)+';'+k3.toFixed(3)+';'+(k3+0.005).toFixed(3)+';'+k4.toFixed(3)+';1" ';
          s += 'dur="'+dur+'s" repeatCount="indefinite"/>';
          s += '</circle>';
        } else {
          s += '<circle r="3" fill="'+c+'" opacity="0">';
          s += '<animateMotion dur="'+dur+'s" repeatCount="indefinite" path="'+fp+'"/>';
          s += '<animate attributeName="opacity" values="0;0;0.8;0.8;0.8;0;0" keyTimes="0;0.03;0.1;0.5;0.9;0.97;1" dur="'+dur+'s" repeatCount="indefinite"/>';
          s += '</circle>';
        }
      });

      // Connecting wire
      if (this.connectingWire) {
        var cw = this.connectingWire, cdx = Math.max(Math.abs(cw.endX - cw.startX) * 0.5, 40);
        if (cw.fromDir === 'output')
          s += '<path class="wire-connecting" d="M'+cw.startX+','+cw.startY+' C'+(cw.startX+cdx)+','+cw.startY+' '+(cw.endX-cdx)+','+cw.endY+' '+cw.endX+','+cw.endY+'" fill="none" stroke="#89b4fa" stroke-width="2"/>';
        else
          s += '<path class="wire-connecting" d="M'+cw.endX+','+cw.endY+' C'+(cw.endX+cdx)+','+cw.endY+' '+(cw.startX-cdx)+','+cw.startY+' '+cw.startX+','+cw.startY+'" fill="none" stroke="#89b4fa" stroke-width="2"/>';
      }

      svg.innerHTML = s;
      if (overlay) overlay.innerHTML = ph;
    };

    console.log('[NodeFlow] Wire Portal v6 installed — independent portals, visible dashed line');
  }

  // ── Drag handling ──
  function initDragListeners() {
    document.addEventListener('mousedown', function(e) {
      var ring = findPortalRingTarget(e.target, e.clientX, e.clientY, document);
      if (!ring) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      var pk = ring.getAttribute('data-pk'); // e.g. 'node-1:val>node-2:x:in'
      dragKey = pk;
      dragState = startPortalDrag({
        key: pk,
        wireLength: parseFloat(ring.getAttribute('data-wlen')) || 200,
        dx: parseFloat(ring.getAttribute('data-dx')) || 1,
        dy: parseFloat(ring.getAttribute('data-dy')) || 0,
        startT: portalT[pk],
        clientX: e.clientX,
        clientY: e.clientY
      });
      app._portalDragActive = true;
    }, true);

    document.addEventListener('mousemove', function(e) {
      if (!dragKey) return;
      e.stopPropagation();
      e.preventDefault();
      var newT = movePortalDrag(dragState, e.clientX, e.clientY);
      portalT[dragKey] = newT;
      app.renderWires();
    }, true);

    document.addEventListener('mouseup', function() {
      dragKey = null;
      dragState = null;
      app._portalDragActive = false;
    }, true);
  }

  var dTimer = setInterval(function() {
    if (document.getElementById('portal-overlay')) {
      clearInterval(dTimer);
      initDragListeners();
    }
  }, 200);

  // ── Helpers ──
  function f(v) { return v.toFixed(1); }
  function wkey(w) { return w.fromNode+':'+w.fromPort+'>'+w.toNode+':'+w.toPort; }

  function bpt(wd, t) {
    var u=1-t;
    return { x: u*u*u*wd.p0.x+3*u*u*t*wd.p1.x+3*u*t*t*wd.p2.x+t*t*t*wd.p3.x,
             y: u*u*u*wd.p0.y+3*u*u*t*wd.p1.y+3*u*t*t*wd.p2.y+t*t*t*wd.p3.y };
  }

  function seg(wd, t0, t1) {
    var pts=[], n=10;
    for (var i=0;i<=n;i++) { var p=bpt(wd,t0+(t1-t0)*i/n); pts.push(f(p.x)+','+f(p.y)); }
    return 'M'+pts[0]+' L'+pts.slice(1).join(' L');
  }

  function crosses(a, b) {
    var N=24;
    for (var i=0;i<N;i++) {
      var a1=bpt(a,i/N),a2=bpt(a,(i+1)/N);
      for (var j=0;j<N;j++) {
        var b1=bpt(b,j/N),b2=bpt(b,(j+1)/N);
        var d=(a1.x-a2.x)*(b1.y-b2.y)-(a1.y-a2.y)*(b1.x-b2.x);
        if (Math.abs(d)<0.001) continue;
        var ua=((a1.x-b1.x)*(b1.y-b2.y)-(a1.y-b1.y)*(b1.x-b2.x))/d;
        var ub=-((a1.x-a2.x)*(a1.y-b1.y)-(a1.y-a2.y)*(a1.x-b1.x))/d;
        if (ua>0.01&&ua<0.99&&ub>0.01&&ub<0.99) return true;
      }
    }
    return false;
  }

  // ── Install ──
  var tries = 0;
  var tmr = setInterval(function() {
    tries++;
    if (tries > 50) { clearInterval(tmr); return; }
    if (app && app._renderFromCompute && document.getElementById('wire-svg')) {
      clearInterval(tmr);
      install();
    }
  }, 100);

  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    installWirePortalPatch();
  });
}

export default installWirePortalPatch;
