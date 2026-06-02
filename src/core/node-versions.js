// Node definition versioning.
//
// A node TYPE can have more than one behavior VERSION over its lifetime. When a
// node's behavior changes in a future release, the new version is published
// while the old one stays registered, so a graph that pinned the old version
// keeps computing exactly as it did. Each node instance pins `nd.version`; the
// def it runs is resolved from that pin, and the user can switch versions on the
// node itself.
//
// A def opts into versioning by declaring `version: N` (an integer ≥ 1) and,
// optionally, carrying its predecessors in `priorVersions: [olderDef, ...]` so
// the older behavior is registered alongside the current one. A def with no
// `version` is the implicit v1 — which is every existing def, so versioning is
// strictly additive and changes nothing until a type ships a second version.
//
// This module is pure (no DOM, no app state) so the resolution + migration
// rules are unit-testable in isolation.

// A def's declared version, defaulting to 1 when it never opted in.
export function getDefVersion(def) {
  const v = def && def.version;
  return Number.isInteger(v) && v > 0 ? v : 1;
}

// Registers `def` (and any `priorVersions` it carries) into a version map shaped
// `{ [type]: { [version]: def } }`. The first def seen for a given (type,
// version) wins, so registration order is stable. Mutates and returns the map.
export function addDefToVersionMap(map, def) {
  if (!map || !def || !def.type) return map;
  const bucket = map[def.type] || (map[def.type] = {});
  const stack = [def].concat(Array.isArray(def.priorVersions) ? def.priorVersions : []);
  for (const d of stack) {
    if (!d) continue;
    const v = getDefVersion(d);
    if (!bucket[v]) bucket[v] = d;
  }
  return map;
}

// Highest registered version number for a type (0 when the type is unknown).
export function latestVersion(map, type) {
  const bucket = map && map[type];
  if (!bucket) return 0;
  return Object.keys(bucket).reduce((hi, k) => Math.max(hi, Number(k)), 0);
}

// Ascending list of registered version numbers for a type (`[]` when unknown).
// The node renderer shows a version picker only when this has more than one
// entry, so the control stays invisible for every single-version node.
export function availableVersions(map, type) {
  const bucket = map && map[type];
  return bucket ? Object.keys(bucket).map(Number).sort((a, b) => a - b) : [];
}

// Resolves the def to use for (type, requestedVersion). Falls back to the latest
// registered version when the requested one is missing — e.g. a graph saved
// against a version that was later retired — and finally to `latestDef` (the
// caller's `NODE_TYPE_MAP[type]`) when the type isn't in the version map at all.
// Returns `{ def, version, fallback }`, or null only when the type is unknown.
export function resolveVersionedDef(map, type, requestedVersion, latestDef) {
  const bucket = (map && map[type]) || {};
  const want = Number.isInteger(requestedVersion) && requestedVersion > 0 ? requestedVersion : null;
  if (want && bucket[want]) return { def: bucket[want], version: want, fallback: false };
  const latest = latestVersion(map, type);
  if (latest && bucket[latest]) {
    return { def: bucket[latest], version: latest, fallback: want != null && want !== latest };
  }
  if (!latestDef) return null;
  const latestDefVersion = getDefVersion(latestDef);
  return { def: latestDef, version: latestDefVersion, fallback: want != null && want !== latestDefVersion };
}

// Produces the control values a node should hold after switching from `fromDef`
// to `toDef`. The target def may declare `migrateFrom: { [fromVersion]: (old) =>
// next }` to remap controls across a behavior change; if it throws or isn't
// provided, the default preserves overlapping control ids and fills the rest
// from `toDef`'s defaults — lossless where the ids line up, never undefined.
export function migrateControlValues(fromDef, toDef, controlValues) {
  const cur = controlValues || {};
  const from = getDefVersion(fromDef);
  const migrator = toDef && toDef.migrateFrom && toDef.migrateFrom[from];
  if (typeof migrator === 'function') {
    try {
      const out = migrator(Object.assign({}, cur));
      if (out && typeof out === 'object') return out;
    } catch {
      // Fall through to the default merge below.
    }
  }
  const next = {};
  (toDef.controls || []).forEach(c => {
    next[c.id] = Object.prototype.hasOwnProperty.call(cur, c.id) ? cur[c.id] : c.default;
  });
  return next;
}

if (typeof window !== 'undefined') {
  window.NodeVersions = {
    getDefVersion, addDefToVersionMap, latestVersion,
    availableVersions, resolveVersionedDef, migrateControlValues
  };
}
