import {
  inferExprType,
  validateGeneratedCodeTypes,
  formatMismatchHint
} from '../src/ai/type-validator.js';

describe('AI type validator', () => {
  describe('inferExprType', () => {
    it('detects numeric literals and arithmetic-ish bare references conservatively', () => {
      expect(inferExprType('42')).toBe('number');
      expect(inferExprType('-3.14')).toBe('number');
      expect(inferExprType('math.cos(angle)')).toBe('number');
    });

    it('recognizes Geo.* call return types via the signature table', () => {
      // The catalog tells the AI these signatures; the validator must
      // agree about return types so downstream type-checks work.
      expect(inferExprType('Geo.Point3(0,0,0)')).toBe('point');
      expect(inferExprType('Geo.createBox(p, 1, 1, 1)')).toBe('mesh');
      expect(inferExprType('Geo.createSphere(c, 4)')).toBe('mesh');
      expect(inferExprType('Geo.phyllotaxis(100, 30)')).toBe('point[]');
      expect(inferExprType('Geo.loft(profiles)')).toBe('mesh');
    });

    it('infers list element type from homogeneous list literals', () => {
      expect(inferExprType('[Geo.Point3(0,0,0), Geo.Point3(1,1,1)]')).toBe('point[]');
      expect(inferExprType('[Geo.createBox(p,1,1,1), Geo.createSphere(p,1)]')).toBe('mesh[]');
    });

    it('returns a bare list for empty / mixed / unknown lists', () => {
      expect(inferExprType('[]')).toBe('list');
      expect(inferExprType('[1, 2, 3]')).toBe('number[]'); // homogeneous numeric
      expect(inferExprType('[Geo.Point3(0,0,0), 42]')).toBe('list'); // mixed
    });

    it('looks up plain variables in the env', () => {
      expect(inferExprType('p', { p: 'point' })).toBe('point');
      expect(inferExprType('missing', { p: 'point' })).toBe('unknown');
    });
  });

  describe('validateGeneratedCodeTypes — single-line checks', () => {
    it('passes good code where every arg matches its expected type', () => {
      const code = `p = Geo.Point3(0, 0, 0)
box = Geo.createBox(p, 1, 1, 1)
sphere = Geo.createSphere(p, 1)
result = Geo.booleanUnion(box, sphere)`;
      expect(validateGeneratedCodeTypes(code).ok).toBe(true);
    });

    it('flags a direct list-of-points fed to a mesh[]-expecting parameter', () => {
      // The minimal version of the production bug — no variable tracking
      // needed because the list is built inline.
      const code = `bad = Geo.combineAll([Geo.Point3(0,0,0), Geo.Point3(1,1,1)])`;
      const r = validateGeneratedCodeTypes(code);
      expect(r.ok).toBe(false);
      expect(r.mismatches[0]).toMatchObject({
        method: 'combineAll',
        paramIndex: 0,
        expected: 'mesh[]',
        got: 'point[]'
      });
    });

    it('flags a single-point fed to combineAll where a list is expected', () => {
      const code = `bad = Geo.combineAll(Geo.Point3(0,0,0))`;
      const r = validateGeneratedCodeTypes(code);
      expect(r.ok).toBe(false);
      expect(r.mismatches[0].method).toBe('combineAll');
    });
  });

  describe('validateGeneratedCodeTypes — variable + .append tracking', () => {
    it('catches the EXACT production bug (curved slab tower → list of points → combineAll)', () => {
      // Direct copy of the buggy code from the user’s screenshot. The
      // validator must follow circle_points through `[]` → `.append(Point3)`
      // → use-site in combineAll, and report the mismatch.
      const code = `import math
radius = 30
num_points = 100
circle_points = []
for i in range(num_points):
    angle = i * 2 * math.pi / num_points
    x = radius * math.cos(angle)
    y = radius * math.sin(angle)
    z = 0
    circle_points.append(Geo.Point3(x, y, z))
curve = Geo.combineAll(circle_points)`;
      const r = validateGeneratedCodeTypes(code);
      expect(r.ok).toBe(false);
      const offending = r.mismatches.find(m => m.method === 'combineAll');
      expect(offending).toBeDefined();
      expect(offending.expected).toBe('mesh[]');
      expect(offending.got).toBe('point[]');
      expect(offending.line).toBe(11);
    });

    it('does not false-fire when the list element type matches', () => {
      const code = `meshes = []
meshes.append(Geo.createBox(Geo.Point3(0,0,0), 1, 1, 1))
meshes.append(Geo.createSphere(Geo.Point3(0,0,0), 1))
result = Geo.combineAll(meshes)`;
      expect(validateGeneratedCodeTypes(code).ok).toBe(true);
    });

    it('tracks Geo.phyllotaxis (returns point[]) flowing into Geo.Polyline3', () => {
      // Polyline3 accepts point[] as first arg — should NOT trigger.
      const code = `points = Geo.phyllotaxis(100, 30)
profile = Geo.Polyline3(points, True)`;
      expect(validateGeneratedCodeTypes(code).ok).toBe(true);
    });
  });

  describe('validateGeneratedCodeTypes — false positive guards', () => {
    it('stays silent on arithmetic-tracked unknowns rather than nagging', () => {
      // x/y/z are derived from arithmetic on numbers; we don’t track
      // those precisely. Phase 3 must NOT flag them because the call
      // shape (Geo.Point3(x, y, z)) is correct in spirit.
      const code = `x = radius * 2
y = radius * 3
p = Geo.Point3(x, y, 0)`;
      expect(validateGeneratedCodeTypes(code).ok).toBe(true);
    });

    it('skips lines that are just comments or blank', () => {
      const code = `# computed below
   # leading whitespace comment

x = 1`;
      expect(validateGeneratedCodeTypes(code).ok).toBe(true);
    });

    it('does not flag unknown Geo.* methods — that is Phase 2’s job', () => {
      // Geo.Edge isn’t in the signature table, so we simply don’t check
      // its args. The Phase 2 validator handles unknown method names.
      const code = `bad = Geo.Edge(0, 0, 0)
ok = Geo.createBox(Geo.Point3(0,0,0), 1, 1, 1)`;
      expect(validateGeneratedCodeTypes(code).ok).toBe(true);
    });

    it('deduplicates identical mismatches inside a loop body', () => {
      const code = `for i in range(10):
    bad = Geo.combineAll([Geo.Point3(0,0,0)])`;
      const r = validateGeneratedCodeTypes(code);
      expect(r.mismatches.length).toBe(1);
    });

    it('returns ok for empty / null / non-string inputs', () => {
      expect(validateGeneratedCodeTypes('').ok).toBe(true);
      expect(validateGeneratedCodeTypes(null).ok).toBe(true);
      expect(validateGeneratedCodeTypes(undefined).ok).toBe(true);
    });
  });

  describe('formatMismatchHint', () => {
    it('produces a human-readable line that includes file location + types', () => {
      const hint = formatMismatchHint({
        line: 11,
        method: 'combineAll',
        paramIndex: 0,
        expected: 'mesh[]',
        got: 'point[]',
        argText: 'circle_points'
      });
      expect(hint).toContain('line 11');
      expect(hint).toContain('Geo.combineAll');
      expect(hint).toContain('mesh[]');
      expect(hint).toContain('point[]');
      expect(hint).toContain('circle_points');
    });
  });
});
