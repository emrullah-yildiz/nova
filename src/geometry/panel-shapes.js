// ============================================
// NOVA — Geometry Kernel: Panel Shapes (TICK-014 / T14a)
//
// Pure builders for the premade unit panel shapes the Input.PanelShapes node
// supplies and the Surface.Panelize node tiles across a surface. Each builder
// returns a closed loop of corner points in the LOCAL XY plane (z = 0), centred
// on the origin and sized to fit a unit cell — its extent spans roughly
// [-0.5, +0.5] in both X and Y so a panel "fills" one UV cell at scale = 1.
//
// The corner loop is the single source of truth: Input.PanelShapes wraps it in
// a closed Geo.Polyline3 (so it watches/wires like any other curve), and
// Surface.Panelize maps each corner onto the surface frame of a cell to build
// the per-panel mesh. Shapes are open loops (no trailing duplicate point) —
// closure is conveyed by Polyline3.closed = true.
//
// Pure math only — no THREE.js, no DOM.
// ============================================

import { Geo } from './geometry-lib.js';

// Canonical option keys (also the dropdown labels). Diagonal first to match the
// ticket's option order: Diagonal, Rectangle, Square, Hexagon, Circle.
export const PANEL_SHAPE_OPTIONS = ['Diagonal', 'Rectangle', 'Square', 'Hexagon', 'Circle'];

export const DEFAULT_PANEL_SHAPE = 'Square';

// Half-extent of a unit cell. Corner coordinates live within [-H, +H].
const H = 0.5;

// Number of segments used to approximate the circle as a closed polygon.
const CIRCLE_SEGMENTS = 32;

function pt(x, y) {
  return new Geo.Point3(x, y, 0);
}

// ── Individual unit shapes (each returns Geo.Point3[] — an OPEN corner loop) ──

// Square: 4 corners filling the cell.
function squareLoop() {
  return [pt(-H, -H), pt(H, -H), pt(H, H), pt(-H, H)];
}

// Rectangle: 4 corners, wider than tall (2:1) so it visibly differs from Square.
function rectangleLoop() {
  const w = H;        // half-width  (full width  = 1.0)
  const d = H * 0.5;  // half-depth  (full depth  = 0.5)
  return [pt(-w, -d), pt(w, -d), pt(w, d), pt(-w, d)];
}

// Diagonal: a diamond (square rotated 45°) — 4 corners on the cell axes.
function diagonalLoop() {
  return [pt(0, -H), pt(H, 0), pt(0, H), pt(-H, 0)];
}

// Hexagon: 6 corners, flat-top regular hexagon inscribed in the unit cell.
function hexagonLoop() {
  const r = H; // circumradius
  const loop = [];
  for (let i = 0; i < 6; i++) {
    // Start at +30° so the hexagon has a flat top/bottom edge.
    const a = (Math.PI / 180) * (30 + i * 60);
    loop.push(pt(r * Math.cos(a), r * Math.sin(a)));
  }
  return loop;
}

// Circle: closed polygon approximation — CIRCLE_SEGMENTS corners.
function circleLoop() {
  const r = H;
  const loop = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    loop.push(pt(r * Math.cos(a), r * Math.sin(a)));
  }
  return loop;
}

const BUILDERS = {
  Diagonal: diagonalLoop,
  Rectangle: rectangleLoop,
  Square: squareLoop,
  Hexagon: hexagonLoop,
  Circle: circleLoop
};

/**
 * Resolve a dropdown option (case-insensitive) to its canonical key, falling
 * back to the default shape for unknown input.
 *
 * @param {string} option
 * @returns {string} canonical option key
 */
export function normalizePanelShape(option) {
  if (typeof option === 'string') {
    const hit = PANEL_SHAPE_OPTIONS.find(
      (k) => k.toLowerCase() === option.trim().toLowerCase()
    );
    if (hit) return hit;
  }
  return DEFAULT_PANEL_SHAPE;
}

/**
 * The OPEN corner loop (Geo.Point3[]) of a named unit shape, centred on the
 * origin in the local XY plane. Closure is implicit (last → first).
 *
 * @param {string} option  one of PANEL_SHAPE_OPTIONS (case-insensitive)
 * @returns {Geo.Point3[]}
 */
export function panelShapeCorners(option) {
  const key = normalizePanelShape(option);
  return BUILDERS[key]();
}

/**
 * The named unit shape as a CLOSED Geo.Polyline3 — the geometry the
 * Input.PanelShapes node outputs (watches/wires like any other curve).
 *
 * @param {string} option  one of PANEL_SHAPE_OPTIONS (case-insensitive)
 * @returns {Geo.Polyline3}  closed unit polygon centred on the origin
 */
export function panelShapeCurve(option) {
  return new Geo.Polyline3(panelShapeCorners(option), true);
}
