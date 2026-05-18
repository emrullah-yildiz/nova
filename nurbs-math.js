// ============================================
// NODEFLOW AI — NURBS & Advanced Mathematics
// Full NURBS curves/surfaces + noise + attractors
// + Voronoi + exotic parametric surfaces
// Inspired by Maya, Rhino/Grasshopper, Houdini
// ============================================

(function() {
  const G = window.Geo;
  const P = function(x,y,z){ return new G.Point3(x||0,y||0,z||0); };
  const V = function(x,y,z){ return new G.Vector3(x||0,y||0,z||0); };

  // ══════════════════════════════════════
  // 1. NURBS MATHEMATICS
  // B-spline basis functions + NURBS evaluation
  // ══════════════════════════════════════

  // Find knot span (Cox-de Boor)
  function findSpan(n, degree, u, knots) {
    if (u >= knots[n + 1]) return n;
    if (u <= knots[degree]) return degree;
    var low = degree, high = n + 1, mid = Math.floor((low + high) / 2);
    while (u < knots[mid] || u >= knots[mid + 1]) {
      if (u < knots[mid]) high = mid;
      else low = mid;
      mid = Math.floor((low + high) / 2);
    }
    return mid;
  }

  // Compute B-spline basis functions
  function basisFunctions(span, u, degree, knots) {
    var N = new Array(degree + 1);
    var left = new Array(degree + 1);
    var right = new Array(degree + 1);
    N[0] = 1.0;
    for (var j = 1; j <= degree; j++) {
      left[j] = u - knots[span + 1 - j];
      right[j] = knots[span + j] - u;
      var saved = 0.0;
      for (var r = 0; r < j; r++) {
        var temp = N[r] / (right[r + 1] + left[j - r]);
        N[r] = saved + right[r + 1] * temp;
        saved = left[j - r] * temp;
      }
      N[j] = saved;
    }
    return N;
  }

  // Generate uniform clamped knot vector
  function clampedKnots(n, degree) {
    var m = n + degree + 1;
    var knots = new Array(m + 1);
    for (var i = 0; i <= degree; i++) knots[i] = 0;
    for (var i = m - degree; i <= m; i++) knots[i] = 1;
    var denom = n - degree;
    if (denom <= 0) denom = 1;
    for (var i = degree + 1; i < m - degree; i++) {
      knots[i] = (i - degree) / denom;
    }
    return knots;
  }

  // ── NURBS Curve ──
  G.NurbsCurve = class {
    constructor(controlPoints, degree, knots, weights) {
      this.controlPoints = controlPoints || [];
      this.degree = degree || 3;
      var n = this.controlPoints.length - 1;
      if (n < 0) n = 0;
      this.knots = knots || clampedKnots(n, this.degree);
      this.weights = weights || new Array(this.controlPoints.length).fill(1.0);
      this._type = 'NurbsCurve';
    }

    evaluate(u) {
      var n = this.controlPoints.length - 1;
      if (n < 0) return P(0, 0, 0);
      var deg = Math.min(this.degree, n);
      var span = findSpan(n, deg, u, this.knots);
      var N = basisFunctions(span, u, deg, this.knots);
      var wx = 0, wy = 0, wz = 0, wsum = 0;
      for (var i = 0; i <= deg; i++) {
        var idx = span - deg + i;
        if (idx < 0 || idx > n) continue;
        var cp = this.controlPoints[idx];
        var w = this.weights[idx] || 1.0;
        var basis = N[i] * w;
        wx += basis * cp.x;
        wy += basis * cp.y;
        wz += basis * cp.z;
        wsum += basis;
      }
      if (Math.abs(wsum) < 1e-10) return P(0, 0, 0);
      return P(wx / wsum, wy / wsum, wz / wsum);
    }

    toPoints(segments) {
      segments = segments || 100;
      var pts = [];
      for (var i = 0; i <= segments; i++) {
        var u = i / segments;
        // clamp to valid domain
        u = Math.max(0, Math.min(u, 0.9999));
        pts.push(this.evaluate(u));
      }
      return pts;
    }

    toPolyline(segments) {
      return new G.Polyline3(this.toPoints(segments), false);
    }

    tangentAt(u) {
      var eps = 0.001;
      var p0 = this.evaluate(Math.max(0, u - eps));
      var p1 = this.evaluate(Math.min(0.9999, u + eps));
      var d = p1.sub(p0);
      var len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) || 1;
      return V(d.x / len, d.y / len, d.z / len);
    }

    toMesh(color) {
      return this.toPolyline().toMesh(color || 0xf9e2af);
    }

    toString() {
      return 'NurbsCurve(deg=' + this.degree + ', ' + this.controlPoints.length + ' pts)';
    }
  };

  // ── NURBS Surface ──
  G.NurbsSurface = class {
    constructor(controlGrid, degreeU, degreeV, knotsU, knotsV, weights) {
      // controlGrid[i][j] = Point3
      this.controlGrid = controlGrid || [[]];
      this.degreeU = degreeU || 3;
      this.degreeV = degreeV || 3;
      var nu = this.controlGrid.length - 1;
      var nv = (this.controlGrid[0] || []).length - 1;
      if (nu < 0) nu = 0;
      if (nv < 0) nv = 0;
      this.knotsU = knotsU || clampedKnots(nu, Math.min(this.degreeU, nu));
      this.knotsV = knotsV || clampedKnots(nv, Math.min(this.degreeV, nv));
      // weights[i][j]
      this.weights = weights || this.controlGrid.map(function(row) {
        return row.map(function() { return 1.0; });
      });
      this._type = 'NurbsSurface';
    }

    evaluate(u, v) {
      var nu = this.controlGrid.length - 1;
      var nv = (this.controlGrid[0] || []).length - 1;
      if (nu < 0 || nv < 0) return P(0, 0, 0);
      var degU = Math.min(this.degreeU, nu);
      var degV = Math.min(this.degreeV, nv);

      var spanU = findSpan(nu, degU, u, this.knotsU);
      var basisU = basisFunctions(spanU, u, degU, this.knotsU);
      var spanV = findSpan(nv, degV, v, this.knotsV);
      var basisV = basisFunctions(spanV, v, degV, this.knotsV);

      var wx = 0, wy = 0, wz = 0, wsum = 0;
      for (var i = 0; i <= degU; i++) {
        var ri = spanU - degU + i;
        if (ri < 0 || ri > nu) continue;
        for (var j = 0; j <= degV; j++) {
          var rj = spanV - degV + j;
          if (rj < 0 || rj > nv) continue;
          var cp = this.controlGrid[ri][rj];
          var w = (this.weights[ri] && this.weights[ri][rj]) || 1.0;
          var basis = basisU[i] * basisV[j] * w;
          wx += basis * cp.x;
          wy += basis * cp.y;
          wz += basis * cp.z;
          wsum += basis;
        }
      }
      if (Math.abs(wsum) < 1e-10) return P(0, 0, 0);
      return P(wx / wsum, wy / wsum, wz / wsum);
    }

    toMesh(uSegs, vSegs, color) {
      uSegs = uSegs || 30;
      vSegs = vSegs || 30;
      var verts = [];
      for (var i = 0; i <= uSegs; i++) {
        var u = Math.min(i / uSegs, 0.9999);
        for (var j = 0; j <= vSegs; j++) {
          var v = Math.min(j / vSegs, 0.9999);
          verts.push(this.evaluate(u, v));
        }
      }
      var faces = [];
      var nv = vSegs + 1;
      for (var i = 0; i < uSegs; i++) {
        for (var j = 0; j < vSegs; j++) {
          var a = i * nv + j;
          faces.push([a, a + nv, a + 1]);
          faces.push([a + 1, a + nv, a + nv + 1]);
        }
      }
      var m = new G.Mesh3(verts, faces, color || 0x94e2d5);
      m._solidType = 'NurbsSurface';
      return m;
    }

    normalAt(u, v) {
      var eps = 0.001;
      var p = this.evaluate(u, v);
      var du = this.evaluate(Math.min(u + eps, 0.9999), v).sub(p);
      var dv = this.evaluate(u, Math.min(v + eps, 0.9999)).sub(p);
      return V(du.x, du.y, du.z).cross(V(dv.x, dv.y, dv.z)).normalize();
    }

    isoU(u, segments) {
      segments = segments || 50;
      var pts = [];
      for (var j = 0; j <= segments; j++) {
        pts.push(this.evaluate(Math.min(u, 0.9999), Math.min(j / segments, 0.9999)));
      }
      return new G.Polyline3(pts, false);
    }

    isoV(v, segments) {
      segments = segments || 50;
      var pts = [];
      for (var i = 0; i <= segments; i++) {
        pts.push(this.evaluate(Math.min(i / segments, 0.9999), Math.min(v, 0.9999)));
      }
      return new G.Polyline3(pts, false);
    }

    toString() {
      return 'NurbsSurface(' + this.controlGrid.length + 'x' + (this.controlGrid[0] || []).length + ', deg ' + this.degreeU + '×' + this.degreeV + ')';
    }
  };

  // ── Factory: NURBS Curve from control points ──
  G.createNurbsCurve = function(controlPoints, degree) {
    degree = degree || 3;
    return new G.NurbsCurve(controlPoints, degree);
  };

  // ── Factory: NURBS Surface from control grid ──
  G.createNurbsSurface = function(controlGrid, degreeU, degreeV) {
    return new G.NurbsSurface(controlGrid, degreeU || 3, degreeV || 3);
  };

  // ── Rebuild NURBS curve (change point count while keeping shape) ──
  G.rebuildCurve = function(nurbsCurve, newPointCount) {
    newPointCount = newPointCount || 20;
    var pts = nurbsCurve.toPoints(newPointCount);
    return new G.NurbsCurve(pts, Math.min(nurbsCurve.degree, newPointCount - 1));
  };

  // ══════════════════════════════════════
  // 2. PERLIN / SIMPLEX NOISE
  // For organic surface variation, terrain, facades
  // ══════════════════════════════════════

  // Permutation table for Perlin noise
  var _perm = [];
  (function() {
    var p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,
             23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,
             174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,
             133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,
             89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,
             202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,
             248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,
             178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,
             14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,
             93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    for (var i = 0; i < 512; i++) _perm[i] = p[i & 255];
  })();

  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function _lerp(a, b, t) { return a + t * (b - a); }
  function _grad(hash, x, y, z) {
    var h = hash & 15;
    var u = h < 8 ? x : y;
    var v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // 3D Perlin noise
  G.perlin3 = function(x, y, z) {
    var X = Math.floor(x) & 255;
    var Y = Math.floor(y) & 255;
    var Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    var u = _fade(x), v = _fade(y), w = _fade(z);
    var A = _perm[X] + Y, AA = _perm[A] + Z, AB = _perm[A + 1] + Z;
    var B = _perm[X + 1] + Y, BA = _perm[B] + Z, BB = _perm[B + 1] + Z;
    return _lerp(
      _lerp(_lerp(_grad(_perm[AA], x, y, z), _grad(_perm[BA], x-1, y, z), u),
            _lerp(_grad(_perm[AB], x, y-1, z), _grad(_perm[BB], x-1, y-1, z), u), v),
      _lerp(_lerp(_grad(_perm[AA+1], x, y, z-1), _grad(_perm[BA+1], x-1, y, z-1), u),
            _lerp(_grad(_perm[AB+1], x, y-1, z-1), _grad(_perm[BB+1], x-1, y-1, z-1), u), v), w);
  };

  // 2D Perlin noise (convenience)
  G.perlin2 = function(x, y) { return G.perlin3(x, y, 0); };

  // Fractal Brownian Motion (octave noise)
  G.fbm = function(x, y, z, octaves, lacunarity, gain) {
    octaves = octaves || 4;
    lacunarity = lacunarity || 2.0;
    gain = gain || 0.5;
    var sum = 0, amp = 1.0, freq = 1.0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * G.perlin3(x * freq, y * freq, (z || 0) * freq);
      freq *= lacunarity;
      amp *= gain;
    }
    return sum;
  };

  // ══════════════════════════════════════
  // 3. ATTRACTOR SYSTEMS
  // Point, curve, and field attractors for facade/panel modulation
  // ══════════════════════════════════════

  // Point attractor: returns influence (0-1) based on distance
  G.pointAttractor = function(point, position, radius, falloff) {
    radius = radius || 10;
    falloff = falloff || 2; // power falloff
    var d = point.distanceTo(position);
    if (d >= radius) return 0;
    return Math.pow(1 - d / radius, falloff);
  };

  // Multi-point attractor: sum of influences
  G.multiAttractor = function(point, attractors, radius, falloff) {
    radius = radius || 10;
    falloff = falloff || 2;
    var total = 0;
    for (var i = 0; i < attractors.length; i++) {
      total += G.pointAttractor(point, attractors[i], radius, falloff);
    }
    return Math.min(total, 1.0);
  };

  // Curve attractor: influence based on closest distance to curve
  G.curveAttractor = function(point, curve, radius, falloff, samples) {
    radius = radius || 10;
    falloff = falloff || 2;
    samples = samples || 50;
    var pts = G._curvePoints(curve, samples);
    var minDist = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var d = point.distanceTo(pts[i]);
      if (d < minDist) minDist = d;
    }
    if (minDist >= radius) return 0;
    return Math.pow(1 - minDist / radius, falloff);
  };

  // Apply attractor field to deform mesh vertices
  G.attractorDeform = function(mesh, attractors, radius, strength, direction) {
    if (!mesh || mesh._type !== 'Mesh3') return mesh;
    direction = direction || V(0, 0, 1);
    var dir = direction.normalize();
    var newVerts = mesh.vertices.map(function(vert) {
      var influence = G.multiAttractor(vert, attractors, radius || 10, 2);
      var offset = dir.scale(influence * (strength || 5));
      return vert.add(offset);
    });
    var m = new G.Mesh3(newVerts, mesh.faces.slice(), mesh.color);
    m._solidType = 'AttractorDeformed';
    return m;
  };

  // ══════════════════════════════════════
  // 4. VORONOI & DELAUNAY (2D)
  // For biomimetic cellular structures
  // ══════════════════════════════════════

  // Simple 2D Voronoi (brute-force nearest neighbor)
  // Returns cells as arrays of boundary points
  G.voronoi2D = function(sites, bounds, resolution) {
    bounds = bounds || { minX: -20, maxX: 20, minY: -20, maxY: 20 };
    resolution = resolution || 1.0;
    var cells = {};
    for (var i = 0; i < sites.length; i++) cells[i] = [];

    // Sample grid and assign each point to nearest site
    for (var x = bounds.minX; x <= bounds.maxX; x += resolution) {
      for (var y = bounds.minY; y <= bounds.maxY; y += resolution) {
        var minD = Infinity, minI = 0;
        for (var i = 0; i < sites.length; i++) {
          var dx = x - sites[i].x, dy = y - sites[i].y;
          var d = dx * dx + dy * dy;
          if (d < minD) { minD = d; minI = i; }
        }
        cells[minI].push(P(x, y, sites[minI].z || 0));
      }
    }
    return cells;
  };

  // Voronoi cell outlines as polylines (convex hull of each cell's points)
  G.voronoiOutlines = function(sites, bounds, resolution) {
    var cells = G.voronoi2D(sites, bounds, resolution);
    var outlines = [];
    for (var key in cells) {
      var pts = cells[key];
      if (pts.length < 3) continue;
      var hull = G._convexHull2D(pts);
      if (hull.length >= 3) {
        outlines.push(new G.Polyline3(hull, true));
      }
    }
    return outlines;
  };

  // Simple 2D convex hull (Graham scan, XY plane)
  G._convexHull2D = function(points) {
    if (points.length < 3) return points.slice();
    // Find bottom-most point
    var sorted = points.slice().sort(function(a, b) {
      return a.y === b.y ? a.x - b.x : a.y - b.y;
    });
    var pivot = sorted[0];

    // Sort by polar angle
    sorted.sort(function(a, b) {
      var angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      var angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      return angleA - angleB;
    });

    var stack = [sorted[0], sorted[1]];
    for (var i = 2; i < sorted.length; i++) {
      while (stack.length > 1) {
        var top = stack[stack.length - 1];
        var next = stack[stack.length - 2];
        var cross = (top.x - next.x) * (sorted[i].y - next.y) - (top.y - next.y) * (sorted[i].x - next.x);
        if (cross <= 0) stack.pop();
        else break;
      }
      stack.push(sorted[i]);
    }
    return stack;
  };

  // 3D Voronoi mesh: extrude Voronoi cells with variable height
  G.voronoiMesh = function(sites, bounds, height, gap, resolution) {
    height = height || 3;
    gap = gap || 0.1;
    resolution = resolution || 1.0;
    var outlines = G.voronoiOutlines(sites, bounds, resolution);
    var meshes = [];
    for (var i = 0; i < outlines.length; i++) {
      // Scale down for gap
      if (gap > 0) {
        var center = P(0, 0, 0);
        var pts = outlines[i].points;
        for (var j = 0; j < pts.length; j++) {
          center = P(center.x + pts[j].x / pts.length, center.y + pts[j].y / pts.length, center.z);
        }
        var scaled = [];
        var factor = 1 - gap;
        for (var j = 0; j < pts.length; j++) {
          scaled.push(P(
            center.x + (pts[j].x - center.x) * factor,
            center.y + (pts[j].y - center.y) * factor,
            pts[j].z
          ));
        }
        outlines[i] = new G.Polyline3(scaled, true);
      }
      var h = typeof height === 'function' ? height(sites[i], i) : height;
      var extruded = G.extrude(outlines[i], V(0, 0, h));
      if (extruded) meshes.push(extruded);
    }
    return meshes;
  };

  // ══════════════════════════════════════
  // 5. EXOTIC PARAMETRIC SURFACES
  // Mathematical surfaces used in avant-garde architecture
  // ══════════════════════════════════════

  // Klein Bottle
  G.createKleinBottle = function(scale, uSegs, vSegs) {
    scale = scale || 3;
    uSegs = uSegs || 40;
    vSegs = vSegs || 20;
    var verts = [];
    for (var i = 0; i <= uSegs; i++) {
      var u = 2 * Math.PI * i / uSegs;
      for (var j = 0; j <= vSegs; j++) {
        var v = 2 * Math.PI * j / vSegs;
        var cosu = Math.cos(u), sinu = Math.sin(u), cosv = Math.cos(v), sinv = Math.sin(v);
        var x, y, z;
        if (u < Math.PI) {
          x = 6 * cosu * (1 + sinu) + 4 * (1 - cosu / 2) * cosu * cosv;
          z = 16 * sinu + 4 * (1 - cosu / 2) * sinu * cosv;
        } else {
          x = 6 * cosu * (1 + sinu) - 4 * (1 - cosu / 2) * cosv;
          z = 16 * sinu;
        }
        y = -4 * (1 - cosu / 2) * sinv;
        verts.push(P(x * scale / 16, y * scale / 16, z * scale / 16));
      }
    }
    var faces = [];
    var nv = vSegs + 1;
    for (var i = 0; i < uSegs; i++) {
      for (var j = 0; j < vSegs; j++) {
        var a = i * nv + j;
        faces.push([a, a + nv, a + 1]);
        faces.push([a + 1, a + nv, a + nv + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xcba6f7);
    m._solidType = 'KleinBottle';
    return m;
  };

  // Möbius Strip (proper thick version)
  G.createMobiusStrip = function(radius, width, segments, strips) {
    radius = radius || 5;
    width = width || 2;
    segments = segments || 80;
    strips = strips || 10;
    var verts = [];
    for (var i = 0; i <= segments; i++) {
      var u = 2 * Math.PI * i / segments;
      for (var j = 0; j <= strips; j++) {
        var v = width * (j / strips - 0.5);
        var x = (radius + v * Math.cos(u / 2)) * Math.cos(u);
        var y = (radius + v * Math.cos(u / 2)) * Math.sin(u);
        var z = v * Math.sin(u / 2);
        verts.push(P(x, y, z));
      }
    }
    var faces = [];
    var nv = strips + 1;
    for (var i = 0; i < segments; i++) {
      for (var j = 0; j < strips; j++) {
        var a = i * nv + j;
        faces.push([a, a + nv, a + 1]);
        faces.push([a + 1, a + nv, a + nv + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xf5c2e7);
    m._solidType = 'MobiusStrip';
    return m;
  };

  // Enneper Surface (minimal surface)
  G.createEnneperSurface = function(scale, segments) {
    scale = scale || 3;
    segments = segments || 30;
    var verts = [];
    for (var i = 0; i <= segments; i++) {
      var u = scale * (2 * i / segments - 1);
      for (var j = 0; j <= segments; j++) {
        var v = scale * (2 * j / segments - 1);
        var x = u - u * u * u / 3 + u * v * v;
        var y = v - v * v * v / 3 + v * u * u;
        var z = u * u - v * v;
        verts.push(P(x, y, z));
      }
    }
    var faces = [];
    var n = segments + 1;
    for (var i = 0; i < segments; i++) {
      for (var j = 0; j < segments; j++) {
        var a = i * n + j;
        faces.push([a, a + n, a + 1]);
        faces.push([a + 1, a + n, a + n + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xa6e3a1);
    m._solidType = 'EnneperSurface';
    return m;
  };

  // Dini Surface (twisted pseudosphere — striking in architecture)
  G.createDiniSurface = function(a, b, uMax, uSegs, vSegs) {
    a = a || 1; b = b || 0.2;
    uMax = uMax || 4 * Math.PI;
    uSegs = uSegs || 80;
    vSegs = vSegs || 20;
    var verts = [];
    for (var i = 0; i <= uSegs; i++) {
      var u = uMax * i / uSegs + 0.01;
      for (var j = 0; j <= vSegs; j++) {
        var v = 0.01 + (Math.PI - 0.02) * j / vSegs;
        var x = a * Math.cos(u) * Math.sin(v);
        var y = a * Math.sin(u) * Math.sin(v);
        var z = a * (Math.cos(v) + Math.log(Math.tan(v / 2))) + b * u;
        verts.push(P(x * 3, y * 3, z * 3));
      }
    }
    var faces = [];
    var n = vSegs + 1;
    for (var i = 0; i < uSegs; i++) {
      for (var j = 0; j < vSegs; j++) {
        var a2 = i * n + j;
        faces.push([a2, a2 + n, a2 + 1]);
        faces.push([a2 + 1, a2 + n, a2 + n + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xf9e2af);
    m._solidType = 'DiniSurface';
    return m;
  };

  // Gyroid (approximation — minimal surface used in 3D printing/architecture)
  G.createGyroid = function(scale, cellSize, resolution) {
    scale = scale || 10;
    cellSize = cellSize || 2 * Math.PI;
    resolution = resolution || 20;
    // Gyroid is an isosurface: sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x) = 0
    // We approximate it by sampling and using marching-cubes-style extraction
    // Simplified: sample on a grid and find surface-crossing points
    var verts = [];
    var step = cellSize / resolution;
    var half = cellSize / 2;

    function gyroidVal(x, y, z) {
      return Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
    }

    // Parametric approximation using two UV parameters
    for (var i = 0; i <= resolution; i++) {
      var u = -half + cellSize * i / resolution;
      for (var j = 0; j <= resolution; j++) {
        var v = -half + cellSize * j / resolution;
        // Find z where gyroid = 0 using Newton's method
        var z = 0;
        for (var iter = 0; iter < 5; iter++) {
          var val = gyroidVal(u, v, z);
          var dz = Math.cos(v) * Math.cos(z) - Math.sin(z) * Math.cos(u);
          if (Math.abs(dz) > 0.001) z -= val / dz;
        }
        var s = scale / cellSize;
        verts.push(P(u * s, v * s, z * s));
      }
    }
    var faces = [];
    var n = resolution + 1;
    for (var i = 0; i < resolution; i++) {
      for (var j = 0; j < resolution; j++) {
        var a = i * n + j;
        faces.push([a, a + n, a + 1]);
        faces.push([a + 1, a + n, a + n + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0x89dceb);
    m._solidType = 'Gyroid';
    return m;
  };

  // Hyperbolic Paraboloid (saddle — classic shell structure)
  G.createHyperbolicParaboloid = function(width, depth, curvature, segments) {
    width = width || 20;
    depth = depth || 20;
    curvature = curvature || 0.05;
    segments = segments || 30;
    var verts = [];
    for (var i = 0; i <= segments; i++) {
      var x = width * (i / segments - 0.5);
      for (var j = 0; j <= segments; j++) {
        var y = depth * (j / segments - 0.5);
        var z = curvature * (x * x - y * y);
        verts.push(P(x, y, z));
      }
    }
    var faces = [];
    var n = segments + 1;
    for (var i = 0; i < segments; i++) {
      for (var j = 0; j < segments; j++) {
        var a = i * n + j;
        faces.push([a, a + n, a + 1]);
        faces.push([a + 1, a + n, a + n + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xfab387);
    m._solidType = 'HyParaboloid';
    return m;
  };

  // Catenary Shell (inverted catenary — Gaudi inspired)
  G.createCatenaryShell = function(span, height, segments) {
    span = span || 20;
    height = height || 10;
    segments = segments || 30;
    var a = height / (Math.cosh(span / (2 * height)) - 1);
    var verts = [];
    for (var i = 0; i <= segments; i++) {
      var x = span * (i / segments - 0.5);
      for (var j = 0; j <= segments; j++) {
        var y = span * (j / segments - 0.5);
        var r = Math.sqrt(x * x + y * y);
        var z = height - a * (Math.cosh(r / (a || 1)) - 1);
        if (z < 0) z = 0;
        verts.push(P(x, y, z));
      }
    }
    var faces = [];
    var n = segments + 1;
    for (var i = 0; i < segments; i++) {
      for (var j = 0; j < segments; j++) {
        var ai = i * n + j;
        faces.push([ai, ai + n, ai + 1]);
        faces.push([ai + 1, ai + n, ai + n + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xf2cdcd);
    m._solidType = 'CatenaryShell';
    return m;
  };

  // Hyperboloid of one sheet (cooling tower form)
  G.createHyperboloid = function(radius, waistRadius, height, segments) {
    radius = radius || 8;
    waistRadius = waistRadius || 4;
    height = height || 20;
    segments = segments || 30;
    var verts = [];
    var a = waistRadius;
    var c = height / 2;
    var scale = radius / Math.sqrt(a * a + c * c) * a;
    for (var i = 0; i <= segments; i++) {
      var v = height * (i / segments - 0.5);
      var r = waistRadius * Math.sqrt(1 + (v * v) / (c * c || 1));
      for (var j = 0; j <= segments; j++) {
        var u = 2 * Math.PI * j / segments;
        verts.push(P(r * Math.cos(u), r * Math.sin(u), v));
      }
    }
    var faces = [];
    var n = segments + 1;
    for (var i = 0; i < segments; i++) {
      for (var j = 0; j < segments; j++) {
        var ai = i * n + j;
        faces.push([ai, ai + n, ai + 1]);
        faces.push([ai + 1, ai + n, ai + n + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xcdd6f4);
    m._solidType = 'Hyperboloid';
    return m;
  };

  // Seashell / Conch (logarithmic spiral surface)
  G.createSeashell = function(turns, growth, segments) {
    turns = turns || 3;
    growth = growth || 0.1;
    segments = segments || 60;
    var radialSegs = 20;
    var verts = [];
    for (var i = 0; i <= segments; i++) {
      var u = turns * 2 * Math.PI * i / segments;
      var spiralR = Math.exp(growth * u);
      var cx = spiralR * Math.cos(u);
      var cy = spiralR * Math.sin(u);
      var cz = spiralR * 0.3;
      var tubeR = spiralR * 0.3;
      for (var j = 0; j <= radialSegs; j++) {
        var v = 2 * Math.PI * j / radialSegs;
        var nx = Math.cos(u) * Math.cos(v) - Math.sin(u) * 0;
        var ny = Math.sin(u) * Math.cos(v) + Math.cos(u) * 0;
        var nz = Math.sin(v);
        verts.push(P(cx + tubeR * nx, cy + tubeR * ny, cz + tubeR * nz));
      }
    }
    var faces = [];
    var nv = radialSegs + 1;
    for (var i = 0; i < segments; i++) {
      for (var j = 0; j < radialSegs; j++) {
        var a = i * nv + j;
        faces.push([a, a + nv, a + 1]);
        faces.push([a + 1, a + nv, a + nv + 1]);
      }
    }
    var m = new G.Mesh3(verts, faces, 0xf2cdcd);
    m._solidType = 'Seashell';
    return m;
  };

  // ══════════════════════════════════════
  // 6. PARAMETRIC FACADE TOOLS
  // Panel arrays, diamond grids, hexagonal patterns
  // ══════════════════════════════════════

  // Parametric panel array on a surface mesh
  G.facadePanels = function(mesh, uPanels, vPanels, scaleFn) {
    if (!mesh || mesh._type !== 'Mesh3') return [];
    var panels = [];
    for (var i = 0; i < uPanels; i++) {
      for (var j = 0; j < vPanels; j++) {
        var u0 = i / uPanels, u1 = (i + 1) / uPanels;
        var v0 = j / vPanels, v1 = (j + 1) / vPanels;
        var p00 = G.evaluateSurface(mesh, u0, v0);
        var p10 = G.evaluateSurface(mesh, u1, v0);
        var p01 = G.evaluateSurface(mesh, u0, v1);
        var p11 = G.evaluateSurface(mesh, u1, v1);

        // Center of panel
        var cx = (p00.x + p10.x + p01.x + p11.x) / 4;
        var cy = (p00.y + p10.y + p01.y + p11.y) / 4;
        var cz = (p00.z + p10.z + p01.z + p11.z) / 4;
        var center = P(cx, cy, cz);

        // Scale factor
        var scale = scaleFn ? scaleFn(center, i, j, uPanels, vPanels) : 0.9;

        // Scale corners toward center
        var corners = [p00, p10, p11, p01].map(function(p) {
          return P(
            center.x + (p.x - center.x) * scale,
            center.y + (p.y - center.y) * scale,
            center.z + (p.z - center.z) * scale
          );
        });
        corners.push(corners[0]); // close
        panels.push(new G.Polyline3(corners, true));
      }
    }
    return panels;
  };

  // Hexagonal grid on XY plane
  G.hexGrid = function(origin, radius, rows, cols) {
    origin = origin || P(0, 0, 0);
    radius = radius || 2;
    rows = rows || 10;
    cols = cols || 10;
    var hexes = [];
    var dx = radius * 1.5;
    var dy = radius * Math.sqrt(3);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cx = origin.x + c * dx;
        var cy = origin.y + r * dy + (c % 2 === 1 ? dy / 2 : 0);
        var pts = [];
        for (var k = 0; k <= 6; k++) {
          var angle = Math.PI / 3 * k + Math.PI / 6;
          pts.push(P(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), origin.z));
        }
        hexes.push(new G.Polyline3(pts, true));
      }
    }
    return hexes;
  };

  // Diamond grid
  G.diamondGrid = function(origin, width, height, rows, cols) {
    origin = origin || P(0, 0, 0);
    width = width || 2;
    height = height || 2;
    rows = rows || 10;
    cols = cols || 10;
    var diamonds = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cx = origin.x + c * width + (r % 2 === 1 ? width / 2 : 0);
        var cy = origin.y + r * height * 0.5;
        var pts = [
          P(cx, cy - height / 2, origin.z),
          P(cx + width / 2, cy, origin.z),
          P(cx, cy + height / 2, origin.z),
          P(cx - width / 2, cy, origin.z),
          P(cx, cy - height / 2, origin.z)
        ];
        diamonds.push(new G.Polyline3(pts, true));
      }
    }
    return diamonds;
  };

  // ══════════════════════════════════════
  // 7. ADVANCED CURVE OPERATIONS
  // ══════════════════════════════════════

  // B-Spline interpolation (approximate NURBS through given points)
  G.nurbsInterpolate = function(throughPoints, degree) {
    degree = degree || 3;
    // Use through-points as control points for a NURBS curve
    // For true interpolation we'd need to solve a linear system,
    // but this approximation works well for design workflows
    if (throughPoints.length <= degree) degree = throughPoints.length - 1;
    return new G.NurbsCurve(throughPoints, degree);
  };

  // Blend between two curves (morph/tween)
  G.blendCurves = function(curve1, curve2, t, segments) {
    segments = segments || 50;
    var pts1 = G._curvePoints(curve1, segments);
    var pts2 = G._curvePoints(curve2, segments);
    var n = Math.min(pts1.length, pts2.length);
    var blended = [];
    for (var i = 0; i < n; i++) {
      blended.push(pts1[i].lerp(pts2[i], t));
    }
    return new G.Polyline3(blended, false);
  };

  // Multiple blend curves between two profiles (for loft-like visualization)
  G.tweenCurves = function(curve1, curve2, count, segments) {
    count = count || 10;
    var result = [];
    for (var i = 0; i <= count; i++) {
      result.push(G.blendCurves(curve1, curve2, i / count, segments));
    }
    return result;
  };

  // Offset curve in 3D (along surface normal direction)
  G.offsetCurve3D = function(curve, distance, normalDir) {
    normalDir = normalDir || V(0, 0, 1);
    var pts = G._curvePoints(curve, 50);
    var offset = [];
    for (var i = 0; i < pts.length; i++) {
      offset.push(pts[i].add(normalDir.normalize().scale(distance)));
    }
    var result = new G.Polyline3(offset, curve.closed || false);
    return result;
  };

  // ══════════════════════════════════════
  // 8. MESH ANALYSIS & DEFORMATION
  // ══════════════════════════════════════

  // Noise deformation — apply Perlin noise to mesh vertices
  G.noiseDeform = function(mesh, amplitude, frequency, seed) {
    if (!mesh || mesh._type !== 'Mesh3') return mesh;
    amplitude = amplitude || 1;
    frequency = frequency || 0.3;
    seed = seed || 0;
    var newVerts = mesh.vertices.map(function(v) {
      var n = G.perlin3(v.x * frequency + seed, v.y * frequency, v.z * frequency);
      // Get approximate normal direction
      return P(v.x + n * amplitude * 0.3, v.y + n * amplitude * 0.3, v.z + n * amplitude);
    });
    var m = new G.Mesh3(newVerts, mesh.faces.slice(), mesh.color);
    m._solidType = 'NoiseDeformed';
    return m;
  };

  // Sin wave deformation
  G.sinDeform = function(mesh, amplitude, frequency, axis) {
    if (!mesh || mesh._type !== 'Mesh3') return mesh;
    axis = axis || 'z';
    var newVerts = mesh.vertices.map(function(v) {
      var input = axis === 'x' ? v.y : axis === 'y' ? v.x : Math.sqrt(v.x * v.x + v.y * v.y);
      var wave = amplitude * Math.sin(input * frequency);
      if (axis === 'x') return P(v.x + wave, v.y, v.z);
      if (axis === 'y') return P(v.x, v.y + wave, v.z);
      return P(v.x, v.y, v.z + wave);
    });
    var m = new G.Mesh3(newVerts, mesh.faces.slice(), mesh.color);
    m._solidType = 'SinDeformed';
    return m;
  };

  // Mesh bounding box
  G.meshBounds = function(mesh) {
    if (!mesh || mesh._type !== 'Mesh3') return null;
    var minX = Infinity, minY = Infinity, minZ = Infinity;
    var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    mesh.vertices.forEach(function(v) {
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
    });
    return { min: P(minX, minY, minZ), max: P(maxX, maxY, maxZ),
             size: V(maxX - minX, maxY - minY, maxZ - minZ),
             center: P((minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2) };
  };

  // ══════════════════════════════════════
  // 9. FIBONACCI / PHYLLOTAXIS PATTERNS
  // Sunflower spirals, golden angle distributions
  // ══════════════════════════════════════

  G.phyllotaxis = function(count, radius, spacing) {
    count = count || 200;
    radius = radius || 10;
    spacing = spacing || 0.5;
    var goldenAngle = Math.PI * (3 - Math.sqrt(5)); // 137.5°
    var pts = [];
    for (var i = 0; i < count; i++) {
      var r = spacing * Math.sqrt(i);
      var theta = i * goldenAngle;
      if (r > radius) break;
      pts.push(P(r * Math.cos(theta), r * Math.sin(theta), 0));
    }
    return pts;
  };

  G.fibonacciSphere = function(count, radius) {
    count = count || 200;
    radius = radius || 10;
    var goldenRatio = (1 + Math.sqrt(5)) / 2;
    var pts = [];
    for (var i = 0; i < count; i++) {
      var theta = 2 * Math.PI * i / goldenRatio;
      var phi = Math.acos(1 - 2 * (i + 0.5) / count);
      pts.push(P(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      ));
    }
    return pts;
  };

  // ══════════════════════════════════════
  // 10. TOPOLOGY OPTIMIZATION (simplified)
  // Variable density mesh for structural forms
  // ══════════════════════════════════════

  // Create a surface with variable density/thickness based on stress field
  G.stressField = function(mesh, loads, supports, resolution) {
    if (!mesh || mesh._type !== 'Mesh3') return mesh;
    loads = loads || [];
    supports = supports || [];
    // Simplified: use distance to loads/supports as proxy for stress
    var newVerts = mesh.vertices.map(function(v) {
      var stress = 0;
      for (var i = 0; i < loads.length; i++) {
        stress += 1 / (v.distanceTo(loads[i]) + 1);
      }
      for (var i = 0; i < supports.length; i++) {
        stress += 0.5 / (v.distanceTo(supports[i]) + 1);
      }
      // Thicken based on stress
      return P(v.x, v.y, v.z + stress * 2);
    });
    var m = new G.Mesh3(newVerts, mesh.faces.slice(), mesh.color);
    m._solidType = 'StressOptimized';
    return m;
  };

  console.log('[NodeFlow] NURBS + Advanced Math library loaded');

})();
