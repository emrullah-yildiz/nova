/**
 * Surface.Panelize — geometry kernel node (Surfaces category)
 *
 * Tiles a surface with a repeating unit panel shape across its UV domain and
 * returns the per-panel geometry. For a U×V grid of cells, each cell gets an
 * oriented surface frame (frameAtUV); the unit shape's corner loop is mapped
 * onto that frame — scaled to the cell's real U/V size times the Scale factor —
 * and fan-triangulated into a panel mesh with the SAME shape Surface.ByPatch
 * emits, so the existing viewer renders panels with no new render path.
 *
 * Inputs : surface (mesh/surface), shape (closed curve/polygon), u, v, scale.
 * Outputs: panels (mesh[]), corners (point[][] grouped per panel),
 *          center (point[]; center.length === panels.length).
 *
 * Reuses src/geometry/surface-eval.js (pointAtUV / frameAtUV) — does not
 * reimplement surface evaluation. Reuses src/geometry/frames.js (planeBasis)
 * to read each cell frame's orthonormal axes.
 *
 * Owned file: src/geometry/nodes/Surface.Panelize.js
 * Owner: geometry-engineer (mouse) — TICK-014 / T14a
 */

import { Geo } from '../index.js';
import { pointAtUV, frameAtUV } from '../surface-eval.js';
import { planeBasis } from '../frames.js';
import { panelShapeCorners } from '../panel-shapes.js';

const PANEL_COLOR = 0x94e2d5;

function toInt(value, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function toScale(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Resolve the Shape input to a LOCAL 2D corner loop normalized into the unit
 * cell ([-0.5, 0.5]²). Three cases:
 *   1. A plain option string ('Square', 'Hexagon', …) → panel-shapes builder.
 *   2. A closed curve / polyline → its boundary points, recentred on their
 *      centroid and scaled so the larger of width/height spans 1.0.
 *   3. Null / unusable → default Square.
 * Returns Geo.Point3[] with z = 0 (local frame coordinates).
 */
function resolveShapeLoop(shape) {
  // Case 1 — a premade option name.
  if (typeof shape === 'string') {
    return panelShapeCorners(shape);
  }

  // Case 2 — an actual curve/polyline. Pull its boundary points.
  let pts = null;
  if (shape && Array.isArray(shape.points) && shape.points.length >= 3) {
    pts = shape.points;
  } else if (shape && typeof Geo._curvePoints === 'function') {
    const sampled = Geo._curvePoints(shape, 48);
    if (Array.isArray(sampled) && sampled.length >= 3) pts = sampled;
  }

  if (!pts) {
    // Case 3 — unusable shape → default unit square.
    return panelShapeCorners('Square');
  }

  // Drop a trailing duplicate (closed loops re-list the start point).
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (
    Math.abs(first.x - last.x) < 1e-9 &&
    Math.abs(first.y - last.y) < 1e-9 &&
    Math.abs((first.z || 0) - (last.z || 0)) < 1e-9 &&
    pts.length > 3
  ) {
    pts = pts.slice(0, -1);
  }

  // Recentre on the centroid and normalize the larger extent to 1.0 so any
  // closed curve maps into a unit cell exactly like the premade shapes.
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;

  let maxX = -Infinity, minX = Infinity, maxY = -Infinity, minY = Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const span = Math.max(spanX, spanY) || 1;

  return pts.map((p) => new Geo.Point3((p.x - cx) / span, (p.y - cy) / span, 0));
}

/**
 * Build one panel mesh (fan-triangulated from its centroid, identical structure
 * to Surface.ByPatch) plus its corner points and centre, from a set of corner
 * points already mapped onto the surface.
 *
 * @param {Geo.Point3[]} cornerPts  panel boundary corners in world space
 * @returns {{ mesh: Geo.Mesh3, corners: Geo.Point3[], center: Geo.Point3 }}
 */
function buildPanel(cornerPts) {
  const n = cornerPts.length;
  let cx = 0, cy = 0, cz = 0;
  for (const p of cornerPts) { cx += p.x; cy += p.y; cz += p.z; }
  const center = new Geo.Point3(cx / n, cy / n, cz / n);

  // Fan triangulation: vertex 0 is the centroid, 1..n the boundary corners.
  const verts = [center];
  for (const p of cornerPts) verts.push(p);
  const faces = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push([0, i + 1, next + 1]);
  }
  const mesh = new Geo.Mesh3(verts, faces, PANEL_COLOR);
  mesh._solidType = 'Panel';

  return { mesh, corners: cornerPts, center };
}

/**
 * Core paneling routine — exported so unit tests can call it without a node
 * runtime context.
 *
 * @param {object} surface  any kernel surface (Mesh3 / Surface / NurbsSurface)
 * @param {*}      shape    option name OR a closed curve/polyline
 * @param {number} uCount   panel cells along U (>= 1)
 * @param {number} vCount   panel cells along V (>= 1)
 * @param {number} scale    per-panel scale within its cell (1 ≈ fills cell)
 * @returns {{ panels: Geo.Mesh3[], corners: Geo.Point3[][], center: Geo.Point3[] }}
 */
export function panelizeSurface(surface, shape, uCount, vCount, scale) {
  const empty = { panels: [], corners: [], center: [] };
  if (!surface) return empty;

  const uCells = toInt(uCount, 4);
  const vCells = toInt(vCount, 4);
  const s = toScale(scale, 1);
  const loop = resolveShapeLoop(shape);

  const panels = [];
  const cornersOut = [];
  const centerOut = [];

  for (let iu = 0; iu < uCells; iu++) {
    // Cell centre parameter and the cell's half-width in U parameter space.
    const uMid = (iu + 0.5) / uCells;
    const halfU = 0.5 / uCells;
    for (let iv = 0; iv < vCells; iv++) {
      const vMid = (iv + 0.5) / vCells;
      const halfV = 0.5 / vCells;

      // Frame at the cell centre — origin on the surface, X≈dU, Y≈dV, normal.
      const frame = frameAtUV(surface, uMid, vMid);
      const { origin, xAxis, yAxis } = planeBasis(frame);

      // Real cell dimensions in world units: distance the surface travels
      // across the cell in U and V around the centre. Measured by sampling the
      // cell's parameter edges so panels follow surface curvature/scale.
      const pUminus = pointAtUV(surface, Math.max(0, uMid - halfU), vMid);
      const pUplus = pointAtUV(surface, Math.min(1, uMid + halfU), vMid);
      const pVminus = pointAtUV(surface, uMid, Math.max(0, vMid - halfV));
      const pVplus = pointAtUV(surface, uMid, Math.min(1, vMid + halfV));
      const cellW = Math.hypot(pUplus.x - pUminus.x, pUplus.y - pUminus.y, pUplus.z - pUminus.z) || 1;
      const cellH = Math.hypot(pVplus.x - pVminus.x, pVplus.y - pVminus.y, pVplus.z - pVminus.z) || 1;

      // Map each unit-shape corner (local x,y ∈ [-0.5,0.5]) onto the frame.
      // local x scales by cellW, local y by cellH, both times the Scale factor.
      const worldCorners = loop.map((c) => {
        const sx = c.x * cellW * s;
        const sy = c.y * cellH * s;
        return new Geo.Point3(
          origin.x + xAxis.x * sx + yAxis.x * sy,
          origin.y + xAxis.y * sx + yAxis.y * sy,
          origin.z + xAxis.z * sx + yAxis.z * sy
        );
      });

      const panel = buildPanel(worldCorners);
      panels.push(panel.mesh);
      cornersOut.push(panel.corners);
      centerOut.push(panel.center);
    }
  }

  return { panels, corners: cornersOut, center: centerOut };
}

// ── Node definition ───────────────────────────────────────────────────────────

export const surfacePanelizeNode = {
  type: 'Surface.Panelize',
  name: 'Surface.Panelize',
  category: 'surfaces',
  subGroup: 'Operations',
  icon: '▦',
  aliases: ['surf-panelize', 'surface-panel', 'paneling'],
  description: 'Tiles a surface with a repeating panel shape across its UV domain. Divides the surface into U×V cells, orients the unit shape (from Input.PanelShapes or any closed curve) onto each cell, and returns one panel mesh per cell plus the per-panel corner points and centre points. Scale shrinks (<1, leaves gaps) or grows (>1, overlaps) each panel within its cell. Panels are meshes the viewer renders directly.',
  inputs: [
    { id: 'surface', name: 'Surface', type: 'mesh', description: 'Surface to clad (e.g. from Surface.ByPatch or Surface.ByPointGrid)' },
    { id: 'shape', name: 'Shape', type: 'curve', description: 'Unit panel shape — a closed curve from Input.PanelShapes or any closed polygon' },
    { id: 'u', name: 'U', type: 'number', description: 'Number of panel cells along the U direction' },
    { id: 'v', name: 'V', type: 'number', description: 'Number of panel cells along the V direction' },
    { id: 'scale', name: 'Scale', type: 'number', description: 'Per-panel scale within its cell (1 ≈ fills the cell, <1 gaps, >1 overlaps)' }
  ],
  outputs: [
    { id: 'panels', name: 'Panels', type: 'mesh', description: 'One panel mesh per cell, tiled across the surface' },
    { id: 'corners', name: 'Corners', type: 'point', description: 'Corner points grouped per panel (one group per panel)' },
    { id: 'center', name: 'Center', type: 'point', description: 'Centre point of each panel (one per panel)' }
  ],
  controls: [
    { id: 'u', type: 'formula', default: '4', label: 'U' },
    { id: 'v', type: 'formula', default: '4', label: 'V' },
    { id: 'scale', type: 'formula', default: '0.9', label: 'Scale' }
  ],
  execute(_context, inputs, controls) {
    const surface = inputs.surface;
    if (surface == null) {
      return { panels: [], corners: [], center: [] };
    }
    // Scale (and U/V) is BOTH a wireable input and a controls property — the
    // wired input wins when present, otherwise the inspector property is used.
    const u = inputs.u != null ? inputs.u : (controls && controls.u);
    const v = inputs.v != null ? inputs.v : (controls && controls.v);
    const scale = inputs.scale != null ? inputs.scale : (controls && controls.scale);
    return panelizeSurface(surface, inputs.shape, u, v, scale);
  },
  codegen: {
    python: '{{panels}}, {{corners}}, {{center}} = Geo.panelize({{surface}}, {{shape}}, int({{ctrl.u}}), int({{ctrl.v}}), {{ctrl.scale}})',
    csharp: 'var {{panels}} = Geo.panelize({{surface}}, {{shape}}, (int){{ctrl.u}}, (int){{ctrl.v}}, {{ctrl.scale}});'
  },
  help: {
    summary: 'Tiles a surface with a repeating panel shape and returns per-panel meshes, corners, and centres.',
    inputs: [
      { name: 'Surface', description: 'Surface to clad (Surface.ByPatch / Surface.ByPointGrid)' },
      { name: 'Shape', description: 'Unit panel shape from Input.PanelShapes or any closed curve' },
      { name: 'U', description: 'Panel cells along U' },
      { name: 'V', description: 'Panel cells along V' },
      { name: 'Scale', description: 'Per-panel scale within its cell (1 ≈ fills, <1 gaps, >1 overlaps)' }
    ],
    outputs: [
      { name: 'Panels', description: 'One panel mesh per cell' },
      { name: 'Corners', description: 'Corner points grouped per panel' },
      { name: 'Center', description: 'Centre point of each panel' }
    ],
    example: {
      title: 'Clad a circle patch with a grid of square panels — visible panels in Watch',
      nodes: [
        { type: 'Point.Origin', x: 0, y: 0 },
        { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
        { type: 'Circle.ByCenterRadius', x: 220, y: 30 },
        { type: 'Surface.ByPatch', x: 440, y: 30 },
        { type: 'Input.PanelShapes', x: 440, y: 150, controls: { shape: 'Square' } },
        { type: 'Surface.Panelize', x: 680, y: 70, controls: { u: 4, v: 4, scale: 0.9 } },
        { type: 'Output.Watch', x: 900, y: 70 }
      ],
      wires: [
        [0, 'point', 2, 'center'],
        [1, 'value', 2, 'radius'],
        [2, 'circle', 3, 'boundary'],
        [3, 'surface', 5, 'surface'],
        [4, 'shape', 5, 'shape'],
        [5, 'panels', 6, 'value']
      ]
    },
    sampleCode: '{{panels}}, {{corners}}, {{center}} = Geo.panelize({{surface}}, {{shape}}, 4, 4, 0.9)'
  }
};
