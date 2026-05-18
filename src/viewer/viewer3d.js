export const Viewer3D = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  gridHelper: null,
  axisHelper: null,
  geometryGroup: null,
  isInitialized: false,
  isVisible: false,
  animFrameId: null,

  init(container) {
    if (this.isInitialized) return;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e2e);
    this.scene.fog = new THREE.FogExp2(0x1e1e2e, 0.002);
    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
    this.camera.position.set(30, 25, 30);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI;
    this.gridHelper = new THREE.GridHelper(100, 100, 0x313244, 0x252538);
    this.scene.add(this.gridHelper);
    this.axisHelper = new THREE.AxesHelper(10);
    this.scene.add(this.axisHelper);
    const ambient = new THREE.AmbientLight(0x89b4fa, 0.4);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 30, 20);
    this.scene.add(dirLight);
    const hemiLight = new THREE.HemisphereLight(0x89b4fa, 0x1e1e2e, 0.3);
    this.scene.add(hemiLight);
    this.geometryGroup = new THREE.Group();
    this.scene.add(this.geometryGroup);
    this._onResize = () => {
      if (!this.isVisible) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
    this.isInitialized = true;
  },

  show() {
    this.isVisible = true;
    if (this.renderer) this.renderer.domElement.style.display = 'block';
    this.animate();
    this._onResize();
  },

  hide() {
    this.isVisible = false;
    if (this.renderer) this.renderer.domElement.style.display = 'none';
    if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
  },

  animate() {
    if (!this.isVisible) return;
    this.animFrameId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  },

  clearGeometry() {
    if (!this.geometryGroup) return;
    while (this.geometryGroup.children.length > 0) {
      const obj = this.geometryGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      this.geometryGroup.remove(obj);
    }
  },

  addPoints(points, color, size) {
    if (!this.scene || !points.length) return;
    color = color || 0x89b4fa;
    size = size || 0.3;
    if (points.length > 1000) {
      const geo = new THREE.SphereGeometry(size, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.InstancedMesh(geo, mat, points.length);
      const dummy = new THREE.Object3D();
      points.forEach((p, i) => {
        dummy.position.set(p[0] || 0, p[2] || 0, p[1] || 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.geometryGroup.add(mesh);
    } else {
      const geo = new THREE.SphereGeometry(size, 8, 8);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
      points.forEach(p => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p[0] || 0, p[2] || 0, p[1] || 0);
        this.geometryGroup.add(mesh);
      });
    }
  },

  addLines(lineSegments, color) {
    if (!this.scene || !lineSegments.length) return;
    color = color || 0xa6e3a1;
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    lineSegments.forEach(seg => {
      if (!seg.start || !seg.end) return;
      const pts = [
        new THREE.Vector3(seg.start[0] || 0, seg.start[2] || 0, seg.start[1] || 0),
        new THREE.Vector3(seg.end[0] || 0, seg.end[2] || 0, seg.end[1] || 0)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.geometryGroup.add(new THREE.Line(geo, mat));
    });
  },

  addCircle(center, radius, color, segments) {
    if (!this.scene) return;
    color = color || 0xf9e2af;
    segments = segments || 64;
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI, false, 0);
    const pts = curve.getPoints(segments);
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, 0, p.y)));
    const mat = new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geo, mat);
    line.position.set(center[0] || 0, center[2] || 0, center[1] || 0);
    this.geometryGroup.add(line);
  },

  addMesh(vertices, faces, color) {
    if (!this.scene || !vertices.length) return;
    color = color || 0x89b4fa;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(vertices.length * 3);
    vertices.forEach((v, i) => {
      verts[i * 3] = v[0] || 0;
      verts[i * 3 + 1] = v[2] || 0;
      verts[i * 3 + 2] = v[1] || 0;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    if (faces && faces.length) {
      const indices = [];
      faces.forEach(f => { indices.push(f[0], f[1], f[2]); });
      geo.setIndex(indices);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, flatShading: true });
    this.geometryGroup.add(new THREE.Mesh(geo, mat));
    const wire = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x45475a, linewidth: 1 });
    this.geometryGroup.add(new THREE.LineSegments(wire, wireMat));
  },

  addPointGrid(rows, cols, spacing, color) {
    const points = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        points.push([c * spacing - (cols - 1) * spacing / 2, r * spacing - (rows - 1) * spacing / 2, 0]);
      }
    }
    this.addPoints(points, color || 0x89b4fa, spacing * 0.15);
  },

  loadGLTF(url, onDone) {
    if (!this.scene) return;
    const loader = new THREE.GLTFLoader();
    loader.load(url, gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 20 / maxDim;
        model.scale.multiplyScalar(scale);
      }
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center.multiplyScalar(model.scale.x));
      this.geometryGroup.add(model);
      if (onDone) onDone(model);
    });
  },

  fitAll() {
    if (!this.geometryGroup || this.geometryGroup.children.length === 0) return;
    const box = new THREE.Box3().setFromObject(this.geometryGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 10;
    this.camera.position.set(center.x + maxDim, center.y + maxDim * 0.8, center.z + maxDim);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
  },

  parsePoint(val) {
    if (typeof val === 'string') {
      const m = val.match(/\(\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)/);
      return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : null;
    }
    if (Array.isArray(val) && val.length >= 2) return val.map(Number);
    return null;
  },

  getConnectedPoint(nodes, wires, nodeId, portId, computeFn) {
    const wire = wires.find(w => w.toNode === nodeId && w.toPort === portId);
    if (!wire) return null;
    const srcNode = nodes.find(n => n.id === wire.fromNode);
    if (!srcNode) return null;
    return this.parsePoint(computeFn(srcNode));
  },

  getConnectedNumber(nodes, wires, nodeId, portId, computeFn) {
    const wire = wires.find(w => w.toNode === nodeId && w.toPort === portId);
    if (!wire) return null;
    const srcNode = nodes.find(n => n.id === wire.fromNode);
    if (!srcNode) return null;
    const val = computeFn(srcNode);
    return typeof val === 'number' ? val : null;
  },

  buildFromGraph(nodes, wires, computeFn) {
    this.clearGeometry();
    nodes.forEach(nd => {
      try {
        const val = computeFn(nd);
        if (nd.type === 'geo-point') {
          const pt = this.parsePoint(val);
          if (pt) this.addPoints([pt], 0x89b4fa, 0.4);
        }
        if (nd.type === 'geo-line') {
          const pA = this.getConnectedPoint(nodes, wires, nd.id, 'start', computeFn);
          const pB = this.getConnectedPoint(nodes, wires, nd.id, 'end', computeFn);
          if (pA && pB) {
            this.addLines([{ start: pA, end: pB }], 0xa6e3a1);
            this.addPoints([pA, pB], 0x89b4fa, 0.3);
          }
        }
        if (nd.type === 'geo-distance') {
          const pA = this.getConnectedPoint(nodes, wires, nd.id, 'a', computeFn);
          const pB = this.getConnectedPoint(nodes, wires, nd.id, 'b', computeFn);
          if (pA && pB) {
            this.addLines([{ start: pA, end: pB }], 0xf9e2af);
            this.addPoints([pA, pB], 0x89b4fa, 0.3);
          }
        }
        if (nd.type === 'geo-circle') {
          const center = this.getConnectedPoint(nodes, wires, nd.id, 'center', computeFn) || [0,0,0];
          const radius = this.getConnectedNumber(nodes, wires, nd.id, 'radius', computeFn) || 5;
          this.addCircle(center, radius, 0xf9e2af);
          this.addPoints([center], 0x89b4fa, 0.3);
        }
        if (nd.type === 'geo-vector') {
          const pt = this.parsePoint(val);
          if (pt) {
            this.addLines([{ start: [0,0,0], end: pt }], 0x94e2d5);
            this.addPoints([pt], 0x94e2d5, 0.3);
          }
        }
        if (val !== undefined && val !== null) {
          if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0]) && val[0].length >= 2) {
            this.addPoints(val, 0x94e2d5, 0.25);
            if (val.length >= 2 && val.length <= 5000) {
              const segs = [];
              for (let i = 0; i < val.length - 1; i++) {
                segs.push({ start: val[i], end: val[i+1] });
              }
              this.addLines(segs, 0x94e2d5);
            }
          }
        }
      } catch (e) {
        /* skip failed nodes */
      }
    });
  }
};
