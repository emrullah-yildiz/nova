import {
  getKnownGeoMethods,
  extractGeoCalls,
  suggestSimilarMethods,
  validateGeneratedCode,
  _clearKnownCacheForTests
} from '../src/ai/code-validator.js';

describe('AI code validator', () => {
  beforeEach(() => _clearKnownCacheForTests());

  describe('getKnownGeoMethods', () => {
    it('includes the Geo.* names that appear in the system-prompt catalog', () => {
      // Validation must NEVER reject a method the AI was told it could use.
      // Both come from coreNodes' codegen.python so they're guaranteed
      // consistent — these assertions are a sanity that the wiring is right.
      const known = getKnownGeoMethods();
      expect(known.has('createBox')).toBe(true);
      expect(known.has('createSphere')).toBe(true);
      expect(known.has('combineAll')).toBe(true);
      expect(known.has('loft')).toBe(true);
      expect(known.has('phyllotaxis')).toBe(true);
    });

    it('includes Geo namespaces that live in the prompt but not in node codegen', () => {
      // Primitives (Point3, Vector3) and utilities (booleanUnion, perlin2)
      // are valid Python the AI may write inside fallback blocks. The
      // catalog doesn't list them as nodes but the prompt does, so they
      // must be on the allowlist.
      const known = getKnownGeoMethods();
      expect(known.has('Point3')).toBe(true);
      expect(known.has('Vector3')).toBe(true);
      expect(known.has('booleanUnion')).toBe(true);
      expect(known.has('perlin2')).toBe(true);
    });
  });

  describe('extractGeoCalls', () => {
    it('finds every Geo.X(...) call with the correct line number', () => {
      const code = 'p = Geo.Point3(0, 0, 0)\nbox = Geo.createBox(p, 1, 1, 1)';
      const calls = extractGeoCalls(code);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'Point3', line: 1 });
      expect(calls[1]).toMatchObject({ method: 'createBox', line: 2 });
    });

    it('ignores Geo.* references inside comments', () => {
      // Otherwise the AI saying "I considered Geo.Edge but..." in a
      // comment would falsely register as a usage and trigger a warning.
      const code = '# we considered Geo.Edge but it does not exist\nbox = Geo.createBox(p, 1, 1, 1)';
      const calls = extractGeoCalls(code);
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('createBox');
    });

    it('requires the open paren so bare namespace mentions are ignored', () => {
      const code = '# Geo.something looks neat\nresult = "Geo.Point3 reference"';
      const calls = extractGeoCalls(code);
      expect(calls).toHaveLength(0);
    });

    it('finds multiple calls on the same line', () => {
      const code = 'r = Geo.booleanUnion(Geo.createBox(p, 1, 1, 1), Geo.createSphere(p, 1))';
      const calls = extractGeoCalls(code);
      expect(calls.map(c => c.method)).toEqual(['booleanUnion', 'createBox', 'createSphere']);
    });
  });

  describe('suggestSimilarMethods', () => {
    it('suggests the correct method on a case typo', () => {
      // Real AI behavior: drops capitalization on createBox / createSphere.
      const suggestions = suggestSimilarMethods('createbox');
      expect(suggestions[0]).toBe('Geo.createBox');
    });

    it('suggests near matches for an invented method name', () => {
      // "createTower" doesn't exist; closest real ones are other
      // primitive constructors.
      const suggestions = suggestSimilarMethods('createTower');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.startsWith('Geo.create'))).toBe(true);
    });

    it('returns empty array for nonsense far from any real method', () => {
      const suggestions = suggestSimilarMethods('xyzzyfoobarbazquux');
      expect(suggestions).toEqual([]);
    });

    it('respects the limit parameter', () => {
      expect(suggestSimilarMethods('create', 1).length).toBeLessThanOrEqual(1);
      expect(suggestSimilarMethods('create', 5).length).toBeLessThanOrEqual(5);
    });
  });

  describe('validateGeneratedCode', () => {
    it('accepts the exact code from the production "curved slab tower" bug', () => {
      // Geo.Point3 and Geo.combineAll both exist; the bug there was a
      // TYPE mismatch (points fed to combineAll), which Phase 3 will
      // catch. Phase 2 only validates method existence.
      const code = `import math
radius = 30
num_points = 100
circle_points = []
for i in range(num_points):
    circle_points.append(Geo.Point3(0, 0, 0))
curve = Geo.combineAll(circle_points)`;
      expect(validateGeneratedCode(code).ok).toBe(true);
    });

    it('flags hallucinated method names with line numbers and suggestions', () => {
      // Regression: the AI hallucinated Geo.Edge after picking Geodesic
      // Dome. Validator must catch this before fix-retry so the retry
      // prompt can specifically forbid the hallucinated name.
      const code = `box = Geo.Edge(0, 0, 0)
mesh = Geo.createTower(10, 30)
good = Geo.createBox(p, 1, 1, 1)`;
      const result = validateGeneratedCode(code);
      expect(result.ok).toBe(false);
      expect(result.unknowns.map(u => u.method)).toEqual(['Edge', 'createTower']);
      expect(result.unknowns[0].line).toBe(1);
      expect(result.unknowns[1].line).toBe(2);
      // Each unknown carries suggestions so the fix prompt can be specific.
      for (const u of result.unknowns) {
        expect(Array.isArray(u.suggestions)).toBe(true);
      }
    });

    it('deduplicates repeated unknowns so we do not nag the user 10 times', () => {
      const code = `a = Geo.Edge(p, 1)
b = Geo.Edge(p, 2)
c = Geo.Edge(p, 3)`;
      const result = validateGeneratedCode(code);
      expect(result.unknowns).toHaveLength(1);
      expect(result.unknowns[0].method).toBe('Edge');
    });

    it('counts total calls separately from unknowns (success-rate signal)', () => {
      const code = `box = Geo.createBox(p, 1, 1, 1)
edge = Geo.Edge(box)
sphere = Geo.createSphere(p, 1)`;
      const result = validateGeneratedCode(code);
      expect(result.totalCalls).toBe(3);
      expect(result.unknowns).toHaveLength(1);
    });

    it('returns ok=true on empty / non-code inputs', () => {
      expect(validateGeneratedCode('').ok).toBe(true);
      expect(validateGeneratedCode(null).ok).toBe(true);
      expect(validateGeneratedCode(undefined).ok).toBe(true);
    });
  });
});
