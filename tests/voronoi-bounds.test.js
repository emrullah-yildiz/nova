import { Geo } from '../src/geometry/index.js';

// Regression: a Voronoi mesh built from sites clustered in a small area used to
// sprawl out to a fixed ±20 box, producing giant flat panels (the Zaha pavilion
// "Voronoi skin" came out as huge planes across the ground). The diagram should
// now fit the sites' own footprint.
describe('Voronoi sampling region fits the sites (no ±20 sprawl)', () => {
  beforeAll(() => {
    if (typeof window === 'undefined') globalThis.window = globalThis;
  });

  const clustered = [
    new Geo.Point3(-2, -1.5, 0),
    new Geo.Point3(2, -1.5, 0),
    new Geo.Point3(2, 1.5, 3),
    new Geo.Point3(-2, 1.5, 3),
    new Geo.Point3(0, 0, 1.5)
  ];

  it('derives bounds from the sites footprint plus a small margin', () => {
    const b = Geo._voronoiBounds(clustered);
    // Footprint is x∈[-2,2], y∈[-1.5,1.5]; span=4 → margin 0.6.
    expect(b.minX).toBeCloseTo(-2.6);
    expect(b.maxX).toBeCloseTo(2.6);
    expect(b.minY).toBeCloseTo(-2.1);
    expect(b.maxY).toBeCloseTo(2.1);
    // Falls back to the fixed box when there are no usable sites.
    expect(Geo._voronoiBounds([])).toEqual({ minX: -20, maxX: 20, minY: -20, maxY: 20 });
  });

  it('keeps voronoi cell outlines inside the footprint (not out at ±20)', () => {
    const outlines = Geo.voronoiOutlines(clustered);
    expect(outlines.length).toBeGreaterThan(0);
    let maxAbs = 0;
    for (const o of outlines) {
      for (const p of o.points) {
        maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y));
      }
    }
    // Old behavior reached ~20; fitted bounds keep it within the footprint+margin.
    expect(maxAbs).toBeLessThan(4);
  });

  it('voronoiMesh returns one bounded mesh per cell', () => {
    const meshes = Geo.voronoiMesh(clustered, null, 1, 0.1);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(clustered.length);
  });
});
