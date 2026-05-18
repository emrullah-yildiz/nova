import { Geo } from './geometry-lib.js';

// ============================================
// Nova — Advanced Geometry Operations
// Parametric surfaces, sweeps, pipes, isolines,
// subdivisions, arrays, mirrors, thicken, trim
// For Zaha Hadid-style parametric design
// ============================================

(function() {
  const G = Geo;
  const P = function(x,y,z){ return new G.Point3(x,y,z); };
  const V = function(x,y,z){ return new G.Vector3(x,y,z); };

  // Helper: extract points from any curve type
  G._curvePoints = function(curve, n) {
    n = n || 48;
    if (!curve) return [];
    if (curve._type === 'Polyline3') return curve.points;
    if (curve._type === 'Circle3' || curve._type === 'Arc3') return curve.toPoints(n);
    if (curve._type === 'Line3') {
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(curve.pointAt(i / n));
      return pts;
    }
    if (Array.isArray(curve)) return curve;
    return [];
  };

  // Helper: Rodrigues rotation
  G._rotatePoint = function(pt, axisOrigin, axisDir, angle) {
    const rel = pt.sub(axisOrigin);
    const rv = V(rel.x, rel.y, rel.z);
    const k = axisDir.normalize();
    const c = Math.cos(angle), s = Math.sin(angle);
    const rotated = rv.scale(c).add(k.cross(rv).scale(s)).add(k.scale(k.dot(rv) * (1 - c)));
    return axisOrigin.add(rotated);
  };

  // Helper: build Frenet frame along curve
  G._frenetFrames = function(points) {
    const frames = [];
    for (let i = 0; i < points.length; i++) {
      let tangent;
      if (i === 0) tangent = points[1].sub(points[0]);
      else if (i === points.length - 1) tangent = points[i].sub(points[i-1]);
      else tangent = points[i+1].sub(points[i-1]);
      const tLen = Math.sqrt(tangent.x**2 + tangent.y**2 + tangent.z**2) || 1;
      tangent = V(tangent.x/tLen, tangent.y/tLen, tangent.z/tLen);

      // Normal: use world up, fallback
      let up = Math.abs(tangent.z) < 0.9 ? V(0,0,1) : V(1,0,0);
      let normal = tangent.cross(up).normalize();
      let binormal = tangent.cross(normal).normalize();
      frames.push({ point: points[i], tangent, normal, binormal });
    }
    return frames;
  };

  // ══════════════════════════════════════
  // PARAMETRIC SURFACE (UV grid)
  // ══════════════════════════════════════
  G.Surface = class {
    constructor(evalFn, uDomain, vDomain, uSegs, vSegs) {
      this.evalFn = evalFn;       // (u, v) => Geo.Point3
      this.uDomain = uDomain || [0, 1];
      this.vDomain = vDomain || [0, 1];
      this.uSegs = uSegs || 20;
      this.vSegs = vSegs || 20;
      this._type = 'Surface';
    }
    evaluate(u, v) { return this.evalFn(u, v); }
    // Get isoline at constant u
    isoU(u, segments) {
      segments = segments || this.vSegs;
      const pts = [];
      for (let j = 0; j <= segments; j++) {
        const v = this.vDomain[0] + (this.vDomain[1] - this.vDomain[0]) * j / segments;
        pts.push(this.evaluate(u, v));
      }
      return new G.Polyline3(pts, false);
    }
    // Get isoline at constant v
    isoV(v, segments) {
      segments = segments || this.uSegs;
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const u = this.uDomain[0] + (this.uDomain[1] - this.uDomain[0]) * i / segments;
        pts.push(this.evaluate(u, v));
      }
      return new G.Polyline3(pts, false);
    }
    // Get grid of isolines
    getIsolines(uCount, vCount) {
      uCount = uCount || 10; vCount = vCount || 10;
      const curves = [];
      for (let i = 0; i <= uCount; i++) {
        const u = this.uDomain[0] + (this.uDomain[1] - this.uDomain[0]) * i / uCount;
        curves.push(this.isoU(u));
      }
      for (let j = 0; j <= vCount; j++) {
        const v = this.vDomain[0] + (this.vDomain[1] - this.vDomain[0]) * j / vCount;
        curves.push(this.isoV(v));
      }
      return curves;
    }
    // Normal at UV
    normalAt(u, v) {
      const eps = 0.001;
      const p = this.evaluate(u, v);
      const du = this.evaluate(Math.min(u + eps, this.uDomain[1]), v).sub(p);
      const dv = this.evaluate(u, Math.min(v + eps, this.vDomain[1])).sub(p);
      const duV = V(du.x, du.y, du.z);
      const dvV = V(dv.x, dv.y, dv.z);
      return duV.cross(dvV).normalize();
    }
    toMesh(color) {
      const uS = this.uSegs, vS = this.vSegs;
      const verts = [];
      for (let i = 0; i <= uS; i++) {
        const u = this.uDomain[0] + (this.uDomain[1] - this.uDomain[0]) * i / uS;
        for (let j = 0; j <= vS; j++) {
          const v = this.vDomain[0] + (this.vDomain[1] - this.vDomain[0]) * j / vS;
          verts.push(this.evaluate(u, v));
        }
      }
      const faces = [];
      const n = vS + 1;
      for (let i = 0; i < uS; i++) {
        for (let j = 0; j < vS; j++) {
          const a = i * n + j;
          faces.push([a, a+n, a+1]);
          faces.push([a+1, a+n, a+n+1]);
        }
      }
      const m = new G.Mesh3(verts, faces, color || 0x94e2d5);
      m._solidType = 'ParametricSurface';
      return m.toMesh(color);
    }
    toString() { return 'Surface(u=' + this.uSegs + ', v=' + this.vSegs + ')'; }
  };

  // ── Create parametric surface from function ──
  G.createSurface = function(evalFn, uDomain, vDomain, uSegs, vSegs) {
    return new G.Surface(evalFn, uDomain, vDomain, uSegs, vSegs);
  };

  // ══════════════════════════════════════
  // SWEEP (extrude profile along path)
  // ══════════════════════════════════════
  G.sweep = function(profile, path, segments) {
    const profilePts = G._curvePoints(profile, 24);
    const pathPts = G._curvePoints(path, segments || 48);
    if (profilePts.length < 2 || pathPts.length < 2) return null;

    const frames = G._frenetFrames(pathPts);
    const np = profilePts.length;
    const verts = [];

    // For each point on path, orient profile using Frenet frame
    frames.forEach(fr => {
      profilePts.forEach(pp => {
        const x = pp.x * fr.normal.x + pp.y * fr.binormal.x;
        const y = pp.x * fr.normal.y + pp.y * fr.binormal.y;
        const z = pp.x * fr.normal.z + pp.y * fr.binormal.z;
        verts.push(P(fr.point.x + x, fr.point.y + y, fr.point.z + z));
      });
    });

    const faces = [];
    for (let s = 0; s < pathPts.length - 1; s++) {
      for (let i = 0; i < np - 1; i++) {
        const a = s * np + i, b = (s+1) * np + i;
        faces.push([a, b, a+1]); faces.push([a+1, b, b+1]);
      }
      if (profile.closed || profile._type === 'Circle3') {
        const a = s * np + np - 1, b = (s+1) * np + np - 1;
        faces.push([a, b, s * np]); faces.push([s * np, b, (s+1) * np]);
      }
    }

    const m = new G.Mesh3(verts, faces, 0x89b4fa);
    m._solidType = 'Sweep';
    return m;
  };

  // ══════════════════════════════════════
  // PIPE (tube along curve with radius)
  // ══════════════════════════════════════
  G.pipe = function(curve, radius, segments, radialSegs) {
    radius = radius || 0.5;
    radialSegs = radialSegs || 12;
    const circle = new G.Circle3(P(0,0,0), radius);
    const profilePts = circle.toPoints(radialSegs);
    // Shift profile to XY centered at origin
    const centeredProfile = new G.Polyline3(profilePts.map(p => P(p.x, p.y, 0)), true);
    return G.sweep(centeredProfile, curve, segments);
  };

  // ══════════════════════════════════════
  // THICKEN (offset mesh along normals)
  // ══════════════════════════════════════
  G.thicken = function(mesh, thickness) {
    if (!mesh || mesh._type !== 'Mesh3') return mesh;
    thickness = thickness || 1;
    const nVerts = mesh.vertices.length;
    const verts = [];
    const faces = [];

    // Compute vertex normals
    const normals = new Array(nVerts).fill(null).map(() => V(0,0,0));
    mesh.faces.forEach(f => {
      const a = mesh.vertices[f[0]], b = mesh.vertices[f[1]], c = mesh.vertices[f[2]];
      const ab = V(b.x-a.x, b.y-a.y, b.z-a.z);
      const ac = V(c.x-a.x, c.y-a.y, c.z-a.z);
      const n = ab.cross(ac);
      for (const idx of f) { normals[idx] = normals[idx].add(n); }
    });
    normals.forEach((n, i) => { normals[i] = n.normalize(); });

    // Inner + outer shells
    mesh.vertices.forEach((v, i) => verts.push(v.clone()));
    mesh.vertices.forEach((v, i) => verts.push(v.add(normals[i].scale(thickness))));

    // Inner faces (original order)
    mesh.faces.forEach(f => faces.push([f[0], f[1], f[2]]));
    // Outer faces (reversed winding)
    mesh.faces.forEach(f => faces.push([f[2]+nVerts, f[1]+nVerts, f[0]+nVerts]));

    const m = new G.Mesh3(verts, faces, mesh.color);
    m._solidType = 'Thickened';
    return m;
  };

  // ══════════════════════════════════════
  // SUBDIVIDE (Loop-style triangle subdivision)
  //
  // Each iteration splits every triangle into 4 sub-triangles
  // using edge midpoints (shared via edge-key deduplication).
  //
  // Growth: faces × 4 per iteration
  //   iter 1: 12 → 48     (box)
  //   iter 2: 48 → 192
  //   iter 3: 192 → 768
  //   iter 4: 768 → 3072  (hard max: 50k faces)
  //
  // Guards:
  //   - iterations clamped to [1, 5]
  //   - projected face count checked before each iteration
  //   - edge midpoints deduplicated (shared edges produce one vertex)
  // ══════════════════════════════════════
  G.SUBDIVIDE_MAX_FACES = 50000;

  G.subdivide = function(mesh, iterations) {
    if (!mesh || mesh._type !== 'Mesh3') return mesh;
    iterations = Math.max(1, Math.min(iterations || 1, 5));
    let verts = mesh.vertices.map(v => v.clone());
    let faces = mesh.faces.map(f => f.slice());

    for (let iter = 0; iter < iterations; iter++) {
      // Safety: check projected face count (×4 per iteration)
      if (faces.length * 4 > G.SUBDIVIDE_MAX_FACES) {
        console.warn('[Geo.subdivide] Stopping at iteration ' + iter + ' — next would produce ' + (faces.length * 4) + ' faces (max ' + G.SUBDIVIDE_MAX_FACES + ')');
        break;
      }

      const newVerts = verts.slice();
      const newFaces = [];
      // Edge midpoint cache: "minIdx-maxIdx" → vertex index in newVerts
      const edgeCache = {};

      const getEdgeMid = function(a, b) {
        const key = a < b ? a + '-' + b : b + '-' + a;
        if (edgeCache[key] !== undefined) return edgeCache[key];
        const mid = verts[a].lerp(verts[b], 0.5);
        const idx = newVerts.length;
        newVerts.push(mid);
        edgeCache[key] = idx;
        return idx;
      };

      faces.forEach(f => {
        const i01 = getEdgeMid(f[0], f[1]);
        const i12 = getEdgeMid(f[1], f[2]);
        const i20 = getEdgeMid(f[2], f[0]);

        // 4 sub-triangles (Loop subdivision pattern)
        newFaces.push([f[0], i01, i20]);
        newFaces.push([i01, f[1], i12]);
        newFaces.push([i20, i12, f[2]]);
        newFaces.push([i01, i12, i20]);
      });

      verts = newVerts;
      faces = newFaces;
    }

    const m = new G.Mesh3(verts, faces, mesh.color);
    m._solidType = 'Subdivided';
    return m;
  };

  // ══════════════════════════════════════
  // ROTATE geometry around axis
  // ══════════════════════════════════════
  G.rotate = function(geometry, axisOrigin, axisDir, angle) {
    if (!geometry) return geometry;
    axisOrigin = axisOrigin || P(0,0,0);
    axisDir = (axisDir || V(0,0,1)).normalize();
    const rp = (p) => G._rotatePoint(p, axisOrigin, axisDir, angle);

    if (geometry._type === 'Point3') return rp(geometry);
    if (geometry._type === 'Line3') return new G.Line3(rp(geometry.start), rp(geometry.end));
    if (geometry._type === 'Polyline3') return new G.Polyline3(geometry.points.map(rp), geometry.closed);
    if (geometry._type === 'Circle3') return new G.Circle3(rp(geometry.center), geometry.radius, G._rotatePoint(geometry.center.add(geometry.normal), axisOrigin, axisDir, angle).sub(rp(geometry.center)));
    if (geometry._type === 'Mesh3') {
      const m = new G.Mesh3(geometry.vertices.map(rp), geometry.faces.slice(), geometry.color);
      m._solidType = geometry._solidType;
      return m;
    }
    return geometry;
  };

  // ══════════════════════════════════════
  // MIRROR across a plane
  // ══════════════════════════════════════
  G.mirror = function(geometry, planeOrigin, planeNormal) {
    if (!geometry) return geometry;
    planeOrigin = planeOrigin || P(0,0,0);
    planeNormal = (planeNormal || V(1,0,0)).normalize();

    const mp = (p) => {
      const d = (p.x - planeOrigin.x) * planeNormal.x + (p.y - planeOrigin.y) * planeNormal.y + (p.z - planeOrigin.z) * planeNormal.z;
      return P(p.x - 2*d*planeNormal.x, p.y - 2*d*planeNormal.y, p.z - 2*d*planeNormal.z);
    };

    if (geometry._type === 'Point3') return mp(geometry);
    if (geometry._type === 'Line3') return new G.Line3(mp(geometry.start), mp(geometry.end));
    if (geometry._type === 'Polyline3') return new G.Polyline3(geometry.points.map(mp), geometry.closed);
    if (geometry._type === 'Mesh3') {
      // Mirror vertices, reverse face winding
      const m = new G.Mesh3(
        geometry.vertices.map(mp),
        geometry.faces.map(f => [f[0], f[2], f[1]]),
        geometry.color
      );
      m._solidType = geometry._solidType;
      return m;
    }
    return geometry;
  };

  // ══════════════════════════════════════
  // ARRAY along curve
  // ══════════════════════════════════════
  G.arrayAlongCurve = function(geometry, curve, count) {
    if (!geometry || !curve || count < 1) return [];
    const pathPts = G._curvePoints(curve, count);
    const frames = G._frenetFrames(pathPts);
    const results = [];

    frames.forEach(fr => {
      const moved = G.move(geometry, V(fr.point.x, fr.point.y, fr.point.z));
      results.push(moved);
    });
    return results;
  };

  // ── Linear array ──
  G.arrayLinear = function(geometry, direction, count, spacing) {
    if (!geometry || count < 1) return [];
    direction = direction || V(1,0,0);
    spacing = spacing || 1;
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(G.move(geometry, direction.scale(i * spacing)));
    }
    return results;
  };

  // ── Polar array ──
  G.arrayPolar = function(geometry, center, axis, count) {
    if (!geometry || count < 1) return [];
    center = center || P(0,0,0);
    axis = axis || V(0,0,1);
    const results = [];
    const step = Math.PI * 2 / count;
    for (let i = 0; i < count; i++) {
      results.push(G.rotate(geometry, center, axis, step * i));
    }
    return results;
  };

  // ══════════════════════════════════════
  // TRIM CURVE at parameters
  // ══════════════════════════════════════
  G.trimCurve = function(curve, t0, t1) {
    if (!curve) return curve;
    t0 = Math.max(0, t0 || 0);
    t1 = Math.min(1, t1 !== undefined ? t1 : 1);
    if (curve._type === 'Line3') return new G.Line3(curve.pointAt(t0), curve.pointAt(t1));
    if (curve._type === 'Polyline3') {
      const pts = curve.points;
      const totalLen = curve.length();
      const startLen = totalLen * t0, endLen = totalLen * t1;
      let accum = 0;
      const trimmed = [];
      for (let i = 0; i < pts.length; i++) {
        if (i > 0) accum += pts[i-1].distanceTo(pts[i]);
        if (accum >= startLen && accum <= endLen) trimmed.push(pts[i].clone());
      }
      if (trimmed.length < 2) return curve;
      return new G.Polyline3(trimmed, false);
    }
    return curve;
  };

  // ══════════════════════════════════════
  // SURFACE OPERATIONS
  // ══════════════════════════════════════

  // ── Get isolines from a Mesh3 surface ──
  G.getIsolinesU = function(mesh, count) {
    if (!mesh || mesh._type !== 'Mesh3') return [];
    count = count || 10;
    // Estimate UV grid from mesh structure
    const n = Math.round(Math.sqrt(mesh.vertices.length));
    if (n < 2) return [];
    const curves = [];
    const step = Math.max(1, Math.floor(n / count));
    for (let i = 0; i < n; i += step) {
      const pts = [];
      for (let j = 0; j < n && i * n + j < mesh.vertices.length; j++) {
        pts.push(mesh.vertices[i * n + j].clone());
      }
      if (pts.length >= 2) curves.push(new G.Polyline3(pts, false));
    }
    return curves;
  };

  G.getIsolinesV = function(mesh, count) {
    if (!mesh || mesh._type !== 'Mesh3') return [];
    count = count || 10;
    const n = Math.round(Math.sqrt(mesh.vertices.length));
    if (n < 2) return [];
    const curves = [];
    const step = Math.max(1, Math.floor(n / count));
    for (let j = 0; j < n; j += step) {
      const pts = [];
      for (let i = 0; i < n && i * n + j < mesh.vertices.length; i++) {
        pts.push(mesh.vertices[i * n + j].clone());
      }
      if (pts.length >= 2) curves.push(new G.Polyline3(pts, false));
    }
    return curves;
  };

  // ── Extrude surface (thicken alternative using direction) ──
  G.extrudeSurface = function(mesh, direction) {
    if (!mesh || mesh._type !== 'Mesh3' || !direction) return mesh;
    const nV = mesh.vertices.length;
    const verts = [];
    mesh.vertices.forEach(v => verts.push(v.clone()));
    mesh.vertices.forEach(v => verts.push(v.add(direction)));
    const faces = [];
    mesh.faces.forEach(f => faces.push([f[0], f[1], f[2]]));
    mesh.faces.forEach(f => faces.push([f[2]+nV, f[1]+nV, f[0]+nV]));
    // Side faces (for boundary edges — simplified: connect all edges)
    // This is approximate, works for quad-grid surfaces
    const m = new G.Mesh3(verts, faces, mesh.color);
    m._solidType = 'ExtrudedSurface';
    return m;
  };

  // ── Evaluate mesh surface at UV (approximate) ──
  G.evaluateSurface = function(mesh, u, v) {
    if (!mesh || mesh._type !== 'Mesh3') return P(0,0,0);
    const n = Math.round(Math.sqrt(mesh.vertices.length));
    if (n < 2) return P(0,0,0);
    const fi = u * (n - 1), fj = v * (n - 1);
    const i = Math.min(Math.floor(fi), n - 2);
    const j = Math.min(Math.floor(fj), n - 2);
    const fu = fi - i, fv = fj - j;
    const idx = (r, c) => Math.min(r * n + c, mesh.vertices.length - 1);
    const p00 = mesh.vertices[idx(i, j)];
    const p10 = mesh.vertices[idx(i+1, j)];
    const p01 = mesh.vertices[idx(i, j+1)];
    const p11 = mesh.vertices[idx(i+1, j+1)];
    // Bilinear interpolation
    const x = p00.x*(1-fu)*(1-fv) + p10.x*fu*(1-fv) + p01.x*(1-fu)*fv + p11.x*fu*fv;
    const y = p00.y*(1-fu)*(1-fv) + p10.y*fu*(1-fv) + p01.y*(1-fu)*fv + p11.y*fu*fv;
    const z = p00.z*(1-fu)*(1-fv) + p10.z*fu*(1-fv) + p01.z*(1-fu)*fv + p11.z*fu*fv;
    return P(x, y, z);
  };

  // ══════════════════════════════════════
  // CURVE OPERATIONS
  // ══════════════════════════════════════

  // ── Fillet between two lines ──
  G.fillet = function(line1, line2, radius) {
    if (!line1 || !line2) return null;
    radius = radius || 1;
    // Find intersection approximation
    const mid = line1.end.lerp(line2.start, 0.5);
    const pts = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p1 = line1.end.lerp(mid, t);
      const p2 = mid.lerp(line2.start, t);
      pts.push(p1.lerp(p2, t));
    }
    return new G.Polyline3(pts, false);
  };

  // ── Bezier curve from control points ──
  G.bezier = function(controlPoints, segments) {
    if (!controlPoints || controlPoints.length < 2) return null;
    segments = segments || 50;
    const pts = [];
    const cp = controlPoints;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // De Casteljau's algorithm
      let working = cp.map(p => p.clone());
      while (working.length > 1) {
        const next = [];
        for (let j = 0; j < working.length - 1; j++) {
          next.push(working[j].lerp(working[j+1], t));
        }
        working = next;
      }
      pts.push(working[0]);
    }
    return new G.Polyline3(pts, false);
  };

  // ── Interpolate curve through points (Catmull-Rom) ──
  G.interpolate = function(points, segments, closed) {
    if (!points || points.length < 2) return null;
    segments = segments || 10;
    const pts = [];
    const n = points.length;

    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i-1)];
      const p1 = points[i];
      const p2 = points[Math.min(n-1, i+1)];
      const p3 = points[Math.min(n-1, i+2)];

      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const t2 = t*t, t3 = t2*t;
        const x = 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3);
        const y = 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3);
        const z = 0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3);
        pts.push(P(x, y, z));
      }
    }
    pts.push(points[n-1].clone());
    return new G.Polyline3(pts, !!closed);
  };

  // ══════════════════════════════════════
  // MESH COMBINE (improved boolean union for multiple)
  // ══════════════════════════════════════
  G.combineAll = function(meshes) {
    if (!meshes || meshes.length === 0) return null;
    let result = meshes[0];
    for (let i = 1; i < meshes.length; i++) {
      if (meshes[i] && meshes[i]._type === 'Mesh3') {
        result = G.booleanUnion(result, meshes[i]);
      }
    }
    return result;
  };

  // ══════════════════════════════════════
  // MESH SMOOTH (Laplacian smoothing)
  // ══════════════════════════════════════
  G.smooth = function(mesh, iterations, factor) {
    if (!mesh || mesh._type !== 'Mesh3') return mesh;
    iterations = Math.max(1, Math.min(iterations || 1, 20));
    factor = factor || 0.5;

    let verts = mesh.vertices.map(v => v.clone());

    // Build adjacency
    const adj = new Array(verts.length).fill(null).map(() => []);
    mesh.faces.forEach(f => {
      adj[f[0]].push(f[1], f[2]);
      adj[f[1]].push(f[0], f[2]);
      adj[f[2]].push(f[0], f[1]);
    });

    for (let iter = 0; iter < iterations; iter++) {
      const newVerts = verts.map(v => v.clone());
      for (let i = 0; i < verts.length; i++) {
        if (adj[i].length === 0) continue;
        let sx = 0, sy = 0, sz = 0;
        const neighbors = [...new Set(adj[i])]; // unique
        neighbors.forEach(j => { sx += verts[j].x; sy += verts[j].y; sz += verts[j].z; });
        const n = neighbors.length;
        newVerts[i] = P(
          verts[i].x + factor * (sx/n - verts[i].x),
          verts[i].y + factor * (sy/n - verts[i].y),
          verts[i].z + factor * (sz/n - verts[i].z)
        );
      }
      verts = newVerts;
    }

    const m = new G.Mesh3(verts, mesh.faces.slice(), mesh.color);
    m._solidType = 'Smoothed';
    return m;
  };

  // ══════════════════════════════════════
  // SURFACE GENERATORS
  // ══════════════════════════════════════

  // ── Ruled surface between two curves ──
  G.ruledSurface = function(curve1, curve2, segments) {
    segments = segments || 20;
    const pts1 = G._curvePoints(curve1, segments);
    const pts2 = G._curvePoints(curve2, segments);
    const n = Math.min(pts1.length, pts2.length);
    const verts = [];
    const steps = 10;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      for (let i = 0; i < n; i++) {
        verts.push(pts1[i].lerp(pts2[i], t));
      }
    }
    const faces = [];
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = (j+1) * n + i;
        faces.push([a, b, a+1]); faces.push([a+1, b, b+1]);
      }
    }
    const m = new G.Mesh3(verts, faces, 0x94e2d5);
    m._solidType = 'RuledSurface';
    return m;
  };

  // ── Patch from 4 boundary curves (Coons patch) ──
  G.coonsPatch = function(curveU0, curveU1, curveV0, curveV1, uSegs, vSegs) {
    uSegs = uSegs || 20; vSegs = vSegs || 20;
    const u0pts = G._curvePoints(curveU0, uSegs);
    const u1pts = G._curvePoints(curveU1, uSegs);
    const v0pts = G._curvePoints(curveV0, vSegs);
    const v1pts = G._curvePoints(curveV1, vSegs);

    const verts = [];
    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      for (let j = 0; j <= vSegs; j++) {
        const v = j / vSegs;
        const ui = Math.min(i, u0pts.length-1);
        const vi = Math.min(j, v0pts.length-1);
        // Bilinear blend
        const ru = u0pts[ui].lerp(u1pts[ui], v);
        const rv = v0pts[vi].lerp(v1pts[vi], u);
        const corners = u0pts[0].lerp(u0pts[u0pts.length-1], u).lerp(u1pts[0].lerp(u1pts[u1pts.length-1], u), v);
        verts.push(P(ru.x + rv.x - corners.x, ru.y + rv.y - corners.y, ru.z + rv.z - corners.z));
      }
    }
    const faces = [];
    const n = vSegs + 1;
    for (let i = 0; i < uSegs; i++) {
      for (let j = 0; j < vSegs; j++) {
        const a = i * n + j;
        faces.push([a, a+n, a+1]); faces.push([a+1, a+n, a+n+1]);
      }
    }
    const m = new G.Mesh3(verts, faces, 0xf5c2e7);
    m._solidType = 'CoonsPatch';
    return m;
  };

  // ══════════════════════════════════════
  // Update PythonRunner wrapper with new functions
  // ══════════════════════════════════════
})();

export { Geo };
export default Geo;
