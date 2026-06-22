// Surface.PointAtParameter — rename of Surface.PointAtUV (TICK-015, T15a)
//
// Covers AC-1, AC-2, AC-3, AC-4:
//   AC-1: exactly ONE selectable surface point-at-parameter node exists in the registry
//          (named Surface.PointAtParameter); no separate Surface.PointAtUV node appears as
//          a selectable library entry.
//   AC-2: searching by "PointAtUV" (old alias) resolves to Surface.PointAtParameter.
//   AC-3: a saved graph instance of type Surface.PointAtUV migrates to
//          Surface.PointAtParameter, preserving u/v control values and portMap.
//   AC-4: execute() returns a real Geo.Point3 with finite x/y/z for a known surface.

import { describe, it, expect } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import { createCoreNodeRegistry } from '../../src/nodes/coreNodes.js';
import { migrateNodeType, isDeprecatedType } from '../../src/core/node-versions.js';
import { surfacesNodes } from '../../src/nodes/categories/surfaces.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const P = (x, y, z) => new Geo.Point3(x, y, z);

// A flat 3×3 grid surface in the world XY plane spanning [0,2]².
function flatSurface() {
  const pts = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) pts.push(P(i, j, 0));
  }
  return Geo.surfaceFromGrid(pts, 3, 3);
}

// A circular patch surface (radius 5, origin) — mirrors the help.example producer.
function patchSurface() {
  const origin = new Geo.Point3(0, 0, 0);
  const circle = new Geo.Circle3(origin, 5);
  return Geo.surfaceByPatch(circle, 32);
}

// Shared registry — throws on any duplicate type or alias collision.
const registry = createCoreNodeRegistry();

// ─── AC-1: exactly one selectable surface point-at-parameter node ─────────────

describe('AC-1: exactly one selectable Surface.PointAtParameter node', () => {
  it('Surface.PointAtParameter resolves in the registry', () => {
    const def = registry.getNode('Surface.PointAtParameter');
    expect(def, 'Surface.PointAtParameter must be in the registry').toBeTruthy();
    expect(def.type).toBe('Surface.PointAtParameter');
    expect(def.name).toBe('Surface.PointAtParameter');
    expect(def.category).toBe('surfaces');
  });

  it('deprecated Surface.PointAtUV stub is hidden (metadata.deprecated)', () => {
    const stub = surfacesNodes.find(n => n.type === 'Surface.PointAtUV');
    expect(stub, 'deprecated stub must exist for backward compat').toBeTruthy();
    expect(stub.metadata && stub.metadata.deprecated).toBe(true);
  });

  it('no second selectable node with the old name appears (no PointAtUV in non-deprecated defs)', () => {
    const selectable = surfacesNodes.filter(
      n => n.type === 'Surface.PointAtUV' && !(n.metadata && n.metadata.deprecated)
    );
    expect(selectable.length).toBe(0);
  });

  it('registry does not throw on construction (no duplicate type/alias collision)', () => {
    // createCoreNodeRegistry() already succeeded above — if it threw, the file would not parse.
    expect(registry).toBeTruthy();
  });
});

// ─── AC-2: alias resolution ("PointAtUV" and "PointAtParameter" both find the node) ──

describe('AC-2: alias resolution — old and new ids both resolve to Surface.PointAtParameter', () => {
  // Note: registry.getNode('Surface.PointAtUV') returns the deprecated STUB (canonical type
  // Surface.PointAtUV is registered as its own node for migration). Search/slug alias resolution
  // uses the slug forms below, which resolve to the canonical Surface.PointAtParameter.
  // This is identical to the Custom.Formula → Custom.CodeBlock pattern.

  it('registry.getNode("surface-pointatuv") resolves to Surface.PointAtParameter via slug alias', () => {
    // 'surface-pointatuv' is an alias on the canonical def → resolves to Surface.PointAtParameter
    const def = registry.getNode('surface-pointatuv');
    expect(def, '"surface-pointatuv" alias must resolve').toBeTruthy();
    expect(def.type).toBe('Surface.PointAtParameter');
  });

  it('registry.getNode("surface-pointat") resolves to Surface.PointAtParameter', () => {
    const def = registry.getNode('surface-pointat');
    expect(def).toBeTruthy();
    expect(def.type).toBe('Surface.PointAtParameter');
  });

  it('registry.getNode("surface-pointatparameter") resolves to Surface.PointAtParameter', () => {
    const def = registry.getNode('surface-pointatparameter');
    expect(def).toBeTruthy();
    expect(def.type).toBe('Surface.PointAtParameter');
  });

  it('canonical def aliases array includes the old slug surface-pointatuv', () => {
    const def = registry.getNode('Surface.PointAtParameter');
    expect(def.aliases).toContain('surface-pointatuv');
    expect(def.aliases).toContain('surface-pointat');
    expect(def.aliases).toContain('surface-pointatparameter');
  });
});

// ─── AC-3: saved-graph migration — Surface.PointAtUV → Surface.PointAtParameter ─

describe('AC-3: saved-graph migration — Surface.PointAtUV instances migrate correctly', () => {
  // The deprecated stub is the def the load-time hook uses for migration.
  const stub = surfacesNodes.find(n => n.type === 'Surface.PointAtUV');

  it('stub has metadata.deprecated = true', () => {
    expect(stub).toBeTruthy();
    expect(isDeprecatedType(stub)).toBe(true);
  });

  it('stub migrateTo target is Surface.PointAtParameter', () => {
    expect(stub.metadata.migrateTo.type).toBe('Surface.PointAtParameter');
  });

  it('migrateNodeType produces Surface.PointAtParameter with u/v controls preserved', () => {
    const savedInstance = {
      type: 'Surface.PointAtUV',
      controlValues: { u: '0.3', v: '0.7' }
    };
    const plan = migrateNodeType(stub, savedInstance);
    expect(plan).toBeTruthy();
    expect(plan.type).toBe('Surface.PointAtParameter');
    expect(plan.controlValues.u).toBe('0.3');
    expect(plan.controlValues.v).toBe('0.7');
  });

  it('portMap preserves all wire connections (surface, u, v, point)', () => {
    const plan = migrateNodeType(stub, { controlValues: {} });
    expect(plan.portMap).toEqual({
      surface: 'surface',
      u: 'u',
      v: 'v',
      point: 'point'
    });
  });

  it('default control values migrate unchanged when none were saved', () => {
    const plan = migrateNodeType(stub, { controlValues: {} });
    expect(plan.type).toBe('Surface.PointAtParameter');
    expect(plan.controlValues).toEqual({});
  });
});

// ─── AC-4: execute returns a real Geo.Point3 with finite coordinates ──────────

describe('AC-4: execute returns a real Geo.Point3 (not [object Object]/NaN/undefined)', () => {
  const def = registry.getNode('Surface.PointAtParameter');

  it('returns undefined when surface is null (graceful null)', () => {
    const { point } = def.execute({}, { surface: null, u: 0.5, v: 0.5 });
    expect(point).toBeUndefined();
  });

  it('flat surface center (u=0.5, v=0.5) → real Point3 at approximately (1, 1, 0)', () => {
    const { point } = def.execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    expect(point, 'point must not be undefined').toBeTruthy();
    expect(typeof point.x).toBe('number');
    expect(typeof point.y).toBe('number');
    expect(typeof point.z).toBe('number');
    expect(isFinite(point.x)).toBe(true);
    expect(isFinite(point.y)).toBe(true);
    expect(isFinite(point.z)).toBe(true);
    expect(point.x).toBeCloseTo(1, 6);
    expect(point.y).toBeCloseTo(1, 6);
    expect(point.z).toBeCloseTo(0, 6);
  });

  it('patch surface center (u=0.5, v=0.5) → real Point3 (finite coords, not NaN)', () => {
    const { point } = def.execute({}, { surface: patchSurface(), u: 0.5, v: 0.5 });
    expect(point, 'point must not be undefined').toBeTruthy();
    expect(isFinite(point.x)).toBe(true);
    expect(isFinite(point.y)).toBe(true);
    expect(isFinite(point.z)).toBe(true);
    // The center of a circular disk patch should be close to origin
    expect(Math.abs(point.x)).toBeLessThan(5);
    expect(Math.abs(point.y)).toBeLessThan(5);
  });

  it('output is a Geo.Point3 instance (not a plain object)', () => {
    const { point } = def.execute({}, { surface: flatSurface(), u: 0.25, v: 0.75 });
    expect(point instanceof Geo.Point3).toBe(true);
  });

  it('toString is not [object Object]', () => {
    const { point } = def.execute({}, { surface: flatSurface(), u: 0.5, v: 0.5 });
    const str = String(point);
    expect(str).not.toBe('[object Object]');
    expect(str).toMatch(/\d/); // has digits — readable coordinates
  });

  it('varying u/v gives different points (parametrization works)', () => {
    const surf = flatSurface();
    const { point: p00 } = def.execute({}, { surface: surf, u: 0, v: 0 });
    const { point: p11 } = def.execute({}, { surface: surf, u: 1, v: 1 });
    // Corners of the [0,2]^2 grid should differ
    expect(p00.x).not.toBeCloseTo(p11.x, 1);
  });
});
