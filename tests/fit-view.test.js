import { describe, it, expect } from 'vitest';
import { computeFitView } from '../src/core/graph-layout.js';

// A content point (x,y) maps to viewport-local (panX + x*zoom, panY + y*zoom).
const toView = (p, x, y) => ({ x: p.panX + x * p.zoom, y: p.panY + y * p.zoom });

describe('computeFitView', () => {
  const VP = { width: 1000, height: 800 };

  it('centres the content box in the viewport', () => {
    const b = { minX: 100, minY: 100, maxX: 300, maxY: 300 }; // centre (200,200)
    const v = computeFitView(b, VP);
    const c = toView(v, 200, 200);
    expect(c.x).toBeCloseTo(500, 3);
    expect(c.y).toBeCloseTo(400, 3);
  });

  it('does not zoom past maxZoom (default 1) for small content', () => {
    const b = { minX: 0, minY: 0, maxX: 50, maxY: 50 };
    const v = computeFitView(b, VP);
    expect(v.zoom).toBe(1);
  });

  it('zooms out so a large graph fits inside the viewport with padding', () => {
    const b = { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
    const v = computeFitView(b, VP, { padding: 60 });
    expect(v.zoom).toBeLessThan(1);
    // Every corner must land inside the viewport.
    for (const [x, y] of [[0, 0], [4000, 0], [0, 3000], [4000, 3000]]) {
      const p = toView(v, x, y);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(VP.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VP.height);
    }
  });

  it('respects the padding (content stays inside the padded area)', () => {
    const b = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    const pad = 100;
    const v = computeFitView(b, VP, { padding: pad });
    const topLeft = toView(v, 0, 0);
    const botRight = toView(v, 2000, 2000);
    expect(topLeft.x).toBeGreaterThanOrEqual(pad - 0.5);
    expect(topLeft.y).toBeGreaterThanOrEqual(pad - 0.5);
    expect(botRight.x).toBeLessThanOrEqual(VP.width - pad + 0.5);
    expect(botRight.y).toBeLessThanOrEqual(VP.height - pad + 0.5);
  });

  it('clamps to minZoom for an enormous graph', () => {
    const b = { minX: 0, minY: 0, maxX: 100000, maxY: 100000 };
    const v = computeFitView(b, VP, { minZoom: 0.25 });
    expect(v.zoom).toBe(0.25);
  });

  it('handles a zero-size box (single point) without NaN', () => {
    const b = { minX: 50, minY: 50, maxX: 50, maxY: 50 };
    const v = computeFitView(b, VP);
    expect(Number.isFinite(v.zoom)).toBe(true);
    expect(Number.isFinite(v.panX)).toBe(true);
    const c = toView(v, 50, 50);
    expect(c.x).toBeCloseTo(500, 3);
    expect(c.y).toBeCloseTo(400, 3);
  });
});
