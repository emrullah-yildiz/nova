import { curveStart, curveEnd, curveLen, curveMid, curveDir } from '../src/core/graph-helpers.js';

describe('Graph helpers', () => {
  const line = { points: [ { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 } ] };

  it('returns the first point as curve start', () => {
    expect(curveStart(line)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('returns the last point as curve end', () => {
    expect(curveEnd(line)).toEqual({ x: 3, y: 4, z: 0 });
  });

  it('computes the correct curve length', () => {
    expect(curveLen(line)).toBeCloseTo(5);
  });

  it('computes the midpoint of a curve', () => {
    expect(curveMid(line)).toEqual({ x: 1.5, y: 2, z: 0 });
  });

  it('computes the normalized direction of a curve', () => {
    expect(curveDir(line)).toEqual({ x: 0.6, y: 0.8, z: 0 });
  });
});
