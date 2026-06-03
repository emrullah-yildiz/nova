import { describe, it, expect } from 'vitest';
import { Geo } from '../src/geometry/index.js';
import { transformNodes } from '../src/nodes/categories/transform.js';

// ──────────────────────────────────────────────────────────────────────────
// Transform-category codegen ↔ runtime-Geo contract guard.
//
// The modern Transform nodes execute() against the T1 ES-module kernel
// (frames.js / transforms.js), but their codegen.python / codegen.csharp emit
// `Geo.<name>(...)` calls that run against the assembled GLOBAL Geo object at
// runtime (pyrunner builds its Geo from window.Geo). If a node's generated code
// names a `Geo.<name>` that does not exist on the global Geo — or names the
// legacy implementation with different semantics — the generated code throws or
// silently produces different geometry than the live preview. Static validation
// (allow-list derived from codegen) cannot catch that.
//
// This guard asserts: for every `Geo.<name>` token emitted by each of the four
// transform-category nodes' codegen.python AND codegen.csharp, `name` resolves
// to a FUNCTION on the assembled global Geo object. Scoped to the transform
// category on purpose so it does not inherit unrelated library debt.
// ──────────────────────────────────────────────────────────────────────────

const GEO_CALL = /\bGeo\.([A-Za-z_$][\w$]*)/g;

function geoTokens(code) {
  const names = new Set();
  if (typeof code !== 'string') return names;
  let m;
  while ((m = GEO_CALL.exec(code)) !== null) names.add(m[1]);
  return names;
}

describe('transform-category codegen resolves on the global Geo object', () => {
  it('ships four transform nodes', () => {
    expect(transformNodes.map((n) => n.type)).toEqual([
      'Plane.ByOriginXAxisYAxis',
      'Geometry.Orient',
      'Geometry.ArrayLinear',
      'Geometry.ArrayPolar'
    ]);
  });

  for (const node of transformNodes) {
    it(`${node.type}: every Geo.<name> in codegen.python is a function on global Geo`, () => {
      const tokens = geoTokens(node.codegen && node.codegen.python);
      expect(tokens.size, `${node.type} should emit at least one Geo.<name> call`).toBeGreaterThan(0);
      for (const name of tokens) {
        expect(typeof Geo[name], `Geo.${name} (from ${node.type} codegen.python) must be a function on global Geo`).toBe('function');
      }
    });

    it(`${node.type}: every Geo.<name> in codegen.csharp is a function on global Geo`, () => {
      const tokens = geoTokens(node.codegen && node.codegen.csharp);
      for (const name of tokens) {
        expect(typeof Geo[name], `Geo.${name} (from ${node.type} codegen.csharp) must be a function on global Geo`).toBe('function');
      }
    });
  }

  it('exposes the T1 array helpers under distinct, non-colliding global names', () => {
    // The T1 count-based helpers must be available...
    expect(typeof Geo.arrayLinearByVector).toBe('function');
    expect(typeof Geo.arrayPolarByAngle).toBe('function');
    expect(typeof Geo.orient).toBe('function');
    expect(typeof Geo.planeFromOriginXY).toBe('function');
    // ...without overwriting the legacy globals the legacy array nodes use.
    expect(typeof Geo.arrayLinear).toBe('function');
    expect(typeof Geo.arrayPolar).toBe('function');
    expect(Geo.arrayLinearByVector).not.toBe(Geo.arrayLinear);
    expect(Geo.arrayPolarByAngle).not.toBe(Geo.arrayPolar);
  });

  it('the new global helpers produce the SAME geometry as the nodes execute()', () => {
    const P = (x, y, z) => new Geo.Point3(x, y, z);
    const V = (x, y, z) => new Geo.Vector3(x, y, z);

    // ArrayLinear: count + per-step vector (codegen calls arrayLinearByVector).
    const lin = transformNodes.find((n) => n.type === 'Geometry.ArrayLinear');
    const linExec = lin.execute({}, { geometry: P(0, 0, 0), direction: V(2, 0, 0), count: 4 }).result;
    const linGen = Geo.arrayLinearByVector(P(0, 0, 0), V(2, 0, 0), 4);
    expect(linGen.length).toBe(linExec.length);
    expect(linGen[3].x).toBeCloseTo(linExec[3].x, 9);

    // ArrayPolar: count + total-angle, codegen converts degrees→radians.
    const pol = transformNodes.find((n) => n.type === 'Geometry.ArrayPolar');
    const polExec = pol.execute({}, { geometry: P(1, 0, 0), center: P(0, 0, 0), axis: V(0, 0, 1), count: 4, angle: 360 }).result;
    const polGen = Geo.arrayPolarByAngle(P(1, 0, 0), P(0, 0, 0), V(0, 0, 1), 4, (360 * Math.PI) / 180);
    expect(polGen.length).toBe(polExec.length);
    expect(polGen[1].x).toBeCloseTo(polExec[1].x, 9);
    expect(polGen[1].y).toBeCloseTo(polExec[1].y, 9);
  });
});
