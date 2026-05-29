// Phase 11 safety net: rewrite Geo.* names that LLMs commonly invent into
// the canonical names that actually exist.
//
// Why this exists: even with the catalog in the system prompt and Phase 2
// validating method names, GPT-class models still overgeneralise from
// Python web conventions. The most common pattern is the model seeing
// Geo.createBox, Geo.createSphere in the catalog and inferring that
// every constructor follows `createX` naming — then writing
// Geo.createLoft, Geo.createQuad, Geo.createPolygon, Geo.createBoolean,
// etc., none of which exist.
//
// Rather than wait for Phase 2's fix-retry to detect and correct these
// names (which burns a round trip + free-tier tokens), we pre-rewrite
// the response text before it hits the validator. If the AI's intent is
// unambiguous (createLoft can only mean loft; there's no other lofting
// primitive), we apply the rewrite and log it for telemetry. The user
// sees correct code on the first try.
//
// This list is curated, not auto-generated — only rewrites with a
// single unambiguous canonical target are included. Add new entries
// when telemetry shows a pattern recurring.

// Map from invented name → real name. Bare-word match (preceded by
// `Geo.`), so partial matches don't fire.
const ALIAS_MAP = {
  // Lofting family — all variants of "make a continuous shape from
  // profiles" resolve to Geo.loft.
  createLoft: 'loft',
  Loft: 'loft',
  loftSurface: 'loft',
  loftProfiles: 'loft',

  // Polygon / polyline / quad — the AI invents these when it means
  // "a closed list of points as a curve". Geo.Polyline3 is the real
  // entry point.
  createPolygon: 'Polyline3',
  Polygon: 'Polyline3',
  createQuad: 'Polyline3',
  Quad: 'Polyline3',
  createPolyline: 'Polyline3',

  // Boolean operations — the AI invents wrapper names like
  // "createBoolean" or "boolean". The real ops are explicit.
  createBoolean: 'booleanUnion',
  createUnion: 'booleanUnion',
  createDifference: 'booleanSubtract',
  createIntersection: 'booleanIntersect',
  boolean: 'booleanUnion',
  union: 'booleanUnion',
  subtract: 'booleanSubtract',
  intersect: 'booleanIntersect',

  // Point / vector — sometimes the model uses lowercase or "create"
  // prefix.
  createPoint: 'Point3',
  Point: 'Point3',
  point: 'Point3',
  createVector: 'Vector3',
  Vector: 'Vector3',

  // Solid primitives — "create" already exists for these, so the AI
  // sometimes drops it. Re-add.
  box: 'createBox',
  sphere: 'createSphere',
  cylinder: 'createCylinder',
  cone: 'createCone',
  torus: 'createTorus',

  // Combine — sometimes confused with combineAll.
  combine: 'combineAll',
  combineMeshes: 'combineAll',

  // Sweep / extrude — drop the "create" prefix.
  createSweep: 'sweep',
  createExtrude: 'extrude',
  createRevolve: 'revolve',
  createPipe: 'pipe'
};

// Returns the rewritten code plus a list of rewrites applied (so the
// caller can log telemetry or surface a chat note "auto-fixed N
// hallucinated method names"). The rewrite is conservative — only
// names with an exact entry in ALIAS_MAP are changed; everything else
// flows through unchanged.
export function rewriteGeoAliases(code) {
  if (typeof code !== 'string' || !code) return { code: code || '', rewrites: [] };
  const rewrites = [];
  // Match Geo.<name> followed by a non-word character (so we don't
  // partial-match Geo.createBoxOfChocolate when only createBox is
  // mapped). The lookahead keeps the following char intact.
  const rewritten = code.replace(/Geo\.([A-Za-z_][A-Za-z0-9_]*)(?=[^A-Za-z0-9_])/g, (match, name) => {
    const canonical = ALIAS_MAP[name];
    if (!canonical) return match;
    rewrites.push({ from: name, to: canonical });
    return 'Geo.' + canonical;
  });
  return { code: rewritten, rewrites };
}

// Convenience helper for the integration — applies the rewriter only to
// the python code block inside an AI response, leaving the surrounding
// markdown narration untouched.
export function rewriteGeoAliasesInResponse(responseText) {
  if (typeof responseText !== 'string') return { text: responseText, rewrites: [] };
  let allRewrites = [];
  const replaced = responseText.replace(/(```(?:python)?\s*\n)([\s\S]*?)(\n\s*```)/g, (full, open, code, close) => {
    const { code: rewritten, rewrites } = rewriteGeoAliases(code);
    allRewrites = allRewrites.concat(rewrites);
    return open + rewritten + close;
  });
  return { text: replaced, rewrites: allRewrites };
}

// Exported for tests that want to assert the full alias map without
// importing private state.
export function getAliasMap() {
  return Object.freeze({ ...ALIAS_MAP });
}
