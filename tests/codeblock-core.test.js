// Custom.CodeBlock CORE — the Dynamo-style code block (Python-first).
//
// Covers the core contract the on-node editor (Switch) and the engine build on:
//   • resolveCodeBlockPorts: free vars → inputs, ALL top-level assignments → outputs
//   • Custom.Python stays last-assignment-only (no regression)
//   • desugarSeries: the four series forms (end-inclusive) + edges
//   • number / string literal semantics
//   • 1/0 ↔ boolean wire-boundary coercion (resolveInputs)
//   • Custom.Formula → Custom.CodeBlock type→type migration
//   • Custom.Code → Custom.CodeBlock rename: alias resolves + v1 graph still runs JS
//   • fresh registry has no duplicate-type collision

import { describe, it, expect } from 'vitest';
import {
  topLevelAssignments,
  resolveCodeBlockPorts,
  lastTopLevelAssignment,
  inferInputPorts
} from '../src/runtime/python-port-decl.js';
import { desugarSeries } from '../src/runtime/codeblock-syntax.js';
import { migrateNodeType, isDeprecatedType, resolveVersionedDef, getDefVersion } from '../src/core/node-versions.js';
import { resolveInputs } from '../src/nodes/runtimeAdapter.js';
import { getLiveCoreRegistry, createCoreNodeRegistry } from '../src/nodes/coreNodes.js';
import { NODE_TYPE_MAP, NODE_VERSION_MAP } from '../src/core/nodes.js';
import { customNodes } from '../src/nodes/categories/custom.js';

describe('resolveCodeBlockPorts (the Switch contract)', () => {
  it('free/unknown variables become INPUT ports, in first-appearance order', () => {
    const r = resolveCodeBlockPorts('Result = x + y');
    expect(r.inputs.map(p => p.id)).toEqual(['x', 'y']);
  });

  it('ALL top-level assignments become OUTPUT ports (not just the last)', () => {
    const r = resolveCodeBlockPorts('a = 1\nb = a + 2\nc = x * b');
    expect(r.outputs.map(p => p.id)).toEqual(['a', 'b', 'c']);
    // only the genuinely-free var is an input (a, b are bound)
    expect(r.inputs.map(p => p.id)).toEqual(['x']);
  });

  it('every port is typed any', () => {
    const r = resolveCodeBlockPorts('Result = x');
    expect(r.inputs.every(p => p.type === 'any')).toBe(true);
    expect(r.outputs.every(p => p.type === 'any')).toBe(true);
  });

  it('a bare expression with no assignment falls back to output0', () => {
    const r = resolveCodeBlockPorts('x + y');
    expect(r.outputs.map(p => p.id)).toEqual(['output0']);
    expect(r.inputs.map(p => p.id)).toEqual(['x', 'y']);
  });

  it('literal-only code (no free vars) has no inputs', () => {
    const r = resolveCodeBlockPorts('a = 5\ns = "hi"');
    expect(r.inputs).toEqual([]);
    expect(r.outputs.map(p => p.id)).toEqual(['a', 's']);
  });

  it('augmented assignment is not an output; underscore names are private', () => {
    expect(topLevelAssignments('a = 1\na += 2')).toEqual(['a']);
    expect(topLevelAssignments('_tmp = 1\nout = _tmp')).toEqual(['out']);
  });

  it('indented assignments are not top-level outputs', () => {
    expect(topLevelAssignments('out = []\nfor i in range(3):\n    inner = i')).toEqual(['out']);
  });

  it('tuple unpacking yields each name', () => {
    expect(topLevelAssignments('a, b = 1, 2')).toEqual(['a', 'b']);
  });
});

describe('Custom.Python is NOT regressed (last-assignment-only)', () => {
  it('lastTopLevelAssignment still returns only the last name', () => {
    expect(lastTopLevelAssignment('a = 1\nb = a + 2\nc = b * 3')).toBe('c');
  });

  it('CodeBlock and Python disagree by design: all vs last', () => {
    const code = 'a = 1\nb = 2';
    expect(topLevelAssignments(code)).toEqual(['a', 'b']);
    expect(lastTopLevelAssignment(code)).toBe('b');
  });

  it('inferInputPorts (shared input strategy) unchanged', () => {
    expect(inferInputPorts('Result = x + y')).toEqual(['x', 'y']);
  });
});

describe('desugarSeries — four forms, end inclusive', () => {
  it('0..10 → step 1, end inclusive', () => {
    expect(desugarSeries('n = 0..10')).toBe('n = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]');
  });

  it('0..10..2 → explicit step, end inclusive', () => {
    expect(desugarSeries('n = 0..10..2')).toBe('n = [0, 2, 4, 6, 8, 10]');
  });

  it('0..10..#5 → start..end..#count: 5 values evenly spaced from 0 to 10', () => {
    // `#` on the LAST token means start..end..#count → count evenly-spaced values.
    // end=10, count=5 → [0, 2.5, 5, 7.5, 10]
    expect(desugarSeries('n = 0..10..#5')).toBe('n = [0, 2.5, 5, 7.5, 10]');
  });

  it('0..#5..2 → start..#count..step: step 2, count+1 values', () => {
    // `#` on the MIDDLE token means start..#count..step → count+1 step values.
    // step=2, count=5 → [0, 2, 4, 6, 8, 10]
    expect(desugarSeries('n = 0..#5..2')).toBe('n = [0, 2, 4, 6, 8, 10]');
  });

  it('negative step counts down, end inclusive', () => {
    expect(desugarSeries('n = 10..0..-2')).toBe('n = [10, 8, 6, 4, 2, 0]');
  });

  it('single-value range (start == end)', () => {
    expect(desugarSeries('n = 5..5')).toBe('n = [5]');
  });

  it('float evenly-spaced form rounds cleanly (no FP noise)', () => {
    // 0..1..#5 means start..end..#count → 5 evenly-spaced values from 0 to 1.
    // (The step form is 0..#5..1 → [0,1,2,3,4,5])
    expect(desugarSeries('n = 0..1..#5')).toBe('n = [0, 0.25, 0.5, 0.75, 1]');
  });

  it('leaves non-series code byte-for-byte intact', () => {
    expect(desugarSeries('a = 1 + 2\nb = a * 3')).toBe('a = 1 + 2\nb = a * 3');
  });

  it('never touches `..` inside string literals', () => {
    expect(desugarSeries('s = "0..10"')).toBe('s = "0..10"');
    expect(desugarSeries("s = '0..10..2'")).toBe("s = '0..10..2'");
  });

  it('step form, count of 1 yields start and one step (count+1 = 2 values)', () => {
    // 3..#1..10 → start..#count..step → start=3, step=10, count=1 → [3, 13]
    expect(desugarSeries('n = 3..#1..10')).toBe('n = [3, 13]');
  });

  it('handles multiple series on one line', () => {
    expect(desugarSeries('p = [0..2, 0..2..1]')).toBe('p = [[0, 1, 2], [0, 1, 2]]');
  });
});

describe('literal / boolean / number semantics', () => {
  it('bare numbers and strings are produced literally (via desugar passthrough)', () => {
    // desugar leaves literals intact; semantics are Python's on the runtime.
    expect(desugarSeries('a = 5')).toBe('a = 5');
    expect(desugarSeries('x = 2.5')).toBe('x = 2.5');
    expect(desugarSeries('s = "hello"')).toBe('s = "hello"');
  });

  it('a number into a boolean-typed input coerces (0→false, non-zero→true)', () => {
    const def = { inputs: [{ id: 'flag', type: 'boolean' }] };
    const inst = {};
    expect(resolveInputs(def, inst, () => 0).flag).toBe(false);
    expect(resolveInputs(def, inst, () => 1).flag).toBe(true);
    expect(resolveInputs(def, inst, () => 7).flag).toBe(true);
  });

  it('a boolean into a number-typed input coerces (true→1, false→0)', () => {
    const def = { inputs: [{ id: 'n', type: 'number' }] };
    const inst = {};
    expect(resolveInputs(def, inst, () => true).n).toBe(1);
    expect(resolveInputs(def, inst, () => false).n).toBe(0);
  });

  it('does NOT coerce when types already match or are any (no surprise)', () => {
    const numDef = { inputs: [{ id: 'n', type: 'number' }] };
    expect(resolveInputs(numDef, {}, () => 5).n).toBe(5);
    const anyDef = { inputs: [{ id: 'v', type: 'any' }] };
    expect(resolveInputs(anyDef, {}, () => 1).v).toBe(1); // stays 1, not true
    expect(resolveInputs(anyDef, {}, () => true).v).toBe(true);
  });

  it('boolean coercion leaves the single→list promotion alone', () => {
    const listDef = { inputs: [{ id: 'items', type: 'list' }] };
    expect(resolveInputs(listDef, {}, () => 1).items).toEqual([1]);
    expect(resolveInputs(listDef, {}, () => true).items).toEqual([true]);
  });

  it('null/undefined are never coerced', () => {
    const boolDef = { inputs: [{ id: 'flag', type: 'boolean' }] };
    expect(resolveInputs(boolDef, {}, () => undefined).flag).toBe(undefined);
    expect(resolveInputs(boolDef, {}, () => null).flag).toBe(null);
  });
});

describe('Custom.Formula → Custom.CodeBlock migration', () => {
  const formulaDef = customNodes.find(n => n.type === 'Custom.Formula');

  it('Formula is retained but deprecated (hidden) with a migrateTo target', () => {
    expect(formulaDef).toBeTruthy();
    expect(formulaDef.metadata.deprecated).toBe(true);
    expect(isDeprecatedType(formulaDef)).toBe(true);
    expect(formulaDef.metadata.migrateTo.type).toBe('Custom.CodeBlock');
  });

  it('migrateNodeType converts an instance to a CodeBlock with Result = <expr>', () => {
    const inst = { type: 'Custom.Formula', controlValues: { expr: 'x * y + 1' } };
    const plan = migrateNodeType(formulaDef, inst);
    expect(plan.type).toBe('Custom.CodeBlock');
    expect(plan.controlValues.code).toBe('Result = x * y + 1');
    expect(plan.portMap).toEqual({ x: 'x', y: 'y', result: 'Result' });
  });

  it('default expression migrates to Result = x + y', () => {
    const inst = { type: 'Custom.Formula', controlValues: {} };
    const plan = migrateNodeType(formulaDef, inst);
    expect(plan.controlValues.code).toBe('Result = x + y');
  });

  it('the migrated code resolves to the expected CodeBlock ports', () => {
    const plan = migrateNodeType(formulaDef, { controlValues: { expr: 'x + y' } });
    const ports = resolveCodeBlockPorts(plan.controlValues.code);
    expect(ports.inputs.map(p => p.id)).toEqual(['x', 'y']);
    expect(ports.outputs.map(p => p.id)).toEqual(['Result']);
  });

  it('migrateNodeType returns null for a def with no migration', () => {
    expect(migrateNodeType({ metadata: {} }, {})).toBeNull();
    expect(migrateNodeType(null, {})).toBeNull();
  });
});

describe('Custom.Code → Custom.CodeBlock rename + alias + versioning', () => {
  it('Custom.CodeBlock is canonical v2 with the language metadata', () => {
    const reg = getLiveCoreRegistry();
    const cb = reg.getNode('Custom.CodeBlock');
    expect(cb).toBeTruthy();
    expect(cb.name).toBe('Custom.CodeBlock');
    expect(getDefVersion(cb)).toBe(2);
    expect(cb.metadata.language).toBe('codeblock');
  });

  it('custom-code / Custom.Code resolve to the CodeBlock def (alias)', () => {
    const reg = getLiveCoreRegistry();
    expect(reg.getNode('custom-code').type).toBe('Custom.CodeBlock');
    expect(reg.getNode('Custom.Code').type).toBe('Custom.CodeBlock');
    expect(reg.getNode('custom-codeblock').type).toBe('Custom.CodeBlock');
  });

  it('the version map buckets v1 (JS Custom.Code) and v2 (Python CodeBlock)', () => {
    expect(Object.keys(NODE_VERSION_MAP['Custom.CodeBlock']).sort()).toEqual(['1', '2']);
    // alias buckets mirror the canonical so old-typed graphs resolve their version
    expect(Object.keys(NODE_VERSION_MAP['Custom.Code']).sort()).toEqual(['1', '2']);
  });

  it('an old Custom.Code graph (v1 / absent version) resolves the original JS def', () => {
    const latest = NODE_TYPE_MAP['Custom.Code'];
    const r = resolveVersionedDef(NODE_VERSION_MAP, 'Custom.Code', 1, latest);
    expect(r.version).toBe(1);
    expect(r.fallback).toBe(false);
    expect(r.def.name).toBe('Custom.Code');
    expect(typeof r.def.execute).toBe('function');
    // the v1 JS behavior is preserved: `return input0;`
    expect(r.def.execute({}, { input0: 42 }, { code: 'return input0;' })).toEqual({ output0: 42 });
  });

  it('a new node resolves the v2 Python CodeBlock def', () => {
    const r = resolveVersionedDef(NODE_VERSION_MAP, 'Custom.CodeBlock', 2, NODE_TYPE_MAP['Custom.CodeBlock']);
    expect(r.version).toBe(2);
    expect(r.def.name).toBe('Custom.CodeBlock');
  });
});

describe('registry integrity (no duplicate-type collision)', () => {
  it('a fresh registry builds without throwing on duplicate types', () => {
    expect(() => createCoreNodeRegistry()).not.toThrow();
  });

  it('Custom.Code is no longer a canonical type (only an alias)', () => {
    const reg = createCoreNodeRegistry();
    expect(reg.nodes.has('Custom.Code')).toBe(false);
    expect(reg.aliases.get('Custom.Code')).toBe('Custom.CodeBlock');
  });

  it('exactly one CodeBlock canonical def in the custom category', () => {
    const codeBlocks = customNodes.filter(n => n.type === 'Custom.CodeBlock');
    expect(codeBlocks.length).toBe(1);
    // the old JS Custom.Code is no longer a standalone canonical node
    expect(customNodes.find(n => n.type === 'Custom.Code')).toBeUndefined();
  });

  it('CodeBlock help.example is a complete producer → focal → consumer graph', () => {
    const cb = customNodes.find(n => n.type === 'Custom.CodeBlock');
    expect(cb.help.example.nodes.length).toBe(3);
    expect(cb.help.example.wires.length).toBe(2);
  });
});

describe('F-001: metadata flows into the legacy NODE_TYPE_MAP def', () => {
  it('toLegacyNodeDefinition carries metadata so live defs expose it', () => {
    const cb = NODE_TYPE_MAP['Custom.CodeBlock'];
    expect(cb).toBeTruthy();
    expect(cb.metadata).toBeTruthy();
    expect(cb.metadata.language).toBe('codeblock');
  });

  it('isDeprecatedType works against the LIVE Custom.Formula def (not just the registry)', () => {
    const formula = NODE_TYPE_MAP['Custom.Formula'];
    expect(formula).toBeTruthy();
    expect(isDeprecatedType(formula)).toBe(true);
    // migration helper resolves a real plan from the live def (was null when metadata was dropped)
    const plan = migrateNodeType(formula, { controlValues: { formula: 'x + y' } });
    expect(plan).toBeTruthy();
  });
});

describe('F-002: desugarSeries leaves Python comments untouched', () => {
  it('does NOT rewrite a series-like pattern inside a # comment', () => {
    expect(desugarSeries('# range 0..10\nx = 1')).toBe('# range 0..10\nx = 1');
    expect(desugarSeries('nums = 0..3  # makes 0..3')).toBe('nums = [0, 1, 2, 3]  # makes 0..3');
  });

  it('still desugars the `..#count` series marker (the # there is NOT a comment)', () => {
    // 0..10..#5 means start..end..#count → 5 evenly spaced from 0 to 10.
    expect(desugarSeries('0..10..#5')).toBe('[0, 2.5, 5, 7.5, 10]');
    // 0..#5..2 means start..#count..step → step=2, count=5 → 6 values.
    expect(desugarSeries('0..#5..2')).toBe('[0, 2, 4, 6, 8, 10]');
  });
});
