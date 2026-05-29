import { NODE_TYPE_MAP } from '../core/nodes.js';
import { shouldCancelRectSelection, shouldStartRectSelection } from './canvas-event-guards.js';
import { Viewer3D } from '../viewer/viewer3d.js';

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

// ============================================
// NODEFLOW AI — UI Enhancements
// 1. Rectangular selection (drag box on canvas)
// 2. Node documentation panel with samples
// ============================================

export function installUiEnhancements(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  if (targetApp.__uiEnhancementsInstalled) return true;
  targetApp.__uiEnhancementsInstalled = true;
  const app = targetApp;

  // ══════════════════════════════════════
  // 1. RECTANGULAR SELECTION
  // ══════════════════════════════════════
  const canvasArea = document.getElementById('canvas-area');
  let rectSelect = null; // { startX, startY, active }
  let rectDiv = null;

  // Create selection rectangle element
  rectDiv = document.createElement('div');
  rectDiv.id = 'rect-select';
  rectDiv.style.cssText = 'position:absolute;border:1.5px dashed rgba(137,180,250,0.7);background:rgba(137,180,250,0.08);display:none;z-index:15;pointer-events:none;border-radius:3px;';
  canvasArea.appendChild(rectDiv);

  // Start rect selection on mousedown (left button, no alt, not on node/toolbar)
  canvasArea.addEventListener('mousedown', function(e) {
    if (!shouldStartRectSelection(app, e)) return;

    if (e.target.closest('.node') || e.target.closest('.canvas-toolbar') ||
        e.target.closest('.canvas-zoom') || e.target.closest('.ws-chat-panel') ||
        e.target.closest('.node-library')) return;

    const rect = canvasArea.getBoundingClientRect();
    rectSelect = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      active: false
    };
  });

  document.addEventListener('mousemove', function(e) {
    if (!rectSelect) return;
    // Don't interfere with panning or node drag
    if (shouldCancelRectSelection(app)) {
      rectSelect = null;
      rectDiv.style.display = 'none';
      return;
    }

    const rect = canvasArea.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const dx = Math.abs(cx - rectSelect.startX);
    const dy = Math.abs(cy - rectSelect.startY);

    // Only activate after 5px movement to avoid accidental selections
    if (!rectSelect.active && dx + dy < 5) return;
    rectSelect.active = true;

    const left = Math.min(rectSelect.startX, cx);
    const top = Math.min(rectSelect.startY, cy);
    rectDiv.style.left = left + 'px';
    rectDiv.style.top = top + 'px';
    rectDiv.style.width = dx + 'px';
    rectDiv.style.height = dy + 'px';
    rectDiv.style.display = 'block';
  });

  document.addEventListener('mouseup', function(e) {
    if (!rectSelect || !rectSelect.active) {
      rectSelect = null;
      rectDiv.style.display = 'none';
      return;
    }

    const rect = canvasArea.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const left = Math.min(rectSelect.startX, cx);
    const top = Math.min(rectSelect.startY, cy);
    const right = Math.max(rectSelect.startX, cx);
    const bottom = Math.max(rectSelect.startY, cy);

    // Find all nodes inside the rect
    if (!e.shiftKey) app.deselectAll();
    app.nodes.forEach(nd => {
      const el = document.getElementById(nd.id);
      if (!el) return;
      const nr = el.getBoundingClientRect();
      // Node center relative to canvas
      const ncx = nr.left + nr.width / 2 - rect.left;
      const ncy = nr.top + nr.height / 2 - rect.top;
      if (ncx >= left && ncx <= right && ncy >= top && ncy <= bottom) {
        app.selectNode(nd.id, true);
      }
    });

    rectSelect = null;
    rectDiv.style.display = 'none';
  });

  // ══════════════════════════════════════
  // 2. NODE 3D PREVIEW TOGGLE (eye icon)
  // ══════════════════════════════════════

  // Patch renderNode to add preview toggle button on each node header
  const origRenderNode2 = app.renderNode.bind(app);
  app.renderNode = function(nd) {
    origRenderNode2(nd);
    const el = document.getElementById(nd.id);
    if (!el) return;
    const header = el.querySelector('.node-header');
    if (!header) return;

    // Initialize preview state (default: visible)
    if (nd._preview3d === undefined) nd._preview3d = true;

    // Add eye toggle button before the ⋮ menu
    const menuBtn = header.querySelector('.node-header-menu');
    if (menuBtn && !header.querySelector('.node-preview-eye')) {
      const eyeBtn = document.createElement('button');
      eyeBtn.className = 'node-preview-eye' + (nd._preview3d ? '' : ' off');
      eyeBtn.title = nd._preview3d ? '3D Preview: ON (click to hide)' : '3D Preview: OFF (click to show)';
      eyeBtn.textContent = nd._preview3d ? '👁' : '👁‍🗨';
      eyeBtn.onclick = function(e) {
        e.stopPropagation();
        const wasOn = nd._preview3d !== false;
        nd._preview3d = !nd._preview3d;
        eyeBtn.className = 'node-preview-eye' + (nd._preview3d ? '' : ' off');
        eyeBtn.textContent = nd._preview3d ? '👁' : '👁‍🗨';
        eyeBtn.title = nd._preview3d ? '3D Preview: ON (click to hide)' : '3D Preview: OFF (click to show)';
        // Toggling OFF: just flip visibility of the existing scene items.
        // Toggling ON when the previous compute skipped this node leaves
        // no scene items to flip — we have to re-run the render so the
        // node's geometry actually appears.
        if (typeof Viewer3D !== 'undefined' && Viewer3D._syncNodePreview) {
          Viewer3D._syncNodePreview(nd.id, nd._preview3d);
        }
        if (!wasOn && nd._preview3d && typeof app._renderFromCompute === 'function') {
          app._renderFromCompute();
        }
      };
      header.insertBefore(eyeBtn, menuBtn);
    }
  };

  // Patch showNodeMenu to include Preview toggle
  const origShowNodeMenu = app.showNodeMenu.bind(app);
  app.showNodeMenu = function(id) {
    const nd = this.nodes.find(n => n.id === id);
    const el = document.getElementById(id);
    if (!el || !nd) return;
    const r = el.getBoundingClientRect();
    const previewLabel = nd._preview3d !== false ? 'Hide from 3D' : 'Show in 3D';
    const previewIcon = nd._preview3d !== false ? '👁‍🗨' : '👁';
    this.showContextMenuAt(r.right + 4, r.top, [
      { label: 'View Code', icon: '{ }', action: () => this.showNodeCode(id) },
      { label: 'Inspect Data', icon: '🔍', action: () => this.toggleDataPanel(id) },
      { label: previewLabel, icon: previewIcon, action: () => {
        const wasOn = nd._preview3d !== false;
        nd._preview3d = !nd._preview3d;
        // Update eye button
        const eye = document.querySelector('#' + id + ' .node-preview-eye');
        if (eye) {
          eye.className = 'node-preview-eye' + (nd._preview3d ? '' : ' off');
          eye.textContent = nd._preview3d ? '👁' : '👁‍🗨';
          eye.title = nd._preview3d ? '3D Preview: ON' : '3D Preview: OFF';
        }
        if (typeof Viewer3D !== 'undefined' && Viewer3D._syncNodePreview) {
          Viewer3D._syncNodePreview(nd.id, nd._preview3d);
        }
        if (!wasOn && nd._preview3d && typeof app._renderFromCompute === 'function') {
          app._renderFromCompute();
        }
      }},
      { label: 'Duplicate', icon: '📋', action: () => this.duplicateNode(id) },
      { label: 'Delete', icon: '🗑', action: () => this.removeNode(id) }
    ]);
  };

  // Note: 3D preview filtering is handled inside geo-viewer-patch.js's buildFromGraph
  // (checks nd._preview3d === false and skips rendering)

  // ══════════════════════════════════════
  // 3. NODE DOCUMENTATION + SAMPLES
  // ══════════════════════════════════════

  // Documentation database: description + sample code for each node type
  const NODE_DOCS = {
    // ── Input ──
    'number-input': { desc: 'Outputs a constant number value. Edit the value to change it.', sample: 'radius = 5' },
    'text-input': { desc: 'Outputs a text string value.', sample: 'name = "Hello"' },
    'boolean-input': { desc: 'Outputs True or False.', sample: 'flag = True' },
    'slider-input': { desc: 'Number with a slider control between min and max.', sample: 'value = 50  # range [0, 100]' },
    'integer-input': { desc: 'Outputs a whole number (integer).', sample: 'count = int(10)' },
    // ── Math ──
    'math-add': { desc: 'Adds two numbers: A + B.', sample: 'a = 10\nb = 5\nresult = a + b\nprint(result)' },
    'math-subtract': { desc: 'Subtracts B from A.', sample: 'a = 10\nb = 3\nresult = a - b' },
    'math-multiply': { desc: 'Multiplies A × B.', sample: 'width = 10\nheight = 5\narea = width * height' },
    'math-divide': { desc: 'Divides A ÷ B. Returns infinity if B=0.', sample: 'total = 100\nparts = 4\neach = total / parts' },
    'math-power': { desc: 'Raises Base to the Exponent power.', sample: 'base = 2\nexp = 10\nresult = base ** exp' },
    // ── Logic ──
    'logic-and': { desc: 'Logical AND: True only if both A and B are True.', sample: 'a = True\nb = True\nresult = a and b' },
    'logic-or': { desc: 'Logical OR: True if either A or B is True.', sample: 'a = True\nb = False\nresult = a or b' },
    'logic-not': { desc: 'Logical NOT: Inverts True ↔ False.', sample: 'value = True\nresult = not value' },
    'logic-compare': { desc: 'Compares A and B with the selected operator.', sample: 'a = 10\nb = 5\nresult = a > b' },
    'logic-if': { desc: 'If/Branch: Returns True value if test passes, else False value.', sample: 'score = 85\ngrade = "Pass" if score > 60 else "Fail"' },
    // ── List ──
    'list-create': { desc: 'Creates a list from up to 3 items.', sample: 'my_list = [10, 20, 30]' },
    'list-get': { desc: 'Gets an item from a list by index (0-based).', sample: 'my_list = [10, 20, 30]\nitem = my_list[1]' },
    'list-length': { desc: 'Returns the number of items in a list.', sample: 'my_list = [10, 20, 30]\nn = len(my_list)' },
    'list-range': { desc: 'Generates a list of numbers from Start to End with Step.', sample: 'numbers = range(0, 10, 2)' },
    'list-reverse': { desc: 'Reverses the order of items in a list.', sample: 'my_list = [1, 2, 3]\nreversed_list = list(reversed(my_list))' },
    // ── Geometry ──
    'geo-point': { desc: 'Creates a 3D point from X, Y, Z coordinates.', sample: 'x = 5\ny = 3\nz = 0\npt = Geo.Point3(x, y, z)\nprint(pt)' },
    'geo-vector': { desc: 'Creates a 3D direction vector.', sample: 'vx = 0\nvy = 0\nvz = 1\nup = Geo.Vector3(vx, vy, vz)' },
    'geo-line': { desc: 'Creates a line between two points.', sample: 'start = Geo.Point3(0, 0, 0)\nend = Geo.Point3(10, 5, 0)\nline = Geo.Line3(start, end)\nprint(line)' },
    'geo-circle': { desc: 'Creates a circle from center point and radius.', sample: 'center = Geo.Point3(0, 0, 0)\nradius = 5\ncircle = Geo.Circle3(center, radius)\nprint(circle)' },
    'geo-distance': { desc: 'Calculates distance between two points.', sample: 'p1 = Geo.Point3(0, 0, 0)\np2 = Geo.Point3(3, 4, 0)\ndist = math.dist(p1, p2)\nprint(dist)' },
    // ── Solids ──
    'solid-box': { desc: 'Creates a box solid from center, width, depth, height.', sample: 'center = Geo.Point3(0, 0, 0)\nwidth = 10\ndepth = 8\nheight = 5\nbox = Geo.createBox(center, width, depth, height)\nprint(box)' },
    'solid-sphere': { desc: 'Creates a sphere from center and radius.', sample: 'center = Geo.Point3(0, 0, 0)\nradius = 5\nsphere = Geo.createSphere(center, radius)\nprint(sphere)' },
    'solid-cylinder': { desc: 'Creates a cylinder from base point, radius, height.', sample: 'base = Geo.Point3(0, 0, 0)\nradius = 3\nheight = 10\ncyl = Geo.createCylinder(base, radius, height)\nprint(cyl)' },
    'solid-cone': { desc: 'Creates a cone from base, radius, height.', sample: 'base = Geo.Point3(0, 0, 0)\nradius = 5\nheight = 8\ncone = Geo.createCone(base, radius, height)\nprint(cone)' },
    'solid-torus': { desc: 'Creates a torus (donut) from center, major and minor radius.', sample: 'center = Geo.Point3(0, 0, 0)\nmajor_r = 8\nminor_r = 2\ntorus = Geo.createTorus(center, major_r, minor_r)\nprint(torus)' },
    // ── Surfaces ──
    'surf-plane': { desc: 'Creates an infinite plane from origin and normal vector.', sample: 'origin = Geo.Point3(0, 0, 0)\nnormal = Geo.Vector3(0, 0, 1)\nplane = Geo.Plane(origin, normal)' },
    'surf-from-grid': { desc: 'Creates a mesh surface from a grid of points.', sample: 'import math\nu_count = 20\nv_count = 20\npoints = []\nfor i in range(u_count):\n    for j in range(v_count):\n        x = i * 0.5\n        y = j * 0.5\n        z = math.sin(x) * math.cos(y)\n        points.append(Geo.Point3(x, y, z))\nsurface = Geo.surfaceFromGrid(points, u_count, v_count)\nprint(surface)' },
    'surf-polyline': { desc: 'Creates a polyline curve through a list of points.', sample: 'import math\nnum_turns = 3\npoints_per_turn = 50\nradius = 5\nheight = 10\npoints = []\nfor i in range(num_turns * points_per_turn):\n    angle = 2 * math.pi * i / points_per_turn\n    x = radius * math.cos(angle)\n    y = radius * math.sin(angle)\n    z = height * i / (num_turns * points_per_turn)\n    points.append(Geo.Point3(x, y, z))\nspiral = Geo.Polyline3(points, False)\nprint(spiral)' },
    'surf-arc': { desc: 'Creates a circular arc from center, radius, start and end angles.', sample: 'center = Geo.Point3(0, 0, 0)\nradius = 5\nstart_angle = 0\nend_angle = 180\narc = Geo.Arc3(center, radius, math.radians(start_angle), math.radians(end_angle))\nprint(arc)' },
    // ── Operations ──
    'op-extrude': { desc: 'Sweeps a curve along a direction vector to create an open side-wall surface (no caps).', sample: 'center = Geo.Point3(0, 0, 0)\nradius = 5\ncircle = Geo.Circle3(center, radius)\ndirection = Geo.Vector3(0, 0, 10)\nsurface = Geo.extrude(circle, direction)\nprint(surface)' },
    'op-revolve': { desc: 'Revolves a curve around an axis to create a surface of revolution.', sample: 'start = Geo.Point3(3, 0, 0)\nend = Geo.Point3(5, 0, 10)\nprofile = Geo.Line3(start, end)\naxis_pt = Geo.Point3(0, 0, 0)\naxis_dir = Geo.Vector3(0, 0, 1)\nangle = 360\nsolid = Geo.revolve(profile, axis_pt, axis_dir, math.radians(angle))\nprint(solid)' },
    'op-loft': { desc: 'Creates a surface by connecting multiple cross-section profiles.', sample: 'import math\nprofiles = []\nfor i in range(5):\n    z = i * 3\n    r = 5 + 2 * math.sin(i * 0.8)\n    c = Geo.Circle3(Geo.Point3(0, 0, z), r)\n    profiles.append(c)\nsolid = Geo.loft(profiles)\nprint(solid)' },
    'op-boolean-union': { desc: 'Combines two solids into one (union).', sample: 'c1 = Geo.Point3(0, 0, 0)\nbox = Geo.createBox(c1, 10, 10, 5)\nc2 = Geo.Point3(5, 5, 0)\nsphere = Geo.createSphere(c2, 4)\nresult = Geo.booleanUnion(box, sphere)\nprint(result)' },
    'op-boolean-intersect': { desc: 'Keeps only the overlapping volume of two solids.', sample: 'c1 = Geo.Point3(0, 0, 0)\nbox = Geo.createBox(c1, 10, 10, 10)\nc2 = Geo.Point3(3, 3, 3)\nsphere = Geo.createSphere(c2, 6)\nresult = Geo.booleanIntersect(box, sphere)\nprint(result)' },
    'op-boolean-subtract': { desc: 'Cuts solid B out of solid A.', sample: 'center = Geo.Point3(0, 0, 0)\nwidth = 10\ndepth = 10\nheight = 5\nbox = Geo.createBox(center, width, depth, height)\nsphere_center = Geo.Point3(0, 0, 2.5)\nsphere_radius = 4\nsphere = Geo.createSphere(sphere_center, sphere_radius)\nresult = Geo.booleanSubtract(box, sphere)\nprint(result)' },
    'op-move': { desc: 'Translates geometry by a vector.', sample: 'center = Geo.Point3(0, 0, 0)\nbox = Geo.createBox(center, 5, 5, 5)\noffset = Geo.Vector3(10, 0, 0)\nmoved = Geo.move(box, offset)\nprint(moved)' },
    'op-scale': { desc: 'Scales geometry by a factor from an origin point.', sample: 'center = Geo.Point3(0, 0, 0)\nsphere = Geo.createSphere(center, 5)\nscale_factor = 2\nscaled = Geo.scaleGeo(sphere, scale_factor, center)\nprint(scaled)' },
    'op-offset': { desc: 'Offsets a polyline curve by a distance.', sample: 'import math\npoints = []\nfor i in range(20):\n    angle = 2 * math.pi * i / 20\n    points.append(Geo.Point3(5 * math.cos(angle), 5 * math.sin(angle), 0))\ncurve = Geo.Polyline3(points, True)\noffset_curve = Geo.offsetCurve(curve, 1.5)\nprint(offset_curve)' },
    'op-trim': { desc: 'Trims a line/curve between two parameters (0=start, 1=end).', sample: 'start = Geo.Point3(0, 0, 0)\nend = Geo.Point3(10, 10, 0)\nline = Geo.Line3(start, end)\nt0 = 0.2\nt1 = 0.8\ntrimmed = Geo.trimLine(line, t0, t1)\nprint(trimmed)' },
    'op-point-grid': { desc: 'Creates a rectangular grid of points.', sample: 'origin = Geo.Point3(0, 0, 0)\nu_count = 10\nv_count = 10\nspacing = 2\npoints = Geo.pointGrid(origin, Geo.Vector3(1,0,0), Geo.Vector3(0,1,0), u_count, v_count, spacing, spacing)\nprint(points)' },
    'op-sweep': { desc: 'Sweeps a profile shape along a path curve to create a solid.', sample: 'import math\npath_pts = []\nfor i in range(50):\n    t = i / 50 * math.pi * 2\n    path_pts.append(Geo.Point3(10 * math.cos(t), 10 * math.sin(t), i * 0.5))\npath = Geo.Polyline3(path_pts, False)\nprofile = Geo.Circle3(Geo.Point3(0, 0, 0), 1)\nsolid = Geo.sweep(profile, path)\nprint(solid)' },
    'op-pipe': { desc: 'Creates a tube/pipe along a curve with given radius.', sample: 'import math\npoints = []\nfor i in range(100):\n    t = i / 100 * math.pi * 4\n    points.append(Geo.Point3(10 * math.cos(t), 10 * math.sin(t), i * 0.3))\ncurve = Geo.Polyline3(points, False)\nradius = 0.5\npipe = Geo.pipe(curve, radius)\nprint(pipe)' },
    'op-thicken': { desc: 'Thickens a mesh surface by offsetting along normals.', sample: 'import math\nu_count = 15\nv_count = 15\npoints = []\nfor i in range(u_count):\n    for j in range(v_count):\n        x = i - 7\n        y = j - 7\n        z = 3 * math.sin(x * 0.5) * math.cos(y * 0.5)\n        points.append(Geo.Point3(x, y, z))\nsurface = Geo.surfaceFromGrid(points, u_count, v_count)\nthick = Geo.thicken(surface, 0.5)\nprint(thick)' },
    'op-subdivide': { desc: 'Subdivides mesh faces for smoother geometry (1-3 iterations).', sample: 'center = Geo.Point3(0, 0, 0)\nbox = Geo.createBox(center, 10, 10, 10)\niterations = 1\nsmooth_box = Geo.subdivide(box, iterations)\nprint(smooth_box)' },
    'op-smooth': { desc: 'Laplacian smoothing — relaxes mesh vertices for organic look.', sample: 'center = Geo.Point3(0, 0, 0)\nbox = Geo.createBox(center, 10, 10, 10)\niterations = 3\nsmoothed = Geo.smooth(box, iterations)\nprint(smoothed)' },
    'op-rotate': { desc: 'Rotates geometry around an axis by an angle in degrees.', sample: 'center = Geo.Point3(0, 0, 0)\nbox = Geo.createBox(center, 10, 3, 5)\naxis_pt = Geo.Point3(0, 0, 0)\naxis_dir = Geo.Vector3(0, 0, 1)\nangle = 45\nrotated = Geo.rotate(box, axis_pt, axis_dir, math.radians(angle))\nprint(rotated)' },
    'op-mirror': { desc: 'Mirrors geometry across a plane.', sample: 'center = Geo.Point3(5, 0, 0)\nbox = Geo.createBox(center, 4, 4, 8)\nplane_pt = Geo.Point3(0, 0, 0)\nplane_n = Geo.Vector3(1, 0, 0)\nmirrored = Geo.mirror(box, plane_pt, plane_n)\nresult = Geo.booleanUnion(box, mirrored)\nprint(result)' },
    'op-array-linear': { desc: 'Creates linear copies of geometry along a direction.', sample: 'center = Geo.Point3(0, 0, 0)\ncolumn = Geo.createCylinder(center, 0.5, 8)\ndirection = Geo.Vector3(4, 0, 0)\ncount = 5\nspacing = 4\ncolumns = Geo.arrayLinear(column, direction, count, spacing)\nresult = Geo.combineAll(columns)\nprint(result)' },
    'op-array-polar': { desc: 'Creates radial copies around a center axis.', sample: 'col_pt = Geo.Point3(8, 0, 0)\ncolumn = Geo.createCylinder(col_pt, 0.5, 10)\ncenter = Geo.Point3(0, 0, 0)\naxis = Geo.Vector3(0, 0, 1)\ncount = 8\ncolumns = Geo.arrayPolar(column, center, axis, count)\nresult = Geo.combineAll(columns)\nprint(result)' },
    'op-bezier': { desc: 'Creates a smooth Bezier curve through control points.', sample: 'p0 = Geo.Point3(0, 0, 0)\np1 = Geo.Point3(3, 10, 0)\np2 = Geo.Point3(7, 10, 5)\np3 = Geo.Point3(10, 0, 0)\npoints = [p0, p1, p2, p3]\ncurve = Geo.bezier(points)\nprint(curve)' },
    'op-interpolate': { desc: 'Creates a smooth Catmull-Rom curve through points.', sample: 'p0 = Geo.Point3(0, 0, 0)\np1 = Geo.Point3(3, 5, 2)\np2 = Geo.Point3(6, -2, 4)\np3 = Geo.Point3(10, 3, 0)\npoints = [p0, p1, p2, p3]\ncurve = Geo.interpolate(points)\nprint(curve)' },
    'op-ruled-surface': { desc: 'Creates a surface by linearly connecting two curves.', sample: 'import math\npts1 = []\npts2 = []\nfor i in range(30):\n    t = i / 29 * math.pi\n    pts1.append(Geo.Point3(i * 0.5, 0, 3 * math.sin(t)))\n    pts2.append(Geo.Point3(i * 0.5, 10, 5 * math.cos(t)))\ncurve1 = Geo.Polyline3(pts1, False)\ncurve2 = Geo.Polyline3(pts2, False)\nsurface = Geo.ruledSurface(curve1, curve2)\nprint(surface)' },
    'op-isolines': { desc: 'Extracts isolines (contour curves) from a mesh surface.', sample: 'import math\nu_count = 20\nv_count = 20\npoints = []\nfor i in range(u_count):\n    for j in range(v_count):\n        x = i - 10\n        y = j - 10\n        z = 3 * math.sin(x * 0.3) * math.cos(y * 0.3)\n        points.append(Geo.Point3(x, y, z))\nsurface = Geo.surfaceFromGrid(points, u_count, v_count)\nisolines = Geo.getIsolinesU(surface, 8)\nprint(isolines)' },
    'op-combine-all': { desc: 'Combines an array of meshes into a single mesh.', sample: 'center = Geo.Point3(0, 0, 0)\nsphere = Geo.createSphere(center, 2)\ndir = Geo.Vector3(5, 0, 0)\ncount = 4\nspacing = 5\nspheres = Geo.arrayLinear(sphere, dir, count, spacing)\nresult = Geo.combineAll(spheres)\nprint(result)' },
    // ── Output ──
    'output-watch': { desc: 'Displays the input value — like a print() statement.', sample: 'x = 42\nprint(x)' },
    'output-display': { desc: 'Displays value with format options (Auto, JSON, Table).', sample: 'data = [1, 2, 3]\nprint(data)' },
    'output-log': { desc: 'Logs value to console.', sample: 'print("Hello NodeFlow")' },
    'output-chart': { desc: 'Visualizes data as Bar, Line, or Pie chart.', sample: 'data = [10, 25, 15, 30, 20]\nprint(data)' },
    'output-export': { desc: 'Exports data as JSON, CSV, or Text.', sample: 'data = [1, 2, 3]\nprint(data)' },
    // ── Custom ──
    'custom-code': { desc: 'A custom code block — write any expression.', sample: 'x = 10\nresult = x * 2 + 1' },
    'custom-formula': { desc: 'Evaluates a math formula with x and y inputs.', sample: 'x = 5\ny = 3\nresult = x + y' },
    'custom-python': { desc: 'Full Python code block — for loops, functions, complex logic.', sample: 'import math\npoints = []\nfor i in range(100):\n    angle = 2 * math.pi * i / 100\n    points.append(Geo.Point3(math.cos(angle) * 5, math.sin(angle) * 5, 0))\nprint(points)' },
    'custom-comment': { desc: 'A comment node — for documentation only, no code generated.', sample: '# This is a comment' },
    'custom-ainode': { desc: 'AI-generated node — describe behavior in the prompt field.', sample: '# AI Generated: compute fibonacci' },
    // ── Revit ──
    'revit-collect-category': { desc: 'Collects all elements of a Revit category (Walls, Doors, Rooms, etc.).', sample: 'import clr\nclr.AddReference("RevitAPI")\nfrom Autodesk.Revit.DB import FilteredElementCollector, BuiltInCategory\nwalls = list(FilteredElementCollector(__currentdoc__).OfCategory(BuiltInCategory.OST_Walls).WhereElementIsNotElementType().ToElements())\nprint(f"Found {len(walls)} walls")' },
    'revit-collect-type': { desc: 'Collects all element types of a category.', sample: 'import clr\nclr.AddReference("RevitAPI")\nfrom Autodesk.Revit.DB import FilteredElementCollector, BuiltInCategory\nwall_types = list(FilteredElementCollector(__currentdoc__).OfCategory(BuiltInCategory.OST_Walls).WhereElementIsElementType().ToElements())\nfor wt in wall_types:\n    print(wt.Name)' },
    'revit-active-view': { desc: 'Gets the currently active view in Revit.', sample: 'view = __uidoc__.ActiveView\nprint(f"Active: {view.Name} ({view.ViewType})")' },
    'revit-selection': { desc: 'Gets the elements currently selected in Revit.', sample: 'sel_ids = __uidoc__.Selection.GetElementIds()\nelements = [__currentdoc__.GetElement(id) for id in sel_ids]\nprint(f"Selected: {len(elements)} elements")' },
    'revit-all-levels': { desc: 'Gets all levels in the project, sorted by elevation.', sample: 'import clr\nclr.AddReference("RevitAPI")\nfrom Autodesk.Revit.DB import FilteredElementCollector, Level\nlevels = sorted(FilteredElementCollector(__currentdoc__).OfClass(Level).ToElements(), key=lambda l: l.Elevation)\nfor lv in levels:\n    print(f"{lv.Name}: {lv.Elevation}")' },
    'revit-all-sheets': { desc: 'Gets all sheets in the project.', sample: 'import clr\nclr.AddReference("RevitAPI")\nfrom Autodesk.Revit.DB import FilteredElementCollector, ViewSheet\nsheets = list(FilteredElementCollector(__currentdoc__).OfClass(ViewSheet).ToElements())\nfor sh in sheets:\n    print(f"{sh.SheetNumber}: {sh.Name}")' },
    'revit-get-param': { desc: 'Reads a parameter value from a Revit element by name.', sample: 'param = element.LookupParameter("Mark")\nif param:\n    print(param.AsString())' },
    'revit-set-param': { desc: 'Sets a parameter value on a Revit element (requires transaction).', sample: 'from Autodesk.Revit.DB import Transaction\nt = Transaction(__currentdoc__, "Set Mark")\nt.Start()\nparam = element.LookupParameter("Mark")\nif param and not param.IsReadOnly:\n    param.Set("New Value")\nt.Commit()' },
    'revit-get-element-name': { desc: 'Gets the name of a Revit element.', sample: 'name = element.Name\nprint(name)' },
    'revit-get-element-id': { desc: 'Gets the integer Element ID.', sample: 'eid = element.Id.IntegerValue\nprint(eid)' },
    'revit-get-type-name': { desc: 'Gets the type name of a Revit element.', sample: 'etype = __currentdoc__.GetElement(element.GetTypeId())\nprint(etype.Name if etype else "Unknown")' },
    'revit-filter-param': { desc: 'Filters a list of elements by parameter value.', sample: 'filtered = []\nfor el in elements:\n    p = el.LookupParameter("Mark")\n    if p and p.AsString():\n        filtered.append(el)\nprint(f"Filtered: {len(filtered)}")' },
    'revit-for-each': { desc: 'Iterates through elements and runs code per element.', sample: 'results = []\nfor element in elements:\n    result = element.Name\n    results.append(result)\nprint(results)' },
    'revit-batch-set-param': { desc: 'Sets a parameter value on multiple elements at once.', sample: 'from Autodesk.Revit.DB import Transaction\nt = Transaction(__currentdoc__, "Batch Set")\nt.Start()\ncount = 0\nfor el in elements:\n    p = el.LookupParameter("Mark")\n    if p and not p.IsReadOnly:\n        p.Set("Updated")\n        count += 1\nt.Commit()\nprint(f"Updated {count}")' },
    'revit-delete-elements': { desc: 'Deletes elements from the Revit model (irreversible!).', sample: '# WARNING: This deletes elements!\nfrom Autodesk.Revit.DB import Transaction\nfrom System.Collections.Generic import List\nfrom Autodesk.Revit.DB import ElementId\nt = Transaction(__currentdoc__, "Delete")\nt.Start()\nids = List[ElementId]()\nfor el in elements:\n    ids.Add(el.Id)\n__currentdoc__.Delete(ids)\nt.Commit()' },
    'revit-export-data': { desc: 'Exports element data to a CSV file.', sample: 'import os, csv\nparams = ["Mark", "Comments"]\npath = os.path.join(os.environ.get("TEMP", "/tmp"), "export.csv")\nwith open(path, "w", newline="") as f:\n    w = csv.writer(f)\n    w.writerow(["Id", "Name"] + params)\n    for el in elements:\n        row = [str(el.Id.IntegerValue), el.Name]\n        for pn in params:\n            p = el.LookupParameter(pn)\n            row.append(p.AsString() if p else "")\n        w.writerow(row)\nprint(f"Exported to {path}")' }
  };

  // Make docs globally accessible
  window.NODE_DOCS = NODE_DOCS;

  // ── Add info button to node library items ──
  const origRenderNodeLibrary = app.renderNodeLibrary.bind(app);
  app.renderNodeLibrary = function() {
    origRenderNodeLibrary();
    // Add info icons and drag-sample capability to each library item
    document.querySelectorAll('.node-lib-item').forEach(item => {
      const type = item.getAttribute('ondragstart');
      if (!type) return;
      const typeMatch = type.match(/app\.onLibDragStart\(event,'([^']+)'\)/);
      if (!typeMatch) return;
      const nodeType = typeMatch[1];
      const doc = NODE_DOCS[nodeType];
      if (!doc) return;

      // Add info button
      const infoBtn = document.createElement('button');
      infoBtn.className = 'node-info-btn';
      infoBtn.textContent = '?';
      infoBtn.title = doc.desc;
      infoBtn.onclick = function(e) {
        e.stopPropagation();
        e.preventDefault();
        showNodeDoc(nodeType);
      };
      item.appendChild(infoBtn);
    });
  };
  // Re-render to add info buttons
  app.renderNodeLibrary();

  // ── Show documentation popup ──
  function showNodeDoc(nodeType) {
    const doc = NODE_DOCS[nodeType];
    const def = NODE_TYPE_MAP[nodeType];
    if (!doc || !def) return;

    // Remove existing popup
    const existing = document.getElementById('node-doc-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'node-doc-popup';
    popup.innerHTML = `
      <div class="ndp-header">
        <span class="ndp-icon" style="color:${def.categoryColor}">${def.icon}</span>
        <span class="ndp-title">${def.name}</span>
        <button class="ndp-close" onclick="document.getElementById('node-doc-popup').remove()">✕</button>
      </div>
      <p class="ndp-desc">${doc.desc}</p>
      <div class="ndp-ports">
        ${def.inputs.length ? '<div class="ndp-section">Inputs: ' + def.inputs.map(i => '<span class="ndp-port-tag">' + i.name + '</span>').join(' ') + '</div>' : ''}
        ${def.outputs.length ? '<div class="ndp-section">Outputs: ' + def.outputs.map(o => '<span class="ndp-port-tag out">' + o.name + '</span>').join(' ') + '</div>' : ''}
      </div>
      <div class="ndp-sample-header">Sample Code <button class="ndp-use-btn" onclick="app._useSampleCode('${nodeType}')">▶ Use This</button></div>
      <pre class="ndp-code">${doc.sample.replace(/</g,'&lt;')}</pre>
    `;
    document.body.appendChild(popup);

    // Position near center
    popup.style.left = Math.round((window.innerWidth - 400) / 2) + 'px';
    popup.style.top = Math.round((window.innerHeight - 350) / 2) + 'px';
  }

  // ── Use sample code: load into code editor and parse ──
  app._useSampleCode = function(nodeType) {
    const doc = NODE_DOCS[nodeType];
    if (!doc) return;
    // Close popup
    const popup = document.getElementById('node-doc-popup');
    if (popup) popup.remove();
    // Switch to workspace if needed
    if (app.currentPage !== 'workspace') app.newProject();
    // Load into code viewer and parse
    app.showCodeViewer(doc.sample, null);
    app._pendingCode = doc.sample;
    app.showApproveButtons();
    app.addAIMessage('workspace', '📋 Loaded **' + NODE_TYPE_MAP[nodeType].name + '** sample code. **Approve** to build the visual graph.');
  };
  return true;
}

export default installUiEnhancements;
