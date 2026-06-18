// ═══════════════════════════════════════════════════
// LINE RENDER PATCH — Render curves as flat, visible "fat lines"
// Plain THREE.Line renders as a 1px hairline (WebGL ignores linewidth on most
// GPUs), so the old code faked thickness with 3D TubeGeometry — but tubes look
// like swept solids, not curves. This patch renders Line3, Polyline3, Arc3 and
// Circle3 with THREE.Line2 / LineMaterial: flat lines whose width is measured
// in screen pixels, so they look crisp and 2D like Rhino while staying visible.
// Falls back to a plain THREE.Line if the Line2 example modules aren't loaded.
// ═══════════════════════════════════════════════════

function getRuntimeGeo() {
  if (typeof window !== 'undefined' && window.Geo) return window.Geo;
  if (typeof globalThis !== 'undefined' && globalThis.Geo) return globalThis.Geo;
  return null;
}

function getRuntimeThree() {
  if (typeof window !== 'undefined' && window.THREE) return window.THREE;
  if (typeof globalThis !== 'undefined' && globalThis.THREE) return globalThis.THREE;
  return null;
}

export function installLineRenderPatch(geo = getRuntimeGeo(), three = getRuntimeThree()) {
  if (!geo || !three) return false;
  if (geo.__lineRenderPatchInstalled) return true;
  geo.__lineRenderPatchInstalled = true;
  var Geo = geo;
  var THREE = three;
  var hasFatLines = !!(THREE.Line2 && THREE.LineGeometry && THREE.LineMaterial);

  // Default line width in screen pixels (Rhino draws curves ~2px).
  var LINE_WIDTH = 2;
  var _size = new THREE.Vector2();

  // Build a flat, screen-space-width line through `threePoints`.
  // `threePoints` is an array of THREE.Vector3 already in viewer (Y-up) space.
  function makeLine(threePoints, color, closed) {
    var c = color;
    if (closed && threePoints.length > 2) {
      threePoints = threePoints.slice();
      threePoints.push(threePoints[0].clone());
    }
    if (!hasFatLines) {
      // Fallback: thin flat line (still 2D, just hairline thin).
      var g = new THREE.BufferGeometry().setFromPoints(threePoints);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color: c }));
    }
    var positions = [];
    for (var i = 0; i < threePoints.length; i++) {
      positions.push(threePoints[i].x, threePoints[i].y, threePoints[i].z);
    }
    var geom = new THREE.LineGeometry();
    geom.setPositions(positions);
    var mat = new THREE.LineMaterial({
      color: c,
      linewidth: LINE_WIDTH,        // measured in screen pixels in this three build
      dashed: false,
      alphaToCoverage: true
    });
    var line = new THREE.Line2(geom, mat);
    line.computeLineDistances();
    // Keep the material's resolution synced to the canvas every frame so the
    // pixel width stays correct across resizes without touching the renderer.
    line.onBeforeRender = function(renderer) {
      renderer.getSize(_size);
      mat.resolution.set(_size.x, _size.y);
    };
    return line;
  }

  // ── Line3: a single flat segment ──
  Geo.Line3.prototype.toMesh = function(color) {
    return makeLine([this.start.toThree(), this.end.toThree()], color || 0xa6e3a1, false);
  };

  // ── Polyline3: flat 2D line (closed loops back to the first point) ──
  Geo.Polyline3.prototype.toMesh = function(color) {
    var pts = this.points;
    if (!pts || pts.length < 2) return new THREE.Group();
    var threePoints = pts.map(function(p) { return p.toThree(); });
    return makeLine(threePoints, color || 0x94e2d5, !!this.closed);
  };

  // ── Arc3: flat polyline sampled along the arc ──
  Geo.Arc3.prototype.toMesh = function(color) {
    var pts = this.toPoints(64);
    if (!pts || pts.length < 2) return new THREE.Group();
    var threePoints = pts.map(function(p) { return p.toThree(); });
    return makeLine(threePoints, color || 0xf9e2af, false);
  };

  // Circle3 delegates to Arc3, so it inherits the fix automatically

  console.log('[NodeFlow] Line render patch loaded — flat fat lines' + (hasFatLines ? '' : ' (thin fallback: Line2 modules missing)'));
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    installLineRenderPatch();
  });
}

export default installLineRenderPatch;
