// Phase 11: strict plan-mode commitment.
//
// Tests cover the two new mechanisms:
//
// 1. geo-alias-rewriter — pre-processes AI responses to swap common
//    name-bias hallucinations (Geo.createLoft → Geo.loft, etc.) for
//    canonical names BEFORE validators run, so the first attempt
//    succeeds instead of burning a fix-retry round trip.
//
// 2. The system prompt's strict-mode contract — build-intent prompts
//    must produce a nova-plan or refusal; Python is rejected. The
//    integration layer's strict rejection handler is exercised
//    indirectly via the prompt content (full DOM integration test
//    is out of scope for this PR — see plan-pipeline.test.js for the
//    happy-path E2E).

import { rewriteGeoAliases, rewriteGeoAliasesInResponse, getAliasMap } from '../src/ai/geo-alias-rewriter.js';
import { GPTClient } from '../src/ai/gpt-client.js';

describe('geo-alias-rewriter: bare code', () => {
  it('rewrites the production-observed Geo.createLoft mistake', () => {
    // Real failure from a user screenshot — AI wrote createLoft (which
    // does not exist) instead of loft. Phase 11 catches it before the
    // validator runs and the user sees correct code on the first try.
    const code = 'profiles = Geo.phyllotaxis(100, 30)\ntower = Geo.createLoft(profiles)';
    const { code: out, rewrites } = rewriteGeoAliases(code);
    expect(out).toContain('Geo.loft(profiles)');
    expect(out).not.toContain('createLoft');
    expect(rewrites).toEqual([{ from: 'createLoft', to: 'loft' }]);
  });

  it('rewrites the createQuad / createPolygon family to Polyline3', () => {
    const { code, rewrites } = rewriteGeoAliases('p = Geo.createPolygon(pts)\nq = Geo.createQuad(a, b, c, d)');
    expect(code).toContain('Geo.Polyline3(pts)');
    expect(code).toContain('Geo.Polyline3(a, b, c, d)');
    expect(rewrites.map(r => r.from).sort()).toEqual(['createPolygon', 'createQuad']);
  });

  it('rewrites boolean shortcuts to the explicit ops', () => {
    const r = rewriteGeoAliases('x = Geo.createBoolean(a, b)\ny = Geo.union(a, b)\nz = Geo.subtract(a, b)\nw = Geo.intersect(a, b)');
    expect(r.code).toContain('Geo.booleanUnion(a, b)');
    expect(r.code).toContain('Geo.booleanSubtract(a, b)');
    expect(r.code).toContain('Geo.booleanIntersect(a, b)');
    // Two rewrites for booleanUnion (createBoolean and union), one each for the others.
    expect(r.rewrites.length).toBe(4);
  });

  it('re-adds the create prefix when the AI dropped it on solid primitives', () => {
    const r = rewriteGeoAliases('b = Geo.box(center, 1, 1, 1)\ns = Geo.sphere(center, 1)');
    expect(r.code).toContain('Geo.createBox');
    expect(r.code).toContain('Geo.createSphere');
  });

  it('does NOT touch Geo.* calls that are already canonical', () => {
    const code = 'p = Geo.Point3(0, 0, 0)\nb = Geo.createBox(p, 1, 1, 1)\nl = Geo.loft(profiles)';
    const { code: out, rewrites } = rewriteGeoAliases(code);
    expect(out).toBe(code);
    expect(rewrites).toHaveLength(0);
  });

  it('does NOT partial-match a longer name that happens to start with an alias', () => {
    // The AI might write Geo.createBoxOfChocolate (not real, but the
    // rewriter must not silently strip "OfChocolate" off to make it
    // createBox).
    const code = 'x = Geo.createBoxOfChocolate(p)';
    const { code: out, rewrites } = rewriteGeoAliases(code);
    expect(out).toBe(code);
    expect(rewrites).toHaveLength(0);
  });

  it('handles malformed / empty input gracefully', () => {
    expect(rewriteGeoAliases('').code).toBe('');
    expect(rewriteGeoAliases(null).code).toBe('');
    expect(rewriteGeoAliases(undefined).code).toBe('');
  });

  it('exposes the alias map for inspection', () => {
    const map = getAliasMap();
    expect(map.createLoft).toBe('loft');
    expect(map.createQuad).toBe('Polyline3');
    expect(Object.isFrozen(map)).toBe(true);
  });
});

describe('geo-alias-rewriter: full AI response (fenced code blocks)', () => {
  it('rewrites only inside ```python blocks, preserving surrounding narration', () => {
    const response = `I'll build this with the loft op.

\`\`\`python
profiles = Geo.phyllotaxis(100, 30)
tower = Geo.createLoft(profiles)
print(tower)
\`\`\`

Approve when ready.`;
    const { text, rewrites } = rewriteGeoAliasesInResponse(response);
    expect(text).toContain('Geo.loft(profiles)');
    expect(text).toContain("I'll build this with the loft op.");
    expect(text).toContain('Approve when ready.');
    expect(rewrites).toHaveLength(1);
  });

  it('handles a response with no python block — no-op', () => {
    const response = "I think you should try Pattern.Phyllotaxis followed by Solid.ByLoft instead.";
    const { text, rewrites } = rewriteGeoAliasesInResponse(response);
    expect(text).toBe(response);
    expect(rewrites).toHaveLength(0);
  });

  it('handles multiple fenced blocks and rewrites each independently', () => {
    const response = `First attempt:
\`\`\`python
a = Geo.createLoft(p)
\`\`\`

Second attempt:
\`\`\`python
b = Geo.createQuad(c, d, e, f)
\`\`\``;
    const { text, rewrites } = rewriteGeoAliasesInResponse(response);
    expect(text).toContain('Geo.loft(p)');
    expect(text).toContain('Geo.Polyline3(c, d, e, f)');
    expect(rewrites).toHaveLength(2);
  });

  it('handles non-string input gracefully', () => {
    expect(rewriteGeoAliasesInResponse(null).text).toBe(null);
    expect(rewriteGeoAliasesInResponse(undefined).text).toBe(undefined);
    expect(rewriteGeoAliasesInResponse(123).rewrites).toEqual([]);
  });
});

describe('strict-mode system prompt commitment', () => {
  // The structural commitment is encoded in the system prompt's text.
  // These tests pin that the strict-mode contract is present so a future
  // refactor that loosens it back to "Python is fine sometimes" will
  // immediately fail.

  const sys = GPTClient.buildSystemPrompt('');

  it('declares plan-mode as the REQUIRED format for build requests', () => {
    expect(sys).toContain('STRICT MODE');
    expect(sys).toContain('nova-plan or refusal ONLY');
  });

  it('explicitly forbids Python for build requests', () => {
    expect(sys.toLowerCase()).toContain('not acceptable for build');
  });

  it('still documents the refusal block format with reason + suggestions', () => {
    expect(sys).toContain('refused');
    expect(sys).toContain('reason');
    expect(sys).toContain('suggestions');
  });

  it('still allows plain-text Python for questions and explanations', () => {
    // Strict mode applies to BUILD requests, not to chat. The prompt
    // should make that distinction so the AI doesn't refuse trivial
    // explanatory text.
    expect(sys).toMatch(/question|explanation|plain text/i);
  });
});
