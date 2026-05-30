import { describe, it, expect } from 'vitest';
import { Geo } from '../src/geometry/index.js';

// ──────────────────────────────────────────────────────────────────────────
// Transform-dispatch coverage.
//
// The geometry transforms (move / rotate / scaleGeo / mirror) dispatch on
// `geometry._type`. When a new geometry type is added but not wired into a
// transform's switch, the transform silently `return geometry` — the geometry
// passes through UNCHANGED with no error. That exact bug shipped twice for
// Ellipse3 (move, then rotate).
//
// This test pins every (transform × geometry type) combination:
//   • handled combos must produce a NEW object (dispatch happened) and
//     preserve the curve's length invariant;
//   • known-unhandled combos are listed in KNOWN_GAPS and marked it.todo,
//     and a guard test fails if the real gap set ever drifts from that list
//     (a new gap appears, or a listed gap gets fixed without being removed).
// ──────────────────────────────────────────────────────────────────────────

const P = (x, y, z) => new Geo.Point3(x, y, z);
const V = (x, y, z) => new Geo.Vector3(x, y, z);

// Fresh instance per use so transforms can't be fooled by shared references.
const GEOMETRIES = {
  Point3: () => P(1, 2, 3),
  Line3: () => new Geo.Line3(P(0, 0, 0), P(3, 4, 0)),
  Polyline3: () => new Geo.Polyline3([P(0, 0, 0), P(1, 0, 0), P(1, 1, 0)], true),
  Arc3: () => new Geo.Arc3(P(0, 0, 0), 5, 0, Math.PI / 2, V(0, 0, 1)),
  Circle3: () => new Geo.Circle3(P(0, 0, 0), 5),
  Ellipse3: () => new Geo.Ellipse3(P(0, 0, 0), 10, 6),
  Mesh3: () => Geo.createBox(P(0, 0, 0), 2, 2, 2)
};

// Each transform plus how it should affect a curve's arc length, so we can
// assert more than "something changed".
const TRANSFORMS = {
  move: { fn: (g) => Geo.move(g, V(5, 1, 2)), lengthFactor: 1 },
  rotate: { fn: (g) => Geo.rotate(g, P(0, 0, 0), V(0, 0, 1), Math.PI / 3), lengthFactor: 1 },
  scale: { fn: (g) => Geo.scaleGeo(g, 2, P(0, 0, 0)), lengthFactor: 2 },
  mirror: { fn: (g) => Geo.mirror(g, P(0, 0, 0), V(1, 0, 0)), lengthFactor: 1 }
};

// Combinations the transforms do not yet handle (they pass the geometry
// through unchanged). Remove an entry when you teach the transform that type —
// the "gap set matches" guard below will remind you if you forget.
const KNOWN_GAPS = new Set([
  'move/Arc3', 'rotate/Arc3', 'scale/Arc3', 'mirror/Arc3',
  'mirror/Circle3', 'mirror/Ellipse3'
]);

function isGap(transformName, geo) {
  const input = GEOMETRIES[geo]();
  let result;
  try {
    result = TRANSFORMS[transformName].fn(input);
  } catch {
    return true; // throwing counts as "not properly handled"
  }
  return result === input; // identical reference => silent passthrough
}

describe('geometry transform dispatch coverage', () => {
  for (const transformName of Object.keys(TRANSFORMS)) {
    for (const geo of Object.keys(GEOMETRIES)) {
      const key = `${transformName}/${geo}`;

      if (KNOWN_GAPS.has(key)) {
        it.todo(`${transformName} should handle ${geo} (known gap)`);
        continue;
      }

      it(`${transformName} handles ${geo}`, () => {
        const input = GEOMETRIES[geo]();
        const result = TRANSFORMS[transformName].fn(input);

        // Dispatch actually happened (not the silent passthrough).
        expect(result, `${key}: returned the input unchanged (silent passthrough)`).not.toBe(input);
        // Type is preserved by translation/rotation/scale/mirror.
        expect(result._type, `${key}: changed geometry type`).toBe(input._type);

        // Curve length invariant, when the type exposes length().
        if (typeof input.length === 'function') {
          const expected = input.length() * TRANSFORMS[transformName].lengthFactor;
          expect(result.length(), `${key}: length invariant violated`).toBeCloseTo(expected, 4);
        }
      });
    }
  }

  // Guard: the discovered gap set must exactly equal KNOWN_GAPS. Fails if a new
  // gap appears (regression) or a listed gap was fixed but not removed (stale).
  it('the real gap set matches KNOWN_GAPS exactly', () => {
    const discovered = [];
    for (const transformName of Object.keys(TRANSFORMS)) {
      for (const geo of Object.keys(GEOMETRIES)) {
        if (isGap(transformName, geo)) discovered.push(`${transformName}/${geo}`);
      }
    }
    expect(new Set(discovered)).toEqual(KNOWN_GAPS);
  });
});
