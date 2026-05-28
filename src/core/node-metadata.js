// ============================================
// NODEFLOW AI — Node Metadata Registry
// Single source of truth for all node descriptions,
// usage patterns, and examples.
// Used by: AI system prompt, parser logging, UI tooltips
// ============================================

export const NODE_META = {
  // ═══════════════════════════════════════
  // INPUT NODES
  // ═══════════════════════════════════════
  'number-input': {
    description: 'Editable number value. Becomes a draggable parameter on the canvas.',
    python: 'x = 10',
    csharp: 'double x = 10;',
    example: 'radius = 5',
    whenToUse: 'Any numeric parameter: dimensions, counts, angles, ratios. Always extract hardcoded numbers into Number nodes for editability.'
  },
  'text-input': {
    description: 'Editable text string value.',
    python: 's = "hello"',
    csharp: 'string s = "hello";',
    example: 'name = "Floor Plan"',
    whenToUse: 'Labels, names, file paths, any string parameter.'
  },
  'boolean-input': {
    description: 'True/False toggle switch.',
    python: 'flag = True',
    csharp: 'bool flag = true;',
    example: 'closed = True',
    whenToUse: 'On/off flags, closed/open curves, enable/disable features.'
  },
  'slider-input': {
    description: 'Number with a slider control for interactive adjustment.',
    python: 'val = 50',
    csharp: 'double val = 50;',
    example: 'twist_angle = 45',
    whenToUse: 'Parameters that benefit from interactive sliding: angles, percentages, blend factors.'
  },
  'integer-input': {
    description: 'Whole number value (no decimals).',
    python: 'n = int(5)',
    csharp: 'int n = 5;',
    example: 'floor_count = 20',
    whenToUse: 'Counts, indices, iterations — anything that must be a whole number.'
  },

  // ═══════════════════════════════════════
  // MATH NODES
  // ═══════════════════════════════════════
  'math-add': {
    description: 'Add two numbers: A + B.',
    python: 'result = a + b',
    csharp: 'var result = a + b;',
    example: 'total_height = base_height + roof_height',
    whenToUse: 'Combining dimensions, offsets, accumulations. Prefer over inline + in complex expressions.'
  },
  'math-subtract': {
    description: 'Subtract two numbers: A - B.',
    python: 'result = a - b',
    csharp: 'var result = a - b;',
    example: 'net_width = gross_width - wall_thickness',
    whenToUse: 'Differences, margins, reductions.'
  },
  'math-multiply': {
    description: 'Multiply two numbers: A × B.',
    python: 'result = a * b',
    csharp: 'var result = a * b;',
    example: 'area = width * depth',
    whenToUse: 'Scaling, areas, repeated values, unit conversions.'
  },
  'math-divide': {
    description: 'Divide two numbers: A ÷ B.',
    python: 'result = a / b',
    csharp: 'var result = a / b;',
    example: 'spacing = total_length / count',
    whenToUse: 'Ratios, spacing calculations, normalization.'
  },
  'math-power': {
    description: 'Raise base to exponent: base^exp.',
    python: 'result = math.pow(base, exp)',
    csharp: 'var result = Math.Pow(base, exp);',
    example: 'area = math.pow(radius, 2)',
    whenToUse: 'Exponents, square roots (exp=0.5), quadratic/cubic growth. Use math.pow() not ** operator.'
  },

  // ═══════════════════════════════════════
  // LOGIC NODES
  // ═══════════════════════════════════════
  'logic-and': {
    description: 'Logical AND: True if both A and B are True.',
    python: 'result = a and b',
    csharp: 'var result = a && b;',
    example: 'valid = is_visible and is_structural',
    whenToUse: 'Combining conditions for filtering.'
  },
  'logic-or': {
    description: 'Logical OR: True if either A or B is True.',
    python: 'result = a or b',
    csharp: 'var result = a || b;',
    example: 'selected = is_wall or is_floor',
    whenToUse: 'Alternative conditions.'
  },
  'logic-not': {
    description: 'Logical NOT: inverts a boolean.',
    python: 'result = not value',
    csharp: 'var result = !value;',
    example: 'hidden = not is_visible',
    whenToUse: 'Inverting conditions.'
  },
  'logic-compare': {
    description: 'Compare two values with ==, !=, <, >, <=, >=.',
    python: 'result = a == b',
    csharp: 'var result = a == b;',
    example: 'is_tall = height > 10',
    whenToUse: 'Threshold checks, equality tests, filtering conditions.'
  },
  'logic-if': {
    description: 'Conditional branch: returns True value if condition, else False value.',
    python: 'result = true_val if condition else false_val',
    csharp: 'var result = condition ? true_val : false_val;',
    example: 'material = "concrete" if is_structural else "glass"',
    whenToUse: 'Choosing between two values based on a condition.'
  },

  // ═══════════════════════════════════════
  // LIST NODES
  // ═══════════════════════════════════════
  'list-create': {
    description: 'Create a list from individual items.',
    python: 'lst = [a, b, c]',
    csharp: 'var lst = new List<object> { a, b, c };',
    example: 'points = [pt1, pt2, pt3]',
    whenToUse: 'Assembling small collections of known items (2-3 items). For large generated lists, use a for-loop with .append().'
  },
  'list-get': {
    description: 'Get an item from a list by index.',
    python: 'item = lst[i]',
    csharp: 'var item = lst[(int)i];',
    example: 'first_point = points[0]',
    whenToUse: 'Accessing specific elements by position.'
  },
  'list-length': {
    description: 'Count items in a list.',
    python: 'n = len(lst)',
    csharp: 'var n = lst.Count;',
    example: 'count = len(profiles)',
    whenToUse: 'Getting the size of a collection for iteration or display.'
  },
  'list-range': {
    description: 'Generate a sequence of numbers from start to end with step.',
    python: 'lst = range(start, end, step)',
    csharp: 'var lst = Enumerable.Range(start, end-start);',
    example: 'indices = range(0, 20, 1)',
    whenToUse: 'Creating sequences for iteration, index lists.'
  },
  'list-reverse': {
    description: 'Reverse the order of items in a list.',
    python: 'r = list(reversed(lst))',
    csharp: 'lst.Reverse();',
    example: 'reversed_profiles = list(reversed(profiles))',
    whenToUse: 'Flipping order for mirrored lofts, reverse iteration.'
  },
  'list-sequence': {
    description: 'Generate a sequence of evenly spaced numbers: start, start+step, start+2*step, ...',
    python: 'seq = [start + step * i for i in range(count)]',
    csharp: 'Enumerable.Range(0, count).Select(i => start + step * i)',
    example: 'heights = Sequence(0, 3.5, 20) → [0, 3.5, 7.0, 10.5, ...]',
    whenToUse: 'Generating floor levels, spacing values, parameter ranges. Like Dynamo Sequence node.'
  },
  'list-flatten': {
    description: 'Flatten a nested list into a single flat list.',
    python: 'flat = [item for sub in lst for item in sub]',
    csharp: 'lst.SelectMany(x => x)',
    example: 'all_points = Flatten([[pt1,pt2],[pt3,pt4]]) → [pt1,pt2,pt3,pt4]',
    whenToUse: 'After Cross Reference or nested list operations. Essential for surfaceFromGrid which needs a flat point list.'
  },
  'list-cross-ref': {
    description: 'Cross reference two lists — creates all combinations (like Dynamo List.CartesianProduct).',
    python: 'pairs_a = [a for a in listA for b in listB]\npairs_b = [b for a in listA for b in listB]',
    csharp: '// CartesianProduct',
    example: 'Cross Reference [0,1,2] × [0,1] → A=[0,0,1,1,2,2] B=[0,1,0,1,0,1]',
    whenToUse: 'Creating point grids from X and Y ranges. Replace nested for-loops with visual nodes.'
  },
  'list-map': {
    description: 'Apply an expression to every item in a list. Variable x = current item.',
    python: 'result = [f(x) for x in lst]',
    csharp: 'lst.Select(x => f(x))',
    example: 'doubled = ListMap([1,2,3], "x * 2") → [2,4,6]',
    whenToUse: 'Transforming values: scaling, converting units, applying math to each item.'
  },
  'list-filter': {
    description: 'Split a list into True/False based on a boolean mask list.',
    python: 'true_list = [v for v,m in zip(lst,mask) if m]',
    csharp: 'lst.Where((v,i) => mask[i])',
    example: 'Filter [1,2,3,4] by [T,F,T,F] → True=[1,3] False=[2,4]',
    whenToUse: 'Selecting elements by condition, filtering geometry by criteria.'
  },
  'list-count': {
    description: 'Count the number of items in a list.',
    python: 'n = len(lst)',
    csharp: 'lst.Count',
    example: 'total = Count(elements) → 42',
    whenToUse: 'Getting list size for display or calculations.'
  },
  'list-repeat': {
    description: 'Create a list by repeating an item N times.',
    python: 'lst = [item] * count',
    csharp: 'Enumerable.Repeat(item, count)',
    example: 'zeros = Repeat(0, 10) → [0,0,0,0,0,0,0,0,0,0]',
    whenToUse: 'Creating uniform lists, default values, padding.'
  },

  // ═══════════════════════════════════════
  // GEOMETRY NODES
  // ═══════════════════════════════════════
  'geo-point': {
    description: 'Create a 3D point from X, Y, Z coordinates.',
    python: 'pt = Geo.Point3(x, y, z)',
    csharp: 'var pt = new XYZ(x, y, z);',
    example: 'center = Geo.Point3(0, 0, 0)',
    whenToUse: 'ANY point creation. ALWAYS use Geo.Point3() — never bare tuples (x,y,z) which won\'t render in 3D.'
  },
  'geo-vector': {
    description: 'Create a 3D direction vector.',
    python: 'v = Geo.Vector3(x, y, z)',
    csharp: 'var v = new XYZ(x, y, z);',
    example: 'up = Geo.Vector3(0, 0, 1)',
    whenToUse: 'Directions for extrude, move, axis definitions, normals.'
  },
  'geo-line': {
    description: 'Create a line between two points.',
    python: 'ln = Geo.Line3(start, end)',
    csharp: 'var ln = Line.CreateBound(start, end);',
    example: 'axis = Geo.Line3(base_pt, top_pt)',
    whenToUse: 'Straight edges, axis definitions, structural members.'
  },
  'geo-circle': {
    description: 'Create a circle from center and radius.',
    python: 'c = Geo.Circle3(center, radius, normal)',
    csharp: 'var c = Arc.Create(center, radius, 0, 2*Math.PI, XYZ.BasisX, XYZ.BasisY);',
    example: 'floor_outline = Geo.Circle3(center, 10, Geo.Vector3(0,0,1))',
    whenToUse: 'Circular profiles, openings, column layouts.'
  },
  'geometry-distance': {
    description: 'Calculate distance between any two geometries by their center point.',
    python: 'd = Geo.distanceBetween(a, b)',
    csharp: '// Geo.distanceBetween(a, b)',
    example: 'span = Geo.distanceBetween(box, sphere)',
    whenToUse: 'Measuring spans between points, lines, circles, meshes, or any geometry. Works with points, lines, polylines, circles, arcs, and meshes.'
  },

  // ═══════════════════════════════════════
  // SOLID NODES
  // ═══════════════════════════════════════
  'solid-box': {
    description: 'Create a rectangular box solid from center, width, depth, height.',
    python: 'box = Geo.createBox(center, width, depth, height)',
    csharp: '// Geo.createBox(center, w, d, h)',
    example: 'floor_slab = Geo.createBox(Geo.Point3(0,0,0), 20, 12, 0.3)',
    whenToUse: 'Slabs, walls, panels, any rectangular solid. The most common building block.'
  },
  'solid-sphere': {
    description: 'Create a sphere solid from center and radius.',
    python: 'sph = Geo.createSphere(center, radius)',
    csharp: '// Geo.createSphere(center, r)',
    example: 'dome = Geo.createSphere(Geo.Point3(0,0,5), 8)',
    whenToUse: 'Domes, decorative elements, boolean cutters, test geometry.'
  },
  'solid-cylinder': {
    description: 'Create a cylinder solid from base point, radius, and height.',
    python: 'cyl = Geo.createCylinder(base, radius, height)',
    csharp: '// Geo.createCylinder(base, r, h)',
    example: 'column = Geo.createCylinder(Geo.Point3(0,0,0), 0.3, 3.5)',
    whenToUse: 'Columns, pipes, circular openings (as boolean cutters), structural elements.'
  },
  'solid-cone': {
    description: 'Create a cone solid from base, radius, and height.',
    python: 'cone = Geo.createCone(base, radius, height)',
    csharp: '// Geo.createCone(base, r, h)',
    example: 'roof = Geo.createCone(Geo.Point3(0,0,10), 6, 4)',
    whenToUse: 'Pointed roofs, tapered columns, decorative forms.'
  },
  'solid-torus': {
    description: 'Create a torus (donut shape) from center, major radius, minor radius.',
    python: 'tor = Geo.createTorus(center, majorR, minorR)',
    csharp: '// Geo.createTorus(center, R, r)',
    example: 'ring = Geo.createTorus(Geo.Point3(0,0,0), 8, 1.5)',
    whenToUse: 'Ring structures, curved connections, decorative elements.'
  },

  // ═══════════════════════════════════════
  // SURFACE NODES
  // ═══════════════════════════════════════
  'surf-plane': {
    description: 'Create an infinite plane from origin and normal vector.',
    python: 'pl = Geo.Plane(origin, normal)',
    csharp: '// Geo.Plane(origin, normal)',
    example: 'ground = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(0,0,1))',
    whenToUse: 'Reference planes, mirror planes, construction geometry.'
  },
  'surf-from-grid': {
    description: 'Create a surface mesh from a flat list of points arranged in a U×V grid.',
    python: 'surf = Geo.surfaceFromGrid(points, uCount, vCount)',
    csharp: '// Geo.surfaceFromGrid(pts, u, v)',
    example: 'terrain = Geo.surfaceFromGrid(heightmap_pts, 30, 30)',
    whenToUse: 'Terrain, canopies, free-form surfaces from point grids. Points must be a FLAT list, not nested arrays.'
  },
  'surf-polyline': {
    description: 'Create a polyline curve from a list of points.',
    python: 'poly = Geo.Polyline3(points, closed)',
    csharp: '// Geo.Polyline3(pts, closed)',
    example: 'outline = Geo.Polyline3(corner_pts, True)',
    whenToUse: 'Floor outlines, paths, profiles for lofting/extruding. Set closed=True for closed shapes.'
  },
  'surf-arc': {
    description: 'Create a circular arc from center, radius, start and end angles.',
    python: 'arc = Geo.Arc3(center, radius, startAngle, endAngle)',
    csharp: '// Geo.Arc3(center, r, start, end)',
    example: 'arc = Geo.Arc3(Geo.Point3(0,0,0), 5, 0, math.radians(180))',
    whenToUse: 'Curved walls, arched openings, partial circles. Angles in radians.'
  },

  // ═══════════════════════════════════════
  // OPERATION NODES
  // ═══════════════════════════════════════
  'op-extrude': {
    description: 'Extrude a 2D curve/profile along a direction vector to create a 3D solid.',
    python: 'solid = Geo.extrude(curve, vector)',
    csharp: '// Geo.extrude(curve, vec)',
    example: 'wall = Geo.extrude(floor_outline, Geo.Vector3(0, 0, 3))',
    whenToUse: 'Creating walls from outlines, columns from profiles, any linear extension of a 2D shape.'
  },
  'op-revolve': {
    description: 'Revolve a profile around an axis to create a solid of revolution.',
    python: 'solid = Geo.revolve(curve, axisOrigin, axisDir, angle)',
    csharp: '// Geo.revolve(curve, axisOrig, axisDir, angle)',
    example: 'dome = Geo.revolve(arch_curve, Geo.Point3(0,0,0), Geo.Vector3(0,0,1), math.radians(360))',
    whenToUse: 'Domes, vases, columns with profile, any axially symmetric geometry. Angle in radians.'
  },
  'op-loft': {
    description: 'Create a smooth surface by lofting through a list of profile curves.',
    python: 'solid = Geo.loft(profiles)',
    csharp: '// Geo.loft(profiles)',
    example: 'tower = Geo.loft(floor_profiles)',
    whenToUse: 'THE key operation for parametric architecture: towers, pavilions, organic forms. Feed it a list of Polyline3 or NurbsCurve profiles at different heights.'
  },
  'op-sweep': {
    description: 'Sweep a profile curve along a path curve.',
    python: 'solid = Geo.sweep(profile, path)',
    csharp: '// Geo.sweep(profile, path)',
    example: 'handrail = Geo.sweep(circle_profile, railing_path)',
    whenToUse: 'Handrails, moldings, pipes with custom profile, any constant-section element along a curve.'
  },
  'op-pipe': {
    description: 'Create a cylindrical pipe/tube along a curve with given radius.',
    python: 'solid = Geo.pipe(curve, radius)',
    csharp: '// Geo.pipe(curve, r)',
    example: 'structural_member = Geo.pipe(beam_curve, 0.15)',
    whenToUse: 'Structural members, diagrid pipes, tubular frames. Simpler than sweep — always circular section.'
  },
  'op-boolean-union': {
    description: 'Combine two solids into one (add).',
    python: 'result = Geo.booleanUnion(a, b)',
    csharp: '// Geo.booleanUnion(a, b)',
    example: 'combined = Geo.booleanUnion(tower, podium)',
    whenToUse: 'Joining separate solids into one. For many solids, use Combine All instead.'
  },
  'op-boolean-subtract': {
    description: 'Cut solid B from solid A (subtract).',
    python: 'result = Geo.booleanSubtract(a, b)',
    csharp: '// Geo.booleanSubtract(a, b)',
    example: 'wall_with_hole = Geo.booleanSubtract(wall, window_cutter)',
    whenToUse: 'Creating openings, windows, doors, carving forms. A minus B.'
  },
  'op-boolean-intersect': {
    description: 'Keep only the overlapping region of two solids.',
    python: 'result = Geo.booleanIntersect(a, b)',
    csharp: '// Geo.booleanIntersect(a, b)',
    example: 'overlap = Geo.booleanIntersect(building, envelope)',
    whenToUse: 'Finding common volume, clipping to a boundary.'
  },
  'op-combine-all': {
    description: 'Union an array of meshes into a single mesh.',
    python: 'result = Geo.combineAll(meshes)',
    csharp: '// Geo.combineAll(meshes)',
    example: 'facade = Geo.combineAll(panel_list)',
    whenToUse: 'Merging many solids from a loop (panels, columns, structural members). Much more efficient than chained booleanUnion.'
  },
  'op-move': {
    description: 'Translate geometry by a vector.',
    python: 'result = Geo.move(geometry, vector)',
    csharp: '// Geo.move(geo, vec)',
    example: 'raised_floor = Geo.move(floor_slab, Geo.Vector3(0, 0, 3.5))',
    whenToUse: 'Positioning elements, creating offsets, stacking floors.'
  },
  'op-rotate': {
    description: 'Rotate geometry around an axis by an angle.',
    python: 'result = Geo.rotate(geometry, axisOrigin, axisDir, angle)',
    csharp: '// Geo.rotate(geo, axisPt, axisDir, angle)',
    example: 'rotated = Geo.rotate(floor, Geo.Point3(0,0,0), Geo.Vector3(0,0,1), math.radians(15))',
    whenToUse: 'Twisting floors, rotating elements, creating radial patterns. Angle in radians.'
  },
  'op-scale': {
    description: 'Scale geometry by a factor from an origin point.',
    python: 'result = Geo.scaleGeo(geometry, factor, origin)',
    csharp: '// Geo.scaleGeo(geo, factor, origin)',
    example: 'smaller = Geo.scaleGeo(floor, 0.8, Geo.Point3(0,0,0))',
    whenToUse: 'Tapering towers (scale per floor), creating size variations.'
  },
  'op-mirror': {
    description: 'Mirror geometry across a plane.',
    python: 'result = Geo.mirror(geometry, planeOrigin, planeNormal)',
    csharp: '// Geo.mirror(geo, planeOrig, planeNorm)',
    example: 'mirrored = Geo.mirror(wing, Geo.Point3(0,0,0), Geo.Vector3(1,0,0))',
    whenToUse: 'Symmetrical buildings, creating matching halves.'
  },
  'op-array-linear': {
    description: 'Create linear copies of geometry along a direction.',
    python: 'result = Geo.arrayLinear(geometry, direction, count, spacing)',
    csharp: '// Geo.arrayLinear(geo, dir, count, spacing)',
    example: 'columns = Geo.arrayLinear(column, Geo.Vector3(1,0,0), 10, 5)',
    whenToUse: 'Repeating elements in a line: column grids, panel arrays, structural bays.'
  },
  'op-array-polar': {
    description: 'Create copies of geometry in a radial/circular pattern.',
    python: 'result = Geo.arrayPolar(geometry, center, axis, count)',
    csharp: '// Geo.arrayPolar(geo, center, axis, count)',
    example: 'petals = Geo.arrayPolar(petal, Geo.Point3(0,0,0), Geo.Vector3(0,0,1), 8)',
    whenToUse: 'Circular arrangements: round buildings, petal patterns, radial structures.'
  },
  'op-thicken': {
    description: 'Offset a surface mesh along its normals to create a solid shell.',
    python: 'result = Geo.thicken(mesh, thickness)',
    csharp: '// Geo.thicken(mesh, t)',
    example: 'shell = Geo.thicken(canopy_surface, 0.3)',
    whenToUse: 'Turning surfaces into shells: canopy roofs, curved walls, shell structures.'
  },
  'op-smooth': {
    description: 'Laplacian smoothing to soften angular geometry.',
    python: 'result = Geo.smooth(mesh, iterations, factor)',
    csharp: '// Geo.smooth(mesh, iters, factor)',
    example: 'organic = Geo.smooth(lofted_tower, 3, 0.5)',
    whenToUse: 'ALWAYS use after Geo.loft() to create smooth, organic forms. Essential for Zaha-style design.'
  },
  'op-subdivide': {
    description: 'Subdivision surface smoothing — increases mesh density.',
    python: 'result = Geo.subdivide(mesh, iterations)',
    csharp: '// Geo.subdivide(mesh, iters)',
    example: 'refined = Geo.subdivide(coarse_mesh, 2)',
    whenToUse: 'Creating smooth, high-poly meshes from coarse geometry. Use sparingly (expensive).'
  },
  'op-offset': {
    description: 'Offset a 2D polyline curve inward or outward.',
    python: 'result = Geo.offsetCurve(polyline, distance)',
    csharp: '// Geo.offsetCurve(poly, dist)',
    example: 'inner = Geo.offsetCurve(floor_outline, -0.5)',
    whenToUse: 'Creating wall inner/outer faces, panel margins, buffer zones.'
  },
  'op-trim': {
    description: 'Trim a curve by start and end parameters (0 to 1).',
    python: 'result = Geo.trimLine(line, t0, t1)',
    csharp: '// Geo.trimLine(line, t0, t1)',
    example: 'segment = Geo.trimLine(full_line, 0.2, 0.8)',
    whenToUse: 'Extracting portions of curves, creating partial elements.'
  },
  'op-bezier': {
    description: 'Create a Bezier curve from control points.',
    python: 'curve = Geo.bezier(controlPoints)',
    csharp: '// Geo.bezier(pts)',
    example: 'path = Geo.bezier([pt0, pt1, pt2, pt3])',
    whenToUse: 'Smooth curves defined by control points. Good for paths, profiles.'
  },
  'op-interpolate': {
    description: 'Create a smooth Catmull-Rom spline through points.',
    python: 'curve = Geo.interpolate(points, segsPerSpan, closed)',
    csharp: '// Geo.interpolate(pts, segs, closed)',
    example: 'smooth_profile = Geo.interpolate(corner_pts, 10, True)',
    whenToUse: 'Smooth closed profiles for lofting. The curve passes THROUGH all points (unlike Bezier).'
  },
  'op-ruled-surface': {
    description: 'Create a surface between two curves by linear interpolation.',
    python: 'surf = Geo.ruledSurface(curve1, curve2)',
    csharp: '// Geo.ruledSurface(c1, c2)',
    example: 'ramp = Geo.ruledSurface(lower_edge, upper_edge)',
    whenToUse: 'Simple surfaces between two edges: ramps, canopies, transitions.'
  },
  'op-isolines': {
    description: 'Extract U or V direction isolines from a mesh surface.',
    python: 'curves = Geo.getIsolinesU(mesh, count)',
    csharp: '// Geo.getIsolinesU(mesh, count)',
    example: 'ribs = Geo.getIsolinesU(shell_surface, 12)',
    whenToUse: 'Extracting structural ribs, grid lines, analysis curves from surfaces.'
  },
  'op-point-grid': {
    description: 'Create a grid of points in U and V directions.',
    python: 'pts = Geo.pointGrid(origin, uDir, vDir, uCount, vCount, uSpacing, vSpacing)',
    csharp: '// Geo.pointGrid(origin, uDir, vDir, uN, vN, uS, vS)',
    example: 'grid = Geo.pointGrid(Geo.Point3(0,0,0), Geo.Vector3(1,0,0), Geo.Vector3(0,1,0), 10, 10, 2, 2)',
    whenToUse: 'Creating point grids for facades, column layouts, surface generation.'
  },

  // ═══════════════════════════════════════
  // OUTPUT NODES
  // ═══════════════════════════════════════
  'output-watch': {
    description: 'Display/inspect a value. The final output node.',
    python: 'print(result)',
    csharp: 'Console.WriteLine(result);',
    example: 'print(tower)',
    whenToUse: 'ALWAYS end with print(final_result) so the 3D viewer can render it.'
  },
  'output-display': {
    description: 'Display a value with formatting options.',
    python: 'print(value)',
    csharp: 'Console.WriteLine(value);',
    example: 'print(area)',
    whenToUse: 'Displaying intermediate results, debugging values.'
  },

  // ═══════════════════════════════════════
  // CUSTOM/CODE NODES
  // ═══════════════════════════════════════
  'custom-python': {
    description: 'Multi-line Python code block. Used ONLY when no visual node can represent the operation.',
    python: '# Multi-line Python code\nfor i in range(n):\n    points.append(Geo.Point3(...))',
    csharp: '// Manual C# code block',
    example: 'Loop generating point arrays, complex math expressions',
    whenToUse: 'LAST RESORT. Only for: (1) loops building arrays with .append(), (2) complex expressions that cannot be decomposed into single-line assignments. ALWAYS log WHY in the console if using this node.'
  }
};

// ═══════════════════════════════════════
// BUILD AI REFERENCE FROM METADATA
// Generates a compact text block the AI system prompt can use
// ═══════════════════════════════════════
export function buildNodeReference() {
  var lines = [];
  lines.push('## AVAILABLE NODES — Use these patterns in your code');
  lines.push('Each line below shows: NodeType | Python pattern | When to use');
  lines.push('The parser maps these EXACT patterns to visual nodes. Anything else becomes a Python block.\n');
  
  var categories = {
    'Input': ['number-input', 'text-input', 'boolean-input', 'integer-input'],
    'Math': ['math-add', 'math-subtract', 'math-multiply', 'math-divide', 'math-power'],
    'Logic': ['logic-compare', 'logic-if', 'logic-and', 'logic-or', 'logic-not'],
    'List': ['list-create', 'list-get', 'list-length', 'list-range', 'list-reverse'],
    'Geometry': ['geo-point', 'geo-vector', 'geo-line', 'geo-circle', 'geo-distance'],
    'Solids': ['solid-box', 'solid-sphere', 'solid-cylinder', 'solid-cone', 'solid-torus'],
    'Surfaces': ['surf-from-grid', 'surf-polyline', 'surf-arc', 'surf-plane'],
    'Operations': ['op-extrude', 'op-revolve', 'op-loft', 'op-sweep', 'op-pipe',
                   'op-boolean-union', 'op-boolean-subtract', 'op-boolean-intersect', 'op-combine-all',
                   'op-move', 'op-rotate', 'op-scale', 'op-mirror',
                   'op-array-linear', 'op-array-polar',
                   'op-thicken', 'op-smooth', 'op-subdivide',
                   'op-offset', 'op-trim', 'op-bezier', 'op-interpolate',
                   'op-ruled-surface', 'op-isolines', 'op-point-grid'],
    'Output': ['output-watch']
  };
  
  for (var catName in categories) {
    lines.push('**' + catName + ':**');
    var nodeTypes = categories[catName];
    for (var i = 0; i < nodeTypes.length; i++) {
      var meta = NODE_META[nodeTypes[i]];
      if (meta) {
        lines.push('- `' + meta.python + '` — ' + meta.description);
      }
    }
    lines.push('');
  }
  
  lines.push('**Python Block** (LAST RESORT):');
  lines.push('- Only for loops with .append() or expressions with no visual equivalent');
  lines.push('- AI MUST log reason in console: NFLogger.info("ai","Used Python node because: <reason>")');
  
  return lines.join('\n');
}

// ═══════════════════════════════════════
// ENRICH NODE DEFINITIONS WITH METADATA
// Patches NODE_TYPE_MAP after all node files load
// ═══════════════════════════════════════
export function enrichNodeDefinitions() {
  if (typeof NODE_TYPE_MAP === 'undefined') return;
  for (var nodeType in NODE_META) {
    var def = NODE_TYPE_MAP[nodeType];
    if (def) {
      def.meta = NODE_META[nodeType];
      // Add tooltip-friendly description
      if (!def.description) def.description = NODE_META[nodeType].description;
    }
  }
  if (typeof NFLogger !== 'undefined') {
    var enriched = Object.keys(NODE_META).filter(function(k) { return NODE_TYPE_MAP[k]; }).length;
    var missing = Object.keys(NODE_META).filter(function(k) { return !NODE_TYPE_MAP[k]; });
    NFLogger.info('metadata', 'Enriched ' + enriched + ' node definitions', { missing: missing });
  }
}

// Run enrichment after DOM loads (all node files will be loaded by then)
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(enrichNodeDefinitions, 100);
});

// Make available globally
window.NODE_META = NODE_META;
window.buildNodeReference = buildNodeReference;
window.enrichNodeDefinitions = enrichNodeDefinitions;
