// RV-M2 — Revit params / info / types / material / phase / workset READ nodes.
// These are codegen-only, READ-ONLY nodes folded into the existing `revit`
// category. They have NO execute() and NO SEC-013 write gate; each emits a
// RevitBridge.* read call. The C# bridge handlers are handed to Trinity in
// docs/agent-handoff.md (RV-M2).
//
// This suite asserts: (1) all RV-M2 types register in the single `revit`
// category with no duplicate-type collision in a fresh registry; (2) each
// node's codegen emits the expected RevitBridge call; (3) the `properties`
// output is present on Element.Info and Element.TypeParameters (NOVA.md
// "Expose Properties where it makes sense"); (4) a dedup guard pins the
// canonical RV-M2 set, confirms it is distinct from RV-M1 + the existing
// parameter nodes (no functional duplicate of Revit.GetParameterValues), and
// (5) read-only invariants (no execute, no approval control).

import { describe, it, expect } from 'vitest';
import { NODE_TYPE_MAP, NODE_LIBRARY } from '../src/core/nodes.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';

const def = (type) => NODE_TYPE_MAP[type];

// The canonical RV-M2 set (type → expected name → expected RevitBridge call).
const RV_M2 = [
  { type: 'revit-element-info', name: 'Element.Info', call: 'RevitBridge.getElementInfo(' },
  { type: 'revit-parameter-by-builtin', name: 'Element.ParameterByBuiltIn', call: 'RevitBridge.getParameterByBuiltIn(' },
  { type: 'revit-type-parameters', name: 'Element.TypeParameters', call: 'RevitBridge.getTypeParameters(' },
  { type: 'revit-family-types', name: 'Revit.FamilyTypes', call: 'RevitBridge.getTypes(' },
  { type: 'revit-material-collect', name: 'Material.Collect', call: 'RevitBridge.getMaterials(' },
  { type: 'revit-element-phase', name: 'Element.Phase', call: 'RevitBridge.getPhase(' },
  { type: 'revit-element-workset', name: 'Element.Workset', call: 'RevitBridge.getWorkset(' }
];

// The RV-M1 set + the existing parameter nodes — the dedup baseline RV-M2 must
// stay distinct from.
const RV_M1_TYPES = [
  'revit-element-bounding-box',
  'revit-element-by-id',
  'revit-element-faces',
  'revit-element-location',
  'revit-element-solids',
  'revit-elements-by-type',
  'revit-filter-by-level',
  'revit-filter-by-parameter'
];

describe('RV-M2 registration & no duplicate-type collision', () => {
  it('registers every RV-M2 type in the single existing `revit` category', () => {
    const revitCats = NODE_LIBRARY.categories.filter((c) => c.id === 'revit');
    // No parallel/duplicate Revit category — RV-M2 folds into the existing one.
    expect(revitCats).toHaveLength(1);
    const types = revitCats[0].nodes.map((n) => n.type);
    RV_M2.forEach(({ type }) => expect(types).toContain(type));
  });

  it('uses the expected ParentName.NodeName for each RV-M2 node', () => {
    RV_M2.forEach(({ type, name }) => {
      expect(def(type)).toBeTruthy();
      expect(def(type).name).toBe(name);
    });
  });

  it('builds a fresh core registry with no duplicate-type collision', () => {
    expect(() => createCoreNodeRegistry()).not.toThrow();
    const registry = createCoreNodeRegistry();
    RV_M2.forEach(({ type }) => expect(registry.hasNode(type)).toBe(true));
  });

  it('every RV-M2 type is unique across the WHOLE library (no functional clone under another type)', () => {
    const allTypes = NODE_LIBRARY.categories.flatMap((c) => c.nodes.map((n) => n.type));
    RV_M2.forEach(({ type }) => {
      expect(allTypes.filter((t) => t === type)).toHaveLength(1);
    });
  });

  it('uses Unicode-glyph icons, never text abbreviations', () => {
    RV_M2.forEach(({ type }) => {
      const icon = def(type).icon || '';
      expect(icon.length).toBeGreaterThan(0);
      // No alphanumeric "text" icons (e.g. "max", "1st") — symbols only.
      expect(/[A-Za-z0-9]/.test(icon)).toBe(false);
    });
  });
});

describe('RV-M2 codegen emits the expected RevitBridge read call', () => {
  RV_M2.forEach(({ type, call }) => {
    it(`${type} codegen calls ${call}…)`, () => {
      const node = def(type);
      expect(node.codegen && typeof node.codegen.python).toBe('string');
      expect(node.codegen.python).toContain(call);
    });
  });

  it('Element.ParameterByBuiltIn keys by the BuiltInParameter enum (control), not a free name', () => {
    const node = def('revit-parameter-by-builtin');
    const py = node.codegen.python;
    expect(py).toContain('RevitBridge.getParameterByBuiltIn({{elements}}, "{{ctrl.bip}}")');
    const bip = (node.controls || []).find((c) => c.id === 'bip');
    expect(bip).toBeTruthy();
    expect(bip.type).toBe('dropdown');
    expect(Array.isArray(bip.options) && bip.options.length).toBeGreaterThan(0);
  });

  it('Revit.FamilyTypes returns a types list + names and takes an optional category control', () => {
    const node = def('revit-family-types');
    const py = node.codegen.python;
    expect(py).toContain('RevitBridge.getTypes("{{ctrl.category}}")');
    expect(py).toContain('t.get("name")');
    const out = node.outputs.map((o) => o.id);
    expect(out).toEqual(expect.arrayContaining(['types', 'names', 'count']));
    expect((node.controls || []).map((c) => c.id)).toContain('category');
  });

  it('Material.Collect produces materials + names (a producer, no inputs)', () => {
    const node = def('revit-material-collect');
    expect(node.inputs).toHaveLength(0);
    const out = node.outputs.map((o) => o.id);
    expect(out).toEqual(expect.arrayContaining(['materials', 'names', 'count']));
  });

  it('Element.Phase splits created/demolished from the bridge records', () => {
    const py = def('revit-element-phase').codegen.python;
    expect(py).toContain('RevitBridge.getPhase({{elements}})');
    expect(py).toContain('p.get("created")');
    expect(py).toContain('p.get("demolished")');
  });
});

describe('RV-M2 Properties output (NOVA.md "Expose Properties where it makes sense")', () => {
  it('Element.Info exposes a `properties` output (name→value map per element)', () => {
    const node = def('revit-element-info');
    const out = node.outputs.map((o) => o.id);
    expect(out).toContain('properties');
    // Plus the readable scalar attribute lists.
    expect(out).toEqual(expect.arrayContaining(['ids', 'categories', 'types', 'levels', 'names']));
    expect(node.codegen.python).toContain('i.get("properties", {})');
  });

  it('Element.TypeParameters exposes a `properties` output (type-scoped params)', () => {
    const node = def('revit-type-parameters');
    const out = node.outputs.map((o) => o.id);
    expect(out).toContain('properties');
    expect(node.codegen.python).toContain('t.get("properties", {})');
  });
});

describe('RV-M2 read-only invariants (no execute, no write gate)', () => {
  RV_M2.forEach(({ type }) => {
    it(`${type} is codegen-only: no execute, no approval control`, () => {
      const node = def(type);
      expect(node.execute == null).toBe(true);
      const ctrlIds = (node.controls || []).map((c) => c.id);
      expect(ctrlIds).not.toContain('requireApproval');
    });
  });
});

describe('RV-M2 dedup guard — canonical set & distinct from RV-M1 + existing params', () => {
  it('pins the exact RV-M2 canonical type set', () => {
    expect(RV_M2.map((n) => n.type).sort()).toEqual([
      'revit-element-info',
      'revit-element-phase',
      'revit-element-workset',
      'revit-family-types',
      'revit-material-collect',
      'revit-parameter-by-builtin',
      'revit-type-parameters'
    ]);
  });

  it('RV-M2 is disjoint from the RV-M1 set (no overlapping types)', () => {
    const m2 = new Set(RV_M2.map((n) => n.type));
    RV_M1_TYPES.forEach((t) => expect(m2.has(t)).toBe(false));
  });

  it('ParameterByBuiltIn / TypeParameters do NOT duplicate Revit.GetParameterValues', () => {
    // GetParameterValues reads a NAMED instance parameter; the RV-M2 readers key
    // by a different scope/space — BuiltInParameter enum and TYPE params — so
    // they are distinct workflows, not functional duplicates.
    expect(def('revit-get-parameter-values').codegen.python).toContain('RevitBridge.getParameterValues(');
    expect(def('revit-parameter-by-builtin').codegen.python).toContain('RevitBridge.getParameterByBuiltIn(');
    expect(def('revit-type-parameters').codegen.python).toContain('RevitBridge.getTypeParameters(');
    // Distinct bridge calls — none of the three share a method.
    expect(def('revit-parameter-by-builtin').codegen.python).not.toContain('RevitBridge.getParameterValues(');
    expect(def('revit-type-parameters').codegen.python).not.toContain('RevitBridge.getParameterValues(');
  });

  it('every RV-M2 node calls a UNIQUE RevitBridge method (no two share a call)', () => {
    const calls = RV_M2.map((n) => n.call);
    expect(new Set(calls).size).toBe(calls.length);
  });

  it('does not introduce a parallel materials/types collector elsewhere in the library', () => {
    const allNames = NODE_LIBRARY.categories.flatMap((c) => c.nodes.map((n) => n.name));
    expect(allNames.filter((n) => n === 'Material.Collect')).toHaveLength(1);
    expect(allNames.filter((n) => n === 'Revit.FamilyTypes')).toHaveLength(1);
  });
});
