import { buildNodeCatalog, _clearCatalogCacheForTests } from '../src/ai/node-catalog.js';

describe('node catalog for AI system prompt', () => {
  beforeEach(() => _clearCatalogCacheForTests());

  const cat = buildNodeCatalog();

  it('has a small enough byte budget for build-intent turns', () => {
    // Sized so injecting it into the system prompt for build-intent turns
    // doesn't blow the free-tier model's context window. ~3k tokens is fine
    // for any modern chat model; we hard-cap at 12 KB just in case the
    // node library doubles in size.
    expect(cat.length).toBeLessThan(12000);
    expect(cat.length).toBeGreaterThan(1000);
  });

  it('lists primary categories users care about for design intents', () => {
    expect(cat).toContain('## Solids');
    expect(cat).toContain('## Surfaces');
    expect(cat).toContain('## Curves');
    expect(cat).toContain('## Point construction');
  });

  it('includes the Geo.* calls the AI hallucinated around in real testing', () => {
    // Specific regressions: the AI used Geo.combineAll(points) (wrong
    // input type). Both should now be visible in the inventory.
    expect(cat).toContain('Geo.createBox');
    expect(cat).toContain('Geo.createSphere');
    expect(cat).toContain('Geo.loft(');
    expect(cat).toContain('Geo.combineAll');
  });

  it('annotates output types so the AI can reason about composition', () => {
    // Mesh3, Point3, Curve3 etc. — these are what wires carry between
    // nodes. Without them the AI can write `Geo.combineAll(points)`
    // without knowing combineAll wants Mesh3[].
    // Allow nested parens inside the arg list (e.g. int(count)) by matching
    // anything up to the arrow.
    expect(cat).toMatch(/Geo\.createBox\([\s\S]+?\) → Mesh3/);
    expect(cat).toMatch(/Geo\.Circle3\([\s\S]+?\) → Circle3/);
  });

  it('drops noisy multi-line codegen so the catalog stays a clean signature list', () => {
    // Some nodes (ellipse, rectangle) build their profile inside a
    // for-loop in codegen.python. Those used to leak into the prompt as
    // raw script snippets and confuse the model. We skip them entirely.
    expect(cat).not.toContain('for j in range');
    expect(cat).not.toContain('pts.append(');
  });

  it('ends with composition rules that frame the AI\'s behavior', () => {
    expect(cat).toContain('## COMPOSITION RULES');
    expect(cat).toContain('single-call replacement');
    expect(cat).toContain('# fallback:');
    expect(cat).toContain('LAST RESORT');
    // Rule 5: AI should always print() the final result so the graph has
    // a Watch node. Without this the canvas stays blank even on success.
    expect(cat).toContain('print(');
  });

  it('caches the catalog string between calls (it\'s deterministic)', () => {
    const a = buildNodeCatalog();
    const b = buildNodeCatalog();
    expect(a).toBe(b);
  });
});
