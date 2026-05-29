// End-to-end tests for Phase 7's nova-plan pipeline.
//
// Covers each module (schema, extractor, validator, builder, planToPython)
// in isolation, plus a happy-path E2E that follows an AI response through
// extract → validate → build → render-as-Python on the spike target (two
// spheres + boolean subtract). If any step regresses, the next plan-mode
// chat in production will fail visibly — the validator surfaces the issue
// to the AI as a fix-retry hint.

import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { validatePlanShape, parseRef, NOVA_PLAN_VERSION } from '../src/ai/plan-schema.js';
import { extractPlanFromResponse } from '../src/ai/plan-extractor.js';
import { validatePlanAgainstRegistry } from '../src/ai/plan-validator.js';
import { buildGraphFromPlan, planToPython } from '../src/ai/plan-builder.js';

getLiveCoreRegistry();

describe('plan schema validation', () => {
  it('accepts a minimal well-formed plan', () => {
    const plan = {
      version: 1,
      ops: [{ id: 'a', node: 'Point.Origin' }]
    };
    expect(validatePlanShape(plan).ok).toBe(true);
  });

  it('rejects wrong version', () => {
    const r = validatePlanShape({ version: 0, ops: [{ id: 'a', node: 'X' }] });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('version'))).toBe(true);
  });

  it('rejects missing ops', () => {
    const r = validatePlanShape({ version: 1 });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('ops'))).toBe(true);
  });

  it('rejects duplicate op ids', () => {
    const r = validatePlanShape({
      version: 1,
      ops: [{ id: 'x', node: 'A' }, { id: 'x', node: 'B' }]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('duplicated'))).toBe(true);
  });

  it('rejects malformed references that do not start with @ or $', () => {
    const r = validatePlanShape({
      version: 1,
      ops: [{ id: 'a', node: 'X', inputs: { center: 'no-prefix' } }]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('@ (op)') || i.includes('$ (param)'))).toBe(true);
  });

  it('accepts a refusal plan and short-circuits the rest of the schema', () => {
    const r = validatePlanShape({
      version: 1,
      refused: { reason: 'No node generates Klein bottles parametrically.', suggestions: ['Try a hyperboloid'] }
    });
    expect(r.ok).toBe(true);
    expect(r.refused).toBe(true);
  });

  it('exports the protocol version so other modules stay in sync', () => {
    expect(NOVA_PLAN_VERSION).toBe(1);
  });

  it('parseRef distinguishes op refs from param refs', () => {
    expect(parseRef('@foo')).toEqual({ kind: '@', name: 'foo' });
    expect(parseRef('$bar')).toEqual({ kind: '$', name: 'bar' });
    expect(parseRef('plain')).toBe(null);
    expect(parseRef(null)).toBe(null);
  });
});

describe('plan extractor', () => {
  it('pulls the JSON out of a fenced ```nova-plan block and preserves narration', () => {
    const response = `Sure, here it is.

\`\`\`nova-plan
{ "version": 1, "ops": [{ "id": "a", "node": "Point.Origin" }] }
\`\`\`

Click Approve when ready.`;
    const r = extractPlanFromResponse(response);
    expect(r).toBeDefined();
    expect(r.plan).toBeDefined();
    expect(r.plan.ops[0].id).toBe('a');
    expect(r.narrationBefore).toContain('Sure, here it is');
    expect(r.narrationAfter).toContain('Click Approve');
  });

  it('returns null when the response has no plan block', () => {
    expect(extractPlanFromResponse('Hello there, no plan here')).toBe(null);
  });

  it('surfaces parse errors without throwing', () => {
    const r = extractPlanFromResponse('\n```nova-plan\n{ this is not json }\n```\n');
    expect(r).toBeDefined();
    expect(r.plan).toBe(null);
    expect(r.parseError).toBeDefined();
  });
});

describe('plan validator (against the real registry)', () => {
  const goodPlan = {
    version: 1,
    params: { outer: 10, inner: 7 },
    ops: [
      { id: 'origin', node: 'Point.Origin' },
      { id: 'a', node: 'Sphere.ByCenterRadius', inputs: { center: '@origin', radius: '$outer' } },
      { id: 'b', node: 'Sphere.ByCenterRadius', inputs: { center: '@origin', radius: '$inner' } },
      { id: 'shell', node: 'Solid.BooleanSubtract', inputs: { a: '@a', b: '@b' } },
      { id: 'watch', node: 'Output.Watch', inputs: { value: '@shell' } }
    ]
  };

  it('accepts a graph whose every node, port, and reference resolves', () => {
    expect(validatePlanAgainstRegistry(goodPlan).ok).toBe(true);
  });

  it('rejects unknown node types (the AI invented something)', () => {
    const r = validatePlanAgainstRegistry({
      version: 1,
      ops: [{ id: 'x', node: 'Imaginary.NotAReal.Node' }]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('unknown node type'))).toBe(true);
  });

  it('rejects an input that references a port the node does not have', () => {
    const r = validatePlanAgainstRegistry({
      version: 1,
      ops: [
        { id: 'pt', node: 'Point.Origin' },
        { id: 'broken', node: 'Sphere.ByCenterRadius', inputs: { notAPort: '@pt' } }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('no such port'))).toBe(true);
  });

  it('rejects a reference to an op id that does not exist', () => {
    const r = validatePlanAgainstRegistry({
      version: 1,
      ops: [
        { id: 'shell', node: 'Solid.BooleanSubtract', inputs: { a: '@missing', b: '@alsoMissing' } },
        { id: 'watch', node: 'Output.Watch', inputs: { value: '@shell' } }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('no such op'))).toBe(true);
  });

  it('rejects a $param reference that has not been declared', () => {
    const r = validatePlanAgainstRegistry({
      version: 1,
      ops: [
        { id: 'pt', node: 'Point.Origin' },
        { id: 's', node: 'Sphere.ByCenterRadius', inputs: { center: '@pt', radius: '$undeclared' } }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('no such param'))).toBe(true);
  });

  it('detects cycles', () => {
    const r = validatePlanAgainstRegistry({
      version: 1,
      ops: [
        { id: 'a', node: 'Solid.BooleanSubtract', inputs: { a: '@b', b: '@b' } },
        { id: 'b', node: 'Solid.BooleanSubtract', inputs: { a: '@a', b: '@a' } },
        { id: 'watch', node: 'Output.Watch', inputs: { value: '@a' } }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('cycle'))).toBe(true);
  });

  it('warns when no Output.* op is present (graph would not render)', () => {
    const r = validatePlanAgainstRegistry({
      version: 1,
      params: { outer: 10 },
      ops: [
        { id: 'pt', node: 'Point.Origin' },
        { id: 's', node: 'Sphere.ByCenterRadius', inputs: { center: '@pt', radius: '$outer' } }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => /Output\..* op/.test(i))).toBe(true);
  });

  it('flags orphan ops whose output nothing consumes', () => {
    const r = validatePlanAgainstRegistry({
      version: 1,
      params: { outer: 10 },
      ops: [
        { id: 'pt', node: 'Point.Origin' },
        { id: 'used', node: 'Sphere.ByCenterRadius', inputs: { center: '@pt', radius: '$outer' } },
        { id: 'orphan', node: 'Sphere.ByCenterRadius', inputs: { center: '@pt', radius: '$outer' } },
        { id: 'watch', node: 'Output.Watch', inputs: { value: '@used' } }
      ]
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('"orphan"') && i.includes('never consumed'))).toBe(true);
  });
});

describe('plan builder', () => {
  const goodPlan = {
    version: 1,
    params: { outer: 10, inner: 7 },
    ops: [
      { id: 'origin', node: 'Point.Origin' },
      { id: 'a', node: 'Sphere.ByCenterRadius', inputs: { center: '@origin', radius: '$outer' } },
      { id: 'b', node: 'Sphere.ByCenterRadius', inputs: { center: '@origin', radius: '$inner' } },
      { id: 'shell', node: 'Solid.BooleanSubtract', inputs: { a: '@a', b: '@b' } },
      { id: 'watch', node: 'Output.Watch', inputs: { value: '@shell' } }
    ]
  };

  it('produces nodes for every param + every op', () => {
    const g = buildGraphFromPlan(goodPlan);
    // 2 params + 5 ops = 7
    expect(g.nodes).toHaveLength(7);
    expect(g.nodes.find(n => n.type === 'Input.Number' && n.variable === 'outer')).toBeDefined();
    expect(g.nodes.find(n => n.type === 'Input.Number' && n.variable === 'inner')).toBeDefined();
    expect(g.nodes.find(n => n.type === 'Solid.BooleanSubtract')).toBeDefined();
  });

  it('produces a wire for every input reference', () => {
    const g = buildGraphFromPlan(goodPlan);
    // origin used twice, outer/inner once each, a→shell, b→shell, shell→watch
    expect(g.wires).toHaveLength(7);
  });

  it('places ops at increasing column based on dependency depth', () => {
    const g = buildGraphFromPlan(goodPlan);
    const watch = g.nodes.find(n => n.type === 'Output.Watch');
    const shell = g.nodes.find(n => n.type === 'Solid.BooleanSubtract');
    const a = g.nodes.find(n => n.type === 'Sphere.ByCenterRadius' && n.variable === 'a');
    expect(watch.x).toBeGreaterThan(shell.x);
    expect(shell.x).toBeGreaterThan(a.x);
  });

  it('returns a refused signal when the plan is a refusal', () => {
    const g = buildGraphFromPlan({ version: 1, refused: { reason: 'no can do' } });
    expect(g.refused).toBeDefined();
    expect(g.nodes).toHaveLength(0);
  });
});

describe('planToPython', () => {
  const plan = {
    version: 1,
    params: { outer: 10, inner: 7 },
    ops: [
      { id: 'origin', node: 'Point.Origin' },
      { id: 'a', node: 'Sphere.ByCenterRadius', inputs: { center: '@origin', radius: '$outer' } },
      { id: 'b', node: 'Sphere.ByCenterRadius', inputs: { center: '@origin', radius: '$inner' } },
      { id: 'shell', node: 'Solid.BooleanSubtract', inputs: { a: '@a', b: '@b' } },
      { id: 'watch', node: 'Output.Watch', inputs: { value: '@shell' } }
    ]
  };

  it('renders the plan as canonical, parser-friendly Python', () => {
    const py = planToPython(plan);
    // Every param becomes an assignment, every op becomes one Geo.* line,
    // and the references are resolved to the variable names. No for-loops,
    // no nested calls — exactly what CodeParser expects.
    expect(py).toContain('outer = 10');
    expect(py).toContain('inner = 7');
    expect(py).toContain('origin = Geo.Point3(0, 0, 0)');
    expect(py).toContain('a = Geo.createSphere(origin, outer)');
    expect(py).toContain('b = Geo.createSphere(origin, inner)');
    expect(py).toContain('shell = Geo.booleanSubtract(a, b)');
  });

  it('does NOT double-emit print() when an Output.* op is present', () => {
    const py = planToPython(plan);
    // Output.Watch's codegen already prints; we must not append our own.
    const printCount = (py.match(/print\s*\(/g) || []).length;
    expect(printCount).toBe(1);
  });

  it('appends a print() for the final variable when no Output.* op exists', () => {
    const withoutWatch = { ...plan, ops: plan.ops.filter(o => o.node !== 'Output.Watch') };
    const py = planToPython(withoutWatch);
    expect(py).toContain('print(shell)');
  });

  it('returns empty string for a refused plan', () => {
    expect(planToPython({ version: 1, refused: { reason: 'x' } })).toBe('');
  });
});

describe('end-to-end: AI response → graph applied to canvas (spike target)', () => {
  it('runs the full pipeline on the sphere-subtract response without losing info', () => {
    const aiResponse = `I'll build a shell: a 10-radius sphere with a 7-radius sphere subtracted.

\`\`\`nova-plan
{
  "version": 1,
  "params": { "outer": 10, "inner": 7 },
  "ops": [
    { "id": "origin", "node": "Point.Origin" },
    { "id": "a",      "node": "Sphere.ByCenterRadius", "inputs": { "center": "@origin", "radius": "$outer" } },
    { "id": "b",      "node": "Sphere.ByCenterRadius", "inputs": { "center": "@origin", "radius": "$inner" } },
    { "id": "shell",  "node": "Solid.BooleanSubtract", "inputs": { "a": "@a", "b": "@b" } },
    { "id": "watch",  "node": "Output.Watch",          "inputs": { "value": "@shell" } }
  ]
}
\`\`\`

Click Approve when ready.`;

    const extracted = extractPlanFromResponse(aiResponse);
    expect(extracted).toBeDefined();
    expect(extracted.plan).toBeDefined();

    const shape = validatePlanShape(extracted.plan);
    expect(shape.ok).toBe(true);

    const reg = validatePlanAgainstRegistry(extracted.plan);
    expect(reg.ok).toBe(true);

    const graph = buildGraphFromPlan(extracted.plan);
    expect(graph.nodes).toHaveLength(7);
    expect(graph.wires).toHaveLength(7);

    const py = planToPython(extracted.plan);
    // The canonical Python should be parseable: every line a single assignment,
    // every reference a real variable.
    expect(py.split('\n').filter(l => l.trim() && !l.startsWith('#') && l !== 'import math').length).toBeGreaterThan(5);
    expect(py).not.toContain('for ');
    expect(py).not.toContain('append(');
  });
});
