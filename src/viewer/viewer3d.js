export const Viewer3D = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  gridHelper: null,
  axisHelper: null,
  geometryGroup: null,
  isInitialized: false,
  isUnavailable: false,
  isVisible: false,
  animFrameId: null,
  _gridVisible: true,
  _axesVisible: true,
  _wireframeVisible: false,

  init(container) {
    if (this.isInitialized) return;
    if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
      this.isUnavailable = true;
      this.isInitialized = true;
      console.warn('[NodeFlow] 3D viewer disabled: Three.js is not available');
      return;
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e2e);
    // Pulled the fog density back so the grid and distant geometry don't fade out before they're useful.
    this.scene.fog = new THREE.FogExp2(0x1e1e2e, 0.0007);
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
    // Brighter grid — the previous values were almost the background colour.
    this.gridHelper = new THREE.GridHelper(100, 100, 0x6c7086, 0x45475a);
    if (this.gridHelper.material) {
      this.gridHelper.material.transparent = true;
      this.gridHelper.material.opacity = 0.85;
    }
    this.gridHelper.visible = this._gridVisible;
    this.scene.add(this.gridHelper);
    this.axisHelper = new THREE.AxesHelper(10);
    if (this.axisHelper.material) this.axisHelper.material.depthTest = false;
    this.axisHelper.renderOrder = 999;
    this.axisHelper.visible = this._axesVisible;
    this.scene.add(this.axisHelper);
    this._installOverlay(container);
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
    if (this._overlay) this._overlay.style.display = 'flex';
    this.animate();
    if (this._onResize) this._onResize();
  },

  hide() {
    this.isVisible = false;
    if (this.renderer) this.renderer.domElement.style.display = 'none';
    if (this._overlay) this._overlay.style.display = 'none';
    if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
  },

  setGridVisible(v) {
    this._gridVisible = !!v;
    if (this.gridHelper) this.gridHelper.visible = this._gridVisible;
  },

  setAxesVisible(v) {
    this._axesVisible = !!v;
    if (this.axisHelper) this.axisHelper.visible = this._axesVisible;
  },

  setWireframeVisible(v) {
    this._wireframeVisible = !!v;
    if (!this.geometryGroup) return;
    this.geometryGroup.traverse(function(obj) {
      if (obj.userData && obj.userData.isMeshWireframe) obj.visible = !!v;
    });
  },

  _installOverlay(container) {
    if (typeof document === 'undefined' || !container) return;
    if (this._overlay) return;
    var overlay = document.createElement('div');
    overlay.className = 'viewer3d-overlay';
    overlay.style.cssText = 'position:absolute;top:50px;right:12px;z-index:8;display:none;flex-direction:column;gap:4px;background:rgba(30,30,46,0.78);border:1px solid var(--border, #45475a);border-radius:6px;padding:8px 10px;backdrop-filter:blur(6px);font-size:11px;color:var(--text, #cdd6f4);pointer-events:auto;user-select:none;';
    overlay.innerHTML = '<div style="font-weight:700;letter-spacing:0.4px;color:var(--text-muted,#a6adc8);font-size:9px;text-transform:uppercase;margin-bottom:2px;">View</div>';

    var self = this;
    function row(labelText, key, initial) {
      var lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;line-height:1.2;';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!initial;
      cb.style.cssText = 'accent-color:var(--accent-blue,#89b4fa);margin:0;';
      cb.addEventListener('change', function() {
        if (key === 'grid') self.setGridVisible(cb.checked);
        else if (key === 'axes') self.setAxesVisible(cb.checked);
        else if (key === 'wireframe') self.setWireframeVisible(cb.checked);
      });
      var span = document.createElement('span');
      span.textContent = labelText;
      lbl.appendChild(cb);
      lbl.appendChild(span);
      overlay.appendChild(lbl);
    }
    row('Grid', 'grid', this._gridVisible);
    row('Axes', 'axes', this._axesVisible);
    row('Wireframe', 'wireframe', this._wireframeVisible);

    container.appendChild(overlay);
    this._overlay = overlay;
  },

  animate() {
    if (!this.isVisible || this.isUnavailable || !this.controls || !this.renderer) return;
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
    size = size || 0.12;
    if (points.length > 1000) {
      const geo = new THREE.SphereGeometry(size, 10, 8);
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
      const geo = new THREE.SphereGeometry(size, 16, 12);
      const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.4, shininess: 60 });
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
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
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
    // Crease-angle normals — matches Mesh3.toThreeGeometry so sharp edges
    // stay sharp while curved regions still get smooth shading.
    const Geo = (typeof window !== 'undefined' && window.Geo) || null;
    const shadedGeo = (Geo && typeof Geo._applyCreaseNormals === 'function')
      ? Geo._applyCreaseNormals(geo, 30)
      : (geo.computeVertexNormals(), geo);
    const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, flatShading: false, shininess: 35 });
    const meshObj = new THREE.Mesh(shadedGeo, mat);
    meshObj.userData.isMeshBody = true;
    this.geometryGroup.add(meshObj);
    const wire = new THREE.WireframeGeometry(shadedGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x45475a, linewidth: 1, transparent: true, opacity: 0.45 });
    const wireLines = new THREE.LineSegments(wire, wireMat);
    wireLines.userData.isMeshWireframe = true;
    wireLines.visible = !!this._wireframeVisible;
    this.geometryGroup.add(wireLines);
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
      const m = val.match(/\(([-\d.]+),\s*([\d.]+),\s*([\d.]+)\)/);
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
