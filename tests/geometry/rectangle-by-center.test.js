import { getLiveCoreRegistry } from '../../src/nodes/coreNodes.js';
import { Geo } from '../../src/geometry/index.js';
import { NODE_TYPE_MAP } from '../../src/core/nodes.js';

// Register all modern category nodes so NODE_TYPE_MAP is populated.
getLiveCoreRegistry();

// Tolerance for floating-point comparisons.
const EPS = 1e-9;
function near(a, b) { return Math.abs(a - b) < EPS; }

describe('Rectangle.ByCenterWidthDepth — Plane input (TICK-012)', () => {

  it('AC-1 / AC-5: no Plane wired → 4 corners in world XY, same as legacy output', () => {
    const def = NODE_TYPE_MAP['Rectangle.ByCenterWidthDepth'];
    expect(def).toBeTruthy();
    const center = new Geo.Point3(0, 0, 0);
    const result = def.execute({}, { center, width: 10, depth: 6 }, {});
    const pts = result.profile;
    expect(pts).toHaveLength(4);
    // All Z = 0 (world XY)
    pts.forEach(p => expect(near(p.z, 0)).toBe(true));
    // Corner span: width=10 → ±5 in X; depth=6 → ±3 in Y
    const xs = pts.map(p => p.x).sort((a, b) => a - b);
    const ys = pts.map(p => p.y).sort((a, b) => a - b);
    expect(near(xs[0], -5)).toBe(true);
    expect(near(xs[3], +5)).toBe(true);
    expect(near(ys[0], -3)).toBe(true);
    expect(near(ys[3], +3)).toBe(true);
  });

  it('AC-2: Plane.XY wired → identical output to no-plane case', () => {
    const def = NODE_TYPE_MAP['Rectangle.ByCenterWidthDepth'];
    const center = new Geo.Point3(0, 0, 0);
    // Plane.XY: origin=(0,0,0), normal=(0,0,1)
    const planeXY = new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1));
    const withPlane = def.execute({}, { center, width: 10, depth: 6, plane: planeXY }, {});
    const withoutPlane = def.execute({}, { center, width: 10, depth: 6 }, {});
    expect(withPlane.profile).toHaveLength(4);
    withPlane.profile.forEach((p, i) => {
      const q = withoutPlane.profile[i];
      expect(near(p.x, q.x)).toBe(true);
      expect(near(p.y, q.y)).toBe(true);
      expect(near(p.z, q.z)).toBe(true);
    });
  });

  it('AC-3: Plane.XZ wired → corners lie in XZ plane, Y = center.Y, Width spans X and Depth spans Z', () => {
    const def = NODE_TYPE_MAP['Rectangle.ByCenterWidthDepth'];
    // Plane.XZ: origin=(0,0,0), normal=(0,1,0). With world-X reference hint,
    // frameAt gives xAxis=(1,0,0) and yAxis=(0,0,-1) — both in-plane.
    const planeXZ = new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 1, 0));
    const center = new Geo.Point3(0, 2, 0); // Y=2 to verify Y stays fixed
    const result = def.execute({}, { center, width: 10, depth: 6, plane: planeXZ }, {});
    const pts = result.profile;
    expect(pts).toHaveLength(4);
    // All Y = center.Y = 2 (plane normal is Y → no Y component in frame axes)
    pts.forEach(p => expect(p.y).toBeCloseTo(2, 9));
    // X total span = Width = 10 (xAxis = world X via reference hint)
    const xs = pts.map(p => p.x).sort((a, b) => a - b);
    expect(xs[3] - xs[0]).toBeCloseTo(10, 9);
    // Z total span = Depth = 6 (yAxis lies along ±Z)
    const zs = pts.map(p => p.z).sort((a, b) => a - b);
    expect(zs[3] - zs[0]).toBeCloseTo(6, 9);
  });

  it('AC-5 regression: non-zero center with no Plane → corners offset by center', () => {
    const def = NODE_TYPE_MAP['Rectangle.ByCenterWidthDepth'];
    const center = new Geo.Point3(5, 10, 0);
    const result = def.execute({}, { center, width: 4, depth: 2 }, {});
    const pts = result.profile;
    const xs = pts.map(p => p.x).sort((a, b) => a - b);
    const ys = pts.map(p => p.y).sort((a, b) => a - b);
    // X: 5 ± 2
    expect(near(xs[0], 3)).toBe(true);
    expect(near(xs[3], 7)).toBe(true);
    // Y: 10 ± 1
    expect(near(ys[0], 9)).toBe(true);
    expect(near(ys[3], 11)).toBe(true);
  });

  it('AC-6: help.example includes Plane.XY, List.Count, and Output.Watch nodes', () => {
    const def = NODE_TYPE_MAP['Rectangle.ByCenterWidthDepth'];
    const example = def.help && def.help.example;
    expect(example).toBeTruthy();
    expect(example.nodes).toBeTruthy();
    // Must contain a Plane.XY node
    const hasPlaneXY = example.nodes.some(n => n.type === 'Plane.XY');
    expect(hasPlaneXY).toBe(true);
    // Must contain List.Count (to show count=4) and Output.Watch
    const hasCount = example.nodes.some(n => n.type === 'List.Count');
    const hasWatch = example.nodes.some(n => n.type === 'Output.Watch');
    expect(hasCount).toBe(true);
    expect(hasWatch).toBe(true);
  });

});
