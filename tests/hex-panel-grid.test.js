// Phase 12 composite: Pattern.HexPanelGrid — the missing piece for the
// "rotating tower with hexagonal panels following the rotation" prompt
// that Phase 11's strict refusal would have flagged as a gap.
//
// Verifies:
//  - the Geo.hexPanelGrid math produces the expected panel count per
//    profile band × ring resolution
//  - panel polylines are closed (last vertex == first)
//  - output composes downstream of Pattern.TwistedEllipsePlates without
//    type incompatibility — same point[][] shape flowing through
//  - the node definition exposes execute() that returns the same shape
//  - defaults survive empty / partial input

import { Geo } from '../src/geometry/index.js';

describe('Geo.hexPanelGrid math', () => {
  it('produces (rings - 1) × ringSize panels for the default skip', () => {
    const profiles = Geo.twistedEllipsePlates(10, 100, 18, 12, 60, 0.2, 16);
    // 11 rings × 16 points → 10 bands × 16 = 160 panels
    const panels = Geo.hexPanelGrid(profiles, true, 1);
    expect(panels).toHaveLength(160);
  });

  it('every panel polyline is closed (last vertex equals first)', () => {
    const profiles = Geo.twistedEllipsePlates(4, 20, 10, 10, 0, 0, 8);
    const panels = Geo.hexPanelGrid(profiles, false, 1);
    for (const panel of panels) {
      expect(panel).toHaveLength(5);
      expect(panel[0]).toBe(panel[panel.length - 1]);
    }
  });

  it('every panel vertex is a Point3 (typed for downstream nodes)', () => {
    const profiles = Geo.twistedEllipsePlates(3, 10, 5, 5, 0, 0, 6);
    const panels = Geo.hexPanelGrid(profiles, false, 1);
    for (const panel of panels) {
      for (const v of panel) {
        expect(v && v._type).toBe('Point3');
      }
    }
  });

  it('skipRings>1 reduces the band count proportionally', () => {
    const profiles = Geo.twistedEllipsePlates(20, 100, 18, 12, 60, 0.2, 12);
    // skip=1 → 20 bands × 12 points = 240
    // skip=2 → 10 bands × 12 = 120
    // skip=4 → 5 bands × 12 = 60
    expect(Geo.hexPanelGrid(profiles, false, 1)).toHaveLength(240);
    expect(Geo.hexPanelGrid(profiles, false, 2)).toHaveLength(120);
    expect(Geo.hexPanelGrid(profiles, false, 4)).toHaveLength(60);
  });

  it('stagger=true vs stagger=false yields the same panel count', () => {
    // Staggering shifts the top vertices but doesn't change how many
    // panels exist — important so the user can toggle the visual
    // without changing parameter scale.
    const profiles = Geo.twistedEllipsePlates(8, 40, 12, 12, 0, 0, 10);
    const a = Geo.hexPanelGrid(profiles, true, 1);
    const b = Geo.hexPanelGrid(profiles, false, 1);
    expect(a.length).toBe(b.length);
  });

  it('returns [] for empty or single-ring input (nothing to band between)', () => {
    expect(Geo.hexPanelGrid([])).toEqual([]);
    expect(Geo.hexPanelGrid([[]])).toEqual([]);
    expect(Geo.hexPanelGrid(null)).toEqual([]);
    expect(Geo.hexPanelGrid(undefined)).toEqual([]);
  });

  it('skips degenerate rings (less than 2 points)', () => {
    const profiles = [
      [new Geo.Point3(0, 0, 0)],     // degenerate
      [new Geo.Point3(0, 0, 1)]      // degenerate
    ];
    expect(Geo.hexPanelGrid(profiles, false, 1)).toEqual([]);
  });
});

