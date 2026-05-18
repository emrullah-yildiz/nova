// ============================================
Nova
// NODEFLOW AI — Geometry Viewer Patch

// Extends Viewer3D.buildFromGraph to render Geo objects

// Also extends app.computeNodeValue for new node types

// ============================================



document.addEventListener('DOMContentLoaded', () => {



  // ══════════════════════════════════════

  // COMPUTATION CACHE — prevents exponential re-evaluation

  //

  // Problem: computeNodeValue() recursively traverses upstream.

  // If node A feeds B and C, A is computed twice. With deep

  // graphs this grows exponentially (O(2^depth)).

  //

  // Solution: A per-cycle cache Map<nodeId, result>.

  // - Populated on first compute, returned on subsequent hits

  // - Cleared at the start of each evaluation cycle

  //   (buildFromGraph, runGraph, setView, toggleDataPanel)

  // - Also tracks "in-progress" nodes for cycle detection

  // ══════════════════════════════════════



  // Sentinel value: distinguishes "not yet computed" from "computed but returned undefined"

  const _CACHE_UNDEFINED = Symbol('CACHE_UNDEFINED');

  // Sentinel value: node is currently being computed (cycle detection)

  const _CACHE_COMPUTING = Symbol('CACHE_COMPUTING');



  // The cache itself — Map<string, any>

  app._computeCache = null;

  // Counter: tracks nested evaluation cycles to avoid clearing mid-evaluation

  app._computeDepth = 0;



  // Start a new evaluation cycle — call before any batch of computeNodeValue calls

  app.beginCompute = function() {

    if (this._computeDepth === 0) {

      this._computeCache = new Map();

    }

    this._computeDepth++;

  };



  // End an evaluation cycle

  app.endCompute = function() {

    this._computeDepth--;

    if (this._computeDepth <= 0) {

      this._computeCache = null;

      this._computeDepth = 0;

    }

  };



  // Invalidate the cache (call when graph structure changes)

  app.invalidateCompute = function() {

    this._computeCache = null;

    this._computeDepth = 0;

  };



  // ── Patch buildFromGraph to handle Geo objects ──

  const origBuildFromGraph = Viewer3D.buildFromGraph.bind(Viewer3D);



  // Node types that just pass through values — should NOT render in 3D

  const PASSTHROUGH_TYPES = new Set([

    'output-watch', 'output-display', 'output-log', 'output-chart', 'output-export',

    'number-input', 'text-input', 'boolean-input', 'slider-input', 'integer-input',

    'math-add', 'math-subtract', 'math-multiply', 'math-divide', 'math-power',

    'logic-and', 'logic-or', 'logic-not', 'logic-compare', 'logic-if',

    'list-get', 'list-length', 'list-range', 'list-reverse', 'list-create',

    'custom-code', 'custom-formula', 'custom-comment', 'custom-ainode',

    'revit-collect-category', 'revit-collect-type', 'revit-active-view', 'revit-selection',

    'revit-all-levels', 'revit-all-sheets', 'revit-get-param', 'revit-set-param',

    'revit-get-element-name', 'revit-get-element-id', 'revit-get-type-name',

    'revit-filter-param', 'revit-for-each', 'revit-batch-set-param',

    'revit-delete-elements', 'revit-export-data'

  ]);



  Viewer3D.buildFromGraph = function(nodes, wires, computeFn) {

    this.clearGeometry();

    // Start a cached evaluation cycle for the entire 3D build

    app.beginCompute();



    nodes.forEach(nd => {

      try {

        // Skip nodes with 3D preview disabled

        if (nd._preview3d === false) return;



        // Skip pass-through nodes that don't create geometry

        // (they just forward values — rendering them duplicates geometry)

        if (PASSTHROUGH_TYPES.has(nd.type)) return;



        const val = computeFn(nd);

        if (val === undefined || val === null) return;



        // ── Geo library objects ──

        if (val && val._type) {

          Geo.addToScene(this.geometryGroup, val);

          return;

        }



        // ── Array of Geo objects ──

        if (Array.isArray(val) && val.length > 0 && val[0] && val[0]._type) {

          val.forEach(item => Geo.addToScene(this.geometryGroup, item));

          return;

        }



        // ── Array of Point3 ──

        if (Array.isArray(val) && val.length > 0 && val[0] instanceof Geo.Point3) {

          const pts = val.map(p => [p.x, p.y, p.z]);

          this.addPoints(pts, 0x94e2d5, 0.15);

          // Only connect as polyline for Polyline/curve nodes — NOT for grids or generic arrays

          // Point Grid, Surface Grid inputs, etc. should just show dots

          return;

        }



        // ── Legacy: old tuple-based geometry ──

        // Point node

        if (nd.type === 'geo-point') {

          const pt = this.parsePoint(val);

          if (pt) this.addPoints([pt], 0x89b4fa, 0.4);

        }



        // Line node

        if (nd.type === 'geo-line') {

          const pA = this.getConnectedPoint(nodes, wires, nd.id, 'start', computeFn);

          const pB = this.getConnectedPoint(nodes, wires, nd.id, 'end', computeFn);

          if (pA && pB) {

            this.addLines([{ start: pA, end: pB }], 0xa6e3a1);

            this.addPoints([pA, pB], 0x89b4fa, 0.3);

          }

        }



        // Distance node

        if (nd.type === 'geo-distance') {

          const pA = this.getConnectedPoint(nodes, wires, nd.id, 'a', computeFn);

          const pB = this.getConnectedPoint(nodes, wires, nd.id, 'b', computeFn);

          if (pA && pB) { this.addLines([{ start: pA, end: pB }], 0xf9e2af); this.addPoints([pA, pB], 0x89b4fa, 0.3); }

        }



        // Circle node

        if (nd.type === 'geo-circle') {

          const center = this.getConnectedPoint(nodes, wires, nd.id, 'center', computeFn) || [0,0,0];

          const radius = this.getConnectedNumber(nodes, wires, nd.id, 'radius', computeFn) || 5;

          this.addCircle(center, radius, 0xf9e2af);

          this.addPoints([center], 0x89b4fa, 0.3);

        }



        // Vector node

        if (nd.type === 'geo-vector') {

          const pt = this.parsePoint(val);

          if (pt) { this.addLines([{ start: [0,0,0], end: pt }], 0x94e2d5); this.addPoints([pt], 0x94e2d5, 0.3); }

        }



        // Legacy: array of tuples — render as points only

        if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0]) && val[0].length >= 2) {

          this.addPoints(val, 0x94e2d5, 0.15);

        }



      } catch(e) { /* skip */ }

    });

    // End the cached evaluation cycle

    app.endCompute();

  };



  // ── Extend computeNodeValue for new Geo node types ──

  const origCompute = app.computeNodeValue.bind(app);



  // Helper: get a specific output from a node by port ID

  // For Python nodes with multiple outputs, returns the matching variable

  app._getNodeOutput = function(nd, fromPort) {

    if (!nd) return undefined;

    // For Python nodes, execute and return the specific variable

    if ((nd.type === 'custom-python' || nd.type === 'custom-code') && nd._pyResults) {

      if (nd._pyResults[fromPort] !== undefined) return nd._pyResults[fromPort];

    }

    // Default: compute the whole node

    return this.computeNodeValue(nd);

  };



  app.computeNodeValue = function(nd) {

    const self = this;

    const cache = self._computeCache;



    // ── CACHE: check for cached result ──

    if (cache) {

      const cached = cache.get(nd.id);

      if (cached === _CACHE_COMPUTING) {

        // Cycle detected — this node is already being computed upstream

        // Return undefined to break the infinite recursion

        console.warn('[NodeFlow] Cycle detected at node ' + nd.id + ' (' + nd.def.name + ')');

        return undefined;

      }

      if (cached !== undefined) {

        // Cache hit — return the stored result

        // (cached _CACHE_UNDEFINED means "computed but result was undefined")

        return cached === _CACHE_UNDEFINED ? undefined : cached;

      }

      // Mark this node as "computing" for cycle detection

      cache.set(nd.id, _CACHE_COMPUTING);

    }



    const getInput = (portId) => {

      const wire = self.wires.find(w => w.toNode === nd.id && w.toPort === portId);

      if (wire) {

        const srcNd = self.nodes.find(n => n.id === wire.fromNode);

        if (srcNd) {

          // For Python nodes: ensure executed, then get the specific output variable

          if (srcNd.type === 'custom-python' || srcNd.type === 'custom-code') {

            // Auto-execute if not yet done

            if (!srcNd._pyResults) {

              self.computeNodeValue(srcNd);

            }

            // Return the specific variable matching the wire's fromPort

            if (srcNd._pyResults && srcNd._pyResults[wire.fromPort] !== undefined) {

              return srcNd._pyResults[wire.fromPort];

            }

            // Fallback: try first output

            if (srcNd._pyResults) {

              const keys = Object.keys(srcNd._pyResults).filter(k => !k.startsWith('_') && k.length > 1);

              if (keys.length > 0) return srcNd._pyResults[keys[0]];

            }

          }

          return self.computeNodeValue(srcNd);

        }

      }

      return undefined;

    };



    // _computeInner does the real work; we cache its return value.

    var _result = undefined;

    try {

      _result = self._computeInner(nd, getInput, origCompute);

    } catch(e) {

      try { _result = origCompute(nd); } catch(e2) { _result = undefined; }

    }

    // Store in cache

    if (cache) cache.set(nd.id, _result !== undefined ? _result : _CACHE_UNDEFINED);

    return _result;

  };



  // ── Inner computation — separated so all return paths are automatically cached ──

  app._computeInner = function(nd, getInput, origCompute) {

    try {

      switch (nd.type) {

        // ── Geometry primitives using Geo library ──

        case 'geo-point': {

          const x = getInput('x'), y = getInput('y'), z = getInput('z');

          if (x !== undefined || y !== undefined || z !== undefined)

            return new Geo.Point3(x || 0, y || 0, z || 0);

          return undefined;

        }

        case 'geo-vector': {

          const x = getInput('x'), y = getInput('y'), z = getInput('z');

          if (x !== undefined || y !== undefined || z !== undefined)

            return new Geo.Vector3(x || 0, y || 0, z || 0);

          return undefined;

        }

        case 'geo-line': {

          const s = getInput('start'), e = getInput('end');

          if (s && e) {

            const sp = s instanceof Geo.Point3 ? s : new Geo.Point3(s.x||0, s.y||0, s.z||0);

            const ep = e instanceof Geo.Point3 ? e : new Geo.Point3(e.x||0, e.y||0, e.z||0);

            return new Geo.Line3(sp, ep);

          }

          return undefined;

        }

        case 'geo-circle': {

          const c = getInput('center'), r = getInput('radius');

          if (c) {

            const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(c.x||0, c.y||0, c.z||0);

            return new Geo.Circle3(cp, r || 5);

          }

          return undefined;

        }

        case 'geo-distance': {

          const a = getInput('a'), b = getInput('b');

          if (a && b) {

            const ap = a instanceof Geo.Point3 ? a : new Geo.Point3(a.x||0, a.y||0, a.z||0);

            const bp = b instanceof Geo.Point3 ? b : new Geo.Point3(b.x||0, b.y||0, b.z||0);

            return ap.distanceTo(bp);

          }

          return undefined;

        }



        // ── Solids ──

        case 'solid-box': {

          const c = getInput('center'), w = getInput('width'), d = getInput('depth'), h = getInput('height');

          const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0);

          return Geo.createBox(cp, w || 10, d || 10, h || 10);

        }

        case 'solid-sphere': {

          const c = getInput('center'), r = getInput('radius');

          const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0);

          return Geo.createSphere(cp, r || 5);

        }

        case 'solid-cylinder': {

          const b = getInput('base'), r = getInput('radius'), h = getInput('height');

          const bp = b instanceof Geo.Point3 ? b : new Geo.Point3(0,0,0);

          return Geo.createCylinder(bp, r || 5, h || 10);

        }

        case 'solid-cone': {

          const b = getInput('base'), r = getInput('radius'), h = getInput('height');

          const bp = b instanceof Geo.Point3 ? b : new Geo.Point3(0,0,0);

          return Geo.createCone(bp, r || 5, h || 10);

        }

        case 'solid-torus': {

          const c = getInput('center'), mR = getInput('majorR'), mr = getInput('minorR');

          const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0);

          return Geo.createTorus(cp, mR || 5, mr || 1.5);

        }



        // ── Surfaces ──

        case 'surf-plane': {

          const o = getInput('origin'), n = getInput('normal');

          const op = o instanceof Geo.Point3 ? o : new Geo.Point3(0,0,0);

          const nv = n instanceof Geo.Vector3 ? n : new Geo.Vector3(0,0,1);

          return new Geo.Plane(op, nv);

        }

        case 'surf-from-grid': {

          const pts = getInput('points'), u = getInput('uCount'), v = getInput('vCount');

          if (pts && u && v) return Geo.surfaceFromGrid(pts, u, v);

          return undefined;

        }

        case 'surf-polyline': {

          const pts = getInput('points'), closed = getInput('closed');

          if (pts && Array.isArray(pts)) return new Geo.Polyline3(pts, !!closed);

          return undefined;

        }

        case 'surf-arc': {

          const c = getInput('center'), r = getInput('radius'), sa = getInput('startAngle'), ea = getInput('endAngle');

          const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0);

          return new Geo.Arc3(cp, r || 5, (sa||0) * Math.PI/180, (ea||360) * Math.PI/180);

        }



        // ── Operations ──

        case 'op-extrude': {

          const curve = getInput('curve'), vec = getInput('vector');

          if (curve && vec) return Geo.extrude(curve, vec instanceof Geo.Vector3 ? vec : new Geo.Vector3(vec.x||0, vec.y||0, vec.z||0));

          return undefined;

        }

        case 'op-revolve': {

          const curve = getInput('curve'), ao = getInput('axisOrigin'), ad = getInput('axisDir'), angle = getInput('angle');

          if (curve) return Geo.revolve(curve, ao, ad, (angle||360) * Math.PI/180);

          return undefined;

        }

        case 'op-loft': {

          const profiles = getInput('profiles');

          if (profiles) return Geo.loft(profiles);

          return undefined;

        }

        case 'op-boolean-union': {

          const a = getInput('a'), b = getInput('b');

          if (a && b) return Geo.booleanUnion(a, b);

          return undefined;

        }

        case 'op-boolean-intersect': {

          const a = getInput('a'), b = getInput('b');

          if (a && b) return Geo.booleanIntersect(a, b);

          return undefined;

        }

        case 'op-boolean-subtract': {

          const a = getInput('a'), b = getInput('b');

          if (a && b) return Geo.booleanSubtract(a, b);

          return undefined;

        }

        case 'op-move': {

          const geo = getInput('geometry'), vec = getInput('vector');

          if (geo && vec) return Geo.move(geo, vec instanceof Geo.Vector3 ? vec : new Geo.Vector3(vec.x||0, vec.y||0, vec.z||0));

          return undefined;

        }

        case 'op-scale': {

          const geo = getInput('geometry'), f = getInput('factor'), o = getInput('origin');

          if (geo && f) return Geo.scaleGeo(geo, f, o);

          return undefined;

        }

        case 'op-offset': {

          const curve = getInput('curve'), d = getInput('distance');

          if (curve && d) return Geo.offsetCurve(curve, d);

          return undefined;

        }

        case 'op-trim': {

          const line = getInput('line'), t0 = getInput('t0'), t1 = getInput('t1');

          if (line) {

            if (line._type === 'Line3') return Geo.trimLine(line, t0 || 0, t1 || 1);

            if (Geo.trimCurve) return Geo.trimCurve(line, t0 || 0, t1 || 1);

            return Geo.trimLine(line, t0 || 0, t1 || 1);

          }

          return undefined;

        }

        case 'op-point-grid': {

          const o = getInput('origin'), u = getInput('uCount'), v = getInput('vCount'), s = getInput('spacing');

          const op = o instanceof Geo.Point3 ? o : new Geo.Point3(0,0,0);

          return Geo.pointGrid(op, new Geo.Vector3(1,0,0), new Geo.Vector3(0,1,0), u||5, v||5, s||1, s||1);

        }

        case 'op-sweep': {

          const profile = getInput('profile'), path = getInput('path');

          if (profile && path) return Geo.sweep(profile, path);

          return undefined;

        }

        case 'op-pipe': case 'op-pipe-curve': {

          const curve = getInput('curve'), r = getInput('radius');

          if (curve) return Geo.pipe(curve, r || 0.5);

          return undefined;

        }

        case 'op-thicken': {

          const mesh = getInput('mesh'), t = getInput('thickness');

          if (mesh) return Geo.thicken(mesh, t || 1);

          return undefined;

        }

        case 'op-subdivide': {

          const mesh = getInput('mesh'), it = getInput('iterations');

          if (mesh) return Geo.subdivide(mesh, Math.max(1, Math.min(it || 1, 5)));

          return undefined;

        }

        case 'op-smooth': {

          const mesh = getInput('mesh'), it = getInput('iterations');

          if (mesh) return Geo.smooth(mesh, Math.max(1, Math.min(it || 1, 20)));

          return undefined;

        }

        case 'op-rotate': {

          const geo = getInput('geometry'), ao = getInput('axisOrigin'), ad = getInput('axisDir'), angle = getInput('angle');

          if (geo) return Geo.rotate(geo, ao, ad, (angle||0) * Math.PI/180);

          return undefined;

        }

        case 'op-mirror': {

          const geo = getInput('geometry'), po = getInput('planeOrigin'), pn = getInput('planeNormal');

          if (geo) return Geo.mirror(geo, po, pn);

          return undefined;

        }

        case 'op-array-linear': {

          const geo = getInput('geometry'), dir = getInput('direction'), cnt = getInput('count'), sp = getInput('spacing');

          if (geo && dir) return Geo.arrayLinear(geo, dir, cnt||3, sp||1);

          return undefined;

        }

        case 'op-array-polar': {

          const geo = getInput('geometry'), c = getInput('center'), ax = getInput('axis'), cnt = getInput('count');

          if (geo) return Geo.arrayPolar(geo, c, ax, cnt||6);

          return undefined;

        }

        case 'op-bezier': {

          const pts = getInput('points');

          if (pts && Array.isArray(pts)) return Geo.bezier(pts);

          return undefined;

        }

        case 'op-interpolate': {

          const pts = getInput('points');

          if (pts && Array.isArray(pts)) return Geo.interpolate(pts);

          return undefined;

        }

        case 'op-ruled-surface': {

          const c1 = getInput('curve1'), c2 = getInput('curve2');

          if (c1 && c2) return Geo.ruledSurface(c1, c2);

          return undefined;

        }

        case 'op-isolines': {

          const mesh = getInput('mesh'), cnt = getInput('count');

          const dir = nd.controlValues && nd.controlValues.dir;

          if (mesh) return dir === 'V' ? Geo.getIsolinesV(mesh, cnt||10) : Geo.getIsolinesU(mesh, cnt||10);

          return undefined;

        }

        case 'op-combine-all': {

          const meshes = getInput('meshes');

          if (meshes && Array.isArray(meshes)) return Geo.combineAll(meshes);

          return undefined;

        }



        // ── Revit nodes: read from REVIT_DATA via RevitBridge ──

        case 'revit-collect-category': {

          const cat = nd.controlValues && nd.controlValues.category;

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          return _rb ? _rb.getElements(cat || 'Walls') : [];

        }

        case 'revit-collect-type': {

          const cat = nd.controlValues && nd.controlValues.category;

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          return _rb ? _rb.getTypes(cat || 'Walls') : [];

        }

        case 'revit-active-view': {

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          return _rb ? _rb.getActiveView() : {};

        }

        case 'revit-selection': {

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          return _rb ? _rb.getSelection() : [];

        }

        case 'revit-all-levels': {

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          return _rb ? _rb.getLevels() : [];

        }

        case 'revit-all-sheets': {

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          return _rb ? _rb.getSheets() : [];

        }

        case 'revit-project-info': {

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          if (!_rb) return {};

          return { name: _rb.getProjectName(), levels: _rb.getLevels().length, sheets: _rb.getSheets().length };

        }

        case 'revit-get-param': {

          const el = getInput('element');

          const pname = nd.controlValues && nd.controlValues.param;

          const _rb = window.RevitBridge || (typeof RevitBridge !== 'undefined' ? RevitBridge : null);

          if (!el || !pname) return undefined;

          // If input is an array, get param from each element

          if (Array.isArray(el)) {

            return el.map(function(item) { return _rb ? _rb.getParam(item, pname) : (item && item.params ? item.params[pname] : null); });

          }

          if (_rb) return _rb.getParam(el, pname);

          return el && el.params ? el.params[pname] : undefined;

        }

        case 'revit-get-element-name': {

          const el = getInput('element');

          if (Array.isArray(el)) return el.map(function(e) { return e && e.name ? e.name : ''; });

          return el && typeof el === 'object' ? (el.name || '') : '';

        }

        case 'revit-get-element-id': {

          const el = getInput('element');

          if (Array.isArray(el)) return el.map(function(e) { return e && e.id ? e.id : 0; });

          return el && typeof el === 'object' ? (el.id || 0) : 0;

        }

        case 'revit-get-type-name': {

          const el = getInput('element');

          if (Array.isArray(el)) return el.map(function(e) { return e && e.typeName ? e.typeName : ''; });

          return el && typeof el === 'object' ? (el.typeName || '') : '';

        }

        case 'revit-filter-param': {

          const els = getInput('elements');

          const pname = nd.controlValues && nd.controlValues.param;

          const op = nd.controlValues && nd.controlValues.op;

          const val = nd.controlValues && nd.controlValues.val;

          if (els && Array.isArray(els) && window.RevitBridge) return RevitBridge.filterByParam(els, pname, op, val);

          return [];

        }

        case 'revit-filter-level': {

          const els = getInput('elements');

          const lvl = nd.controlValues && nd.controlValues.level;

          if (els && Array.isArray(els)) return els.filter(e => e.levelName === lvl);

          return [];

        }

        case 'revit-filter-type': {

          const els = getInput('elements');

          const tn = nd.controlValues && nd.controlValues.typename;

          if (els && Array.isArray(els)) return els.filter(e => e.typeName && e.typeName.indexOf(tn) >= 0);

          return [];

        }

        case 'revit-for-each': {

          const els = getInput('elements');

          const expr = nd.controlValues && nd.controlValues.expr;

          if (!els || !Array.isArray(els)) return [];

          try {

            return els.map(el => {

              try { return eval('(function(el){return ' + expr + ';})(el)'); } catch(e) { return null; }

            });

          } catch(e) { return []; }

        }

        case 'revit-element-count': {

          const els = getInput('elements');

          return els && Array.isArray(els) ? els.length : 0;

        }



        // ── Python / Code nodes: execute and return result ──

        case 'custom-python':
          // falls through
        case 'custom-code': {

          // If already executed, return cached result

          if (nd._pyResults) {

            const keys = Object.keys(nd._pyResults).filter(k => !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k');

            if (keys.length === 1) return nd._pyResults[keys[0]];

            if (keys.length > 1) return nd._pyResults;

          }

          // Auto-execute the Python node

          try {

            const inputs = {};

            (nd._dynInputs || ['input0']).forEach(pid => {

              const wire = this.wires.find(w => w.toNode === nd.id && w.toPort === pid);

              if (wire) {

                const srcNd = this.nodes.find(n => n.id === wire.fromNode);

                if (srcNd) inputs[pid] = this.computeNodeValue(srcNd);

              }

            });

            const result = PythonRunner.execute(nd.controlValues.code || '', inputs);

            if (result.error) return undefined;

            nd._pyResults = result.outputs;

            // Update outputs dynamically

            const outKeys = Object.keys(result.outputs).filter(k => !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k');

            if (outKeys.length > 0) nd._dynOutputs = outKeys;

            if (outKeys.length === 1) return result.outputs[outKeys[0]];

            if (outKeys.length > 1) return result.outputs;

          } catch(e) { /* skip */ }

          return undefined;

        }



        // ── Pattern & Noise nodes ──

        case 'pat-voronoi-outlines': {

          const sites = getInput('sites');

          if (sites && Array.isArray(sites)) return Geo.voronoiOutlines(sites, null, 0.5);

          return undefined;

        }

        case 'pat-voronoi-mesh': {

          const sites = getInput('sites'), h = getInput('height'), gap = getInput('gap');

          if (sites && Array.isArray(sites)) return Geo.voronoiMesh(sites, null, h || 3, gap || 0.1);

          return undefined;

        }

        case 'pat-hex-grid': {

          const o = getInput('origin'), r = getInput('radius'), rows = getInput('rows'), cols = getInput('cols');

          if (o) return Geo.hexGrid(o, r || 2, rows || 5, cols || 5);

          return undefined;

        }

        case 'pat-diamond-grid': {

          const o = getInput('origin'), w = getInput('width'), h = getInput('height'), rows = getInput('rows'), cols = getInput('cols');

          if (o) return Geo.diamondGrid(o, w || 10, h || 10, rows || 5, cols || 5);

          return undefined;

        }

        case 'pat-phyllotaxis': {

          const cnt = getInput('count'), r = getInput('radius');

          return Geo.phyllotaxis(cnt || 100, r || 10);

        }

        case 'pat-fibonacci-sphere': {

          const cnt = getInput('count'), r = getInput('radius');

          return Geo.fibonacciSphere(cnt || 100, r || 10);

        }

        case 'pat-perlin2': {

          const x = getInput('x'), y = getInput('y');

          if (x !== undefined && y !== undefined) return Geo.perlin2(x, y);

          return undefined;

        }

        case 'pat-perlin3': {

          const x = getInput('x'), y = getInput('y'), z = getInput('z');

          if (x !== undefined) return Geo.perlin3(x || 0, y || 0, z || 0);

          return undefined;

        }

        case 'pat-fbm': {

          const x = getInput('x'), y = getInput('y'), z = getInput('z'), oct = getInput('octaves');

          return Geo.fbm(x || 0, y || 0, z || 0, oct || 4);

        }

        case 'pat-point-attractor': {

          const pt = getInput('point'), attr = getInput('attractor'), r = getInput('radius'), f = getInput('falloff');

          if (pt && attr) return Geo.pointAttractor(pt, attr, r || 10, f || 2);

          return undefined;

        }

        case 'pat-noise-deform': {

          const mesh = getInput('mesh'), amp = getInput('amplitude'), freq = getInput('frequency');

          if (mesh) return Geo.noiseDeform(mesh, amp || 1, freq || 0.1);

          return undefined;

        }

        // ── NURBS nodes ──

        case 'nurbs-curve': {

          const pts = getInput('points'), deg = getInput('degree');

          if (pts && Array.isArray(pts)) return Geo.createNurbsCurve(pts, deg || 3);

          return undefined;

        }

        case 'nurbs-surface': {

          const grid = getInput('grid'), du = getInput('degreeU'), dv = getInput('degreeV');

          if (grid && Array.isArray(grid)) return Geo.createNurbsSurface(grid, du || 3, dv || 3);

          return undefined;

        }



        // ── Profile nodes ──

        case 'prof-circle': {

          const c = getInput('center'), r = getInput('radius'), res = getInput('resolution');

          if (c && r) {

            const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0);

            const n = Math.max(8, parseInt(res) || 32);

            const pts = [];

            for (let j = 0; j < n; j++) {

              const a = 2 * Math.PI * j / n;

              pts.push(new Geo.Point3(cp.x + r * Math.cos(a), cp.y + r * Math.sin(a), cp.z));

            }

            return pts;

          }

          return undefined;

        }

        case 'prof-ellipse': {

          const c = getInput('center'), w = getInput('width'), d = getInput('depth'), rot = getInput('rotation'), res = getInput('resolution');

          if (c) {

            const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0);

            const hw = (w || 10) / 2, hd = (d || 6) / 2;

            const ra = (rot || 0) * Math.PI / 180;

            const cosR = Math.cos(ra), sinR = Math.sin(ra);

            const n = Math.max(8, parseInt(res) || 32);

            const pts = [];

            for (let j = 0; j < n; j++) {

              const a = 2 * Math.PI * j / n;

              const x = hw * Math.cos(a), y = hd * Math.sin(a);

              pts.push(new Geo.Point3(cp.x + x * cosR - y * sinR, cp.y + x * sinR + y * cosR, cp.z));

            }

            return pts;

          }

          return undefined;

        }

        case 'prof-rect': {

          const c = getInput('center'), w = getInput('width'), d = getInput('depth');

          if (c) {

            const cp = c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0);

            const hw = (w || 10) / 2, hd = (d || 6) / 2;

            return [

              new Geo.Point3(cp.x - hw, cp.y - hd, cp.z),

              new Geo.Point3(cp.x + hw, cp.y - hd, cp.z),

              new Geo.Point3(cp.x + hw, cp.y + hd, cp.z),

              new Geo.Point3(cp.x - hw, cp.y + hd, cp.z)

            ];

          }

          return undefined;

        }



        // ── List management nodes ──

        case 'list-sequence': {

          const start = getInput('start'), step = getInput('step'), count = getInput('count');

          if (count !== undefined) {

            const r = [];

            for (let i = 0; i < (count || 0); i++) r.push((start || 0) + (step || 1) * i);

            return r;

          }

          return undefined;

        }

        case 'list-flatten': {

          const lst = getInput('list');

          if (Array.isArray(lst)) {

            const flat = [];

            lst.forEach(function(item) { if (Array.isArray(item)) item.forEach(function(sub) { flat.push(sub); }); else flat.push(item); });

            return flat;

          }

          return undefined;

        }

        case 'list-cross-ref': {

          const a = getInput('listA'), b = getInput('listB');

          if (Array.isArray(a) && Array.isArray(b)) {

            const pA = [], pB = [];

            a.forEach(function(av) { b.forEach(function(bv) { pA.push(av); pB.push(bv); }); });

            return { pairsA: pA, pairsB: pB };

          }

          return undefined;

        }

        case 'list-map': {

          const lst = getInput('list');

          const expr = nd.controlValues && nd.controlValues.code;

          if (Array.isArray(lst) && expr) {

            try { return lst.map(function(x) { return eval(expr); }); } catch(e) { return undefined; }

          }

          return undefined;

        }

        case 'list-filter': {

          const lst = getInput('list'), mask = getInput('mask');

          if (Array.isArray(lst) && Array.isArray(mask)) {

            const t = [], f = [];

            lst.forEach(function(v, i) { if (mask[i]) t.push(v); else f.push(v); });

            return { true_list: t, false_list: f };

          }

          return undefined;

        }

        case 'list-count': {

          const lst = getInput('list');

          return Array.isArray(lst) ? lst.length : 0;

        }

        case 'list-repeat': {

          const item = getInput('item'), count = getInput('count');

          if (count !== undefined) {

            const r = [];

            for (let i = 0; i < (count || 0); i++) r.push(item);

            return r;

          }

          return undefined;

        }



        // ── Default: try original compute ──

        default:

          return origCompute(nd);

      }

    } catch(e) {

      return origCompute(nd);

    }

  };



  // ── Extend formatValue to display Geo objects nicely ──

  const origFormatValue = app.formatValue.bind(app);

  app.formatValue = function(val) {

    if (val && val._type) {

      return '<span style="color:var(--accent-teal)">' + val.toString() + '</span>';

    }

    if (val instanceof Geo.Mesh3) {

      return '<span style="color:var(--accent-pink)">' + val.toString() + '</span>';

    }

    // Single Revit element dict → compact card

    if (val && typeof val === 'object' && !Array.isArray(val) && (val.id !== undefined || val.number !== undefined) && !val._type) {

      return app._formatObjectCard(val);

    }

    // Array of objects → table

    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0]) && !val[0]._type) {

      return app._formatObjectTable(val);

    }

    // Array of strings

    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {

      return app._formatStringList(val);

    }

    return origFormatValue(val);

  };



  // ── Format single object as a mini card ──

  app._formatObjectCard = function(obj) {

    const keys = Object.keys(obj).filter(k => k !== 'params' && k !== '_type');

    let h = '<div style="font-size:10px;line-height:1.6">';

    keys.slice(0, 6).forEach(k => {

      const v = obj[k];

      if (v === null || v === undefined || v === '' || v === -1) return;

      h += '<span style="color:var(--text-muted)">' + k + ':</span> <span style="color:var(--accent-blue)">' + v + '</span>  ';

    });

    h += '</div>';

    return h;

  };



  // ── Override nodeDataHTML — collapsible Input/Output sections ──

  const origNodeDataHTML = app.nodeDataHTML.bind(app);

  app.nodeDataHTML = function(nd) {

    let r = '';

    // Use a cached evaluation cycle so input lookups share results

    this.beginCompute();

    const computed = this.computeNodeValue(nd);

    const nid = nd.id;



    // ── Inputs section (collapsible) ──

    if (nd.def.inputs.length > 0 || nd.def.controls.length > 0) {

      const inputId = nid + '-di-inputs';

      r += '<div style="cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 0;color:var(--text-muted);font-size:9px;font-weight:600" onclick="var el=document.getElementById(\'' + inputId + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';this.querySelector(\'span\').textContent=el.style.display===\'none\'?\'▸\':\'▾\'">';

      r += '<span>▾</span> Inputs</div>';

      r += '<div id="' + inputId + '">';



      nd.def.inputs.forEach(inp => {

        const wire = this.wires.find(w => w.toNode === nd.id && w.toPort === inp.id);

        if (wire) {

          const srcNd = this.nodes.find(n => n.id === wire.fromNode);

          const srcVal = srcNd ? this.computeNodeValue(srcNd) : undefined;

          // For arrays, just show count — don't duplicate the full table

          if (Array.isArray(srcVal) && srcVal.length > 3) {

            r += '<div class="data-row"><span class="data-label">⊙ ' + inp.name + '</span><span style="color:var(--accent-blue)">[' + srcVal.length + ' items]</span></div>';

          } else {

            r += '<div class="data-row"><span class="data-label">⊙ ' + inp.name + '</span>' + this.formatValue(srcVal) + '</div>';

          }

        } else {

          r += '<div class="data-row"><span class="data-label">⊙ ' + inp.name + '</span><span style="color:var(--text-muted)">—</span></div>';

        }

      });



      nd.def.controls.forEach(c => {

        const val = nd.controlValues[c.id];

        r += '<div class="data-row"><span class="data-label">⚙ ' + (c.label || c.id) + '</span><span style="color:var(--accent-purple)">' + val + '</span></div>';

      });

      r += '</div>';

    }



    // ── Output section (collapsible) ──

    if (nd.def.outputs.length > 0) {

      const outputId = nid + '-di-outputs';

      const isTable = Array.isArray(computed) && computed.length > 0 && (typeof computed[0] === 'object' || typeof computed[0] === 'string');

      const countLabel = Array.isArray(computed) ? ' (' + computed.length + ')' : '';



      r += '<div style="border-top:1px solid rgba(49,50,68,0.8);margin-top:2px;padding-top:4px;cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-primary);font-size:9px;font-weight:600" onclick="var el=document.getElementById(\'' + outputId + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';this.querySelector(\'span\').textContent=el.style.display===\'none\'?\'▸\':\'▾\'">';

      r += '<span>▾</span> Output' + '<span style="color:var(--text-muted);font-weight:400;margin-left:auto">' + countLabel + '</span></div>';

      r += '<div id="' + outputId + '">';



      if (isTable) {

        r += this.formatValue(computed);

      } else {

        r += '<div class="data-row">' + this.formatValue(computed) + '</div>';

      }

      r += '</div>';

    }



    this.endCompute();

    return r || '<span style="color:var(--text-muted)">No data</span>';

  };



  // ── Format array of objects as a striped table ──

  app._formatObjectTable = function(arr) {

    const sampleKeys = new Set();

    arr.slice(0, 5).forEach(item => {

      Object.keys(item).forEach(k => {

        if (k !== 'params' && k !== '_type' && k !== 'typeId' && k !== 'levelId') sampleKeys.add(k);

      });

    });

    const cols = Array.from(sampleKeys).slice(0, 6);

    if (cols.length === 0) return '<span style="color:var(--text-muted)">[' + arr.length + ' items]</span>';



    // Table with NO inner scroll — parent data-panel handles scrolling

    let h = '<table style="width:100%;border-collapse:collapse;font-size:9px;font-family:var(--font-mono)">';

    h += '<thead><tr style="background:rgba(137,180,250,0.12);position:sticky;top:0">';

    h += '<th style="padding:4px 6px;text-align:left;color:var(--text-disabled);width:28px;font-weight:600">#</th>';

    cols.forEach(c => {

      h += '<th style="padding:4px 6px;text-align:left;color:var(--accent-blue);font-weight:600;white-space:nowrap">' + c + '</th>';

    });

    h += '</tr></thead><tbody>';

    arr.forEach((item, idx) => {

      const bg = idx % 2 === 0 ? 'transparent' : 'rgba(49,50,68,0.35)';

      h += '<tr style="background:' + bg + '">';

      h += '<td style="padding:3px 6px;color:var(--text-disabled)">' + idx + '</td>';

      cols.forEach(c => {

        let v = item[c];

        if (v === null || v === undefined) v = '';

        if (typeof v === 'number') v = Number.isInteger(v) ? v : v.toFixed(2);

        const color = typeof item[c] === 'number' ? 'var(--accent-green)' : typeof item[c] === 'string' ? 'var(--accent-yellow)' : 'var(--text-primary)';

        h += '<td style="padding:3px 6px;color:' + color + ';max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + v + '</td>';

      });

      h += '</tr>';

    });

    h += '</tbody></table>';

    h += '<div style="font-size:9px;color:var(--text-muted);padding:3px 0;text-align:right">' + arr.length + ' items</div>';

    return h;

  };



  // ── Format array of strings as a numbered list ──

  app._formatStringList = function(arr) {

    let h = '<table style="width:100%;border-collapse:collapse;font-size:9px;font-family:var(--font-mono)">';

    arr.forEach((s, idx) => {

      const bg = idx % 2 === 0 ? 'transparent' : 'rgba(49,50,68,0.35)';

      h += '<tr style="background:' + bg + '">';

      h += '<td style="padding:3px 6px;color:var(--text-disabled);width:28px">' + idx + '</td>';

      h += '<td style="padding:3px 6px;color:var(--accent-yellow)">' + s + '</td>';

      h += '</tr>';

    });

    h += '</table>';

    h += '<div style="font-size:9px;color:var(--text-muted);padding:3px 0;text-align:right">' + arr.length + ' items</div>';

    return h;

  };



  // ── Patch setView to auto-run Python nodes before 3D ──

  const origSetView = app.setView.bind(app);

  app.setView = function(mode) {

    if (mode === '3d') {

      // Auto-execute all Python nodes so their results are available for 3D rendering

      this.beginCompute();

      this.nodes.forEach(nd => {

        if (nd.type === 'custom-python' || nd.type === 'custom-code') {

          try {

            const inputs = {};

            (nd._dynInputs || ['input0']).forEach(pid => {

              const wire = this.wires.find(w => w.toNode === nd.id && w.toPort === pid);

              if (wire) {

                const srcNd = this.nodes.find(n => n.id === wire.fromNode);

                if (srcNd) inputs[pid] = this.computeNodeValue(srcNd);

              }

            });

            const result = PythonRunner.execute(nd.controlValues.code || '', inputs);

            if (!result.error) {

              nd._pyResults = result.outputs;

              const outKeys = Object.keys(result.outputs).filter(k => !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k');

              if (outKeys.length > 0) nd._dynOutputs = outKeys;

            }

          } catch(e) { /* skip */ }

        }

      });

      this.endCompute();

    }

    origSetView(mode);

  };



  // ── Also patch runGraph to auto-execute Python nodes ──

  const origRunGraph = app.runGraph.bind(app);

  app.runGraph = function() {

    // Auto-execute all Python nodes within a cached cycle

    this.beginCompute();

    this.nodes.forEach(nd => {

      if (nd.type === 'custom-python' || nd.type === 'custom-code') {

        app.pyRunNode(nd.id);

      }

    });

    this.endCompute();

    if (typeof Viewer3D !== 'undefined') Viewer3D._needsRebuild = true;

    origRunGraph();

  };



  // ── Patch runEditedCode to pass dynamic input names from parser ──

  const origRunEditedCode = app.runEditedCode.bind(app);

  app.runEditedCode = function() {

    const codeEl = document.getElementById('cv-code');

    if (!codeEl) return;

    const code = codeEl.value;



    try {

      const graph = CodeParser.parseToGraph(code);



      if (graph.nodes.length === 0) {

        this.addAIMessage('workspace', '⚠️ Could not parse any operations from the code.');

        return;

      }



      // Clear current canvas

      this.nodes.forEach(nd => {

        const el = document.getElementById(nd.id);

        if (el) el.remove();

      });

      this.nodes = [];

      this.wires = [];

      this.selectedNodes = [];

      this.nextNodeId = graph.nextId;

      document.getElementById('wire-svg').innerHTML = '';



      // Create nodes

      const created = [];

      graph.nodes.forEach(gn => {

        const def = NODE_TYPE_MAP[gn.type];

        if (!def) return;



        this.nodeZCounter++;

        const nd = {

          id: gn.id, type: gn.type,

          x: gn.x, y: gn.y,

          def: { ...def },

          controlValues: {},

          dataPanelOpen: false,

          zIndex: this.nodeZCounter

        };

        def.controls.forEach(c => { nd.controlValues[c.id] = c.default; });

        Object.keys(gn.controls).forEach(k => {

          if (k === '_dynInputs') return; // skip meta

          nd.controlValues[k] = gn.controls[k];

        });



        // For Python nodes, set dynamic inputs from parser analysis

        if (gn.type === 'custom-python' && gn.controls._dynInputs) {

          nd._dynInputs = gn.controls._dynInputs;

        }

        if (gn.type === 'custom-python' && gn.rawCode) {

          nd.controlValues.code = gn.rawCode || gn.controls.code;

        }



        // Set dynamic outputs from parser analysis

        if (gn.outputVars && gn.outputVars.length > 0) {

          nd._dynOutputs = gn.outputVars;

        }



        this.nodes.push(nd);

        this.renderNode(nd);

        created.push(nd.def.name);

      });



      // Create wires

      graph.wires.forEach(w => { this.wires.push(w); });



      this.updatePortDots();

      setTimeout(() => this.renderWires(), 50);

      this.updateMenuState();



      // Summary

      const typeCount = {};

      created.forEach(n => { typeCount[n] = (typeCount[n] || 0) + 1; });

      const summary = Object.keys(typeCount).map(k => '**' + k + '** ×' + typeCount[k]).join(', ');



      this.addAIMessage('workspace', '✅ **Built visual graph!**\n\n' + created.length + ' nodes: ' + summary + '\n' + graph.wires.length + ' connections wired.');



    } catch (err) {

      this.addAIMessage('workspace', '❌ Parse error: ' + err.message);

    }

  };



  // ── Re-render node library to show new categories ──

  if (typeof app.renderNodeLibrary === 'function') {

    app.renderNodeLibrary();

  }

});

