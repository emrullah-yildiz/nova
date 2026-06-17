// ═══════════════════════════════════════════════════
// LINE RENDER PATCH — Replace thin THREE.Line with visible tubes
// WebGL ignores linewidth on most GPUs, so lines render as 1px.
// This patches Line3, Polyline3, Arc3, Circle3 toMesh() methods
// to use TubeGeometry for thick, visible lines.
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

  // ── Line3: tube with endpoint spheres ──
  Geo.Line3.prototype.toMesh = function(color) {
    var s = this.start.toThree(), e = this.end.toThree();
    var c = color || 0xa6e3a1;
    var len = s.distanceTo(e);
    if (len < 0.001) len = 0.1;
    var r = Math.max(0.04, len * 0.01);
    var path = new THREE.LineCurve3(s, e);
    var tubeGeo = new THREE.TubeGeometry(path, 1, r, 6, false);
    var mat = new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.15 });
    var group = new THREE.Group();
    group.add(new THREE.Mesh(tubeGeo, mat));
    // Endpoint dots
    var dotGeo = new THREE.SphereGeometry(r * 2, 6, 6);
    var dotMat = new THREE.MeshPhongMaterial({ color: c });
    var d1 = new THREE.Mesh(dotGeo, dotMat); d1.position.copy(s);
    var d2 = new THREE.Mesh(dotGeo, dotMat); d2.position.copy(e);
    group.add(d1); group.add(d2);
    return group;
  };

  // ── Polyline3: straight tube segments (LineCurve3 per edge, no smoothing) ──
  Geo.Polyline3.prototype.toMesh = function(color) {
    var c = color || 0x94e2d5;
    var pts = this.points;
    if (!pts || pts.length < 2) return new THREE.Group();
    var totalLen = 0;
    for (var i = 1; i < pts.length; i++) totalLen += pts[i-1].distanceTo(pts[i]);
    if (totalLen < 0.001) totalLen = 1;
    var r = Math.max(0.03, totalLen * 0.005);
    var mat = new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.1 });
    var group = new THREE.Group();
    var threePoints = pts.map(function(p) { return p.toThree(); });
    var count = threePoints.length;
    var edgeCount = this.closed ? count : count - 1;
    for (var j = 0; j < edgeCount; j++) {
      var a = threePoints[j];
      var b = threePoints[(j + 1) % count];
      var edgeLen = a.distanceTo(b);
      if (edgeLen < 0.0001) continue;
      var seg = new THREE.LineCurve3(a, b);
      var tubeGeo = new THREE.TubeGeometry(seg, 1, r, 6, false);
      group.add(new THREE.Mesh(tubeGeo, mat));
    }
    return group;
  };

  // ── Arc3: tube along arc path ──
  Geo.Arc3.prototype.toMesh = function(color) {
    var c = color || 0xf9e2af;
    var pts = this.toPoints(64);
    if (!pts || pts.length < 2) return new THREE.Group();
    var r = Math.max(0.03, this.radius * 0.008);
    var threePoints = pts.map(function(p) { return p.toThree(); });
    var curve = new THREE.CatmullRomCurve3(threePoints, false);
    var mat = new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.1 });
    var tubeGeo = new THREE.TubeGeometry(curve, 64, r, 6, false);
    return new THREE.Mesh(tubeGeo, mat);
  };

  // Circle3 delegates to Arc3, so it inherits the fix automatically

  console.log('[NodeFlow] Line render patch loaded — tubes replace thin lines');
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    installLineRenderPatch();
  });
}

export default installLineRenderPatch;
