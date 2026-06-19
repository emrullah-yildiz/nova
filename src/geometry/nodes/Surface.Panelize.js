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
import { panelShapeCorners, panelShapeTiling, DEFAULT_PANEL_TILING } from '../panel-shapes.js';

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
 * cell ([-0.5, 0.5]²) PLUS its tiling kind ('rect' | 'hex' | 'diamond' |
 * 'none'). The tiling kind selects the gap-free lattice Surface.Panelize lays
 * panel centres on. Three cases:
 *   1. A plain option string ('Square', 'Hexagon', …) → panel-shapes builder
 *      + its registered tiling kind.
 *   2. A closed curve / polyline → its boundary points, recentred on their
 *      centroid and scaled so the larger of width/height spans 1.0. The tiling
 *      kind is read off the curve's `_tilingKind` tag when present (premade
 *      shapes from Input.PanelShapes carry it), else 'none' — an arbitrary
 *      wired curve falls back to per-cell stamping (no assumed tessellation).
 *   3. Null / unusable → default Square ('rect').
 * Returns { loop: Geo.Point3[] (z = 0), tiling: string }.
 */
function resolveShape(shape) {
  // Case 1 — a premade option name.
  if (typeof shape === 'string') {
    return { loop: panelShapeCorners(shape), tiling: panelShapeTiling(shape) };
  }

  // Tiling kind tagged on the curve by Input.PanelShapes (non-enumerable).
  const taggedTiling =
    shape && typeof shape._tilingKind === 'string' ? shape._tilingKind : DEFAULT_PANEL_TILING;

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
    return { loop: panelShapeCorners('Square'), tiling: 'rect' };
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

  const loop = pts.map((p) => new Geo.Point3((p.x - cx) / span, (p.y - cy) / span, 0));
  return { loop, tiling: taggedTiling };
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
 * Map a unit-shape loop (local x,y ∈ [-0.5,0.5]) onto the surface frame at a
 * centre parameter (uMid, vMid), scaling local-x by `worldX` and local-y by
 * `worldY` world units (already including the Scale factor), and build the
 * panel mesh + corners + centre. Shared by the rect and staggered layouts.
 */
function stampPanel(surface, loop, uMid, vMid, worldX, worldY) {
  const frame = frameAtUV(surface, uMid, vMid);
  const { origin, xAxis, yAxis } = planeBasis(frame);
  const worldCorners = loop.map((c) => {
    const sx = c.x * worldX;
    const sy = c.y * worldY;
    return new Geo.Point3(
      origin.x + xAxis.x * sx + yAxis.x * sy,
      origin.y + xAxis.y * sx + yAxis.y * sy,
      origin.z + xAxis.z * sx + yAxis.z * sy
    );
  });
  return buildPanel(worldCorners);
}

// World distance the surface travels across a U/V parameter span centred on
// (uMid,vMid). Used to convert a UV pitch into a world size so panels follow
// the surface's real scale/curvature.
function worldSpanU(surface, uMid, vMid, du) {
  const a = pointAtUV(surface, Math.max(0, uMid - du / 2), vMid);
  const b = pointAtUV(surface, Math.min(1, uMid + du / 2), vMid);
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
}
function worldSpanV(surface, uMid, vMid, dv) {
  const a = pointAtUV(surface, uMid, Math.max(0, vMid - dv / 2));
  const b = pointAtUV(surface, uMid, Math.min(1, vMid + dv / 2));
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
}

// A SINGLE global world size for one UV pitch, measured at the surface centre
// (u=0.5 / v=0.5) WITHOUT edge clamping, so every tessellated panel is sized
// identically (a uniform global pitch). Per-panel re-measurement would clamp at
// the domain edges (halving boundary-row panels) and break the shared-edge
// tessellation — the honeycomb needs one uniform hex size, not per-cell sizes.
function globalSpanU(surface, du) {
  const a = pointAtUV(surface, clamp01(0.5 - du / 2), 0.5);
  const b = pointAtUV(surface, clamp01(0.5 + du / 2), 0.5);
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
}
function globalSpanV(surface, dv) {
  const a = pointAtUV(surface, 0.5, clamp01(0.5 - dv / 2));
  const b = pointAtUV(surface, 0.5, clamp01(0.5 + dv / 2));
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
}

function clamp01(t) {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/**
 * Stretch a unit loop so its bounding box exactly fills [-0.5,0.5]² in BOTH
 * axes. A rect-kind panel must FILL its cell to tile gap-free; the premade
 * Rectangle is 2:1 (half-height), so without this it covers the cell width but
 * only half its height, leaving horizontal gaps between rows. Square is already
 * [-0.5,0.5]² so it is unchanged. (Only applied to the 'rect' tiling kind —
 * round/irregular 'none' shapes keep their aspect and gap by nature.)
 */
function fillCellLoop(loop) {
  let maxX = 0, maxY = 0;
  for (const p of loop) {
    if (Math.abs(p.x) > maxX) maxX = Math.abs(p.x);
    if (Math.abs(p.y) > maxY) maxY = Math.abs(p.y);
  }
  const sx = maxX > 1e-9 ? 0.5 / maxX : 1;
  const sy = maxY > 1e-9 ? 0.5 / maxY : 1;
  return loop.map((p) => new Geo.Point3(p.x * sx, p.y * sy, p.z || 0));
}

/**
 * Original per-cell stamping: divide the surface into uCells×vCells rectangular
 * cells and stamp one shape centred in each, sized to the cell. Tiles seamlessly
 * for rect shapes (Square/Rectangle); used for 'none' shapes (Circle / arbitrary
 * curves) too — round/irregular shapes cannot tessellate, so per-cell is correct.
 */
function panelizePerCell(surface, loop, uCells, vCells, s) {
  const panels = [];
  const cornersOut = [];
  const centerOut = [];
  for (let iu = 0; iu < uCells; iu++) {
    const uMid = (iu + 0.5) / uCells;
    for (let iv = 0; iv < vCells; iv++) {
      const vMid = (iv + 0.5) / vCells;
      // Cell size in world units (the full cell span = 1/cells in each param).
      const cellW = worldSpanU(surface, uMid, vMid, 1 / uCells);
      const cellH = worldSpanV(surface, uMid, vMid, 1 / vCells);
      const panel = stampPanel(surface, loop, uMid, vMid, cellW * s, cellH * s);
      panels.push(panel.mesh);
      cornersOut.push(panel.corners);
      centerOut.push(panel.center);
    }
  }
  return { panels, corners: cornersOut, center: centerOut };
}

// Local-unit packing constants for the premade pointy-top hexagon
// (hexagonLoop, circumradius R = 0.5, vertices at 30°,90°,…,330° → points at
// top/bottom on the Y axis, flat edges left/right on the X axis):
//   • flat-to-flat WIDTH  = √3·R  (the horizontal column pitch)
//   • ROW pitch           = 1.5·R (¾ of the 2R vertex-to-vertex height)
// Alternate rows are offset by half the column pitch — standard hex packing.
const HEX_R = 0.5;
const HEX_WIDTH = Math.sqrt(3) * HEX_R;   // ≈ 0.8660  (local flat-to-flat)
const HEX_ROW_PITCH = 1.5 * HEX_R;        // = 0.75    (local row pitch)

/**
 * Staggered HONEYCOMB layout for hexagon panels — a gap-free tessellation.
 *
 * uCells = hex columns across U, vCells = hex rows across V. Centres sit on a
 * lattice with column pitch pu = 1/uCells and row pitch pv = 1/vCells in UV,
 * alternate rows offset by pu/2. Each panel is sized so the unit hex's local
 * flat-to-flat width (HEX_WIDTH) maps to one full column pitch in world units
 * and its row-pitch dimension (HEX_ROW_PITCH) maps to one full row pitch — so
 * at scale 1 adjacent hexagon EDGES coincide (shared edges, no gaps). Scale <1
 * shrinks every panel uniformly about its centre (uniform reveal gaps); >1
 * overlaps. The honeycomb covers extra staggered centres at the row ends, so
 * the panel COUNT differs from a plain uCells×vCells grid (expected & correct).
 */
function panelizeHex(surface, loop, uCells, vCells, s) {
  const pu = 1 / uCells; // column pitch in U
  const pv = 1 / vCells; // row pitch in V

  // ONE global hex size for every panel: local flat-to-flat width → one column
  // pitch (worldCol), local row-pitch dimension → one row pitch (worldRow), both
  // measured once at the surface centre. Uniform sizing is what makes adjacent
  // hex edges coincide everywhere — including the boundary rows.
  const worldCol = globalSpanU(surface, pu);
  const worldRow = globalSpanV(surface, pv);
  const worldX = (worldCol / HEX_WIDTH) * s;
  const worldY = (worldRow / HEX_ROW_PITCH) * s;

  const panels = [];
  const cornersOut = [];
  const centerOut = [];

  // Rows span v ∈ [0,1] inclusive; columns span u ∈ [0,1]. Include centres up to
  // and including the far edge so the honeycomb covers the whole surface.
  const rows = Math.round(1 / pv);
  for (let j = 0; j <= rows; j++) {
    const vMid = j * pv;
    if (vMid > 1 + 1e-9) break;
    const offset = (j % 2) * (pu / 2); // stagger alternate rows by half a column
    const cols = Math.round(1 / pu);
    for (let i = 0; i <= cols; i++) {
      const uMid = i * pu + offset;
      if (uMid > 1 + 1e-9) break;
      const panel = stampPanel(surface, loop, clamp01(uMid), clamp01(vMid), worldX, worldY);
      panels.push(panel.mesh);
      cornersOut.push(panel.corners);
      centerOut.push(panel.center);
    }
  }
  return { panels, corners: cornersOut, center: centerOut };
}

/**
 * Staggered DIAMOND layout for Diagonal panels — diamonds interlock with shared
 * edges (a square grid rotated 45°). uCells = diamond columns, vCells controls
 * the row density. Diamond centres sit on a checkerboard: row pitch pv = 1/vCells,
 * column pitch pu = 1/uCells, alternate rows offset by pu/2, and rows half a
 * column pitch apart vertically so each diamond's slanted edges coincide with
 * its four diagonal neighbours. The unit diamond (vertices at ±0.5 on each axis,
 * full width = full height = 1.0) is sized so width→column pitch and height→two
 * row pitches in world units, giving shared edges at scale 1.
 */
function panelizeDiamond(surface, loop, uCells, vCells, s) {
  const pu = 1 / uCells;       // column pitch in U
  const pv = 1 / (2 * vCells); // row pitch in V — half a column so diamonds interlock

  // ONE global diamond size for every panel (uniform, measured at the centre).
  // Diamond full width (1.0) → one column pitch; full height (1.0) → two row
  // pitches (it spans two staggered rows vertically). Uniform sizing → shared edges.
  const worldX = globalSpanU(surface, pu) * s;
  const worldY = globalSpanV(surface, 2 * pv) * s;

  const panels = [];
  const cornersOut = [];
  const centerOut = [];

  const rows = Math.round(1 / pv);
  for (let j = 0; j <= rows; j++) {
    const vMid = j * pv;
    if (vMid > 1 + 1e-9) break;
    const offset = (j % 2) * (pu / 2);
    const cols = Math.round(1 / pu);
    for (let i = 0; i <= cols; i++) {
      const uMid = i * pu + offset;
      if (uMid > 1 + 1e-9) break;
      const panel = stampPanel(surface, loop, clamp01(uMid), clamp01(vMid), worldX, worldY);
      panels.push(panel.mesh);
      cornersOut.push(panel.corners);
      centerOut.push(panel.center);
    }
  }
  return { panels, corners: cornersOut, center: centerOut };
}

/**
 * Core paneling routine — exported so unit tests can call it without a node
 * runtime context.
 *
 * Tessellation dispatch by the shape's tiling kind:
 *   • 'rect'    → per-cell grid (Square/Rectangle already tile a rectangle).
 *   • 'hex'     → staggered honeycomb (gap-free hexagons, shared edges).
 *   • 'diamond' → staggered checkerboard (interlocking diamonds, shared edges).
 *   • 'none'    → per-cell grid (Circle / arbitrary curves can't tessellate).
 * In every case Scale shrinks (<1, reveal gaps) or grows (>1, overlap) panels
 * uniformly about their centres; scale 1 = touching / gap-free for tiling shapes.
 *
 * @param {object} surface  any kernel surface (Mesh3 / Surface / NurbsSurface)
 * @param {*}      shape    option name OR a closed curve/polyline
 * @param {number} uCount   panel cells/columns along U (>= 1)
 * @param {number} vCount   panel cells/rows along V (>= 1)
 * @param {number} scale    per-panel scale (1 ≈ touching for tiling shapes)
 * @returns {{ panels: Geo.Mesh3[], corners: Geo.Point3[][], center: Geo.Point3[] }}
 */
export function panelizeSurface(surface, shape, uCount, vCount, scale) {
  const empty = { panels: [], corners: [], center: [] };
  if (!surface) return empty;

  const uCells = toInt(uCount, 4);
  const vCells = toInt(vCount, 4);
  const s = toScale(scale, 1);
  const { loop, tiling } = resolveShape(shape);

  switch (tiling) {
    case 'hex':
      return panelizeHex(surface, loop, uCells, vCells, s);
    case 'diamond':
      return panelizeDiamond(surface, loop, uCells, vCells, s);
    case 'rect':
      // Rect panels must FILL the cell to tile gap-free (the 2:1 Rectangle would
      // otherwise leave horizontal gaps between rows).
      return panelizePerCell(surface, fillCellLoop(loop), uCells, vCells, s);
    case 'none':
    default:
      return panelizePerCell(surface, loop, uCells, vCells, s);
  }
}

// ── Node definition ───────────────────────────────────────────────────────────

export const surfacePanelizeNode = {
  type: 'Surface.Panelize',
  name: 'Surface.Panelize',
  category: 'surfaces',
  subGroup: 'Operations',
  icon: '▦',
  aliases: ['surf-panelize', 'surface-panel', 'paneling'],
  description: 'Tiles a surface with a repeating panel shape across its UV domain. Square/Rectangle fill a U×V grid; Hexagon forms a gap-free honeycomb and Diagonal (diamond) interlocks on a staggered lattice (so their panel COUNT exceeds U×V); Circle and arbitrary closed curves stamp one per cell (round shapes leave inherent gaps). Returns one mesh per panel plus the per-panel corner points and centre points. Scale shrinks (<1, reveal gaps) or grows (>1, overlaps) every panel uniformly about its centre — at scale 1 tessellating shapes share edges with no gaps. Panels are meshes the viewer renders directly.',
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
