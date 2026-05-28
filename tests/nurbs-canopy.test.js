import { Geo } from '../src/geometry/index.js';
import { PythonRunner } from '../src/runtime/pyrunner.js';

const NURBS_CANOPY_CODE = [
  'import math',
  '',
  '# Canopy parameters',
  'span = 30',
  'height = 6',
  'u_count = 20',
  'v_count = 20',
  '',
  '# Build surface point grid',
  'points = []',
  'for i in range(u_count):',
  '    for j in range(v_count):',
  '        x = span * (i / (u_count - 1) - 0.5)',
  '        y = span * (j / (v_count - 1) - 0.5)',
  '        dist = math.sqrt(x * x + y * y)',
  '        z = height * math.cos(dist * 0.15) + Geo.perlin2(x * 0.1, y * 0.1) * 1.5',
  '        points.append(Geo.Point3(x, y, z))',
  '',
  'canopy = Geo.surfaceFromGrid(points, u_count, v_count)',
  'shell = Geo.thicken(canopy, 0.3)',
  'print(shell)'
].join('\n');

describe('NURBS canopy template', () => {
  beforeAll(() => {
    globalThis.window = globalThis;
    globalThis.Geo = Geo;
  });

  it('builds the full point grid before creating and thickening the canopy surface', () => {
    const result = PythonRunner.execute(NURBS_CANOPY_CODE, {});

    expect(result.error).toBeNull();
    expect(result.outputs.points).toHaveLength(400);
    expect(result.outputs.canopy._type).toBe('Mesh3');
    expect(result.outputs.canopy._solidType).toBe('Surface');
    expect(result.outputs.shell._type).toBe('Mesh3');
    expect(result.outputs.shell._solidType).toBe('Thickened');
    expect(result.outputs.shell.vertices.length).toBeGreaterThan(result.outputs.canopy.vertices.length);
    expect(result.outputs.shell.faces.length).toBeGreaterThan(result.outputs.canopy.faces.length);
  });
});
