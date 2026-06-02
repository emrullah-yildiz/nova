import { describe, it, expect } from 'vitest';
import { resolveInputs } from '../src/nodes/runtimeAdapter.js';

// A single value wired to a list-typed input is auto-promoted to a one-item list,
// so list-consuming nodes (Solid.ByLoft, List.*, Math.Sum) work when given one
// item instead of erroring on a non-array.
describe('list-input coercion (single value → one-item list)', () => {
  const def = { inputs: [{ id: 'profiles', type: 'list' }, { id: 'n', type: 'number' }] };
  const run = (vals) => resolveInputs(def, {}, (id) => vals[id], null, {});

  it('wraps a single object wired to a list input', () => {
    const surface = { kind: 'surface' };
    expect(run({ profiles: surface, n: 3 })).toEqual({ profiles: [surface], n: 3 });
  });

  it('leaves an array list input unchanged (same reference)', () => {
    const arr = [1, 2];
    expect(run({ profiles: arr }).profiles).toBe(arr);
  });

  it('does not wrap null or undefined', () => {
    expect(run({ profiles: undefined }).profiles).toBeUndefined();
    expect(run({ profiles: null }).profiles).toBeNull();
  });

  it('does not touch non-list ports', () => {
    expect(run({ n: 5 }).n).toBe(5);
  });
});
