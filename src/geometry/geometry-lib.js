// ============================================

// NODEFLOW AI — Geometry Kernel

// Full 3D geometry library with Three.js rendering

// ============================================



// Coerce a point-like / vector-like value to a Vector3 (so directions always
// have vector methods like normalize/cross). Returns null for nullish input.
function asVector(v) {
  if (!v) return null;
  if (v instanceof _Vector3) return v;
  return new Geo.Vector3(v.x || 0, v.y || 0, v.z || 0);
}

// ── Base: Curve3 — abstract curve interface ──

class _Curve3 {

  constructor() { this._type = 'Curve3'; }

  /** Evaluate point at parameter t ∈ [0,1] */
  pointAt(t) { throw new Error('Curve3.pointAt() not implemented'); }

  /** Total arc length */
  length() { throw new Error('Curve3.length() not implemented'); }

  /** Center-of-mass or midpoint */
  getCenter() { throw new Error('Curve3.getCenter() not implemented'); }

  /** Three.js mesh for rendering */
  toMesh(color) { throw new Error('Curve3.toMesh() not implemented'); }

  /** Tangent direction at parameter t ∈ [0,1] (default: chord approximation) */
  tangentAt(t) {
    const dt = 0.001;
    const p0 = this.pointAt(Math.max(0, Math.min(1, t - dt)));
    const p1 = this.pointAt(Math.max(0, Math.min(1, t + dt)));
    const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
    const l = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
    return new Geo.Vector3(dx/l, dy/l, dz/l);
  }

  /** Start→End chord direction (fast, no parameter evaluation) */
  chordDirection() {
    const s = this.start || this.pointAt(0);
    const e = this.end   || this.pointAt(1);
    if (!s || !e) return new _Vector3(0,0,1);
    const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z;
    const l = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
    return new _Vector3(dx/l, dy/l, dz/l);
  }

  toString() { return `Curve3(${this._type})`; }

}

// ── Point3 ──

class _Point3 {

  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; this._type = 'Point3'; }

  toArray() { return [this.x, this.y, this.z]; }

  toThree() { return new THREE.Vector3(this.x, this.z, this.y); } // Y-up swap

  distanceTo(p) { return Math.sqrt((this.x-p.x)**2 + (this.y-p.y)**2 + (this.z-p.z)**2); }

  add(v) { return new Geo.Point3(this.x+v.x, this.y+v.y, this.z+v.z); }

  sub(v) { return new Geo.Point3(this.x-v.x, this.y-v.y, this.z-v.z); }

  scale(s) { return new Geo.Point3(this.x*s, this.y*s, this.z*s); }

  lerp(p, t) { return new Geo.Point3(this.x+(p.x-this.x)*t, this.y+(p.y-this.y)*t, this.z+(p.z-this.z)*t); }

  clone() { return new Geo.Point3(this.x, this.y, this.z); }
  getCenter() { return this; }

  toString() { return `Point3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`; }

}



// ── Vector3 ──

class _Vector3 {

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

}



// ── Line3 (extends Curve3) ──

class _Line3 extends _Curve3 {

  constructor(start, end) {

    super();

    this.start = start; this.end = end; this._type = 'Line3';

  }

  length() { return this.start.distanceTo(this.end); }

  midpoint() { return this.start.lerp(this.end, 0.5); }
  getCenter() { return this.midpoint(); }

  pointAt(t) { return this.start.lerp(this.end, t); }

  tangentAt(t) { return this.chordDirection(); } // Line has constant direction

  reverse() { return new Geo.Line3(this.end, this.start); }

  toMesh(color) {

    const g = new THREE.BufferGeometry().setFromPoints([this.start.toThree(), this.end.toThree()]);

    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || 0xa6e3a1, linewidth: 2 }));

  }

  toString() { return `Line3(${this.start} → ${this.end})`; }

}



// ── Polyline3 (extends Curve3) ──

class _Polyline3 extends _Curve3 {

  constructor(points, closed) {

    super();

    this.points = points || []; this.closed = closed || false; this._type = 'Polyline3';

  }

  length() { let l = 0; for (let i = 1; i < this.points.length; i++) l += this.points[i-1].distanceTo(this.points[i]); if (this.closed && this.points.length > 2) l += this.points[this.points.length-1].distanceTo(this.points[0]); return l; }

  pointAt(t) {
    const n = this.points.length;
    if (n < 2) return this.points[0] ? this.points[0].clone() : new Geo.Point3(0,0,0);
    const totalLen = this.length();
    if (totalLen === 0) return this.points[0].clone();
    const targetDist = t * totalLen;
    let accum = 0;
    for (let i = 1; i < n; i++) {
      const segLen = this.points[i-1].distanceTo(this.points[i]);
      if (accum + segLen >= targetDist || i === n - 1) {
        const frac = (targetDist - accum) / (segLen || 1);
        return this.points[i-1].lerp(this.points[i], Math.min(1, Math.max(0, frac)));
      }
      accum += segLen;
    }
    return this.points[n-1].clone();
  }

  getCenter() {
    if (this.points.length === 0) return new Geo.Point3(0,0,0);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < this.points.length; i++) { cx += this.points[i].x; cy += this.points[i].y; cz += this.points[i].z; }
    return new Geo.Point3(cx/this.points.length, cy/this.points.length, cz/this.points.length);
  }

  toMesh(color) {

    const pts = this.points.map(p => p.toThree());

    if (this.closed && pts.length > 2) pts.push(pts[0].clone());

    const g = new THREE.BufferGeometry().setFromPoints(pts);

    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || 0x94e2d5, linewidth: 2 }));

  }

  toString() { return `Polyline3(${this.points.length} pts, ${this.closed ? 'closed' : 'open'})`; }

}



// ── Arc3 (circular arc in a plane, extends Curve3) ──

class _Arc3 extends _Curve3 {

  constructor(center, radius, startAngle, endAngle, normal) {

    super();

    this.center = center || new Geo.Point3(0,0,0);

    this.radius = radius || 1;

    this.startAngle = startAngle || 0;

    this.endAngle = endAngle || Math.PI * 2;

    this.normal = normal || new Geo.Vector3(0,0,1);

    this._type = 'Arc3';

  }

  _buildAxes() {
    const n = this.normal.normalize();
    let u = Math.abs(n.z) < 0.9 ? new Geo.Vector3(0,0,1) : new Geo.Vector3(1,0,0);
    return { u: n.cross(u).normalize(), v: n.cross(n.cross(u)).normalize(), n };
  }

  pointAt(t) {
    const a = this.startAngle + (this.endAngle - this.startAngle) * t;
    const axes = this._buildAxes();
    const cosA = Math.cos(a), sinA = Math.sin(a);
    return new Geo.Point3(
      this.center.x + this.radius * (cosA * axes.u.x + sinA * axes.v.x),
      this.center.y + this.radius * (cosA * axes.u.y + sinA * axes.v.y),
      this.center.z + this.radius * (cosA * axes.u.z + sinA * axes.v.z)
    );
  }

  length() {
    const span = Math.abs(this.endAngle - this.startAngle);
    if (span >= Math.PI * 2 - 0.001) return 2 * Math.PI * this.radius;
    return this.radius * span;
  }

  getCenter() { return this.center.clone(); }

  toPoints(segments) {

    segments = segments || 64;

    const pts = [];

    const span = this.endAngle - this.startAngle;

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

}



// ── Circle3 (extends Curve3) ──

class _Circle3 extends _Curve3 {

  constructor(center, radius, normal) {

    super();

    this.center = center || new Geo.Point3(0,0,0);

    this.radius = radius || 1;

    this.normal = normal || new Geo.Vector3(0,0,1);

    this._type = 'Circle3';

  }

  toArc() { return new Geo.Arc3(this.center, this.radius, 0, Math.PI*2, this.normal); }

  pointAt(t) { return this.toArc().pointAt(t); }

  length() { return 2 * Math.PI * this.radius; }

  getCenter() { return this.center.clone(); }

  toPoints(segments) { return this.toArc().toPoints(segments); }

  area() { return Math.PI * this.radius ** 2; }

  circumference() { return 2 * Math.PI * this.radius; }

  toMesh(color) { return this.toArc().toMesh(color || 0xf9e2af); }

  toString() { return `Circle3(r=${this.radius.toFixed(2)}, c=${this.center})`; }

}



// ── Ellipse3 (axis-aligned ellipse in a plane, extends Curve3) ──

class _Ellipse3 extends _Curve3 {

  constructor(center, width, depth, normal, xAxis) {

    super();

    this.center = center || new Geo.Point3(0,0,0);

    this.width = width || 1;   // total span along the local X (xAxis) direction

    this.depth = depth || 1;   // total span along the local Y direction

    this.normal = asVector(normal) || new Geo.Vector3(0,0,1);

    // In-plane direction of the width axis. Defaults so a Z-normal ellipse has
    // width along world X; transforms carry/rotate it so the ellipse can hold
    // an arbitrary orientation (this is what lets Geometry.Rotate spin it).
    this.xAxis = asVector(xAxis) || this._defaultXAxis();

    this.closed = true;

    this._type = 'Ellipse3';

  }

  _defaultXAxis() {
    const n = this.normal.normalize();
    const ref = Math.abs(n.y) < 0.999 ? new Geo.Vector3(0,1,0) : new Geo.Vector3(1,0,0);
    return ref.cross(n).normalize();
  }

  // Orthonormal basis: u = width axis, v = depth axis, n = normal.
  _buildAxes() {
    const n = this.normal.normalize();
    const u = this.xAxis.normalize();
    const v = n.cross(u).normalize();
    return { u, v, n };
  }

  pointAt(t) {
    const a = Math.PI * 2 * t;
    const rx = this.width / 2, ry = this.depth / 2;
    const ax = this._buildAxes();
    const cosA = Math.cos(a), sinA = Math.sin(a);
    return new Geo.Point3(
      this.center.x + rx * cosA * ax.u.x + ry * sinA * ax.v.x,
      this.center.y + rx * cosA * ax.u.y + ry * sinA * ax.v.y,
      this.center.z + rx * cosA * ax.u.z + ry * sinA * ax.v.z
    );
  }

  // Ramanujan's approximation — no closed form exists for an ellipse perimeter.
  length() {
    const a = this.width / 2, b = this.depth / 2;
    const h = Math.pow(a - b, 2) / Math.pow(a + b, 2) || 0;
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  }

  getCenter() { return this.center.clone(); }

  toPoints(segments) {
    segments = segments || 64;
    const pts = [];
    for (let i = 0; i <= segments; i++) pts.push(this.pointAt(i / segments));
    return pts;
  }

  area() { return Math.PI * (this.width / 2) * (this.depth / 2); }

  toMesh(color) {
    const pts = this.toPoints(64).map(p => p.toThree());
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || 0xf9e2af, linewidth: 2 }));
  }

  toString() { return `Ellipse3(w=${this.width.toFixed(2)}, d=${this.depth.toFixed(2)}, c=${this.center})`; }

}



// ── Plane ──

class _Plane {

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

}



// ── Mesh3 — generic triangulated mesh ──

class _Mesh3 {

  constructor(vertices, faces, color) {

    this.vertices = vertices || []; // Geo.Point3[]

    this.faces = faces || [];       // [i, j, k][]

    this.color = color || 0x89b4fa;

    this._type = 'Mesh3';

  }

  vertexCount() { return this.vertices.length; }

  faceCount() { return this.faces.length; }
  getCenter() {
    if (this.vertices.length === 0) return new Geo.Point3(0,0,0);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < this.vertices.length; i++) { cx += this.vertices[i].x; cy += this.vertices[i].y; cz += this.vertices[i].z; }
    return new Geo.Point3(cx/this.vertices.length, cy/this.vertices.length, cz/this.vertices.length);
  }

  toThreeGeometry() {

    const g = new THREE.BufferGeometry();

    const verts = new Float32Array(this.vertices.length * 3);

    this.vertices.forEach((v, i) => { verts[i*3] = v.x; verts[i*3+1] = v.z; verts[i*3+2] = v.y; }); // Y-up swap

    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));

    if (this.faces.length) {

      const idx = []; this.faces.forEach(f => idx.push(f[0], f[1], f[2]));

      g.setIndex(idx);

    }

    // Crease-angle normals: smooth where adjacent faces meet shallowly,
    // hard otherwise — fixes the amorphous look at sharp extrusion corners.
    return Geo._applyCreaseNormals(g, 30);

  }

  toMesh(color) {

    const g = this.toThreeGeometry();

    const c = color || this.color;

    // Clay-like Phong, opaque queue so depth writes are on (transparent + DoubleSide caused front/back z-fighting flicker during orbit).
    const mat = new THREE.MeshPhongMaterial({ color: c, transparent: false, opacity: 1.0, side: THREE.DoubleSide, flatShading: false, shininess: 18, specular: 0x252538 });

    mat.polygonOffset = true;

    mat.polygonOffsetFactor = 1;

    mat.polygonOffsetUnits = 1;

    const mesh = new THREE.Mesh(g, mat);

    mesh.userData.isMeshBody = true;

    // EdgesGeometry: only emits edges where the dihedral angle > 30°. A box gets its 12 corners, a sphere gets nothing, parametric surfaces show their boundary curves.
    const edges = new THREE.EdgesGeometry(g, 30);

    const eMat = new THREE.LineBasicMaterial({ color: 0x313244, linewidth: 1, transparent: true, opacity: 0.7 });

    const edgeLines = new THREE.LineSegments(edges, eMat);

    edgeLines.userData.isMeshEdges = true;

    edgeLines.visible = !(typeof window !== 'undefined' && window.Viewer3D && window.Viewer3D._edgesVisible === false);

    const group = new THREE.Group();

    group.add(mesh);

    group.add(edgeLines);

    return group;

  }

  // ── groupFaces ──────────────────────────────────────────────────────────
  // Groups triangles into coplanar face-groups by comparing normals.
  // Two triangles merge when dot(nA, nB) > 0.999 (same direction) OR when
  // they lie on the same supporting plane with antiparallel normals (checked by
  // also testing abs-dot AND verifying that a vertex from the new triangle lies
  // on the existing group's plane within a small tolerance). This way a Box
  // produces 6 groups (one per face square), not 3 (collapsed axis pairs) and
  // not 12 (one per triangle).
  // Returns Array<{ triangleIndices: number[], normal: [nx,ny,nz], d: number }>.
  groupFaces() {
    const groups = [];
    for (let ti = 0; ti < this.faces.length; ti++) {
      const f = this.faces[ti];
      const v0 = this.vertices[f[0]], v1 = this.vertices[f[1]], v2 = this.vertices[f[2]];
      // Edge vectors in Geo space
      const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
      const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
      // Cross product → triangle normal
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // Plane offset (signed distance from origin along normal)
      const d = nx * v0.x + ny * v0.y + nz * v0.z;
      // Find an existing group whose supporting plane is the same:
      // normals must be nearly parallel (dot > 0.999) AND same plane offset.
      // Using same-plane-offset check (|d - gd| < 1e-4) means that two parallel
      // but spatially distinct faces (e.g. top vs bottom of a box) stay in
      // separate groups even when normals are exactly antiparallel.
      let matched = false;
      for (let gi = 0; gi < groups.length; gi++) {
        const gn = groups[gi].normal;
        const gd = groups[gi].d;
        const dot = nx * gn[0] + ny * gn[1] + nz * gn[2];
        // Same-direction normals on the same plane: standard case (2 triangles per quad).
        if (dot > 0.999 && Math.abs(d - gd) < 1e-4) {
          groups[gi].triangleIndices.push(ti);
          matched = true;
          break;
        }
        // Opposite-winding normals on the same plane (e.g. boolean-result faces):
        // dot ≈ -1 AND the plane offsets are equal-magnitude-but-opposite-sign.
        if (dot < -0.999 && Math.abs(d + gd) < 1e-4) {
          groups[gi].triangleIndices.push(ti);
          matched = true;
          break;
        }
      }
      if (!matched) {
        groups.push({ triangleIndices: [ti], normal: [nx, ny, nz], d });
      }
    }
    return groups;
  }

  // ── toSelectionMesh ────────────────────────────────────────────────────
  // Builds a THREE.Mesh with one BufferGeometry group per face-group so
  // individual faces can be highlighted by switching material color/opacity.
  // Applies the same Y/Z coordinate swap as toThreeGeometry().
  // Returns { mesh, materials, faceGroups, triangleToGroup }.
  toSelectionMesh(faceGroups) {
    if (!faceGroups) faceGroups = this.groupFaces();

    // Flat position array (Y/Z swap to match toThreeGeometry)
    const verts = new Float32Array(this.vertices.length * 3);
    this.vertices.forEach((v, i) => {
      verts[i * 3]     = v.x;
      verts[i * 3 + 1] = v.z; // Y-up swap
      verts[i * 3 + 2] = v.y;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));

    // Build triangle index array ordered by group; track each group's slice.
    // triangleToGroup is built as a parallel array so its indices match
    // hit.faceIndex (the triangle's position in the reordered buffer), not
    // the original face indices. Each push to indexArr is accompanied by a
    // push of the owning group index so the two arrays stay in sync.
    const indexArr = [];
    const triangleToGroup = [];
    for (let gi = 0; gi < faceGroups.length; gi++) {
      const startOffset = indexArr.length;
      const tris = faceGroups[gi].triangleIndices;
      for (let k = 0; k < tris.length; k++) {
        const f = this.faces[tris[k]];
        indexArr.push(f[0], f[1], f[2]);
        triangleToGroup.push(gi);
      }
      const count = indexArr.length - startOffset;
      geometry.addGroup(startOffset, count, gi);
    }
    geometry.setIndex(indexArr);
    geometry.computeVertexNormals();

    // One independent material per group (teal base color, polygon-offset so it
    // renders just above the underlying solid without z-fighting).
    // MeshBasicMaterial is used instead of MeshPhongMaterial so face colors are
    // completely unaffected by scene lighting — no shadows or specular highlights,
    // just flat solid teal/blue/green as the PM requires.
    const baseMat = new THREE.MeshBasicMaterial({
      color: 0x94e2d5,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    const materials = faceGroups.map(() => baseMat.clone());

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.userData.isSelectionMesh = true;

    return { mesh, materials, faceGroups, triangleToGroup };
  }

  // ── getFaceVertices ────────────────────────────────────────────────────
  // Returns unique vertex positions for the face-group at faceGroupIndex.
  // Deduplicates by stringified coordinate (tolerance 1e-6 via toFixed(6)).
  // Returns raw Geo coordinates — NO Y/Z swap.
  getFaceVertices(faceGroupIndex, faceGroups) {
    if (!faceGroups) faceGroups = this.groupFaces();
    const group = faceGroups[faceGroupIndex];
    if (!group) return [];
    const seen = new Set();
    const result = [];
    for (let k = 0; k < group.triangleIndices.length; k++) {
      const f = this.faces[group.triangleIndices[k]];
      for (let vi = 0; vi < 3; vi++) {
        const v = this.vertices[f[vi]];
        const key = v.x.toFixed(6) + ',' + v.y.toFixed(6) + ',' + v.z.toFixed(6);
        if (!seen.has(key)) {
          seen.add(key);
          result.push([v.x, v.y, v.z]);
        }
      }
    }
    return result;
  }

  toString() { return `Mesh3(${this.vertices.length} verts, ${this.faces.length} faces)`; }

}

const Geo = {

  // Classes
  Curve3: _Curve3,
  Point3: _Point3,
  Vector3: _Vector3,
  Line3: _Line3,
  Polyline3: _Polyline3,
  Arc3: _Arc3,
  Circle3: _Circle3,
  Ellipse3: _Ellipse3,
  Plane: _Plane,
  Mesh3: _Mesh3,


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

    for (let ring = 0; ring <= 1; ring++) {

      const z = baseCenter.z + ring * height;

      for (let i = 0; i <= segments; i++) {

        const a = 2 * Math.PI * i / segments;

        verts.push(new Geo.Point3(baseCenter.x + radius * Math.cos(a), baseCenter.y + radius * Math.sin(a), z));

      }

    }

    const n = segments + 1;

    for (let i = 0; i < segments; i++) {

      faces.push([i, i+n, i+1]); faces.push([i+1, i+n, i+n+1]);

    }

    const bc = verts.length; verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z));

    const tc = verts.length; verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z + height));

    for (let i = 0; i < segments; i++) {

      faces.push([bc, i+1, i]);

      faces.push([tc, i+n, i+n+1]);

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

    for (let i = 0; i <= segments; i++) {

      const a = 2 * Math.PI * i / segments;

      verts.push(new Geo.Point3(baseCenter.x + radius * Math.cos(a), baseCenter.y + radius * Math.sin(a), baseCenter.z));

    }

    const apex = verts.length;

    verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z + height));

    const bc = verts.length;

    verts.push(new Geo.Point3(baseCenter.x, baseCenter.y, baseCenter.z));

    for (let i = 0; i < segments; i++) {

      faces.push([i, apex, i+1]);

      faces.push([bc, i+1, i]);

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



  // ── Helper: extract point array from any curve ──

  _curveToPoints(curve, count) {
    if (Array.isArray(curve)) return curve;
    if (curve._type === 'Polyline3') return curve.points;
    if (curve._type === 'Circle3' || curve._type === 'Arc3' || curve._type === 'Ellipse3') return curve.toPoints ? curve.toPoints(count || 48) : [];
    if (curve._type === 'Line3') return [curve.start, curve.end];
    const segs = count || 32;
    const pts = [];
    for (let i = 0; i <= segs; i++) { pts.push(curve.pointAt(i / segs)); }
    return pts;
  },

  // ── Extrude ──

  extrude(curve, vector) {

    if (!curve || !vector) return null;

    const pts = curve instanceof _Curve3 ? Geo._curveToPoints(curve) : (Array.isArray(curve) ? curve : []);
    if (pts.length < 2) return null;

    const n = pts.length;
    const verts = [];
    pts.forEach(p => verts.push(p.clone()));
    pts.forEach(p => verts.push(p.add(vector)));

    const faces = [];
    for (let i = 0; i < n - 1; i++) {
      faces.push([i, i+n, i+1]);
      faces.push([i+1, i+n, i+n+1]);
    }
    if (curve.closed || curve._type === 'Circle3') {
      faces.push([n-1, n-1+n, 0]);
      faces.push([0, n-1+n, n]);
    }
    const m = new Geo.Mesh3(verts, faces, 0x89b4fa);
    m._solidType = 'Extrusion';
    return m;
  },

  // ── Revolve ──

  revolve(curve, axisOrigin, axisDir, angle, segments) {

    if (!curve) return null;
    angle = angle || Math.PI * 2;
    segments = segments || 32;
    const pts = curve instanceof _Curve3 ? Geo._curveToPoints(curve) : (Array.isArray(curve) ? curve : []);
    if (pts.length < 2) return null;

    axisOrigin = axisOrigin || new Geo.Point3(0,0,0);
    axisDir = (axisDir || new Geo.Vector3(0,0,1)).normalize();
    const n = pts.length;
    const verts = [];

    for (let s = 0; s <= segments; s++) {
      const a = angle * s / segments;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      pts.forEach(p => {
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

  // ── Loft ──

  loft(profiles) {

    if (!profiles || profiles.length < 2) return null;
    const rings = profiles.map(p => {
      if (p instanceof _Curve3) return Geo._curveToPoints(p);
      if (Array.isArray(p)) return p;
      return [];
    }).filter(r => r.length > 0);
    if (rings.length < 2) return null;

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

    if (!isClosed && cleaned.length > 0 && cleaned[0].length > 12) {
      var ring = cleaned[0];
      var f = ring[0], l = ring[ring.length - 1];
      if (f && l && f.distanceTo) {
        var gap = f.distanceTo(l);
        var seg = f.distanceTo(ring[1]);
        if (gap < seg * 3) isClosed = true;
      }
    }

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
      if (isClosed) {
        const a = r * n + (n - 1), b = (r+1) * n + (n - 1);
        faces.push([a, b, r * n]); faces.push([r * n, b, (r+1) * n]);
      }
    }
    const m = new Geo.Mesh3(verts, faces, 0x94e2d5);
    m._solidType = 'Loft';
    return m;
  },

  // ── Offset curve ──

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
    if (geometry instanceof _Curve3) {
      if (geometry._type === 'Line3') return new Geo.Line3(geometry.start.add(vector), geometry.end.add(vector));
      if (geometry._type === 'Polyline3') return new Geo.Polyline3(geometry.points.map(p => p.add(vector)), geometry.closed);
      if (geometry._type === 'Circle3') return new Geo.Circle3(geometry.center.add(vector), geometry.radius, geometry.normal);
      if (geometry._type === 'Arc3') return new Geo.Arc3(geometry.center.add(vector), geometry.radius, geometry.startAngle, geometry.endAngle, geometry.normal);
      if (geometry._type === 'Ellipse3') return new Geo.Ellipse3(geometry.center.add(vector), geometry.width, geometry.depth, geometry.normal, geometry.xAxis);
    }
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
    if (geometry instanceof _Curve3) {
      if (geometry._type === 'Line3') return new Geo.Line3(scalePoint(geometry.start), scalePoint(geometry.end));
      if (geometry._type === 'Polyline3') return new Geo.Polyline3(geometry.points.map(scalePoint), geometry.closed);
      if (geometry._type === 'Circle3') return new Geo.Circle3(scalePoint(geometry.center), geometry.radius * factor, geometry.normal);
      if (geometry._type === 'Arc3') return new Geo.Arc3(scalePoint(geometry.center), geometry.radius * factor, geometry.startAngle, geometry.endAngle, geometry.normal);
      if (geometry._type === 'Ellipse3') return new Geo.Ellipse3(scalePoint(geometry.center), geometry.width * factor, geometry.depth * factor, geometry.normal, geometry.xAxis);
    }
    if (geometry._type === 'Mesh3') {
      const m = new Geo.Mesh3(geometry.vertices.map(scalePoint), geometry.faces.slice(), geometry.color);
      m._solidType = geometry._solidType;
      return m;
    }
    return geometry;
  },



  // ── Boolean operations ──

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

  booleanIntersect(meshA, meshB) {
    if (!meshA) return meshB;
    const m = new Geo.Mesh3(meshA.vertices.map(v => v.clone()), meshA.faces.slice(), 0xf9e2af);
    m._solidType = 'BooleanIntersect';
    return m;
  },

  booleanSubtract(meshA, meshB) {
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

  // RENDERING HELPER

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

      const g = new THREE.SphereGeometry(0.12, 16, 12);

      const m = new THREE.MeshPhongMaterial({ color: color || 0x89b4fa, emissive: color || 0x89b4fa, emissiveIntensity: 0.4, shininess: 60 });

      const mesh = new THREE.Mesh(g, m);

      mesh.position.copy(geoObj.toThree());

      group.add(mesh);

    } else if (Array.isArray(geoObj)) {

      geoObj.forEach(item => {

        if (item && item._type) Geo.addToScene(group, item, color);

        else if (item instanceof Geo.Point3) Geo.addToScene(group, item, color);

      });

    }

  },

  distanceBetween(geoA, geoB) {
    if (!geoA || !geoB) return 0;
    var centerA = typeof geoA.getCenter === 'function' ? geoA.getCenter() : geoA;
    var centerB = typeof geoB.getCenter === 'function' ? geoB.getCenter() : geoB;
    if (centerA && centerB && typeof centerA.distanceTo === 'function') {
      return centerA.distanceTo(centerB);
    }
    return 0;
  },

  // Crease-angle vertex normals. Adjacent faces are smoothed when their
  // dihedral angle is below `angleDeg`, otherwise the edge stays hard —
  // a single mesh therefore renders smooth on curved regions and faceted
  // on prismatic ones (Rhino-style).
  _applyCreaseNormals(geometry, angleDeg) {
    if (typeof THREE === 'undefined' || !geometry) return geometry;
    var threshold = Math.cos(((angleDeg == null ? 30 : angleDeg)) * Math.PI / 180);
    var g = geometry.index ? geometry.toNonIndexed() : geometry;
    var pos = g.attributes.position.array;
    var triCount = pos.length / 9;
    if (triCount === 0) return g;

    var faceN = new Float32Array(triCount * 3);
    for (var t = 0; t < triCount; t++) {
      var ax = pos[t*9],   ay = pos[t*9+1], az = pos[t*9+2];
      var bx = pos[t*9+3], by = pos[t*9+4], bz = pos[t*9+5];
      var cx = pos[t*9+6], cy = pos[t*9+7], cz = pos[t*9+8];
      var ex = bx - ax, ey = by - ay, ez = bz - az;
      var fx = cx - ax, fy = cy - ay, fz = cz - az;
      var nx = ey*fz - ez*fy;
      var ny = ez*fx - ex*fz;
      var nz = ex*fy - ey*fx;
      var fl = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
      faceN[t*3] = nx/fl; faceN[t*3+1] = ny/fl; faceN[t*3+2] = nz/fl;
    }

    // Bucket every triangle-vertex by its rounded position.
    var buckets = new Map();
    for (var ti = 0; ti < triCount; ti++) {
      for (var v = 0; v < 3; v++) {
        var i = ti*9 + v*3;
        var key = pos[i].toFixed(5) + ',' + pos[i+1].toFixed(5) + ',' + pos[i+2].toFixed(5);
        var bucket = buckets.get(key);
        if (!bucket) { bucket = []; buckets.set(key, bucket); }
        bucket.push(ti * 3 + v); // packed (triIdx, vertOffset)
      }
    }

    var vN = new Float32Array(pos.length);
    buckets.forEach(function(refs) {
      for (var k = 0; k < refs.length; k++) {
        var refTri = (refs[k] / 3) | 0;
        var mx = faceN[refTri*3], my = faceN[refTri*3+1], mz = faceN[refTri*3+2];
        var sx = 0, sy = 0, sz = 0;
        for (var j = 0; j < refs.length; j++) {
          var otherTri = (refs[j] / 3) | 0;
          var ox = faceN[otherTri*3], oy = faceN[otherTri*3+1], oz = faceN[otherTri*3+2];
          if (mx*ox + my*oy + mz*oz >= threshold) {
            sx += ox; sy += oy; sz += oz;
          }
        }
        var l = Math.sqrt(sx*sx + sy*sy + sz*sz) || 1;
        var idx = refs[k] * 3; // (triIdx*3 + v) * 3 — same as triIdx*9 + v*3
        vN[idx] = sx/l; vN[idx+1] = sy/l; vN[idx+2] = sz/l;
      }
    });

    g.setAttribute('normal', new THREE.BufferAttribute(vN, 3));
    return g;
  }

};



// Make globally accessible

if (typeof window !== 'undefined') {
  window.Geo = Geo;
}

export { Geo };
export default Geo;