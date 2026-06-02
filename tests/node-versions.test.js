import { describe, it, expect } from 'vitest';
import {
  getDefVersion,
  addDefToVersionMap,
  latestVersion,
  availableVersions,
  resolveVersionedDef,
  migrateControlValues
} from '../src/core/node-versions.js';

describe('getDefVersion', () => {
  it('defaults a def with no version to 1', () => {
    expect(getDefVersion({ type: 'A' })).toBe(1);
  });
  it('reads an explicit integer version', () => {
    expect(getDefVersion({ type: 'A', version: 3 })).toBe(3);
  });
  it('ignores non-positive / non-integer versions', () => {
    expect(getDefVersion({ version: 0 })).toBe(1);
    expect(getDefVersion({ version: 2.5 })).toBe(1);
    expect(getDefVersion(null)).toBe(1);
  });
});

describe('addDefToVersionMap', () => {
  it('registers a def under its version, plus any priorVersions', () => {
    const map = {};
    const v2 = { type: 'Box', version: 2, priorVersions: [{ type: 'Box', version: 1 }] };
    addDefToVersionMap(map, v2);
    expect(availableVersions(map, 'Box')).toEqual([1, 2]);
    expect(map.Box[1].version).toBe(1);
    expect(map.Box[2]).toBe(v2);
  });
  it('keeps the first def seen for a (type, version) — registration order is stable', () => {
    const map = {};
    addDefToVersionMap(map, { type: 'A', version: 1, tag: 'first' });
    addDefToVersionMap(map, { type: 'A', version: 1, tag: 'second' });
    expect(map.A[1].tag).toBe('first');
  });
  it('treats a version-less def as v1', () => {
    const map = {};
    addDefToVersionMap(map, { type: 'A' });
    expect(availableVersions(map, 'A')).toEqual([1]);
  });
});

describe('latestVersion / availableVersions', () => {
  const map = { Box: { 1: {}, 2: {}, 4: {} } };
  it('reports the highest version', () => {
    expect(latestVersion(map, 'Box')).toBe(4);
    expect(latestVersion(map, 'Nope')).toBe(0);
  });
  it('lists versions ascending', () => {
    expect(availableVersions(map, 'Box')).toEqual([1, 2, 4]);
    expect(availableVersions(map, 'Nope')).toEqual([]);
  });
});

describe('resolveVersionedDef', () => {
  const map = { Box: { 1: { type: 'Box', version: 1 }, 2: { type: 'Box', version: 2 } } };
  const latestDef = map.Box[2];

  it('returns the exact requested version when present', () => {
    const r = resolveVersionedDef(map, 'Box', 1, latestDef);
    expect(r).toEqual({ def: map.Box[1], version: 1, fallback: false });
  });
  it('falls back to the latest version (flagged) when the pinned one is gone', () => {
    const r = resolveVersionedDef(map, 'Box', 3, latestDef);
    expect(r.version).toBe(2);
    expect(r.fallback).toBe(true);
  });
  it('uses the latest version without a fallback flag when none was requested', () => {
    const r = resolveVersionedDef(map, 'Box', undefined, latestDef);
    expect(r).toEqual({ def: map.Box[2], version: 2, fallback: false });
  });
  it('falls back to the caller latestDef when the type is not in the version map', () => {
    const onlyDef = { type: 'Loner', version: 1 };
    const r = resolveVersionedDef({}, 'Loner', 1, onlyDef);
    expect(r).toEqual({ def: onlyDef, version: 1, fallback: false });
  });
  it('returns null for a wholly unknown type', () => {
    expect(resolveVersionedDef({}, 'Ghost', 1, null)).toBeNull();
  });
});

describe('migrateControlValues', () => {
  it('runs a declared migrator for the source version', () => {
    const fromDef = { version: 1, controls: [{ id: 'r', default: 1 }] };
    const toDef = {
      version: 2,
      controls: [{ id: 'radius', default: 5 }],
      migrateFrom: { 1: (old) => ({ radius: old.r * 2 }) }
    };
    expect(migrateControlValues(fromDef, toDef, { r: 3 })).toEqual({ radius: 6 });
  });
  it('preserves overlapping ids and fills the rest from defaults when no migrator', () => {
    const fromDef = { version: 1 };
    const toDef = { version: 2, controls: [{ id: 'a', default: 0 }, { id: 'b', default: 9 }] };
    expect(migrateControlValues(fromDef, toDef, { a: 7, gone: 1 })).toEqual({ a: 7, b: 9 });
  });
  it('falls back to the default merge if the migrator throws', () => {
    const fromDef = { version: 1 };
    const toDef = {
      version: 2,
      controls: [{ id: 'a', default: 0 }],
      migrateFrom: { 1: () => { throw new Error('boom'); } }
    };
    expect(migrateControlValues(fromDef, toDef, { a: 4 })).toEqual({ a: 4 });
  });
});
