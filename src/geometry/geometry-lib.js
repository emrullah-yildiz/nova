// ============================================
// NODEFLOW AI — Geometry Kernel
// Full 3D geometry library with Three.js rendering
// ============================================

const Geo = {

  // ══════════════════════════════════════
  // PRIMITIVES
  // ══════════════════════════════════════

  // ── Point3 ──
  Point3: class {
    constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; this._type = 'Point3'; }
    toArray() { return [this.x, this.y, this.z]; }
    toThree() { return new THREE.Vector3(this.x, this.z, this.y); } // Y-up swap
    distanceTo(p) { return Math.sqrt((this.x-p.x)**2 + (this.y-p.y)**2 + (this.z-p.z)**2); }
    add(v) { return new Geo.Point3(this.x+v.x, this.y+v.y, this.z+v.z); }
    sub(v) { return new Geo.Point3(this.x-v.x, this.y-v.y, this.z-v.z); }
    scale(s) { return new Geo.Point3(this.x*s, this.y*s, this.z*s); }
    lerp(p, t) { return new Geo.Point3(this.x+(p.x-this.x)*t, this.y+(p.y-this.y)*t, this.z+(p.z-this.z)*t); }
    clone() { return new Geo.Point3(this.x, this.y, this.z); }
    toString() { return `Point3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`; }
  },

  // ── Vector3 ──
  Vector3: class {
    constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; this._type = 'Vector3'; }
    length() { return Math.sqrt(this.x**2 + this.y**2 + this.z**2); }
    normalize() { const l = this.length() || 1; return new Geo.Vector3(this.x/l, this.y/l, this.z/l); }
    cross(v) { return new Geo.Vector3(this.y*v.z - this.z*v.y, this.z*v.x - this.x*v.z, this.x*v.y - this.y*v.x); }
    dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }
    scale(s) { return new Geo.Vector3(this.x*s, this.y*s, this.z*s); }
    add(v) { return new Geo.Vector3(this.x+v.x, this.y+v.y, this.z+v.z); }
    negate() { return new Geo.Vector3(-this.x, -this.y, -this.z); }
    toThree() { return new THREE.Vector3(this.x, this.z, this.y); }
    clone() { return new Geo.Vector3(this.x, this.y, this.z); }
    toString() { return `Vec3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`; }
  },

  // ── Line3 ──
  Line3: class {
    constructor(start, end) {
      this.start = start; this.end = end; this._type = 'Line3';
    }
    length() { return this.start.distanceTo(this.end); }
    midpoint() { return this.start.lerp(this.end, 0.5); }
    direction() { const d = this.end.sub(this.start); const l = Math.sqrt(d.x**2+d.y**2+d.z**2)||1; return new Geo.Vector3(d.x/l, d.y/l, d.z/l); }
    pointAt(t) { return this.start.lerp(this.end, t); }
    reverse() { return new Geo.Line3(this.end, this.start); }
    toMesh(color) {
      const g = new THREE.BufferGeometry().setFromPoints([this.start.toThree(), this.end.toThree()]);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || 0xa6e3a1, linewidth: 2 }));
    }
    toString() { return `Line3(${this.start} → ${this.end})`; }
  },

  // ── Polyline3 ──
  Polyline3: class {
    constructor(points, closed) {
      this.points = points || []; this.closed = closed || false; this._type = 'Polyline3';
    }
    length() { let l = 0; for (let i = 1; i < this.points.length; i++) l += this.points[i-1].distanceTo(this.points[i]); if (this.closed && this.points.length > 2) l += this.points[this.points.length-1].distanceTo(this.points[0]); return l; }
    toMesh(color) {
      const pts = this.points.map(p => p.toThree());
      if (this.closed && pts.length > 2) pts.push(pts[0].clone());
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || 0x94e2d5, linewidth: 2 }));
    }
    toString() { return `Polyline3(${this.points.length} pts, ${this.closed ? 'closed' : 'open'})`; }
  },

  // ── Arc3 (circular arc in a plane) ──
  Arc3: class {
    constructor(center, radius, startAngle, endAngle, normal) {
      this.center = center || new Geo.Point3(0,0,0);
      this.radius = radius || 1;
      this.startAngle = startAngle || 0;
      this.endAngle = endAngle || Math.PI * 2;
      this.normal = normal || new Geo.Vector3(0,0,1);
      this._type = 'Arc3';
    }
    toPoints(segments) {
      segments = segments || 64;
      const pts = [];
      const span = this.endAngle - this.startAngle;
      // Build local axes perpendicular to normal
      const n = this.normal.normalize();
      let u = Math.abs(n.z) < 0.9 ? new Geo.Vector3(0,0,1) : new Geo.Vector3(1,0,0);
      const v1 = n.cross(u).normalize();
      const v2 = n.cross(v1).normalize();
      for (let i = 0; i <= segments; i++) {
        const a = this.startAngle + span * i / segments;
        const px = this.center.x + this.radius * (Math.cos(a)*v1.x + Math.sin(a)*v2.x);
        const py = this.center.y + this.radius * (Math.cos(a)*v1.y + Math.sin(a)*v2.y);
        const pz = this.center.z + this.radius * (Math.cos(a)*v1.z + Math.sin(a)*v2.z);
        pts.push(new Geo.Point3(px, py, pz));
      }
      return pts;
    }
    toMesh(color) {
      const pts = this.toPoints(64).map(p => p.toThree());
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || 0xf9e2af, linewidth: 2 }));
    }
    toString() { return `Arc3(r=${this.radius.toFixed(2)}, ${(this.startAngle*180/Math.PI).toFixed(0)}°→${(this.endAngle*180/Math.PI).toFixed(0)}°)`; }
  },

  // ── Circle3 ──
  Circle3: class {
    constructor(center, radius, normal) {
      this.center = center || new Geo.Point3(0,0,0);
      this.radius = radius || 1;
      this.normal = normal || new Geo.Vector3(0,0,1);
      this._type = 'Circle3';
    }
    toArc() { return new Geo.Arc3(this.center, this.radius, 0, Math.PI*2, this.normal); }
    toPoints(segments) { return this.toArc().toPoints(segments); }
    area() { return Math.PI * this.radius ** 2; }
    circumference() { return 2 * Math.PI * this.radius; }
    toMesh(color) { return this.toArc().toMesh(color || 0xf9e2af); }
    toString() { return `Circle3(r=${this.radius.toFixed(2)}, c=${this.center})`; }
  },

  // ── Plane ──
  Plane: class {
    constructor(origin, normal) {
      this.origin = origin || new Geo.Point3(0,0,0);
      this.normal = (normal || new Geo.Vector3(0,0,1)).normalize();
      this._type = 'Plane';
    }
    xAxis() {
      const n = this.normal;
      let u = Math.abs(n.z) < 0.9 ? new Geo.Vector3(0,0,1) : new Geo.Vector3(1,0,0);
      return n.cross(u).normalize();
    }
    yAxis() { return this.normal.cross(this.xAxis()).normalize(); }
    toMesh(size, color) {
      size = size || 20;
      const g = new THREE.PlaneGeometry(size, size);
      const m = new THREE.MeshPhongMaterial({ color: color || 0x89b4fa, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m);
      const o = this.origin.toThree();
      const n = this.normal.toThree();
      mesh.position.copy(o);
      mesh.lookAt(o.clone().add(n));
      return mesh;
    }
    toString() { return `Plane(o=${this.origin}, n=${this.normal})`; }
  },

  // ══════════════════════════════════════
  // SURFACES & SOLIDS (mesh-based)
  // ══════════════════════════════════════

  // ── Mesh3 — generic triangulated mesh ──
  Mesh3: class {
    constructor(vertices, faces, color) {
      this.vertices = vertices || []; // Geo.Point3[]
      this.faces = faces || [];       // [i, j, k][]
      this.color = color || 0x89b4fa;
      this._type = 'Mesh3';
    }
    vertexCount() { return this.vertices.length; }
    faceCount() { return this.faces.length; }
    toThreeGeometry() {
      const g = new THREE.BufferGeometry();
      const verts = new Float32Array(this.vertices.length * 3);
      this.vertices.forEach((v, i) => { verts[i*3] = v.x; verts[i*3+1] = v.z; verts[i*3+2] = v.y; }); // Y-up swap
      g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      if (this.faces.length) {
        const idx = []; this.faces.forEach(f => idx.push(f[0], f[1], f[2]));
        g.setIndex(idx);
      }
      g.computeVertexNormals();
      return g;
    }
    toMesh(color) {
      const g = this.toThreeGeometry();
      const c = color || this.color;
      const mat = new THREE.MeshPhongMaterial({ color: c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, flatShading: true });
      const mesh = new THREE.Mesh(g, mat);
      // Wireframe overlay
      const wire = new THREE.WireframeGeometry(g);
      const wMat = new THREE.LineBasicMaterial({ color: 0x45475a, linewidth: 1 });
      const group = new THREE.Group();
      group.add(mesh);
      group.add(new THREE.LineSegments(wire, wMat));
      return group;
    }
    toString() { return `Mesh3(${this.vertices.length} verts, ${this.faces.length} faces)`; }
  },

  // ══════════════════════════════════════
  // SOLID PRIMITIVES (generate Mesh3)
  // ══════════════════════════════════════

  // Box
  createBox(center, width, depth, height) {
    center = center || new Geo.Point3(0,0,0);
    const w = width/2, d = depth/2, h = height/2;
    const cx = center.x, cy = center.y, cz = center.z;
    const P = Geo.Point3;
    const v = [
      new P(cx-w,cy-d,cz-h), new P(cx+w,cy-d,cz-h), new P(cx+w,cy+d,cz-h), new P(cx-w,cy+d,cz-h),
      new P(cx-w,cy-d,cz+h), new P(cx+w,cy-d,cz+h), new P(cx+w,cy+d,cz+h), new P(cx-w,cy+d,cz+h)
    ];
    const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[2,3,7],[2,7,6],[1,2,6],[1,6,5],[0,4,7],[0,7,3]];
    const m = new Geo.Mesh3(v, f, 0x89b4fa);
    m._solidType = 'Box'; m._params = { center, width, depth, height };
    return m;
  },

  // Sphere
  createSphere(center, radius, segments) {
    center = center || new Geo.Point3(0,0,0);
    radius = radius || 1; segments = segments || 24;
    const verts = []; const faces = [];
    for (let lat = 0; lat <= segments; lat++) {
      const theta = Math.PI * lat / segments;
      for (let lon = 0; lon <= segments; lon++) {
        const phi = 2 * Math.PI * lon / segments;
        verts.push(new Geo.Point3(
          center.x + radius * Math.sin(theta) * Math.cos(phi),
          center.y + radius * Math.sin(theta) * Math.sin(phi),
          center.z + radius * Math.cos(theta)
        ));
      }
    }
    for (let lat = 0; lat < segments; lat++) {
      for (let lon = 0; lon < segments; lon++) {
        const a = lat * (segments+1) + lon, b = a + segments + 1;
        faces.push([a, b, a+1]); faces.push([a+1, b, b+1]);
      }
    }
    const m = new Geo.Mesh3(verts, faces, 0xf38ba8);
    m._solidType = 'Sphere'; m._params = { center, radius };
    return m;
  },

  // Cylinder
  createCylinder(baseCenter, radius, height, segments) {
    baseCenter = baseCenter || new Geo.Point3(0,0,0);
    radius = radius || 1; height = height || 2; segments = segments || 24;
    const verts = []; const faces = [];
    // Bottom + top rings
    for (let ring = 0; ring <= 1; ring++) {
      const z = baseCenter.z + ring * height;
      for (let i = 0; i <= segments; i++) {
        const a = 2 * Math.PI * i / segments;
        verts.push(new Geo.Point3(baseCenter.x + radius * Math.cos(a), baseCenter.y + radius * Math.sin(a), z));
      }
    }
    // Side faces
    const n = segments + 1;
    for (let i = 0; i < segments; i++) {
      faces.push([i, i+n, i+1]); faces.push([i+1, i+n, i+n+1]);
    }
    // Caps
    const bc = verts.length; verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z));
    const tc = verts.length; verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z + height));
    for (let i = 0; i < segments; i++) {
      faces.push([bc, i+1, i]);           // bottom
      faces.push([tc, i+n, i+n+1]);       // top
    }
    const m = new Geo.Mesh3(verts, faces, 0xa6e3a1);
    m._solidType = 'Cylinder'; m._params = { baseCenter, radius, height };
    return m;
  },

  // Cone
  createCone(baseCenter, radius, height, segments) {
    baseCenter = baseCenter || new Geo.Point3(0,0,0);
    radius = radius || 1; height = height || 2; segments = segments || 24;
    const verts = []; const faces = [];
    // Base ring
    for (let i = 0; i <= segments; i++) {
      const a = 2 * Math.PI * i / segments;
      verts.push(new Geo.Point3(baseCenter.x + radius * Math.cos(a), baseCenter.y + radius * Math.sin(a), baseCenter.z));
    }
    // Apex
    const apex = verts.length;
    verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z + height));
    // Base center
    const bc = verts.length;
    verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z));
    // Side + bottom faces
    for (let i = 0; i < segments; i++) {
      faces.push([i, apex, i+1]);   // side
      faces.push([bc, i+1, i]);     // bottom
    }
    const m = new Geo.Mesh3(verts, faces, 0xfab387);
    m._solidType = 'Cone'; m._params = { baseCenter, radius, height };
    return m;
  },

  // Torus
  createTorus(center, majorR, minorR, majorSegs, minorSegs) {
    center = center || new Geo.Point3(0,0,0);
    majorR = majorR || 5; minorR = minorR || 1.5;
    majorSegs = majorSegs || 32; minorSegs = minorSegs || 16;
    const verts = []; const faces = [];
    for (let i = 0; i <= majorSegs; i++) {
      const u = 2 * Math.PI * i / majorSegs;
      for (let j = 0; j <= minorSegs; j++) {
        const v = 2 * Math.PI * j / minorSegs;
        verts.push(new Geo.Point3(
          center.x + (majorR + minorR * Math.cos(v)) * Math.cos(u),
          center.y + (majorR + minorR * Math.cos(v)) * Math.sin(u),
          center.z + minorR * Math.sin(v)
        ));
      }
    }
    const n = minorSegs + 1;
    for (let i = 0; i < majorSegs; i++) {
      for (let j = 0; j < minorSegs; j++) {
        const a = i * n + j, b = a + n;
        faces.push([a, b, a+1]); faces.push([a+1, b, b+1]);
      }
    }
    const m = new Geo.Mesh3(verts, faces, 0xcba6f7);
    m._solidType = 'Torus'; m._params = { center, majorR, minorR };
    return m;
  },

  // ══════════════════════════════════════
  // OPERATIONS
  // ══════════════════════════════════════

  // ── Extrude: curve/polyline → mesh along a vector ──
  extrude(curve, vector) {
    if (!curve || !vector) return null;
    let pts = [];
    if (curve._type === 'Polyline3') pts = curve.points;
    else if (curve._type === 'Circle3' || curve._type === 'Arc3') pts = curve.toPoints ? curve.toPoints(48) : [];
    else if (curve._type === 'Line3') pts = [curve.start, curve.end];
    else if (Array.isArray(curve)) pts = curve;
    if (pts.length < 2) return null;

    const n = pts.length;
    const verts = [];
    // Bottom ring
    pts.forEach(p => verts.push(p.clone()));
    // Top ring
    pts.forEach(p => verts.push(p.add(vector)));

    const faces = [];
    for (let i = 0; i < n - 1; i++) {
      faces.push([i, i+n, i+1]);
      faces.push([i+1, i+n, i+n+1]);
    }
    // If closed, connect last to first
    if (curve.closed || curve._type === 'Circle3') {
      faces.push([n-1, n-1+n, 0]);
      faces.push([0, n-1+n, n]);
    }

    const m = new Geo.Mesh3(verts, faces, 0x89b4fa);
    m._solidType = 'Extrusion';
    return m;
  },

  // ── Revolve: curve around an axis ──
  revolve(curve, axisOrigin, axisDir, angle, segments) {
    if (!curve) return null;
    angle = angle || Math.PI * 2;
    segments = segments || 32;
    let pts = [];
    if (curve._type === 'Polyline3') pts = curve.points;
    else if (curve._type === 'Line3') pts = [curve.start, curve.end];
    else if (Array.isArray(curve)) pts = curve;
    if (pts.length < 2) return null;

    axisOrigin = axisOrigin || new Geo.Point3(0,0,0);
    axisDir = (axisDir || new Geo.Vector3(0,0,1)).normalize();
    const n = pts.length;
    const verts = [];

    for (let s = 0; s <= segments; s++) {
      const a = angle * s / segments;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      pts.forEach(p => {
        // Rodrigues' rotation formula
        const rel = p.sub(axisOrigin);
        const rv = new Geo.Vector3(rel.x, rel.y, rel.z);
        const k = axisDir;
        const rotated = rv.scale(cosA).add(k.cross(rv).scale(sinA)).add(k.scale(k.dot(rv) * (1 - cosA)));
        verts.push(axisOrigin.add(rotated));
      });
    }

    const faces = [];
    for (let s = 0; s < segments; s++) {
      for (let i = 0; i < n - 1; i++) {
        const a = s * n + i, b = (s+1) * n + i;
        faces.push([a, b, a+1]); faces.push([a+1, b, b+1]);
      }
    }

    const m = new Geo.Mesh3(verts, faces, 0xf5c2e7);
    m._solidType = 'Revolution';
    return m;
  },

  // ── Loft: connect multiple profiles ──
  loft(profiles) {
    if (!profiles || profiles.length < 2) return null;
    // Normalize to point arrays
    const rings = profiles.map(p => {
      if (p._type === 'Polyline3') return p.points;
      if (p._type === 'Circle3') return p.toPoints(48);
      if (Array.isArray(p)) return p;
      return [];
    }).filter(r => r.length > 0);
    if (rings.length < 2) return null;

    // Detect closed profiles: if first and last point are the same (or very close), remove duplicate
    var isClosed = false;
    const cleaned = rings.map(ring => {
      if (ring.length > 2) {
        var first = ring[0], last = ring[ring.length - 1];
        if (first && last && first.distanceTo && first.distanceTo(last) < 0.5) {
          isClosed = true;
          return ring.slice(0, ring.length - 1);
        }
      }
      return ring;
    });

    // Also detect closed if profiles come from Polyline3 with closed flag, or if they look like rings
    // Heuristic: if profiles have >12 points and first-to-last gap is smaller than average segment length, it's closed
    if (!isClosed && cleaned.length > 0 && cleaned[0].length > 12) {
      var ring = cleaned[0];
      var f = ring[0], l = ring[ring.length - 1];
      if (f && l && f.distanceTo) {
        var gap = f.distanceTo(l);
        var seg = f.distanceTo(ring[1]);
        if (gap < seg * 3) isClosed = true;
      }
    }

    // Resample all rings to same count
    const targetCount = Math.max(...cleaned.map(r => r.length));
    const resampled = cleaned.map(ring => {
      if (ring.length === targetCount) return ring;
      const out = [];
      for (let i = 0; i < targetCount; i++) {
        const t = i / (targetCount - 1) * (ring.length - 1);
        const idx = Math.floor(t);
        const frac = t - idx;
        if (idx >= ring.length - 1) out.push(ring[ring.length-1].clone());
        else out.push(ring[idx].lerp(ring[idx+1], frac));
      }
      return out;
    });

    const verts = [];
    resampled.forEach(ring => ring.forEach(p => verts.push(p)));

    const faces = [];
    const n = targetCount;
    for (let r = 0; r < resampled.length - 1; r++) {
      for (let i = 0; i < n - 1; i++) {
        const a = r * n + i, b = (r+1) * n + i;
        faces.push([a, b, a+1]); faces.push([a+1, b, b+1]);
      }
      // Close the loop if profiles are closed
      if (isClosed) {
        const a = r * n + (n - 1), b = (r+1) * n + (n - 1);
        faces.push([a, b, r * n]); faces.push([r * n, b, (r+1) * n]);
      }
    }

    const m = new Geo.Mesh3(verts, faces, 0x94e2d5);
    m._solidType = 'Loft';
    return m;
  },

  // ── Offset curve (2D, XY plane) ──
  offsetCurve(polyline, distance) {
    if (!polyline || !polyline.points || polyline.points.length < 2) return null;
    const pts = polyline.points;
    const offset = [];
    for (let i = 0; i < pts.length; i++) {
      let nx = 0, ny = 0, count = 0;
      if (i > 0) {
        const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
        const l = Math.sqrt(dx*dx + dy*dy) || 1;
        nx += -dy/l; ny += dx/l; count++;
      }
      if (i < pts.length - 1) {
        const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y;
        const l = Math.sqrt(dx*dx + dy*dy) || 1;
        nx += -dy/l; ny += dx/l; count++;
      }
      if (count > 0) { nx /= count; ny /= count; }
      const l = Math.sqrt(nx*nx + ny*ny) || 1;
      offset.push(new Geo.Point3(pts[i].x + distance * nx/l, pts[i].y + distance * ny/l, pts[i].z));
    }
    return new Geo.Polyline3(offset, polyline.closed);
  },

  // ── Move ──
  move(geometry, vector) {
    if (!geometry || !vector) return geometry;
    if (geometry._type === 'Point3') return geometry.add(vector);
    if (geometry._type === 'Line3') return new Geo.Line3(geometry.start.add(vector), geometry.end.add(vector));
    if (geometry._type === 'Polyline3') return new Geo.Polyline3(geometry.points.map(p => p.add(vector)), geometry.closed);
    if (geometry._type === 'Circle3') return new Geo.Circle3(geometry.center.add(vector), geometry.radius, geometry.normal);
    if (geometry._type === 'Mesh3') {
      const m = new Geo.Mesh3(geometry.vertices.map(v => v.add(vector)), geometry.faces.slice(), geometry.color);
      m._solidType = geometry._solidType;
      return m;
    }
    return geometry;
  },

  // ── Scale ──
  scaleGeo(geometry, factor, origin) {
    origin = origin || new Geo.Point3(0,0,0);
    const scalePoint = (p) => {
      const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
      return new Geo.Point3(origin.x + dx * factor, origin.y + dy * factor, origin.z + dz * factor);
    };
    if (geometry._type === 'Point3') return scalePoint(geometry);
    if (geometry._type === 'Line3') return new Geo.Line3(scalePoint(geometry.start), scalePoint(geometry.end));
    if (geometry._type === 'Polyline3') return new Geo.Polyline3(geometry.points.map(scalePoint), geometry.closed);
    if (geometry._type === 'Circle3') return new Geo.Circle3(scalePoint(geometry.center), geometry.radius * factor, geometry.normal);
    if (geometry._type === 'Mesh3') {
      const m = new Geo.Mesh3(geometry.vertices.map(scalePoint), geometry.faces.slice(), geometry.color);
      m._solidType = geometry._solidType;
      return m;
    }
    return geometry;
  },

  // ── Boolean operations (mesh-level: simplified via merge/clip) ──
  // Full CSG would require a BSP tree. This provides visual approximation.
  booleanUnion(meshA, meshB) {
    if (!meshA || !meshB) return meshA || meshB;
    const verts = [...meshA.vertices];
    const offset = verts.length;
    meshB.vertices.forEach(v => verts.push(v.clone()));
    const faces = [...meshA.faces];
    meshB.faces.forEach(f => faces.push([f[0]+offset, f[1]+offset, f[2]+offset]));
    const m = new Geo.Mesh3(verts, faces, meshA.color);
    m._solidType = 'BooleanUnion';
    return m;
  },

  // For visual intersect/subtract we combine both meshes (visual proxy)
  booleanIntersect(meshA, meshB) {
    // True CSG would require BSP trees. For now, show meshA as proxy.
    if (!meshA) return meshB;
    const m = new Geo.Mesh3(meshA.vertices.map(v => v.clone()), meshA.faces.slice(), 0xf9e2af);
    m._solidType = 'BooleanIntersect';
    return m;
  },

  booleanSubtract(meshA, meshB) {
    // True CSG would require BSP trees. For now, just show meshA (the positive shape).
    // meshB is the cutter — we don't render it.
    if (!meshA) return meshB;
    const m = new Geo.Mesh3(meshA.vertices.map(v => v.clone()), meshA.faces.slice(), meshA.color);
    m._solidType = 'BooleanSubtract';
    return m;
  },

  // ── Trim line at parameter ──
  trimLine(line, t0, t1) {
    if (!line || line._type !== 'Line3') return line;
    t0 = Math.max(0, t0 || 0);
    t1 = Math.min(1, t1 || 1);
    return new Geo.Line3(line.pointAt(t0), line.pointAt(t1));
  },

  // ── Point grid ──
  pointGrid(origin, uDir, vDir, uCount, vCount, uSpacing, vSpacing) {
    origin = origin || new Geo.Point3(0,0,0);
    uDir = (uDir || new Geo.Vector3(1,0,0)).normalize();
    vDir = (vDir || new Geo.Vector3(0,1,0)).normalize();
    uSpacing = uSpacing || 1; vSpacing = vSpacing || 1;
    const pts = [];
    for (let i = 0; i < uCount; i++) {
      for (let j = 0; j < vCount; j++) {
        pts.push(origin.add(uDir.scale(i * uSpacing)).add(vDir.scale(j * vSpacing)));
      }
    }
    return pts;
  },

  // ── Surface from point grid ──
  surfaceFromGrid(points, uCount, vCount) {
    const verts = points.map(p => p instanceof Geo.Point3 ? p : new Geo.Point3(p.x||p[0]||0, p.y||p[1]||0, p.z||p[2]||0));
    const faces = [];
    for (let i = 0; i < uCount - 1; i++) {
      for (let j = 0; j < vCount - 1; j++) {
        const a = i * vCount + j;
        faces.push([a, a+vCount, a+1]);
        faces.push([a+1, a+vCount, a+vCount+1]);
      }
    }
    const m = new Geo.Mesh3(verts, faces, 0x94e2d5);
    m._solidType = 'Surface';
    return m;
  },

  // ══════════════════════════════════════
  // RENDERING HELPER — add any Geo object to a Three.js group
  // ══════════════════════════════════════
  addToScene(group, geoObj, color) {
    if (!group || !geoObj) return;
    if (geoObj.type === 'GeometryRef' && geoObj.bounds) {
      const min = geoObj.bounds.min || [0, 0, 0];
      const max = geoObj.bounds.max || [0, 0, 0];
      const sx = Math.max(0.01, Number(max[0]) - Number(min[0]));
      const sy = Math.max(0.01, Number(max[1]) - Number(min[1]));
      const sz = Math.max(0.01, Number(max[2]) - Number(min[2]));
      const box = new THREE.BoxGeometry(sx, sz, sy);
      const edges = new THREE.EdgesGeometry(box);
      const material = new THREE.LineBasicMaterial({
        color: color || 0x74c7ec,
        transparent: true,
        opacity: 0.72
      });
      const line = new THREE.LineSegments(edges, material);
      line.position.set(
        (Number(min[0]) + Number(max[0])) / 2,
        (Number(min[2]) + Number(max[2])) / 2,
        (Number(min[1]) + Number(max[1])) / 2
      );
      line.userData.geometryRef = geoObj;
      group.add(line);
      return;
    }
    if (geoObj.toMesh) {
      group.add(geoObj.toMesh(color));
    } else if (geoObj._type === 'Point3') {
      const g = new THREE.SphereGeometry(0.3, 8, 8);
      const m = new THREE.MeshPhongMaterial({ color: color || 0x89b4fa, emissive: color || 0x89b4fa, emissiveIntensity: 0.3 });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(geoObj.toThree());
      group.add(mesh);
    } else if (Array.isArray(geoObj)) {
      // Array of geo objects or points
      geoObj.forEach(item => {
        if (item && item._type) Geo.addToScene(group, item, color);
        else if (item instanceof Geo.Point3) Geo.addToScene(group, item, color);
      });
    }
  }
};

// Make globally accessible
if (typeof window !== 'undefined') {
  window.Geo = Geo;
}

export { Geo };
export default Geo;
