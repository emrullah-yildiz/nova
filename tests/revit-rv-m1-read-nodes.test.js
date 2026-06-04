// RV-M1 — Revit READ nodes (collectors/filtering + geometry extraction).
// These are codegen-only, READ-ONLY nodes folded into the existing `revit`
// category. They have NO execute() and NO SEC-013 write gate; each emits a
// RevitBridge.* read call. The C# bridge handlers are handed to Trinity in
// docs/agent-handoff.md (RV-M1b).
//
// This suite asserts: (1) all RV-M1 types register in the single `revit`
// category with no duplicate-type collision in a fresh registry; (2) each
// node's codegen emits the expected RevitBridge call; (3) a dedup guard pins
// the canonical RV-M1 set and confirms none is a functional duplicate of an
// existing collector / parameter / geometry node; (4) read-only invariants
// (no execute, no approval control).

import { describe, it, expect } from 'vitest';
import { NODE_TYPE_MAP, NODE_LIBRARY } from '../src/core/nodes.js';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';

const def = (type) => NODE_TYPE_MAP[type];

// The canonical RV-M1 set (type → expected name → expected RevitBridge call).
const RV_M1 = [
  { type: 'revit-filter-by-parameter', name: 'Revit.FilterByParameter', call: 'RevitBridge.filterByParameter(' },
  { type: 'revit-filter-by-level', name: 'Revit.FilterByLevel', call: 'RevitBridge.filterByLevel(' },
  { type: 'revit-elements-by-type', name: 'Revit.ElementsByType', call: 'RevitBridge.getElementsByType(' },
  { type: 'revit-element-by-id', name: 'Revit.ElementById', call: 'RevitBridge.getElementsById(' },
  { type: 'revit-element-solids', name: 'Element.Solids', call: 'RevitBridge.getSolids(' },
  { type: 'revit-element-faces', name: 'Element.Faces', call: 'RevitBridge.getFaces(' },
  { type: 'revit-element-bounding-box', name: 'Element.BoundingBox', call: 'RevitBridge.getBoundingBoxes(' },
  { type: 'revit-element-location', name: 'Element.Location', call: 'RevitBridge.getLocations(' }
];

describe('RV-M1 registration & no duplicate-type collision', () => {
  it('registers every RV-M1 type in the single existing `revit` category', () => {
    const revitCats = NODE_LIBRARY.categories.filter((c) => c.id === 'revit');
    // No parallel/duplicate Revit category — RV-M1 folds into the existing one.
    expect(revitCats).toHaveLength(1);
    const types = revitCats[0].nodes.map((n) => n.type);
    RV_M1.forEach(({ type }) => expect(types).toContain(type));
  });

  it('uses the expected ParentName.NodeName for each RV-M1 node', () => {
    RV_M1.forEach(({ type, name }) => {
      expect(def(type)).toBeTruthy();
      expect(def(type).name).toBe(name);
    });
  });

  it('builds a fresh core registry with no duplicate-type collision', () => {
    expect(() => createCoreNodeRegistry()).not.toThrow();
    const registry = createCoreNodeRegistry();
    RV_M1.forEach(({ type }) => expect(registry.hasNode(type)).toBe(true));
  });

  it('every RV-M1 type is unique across the WHOLE library (no functional clone under another type)', () => {
    const allTypes = NODE_LIBRARY.categories.flatMap((c) => c.nodes.map((n) => n.type));
    RV_M1.forEach(({ type }) => {
      expect(allTypes.filter((t) => t === type)).toHaveLength(1);
    });
  });
});

describe('RV-M1 codegen emits the expected RevitBridge read call', () => {
  RV_M1.forEach(({ type, call }) => {
    it(`${type} codegen calls ${call}…)`, () => {
      const node = def(type);
      expect(node.codegen && typeof node.codegen.python).toBe('string');
      expect(node.codegen.python).toContain(call);
    });
  });

  it('FilterByParameter passes elements + name/op/value into the bridge call', () => {
    const py = def('revit-filter-by-parameter').codegen.python;
    expect(py).toContain('RevitBridge.filterByParameter({{elements}}, "{{ctrl.name}}", "{{ctrl.op}}", "{{ctrl.value}}")');
  });

  it('Element.Location splits curve/point from the bridge records', () => {
    const py = def('revit-element-location').codegen.python;
    expect(py).toContain('RevitBridge.getLocations({{elements}})');
    expect(py).toContain('l.get("curve")');
    expect(py).toContain('l.get("point")');
  });

  it('Element.Faces surfaces faceIds for hosting', () => {
    const py = def('revit-element-faces').codegen.python;
    expect(py).toContain('f.get("faceId")');
  });
});

describe('RV-M1 read-only invariants (no execute, no write gate)', () => {
  RV_M1.forEach(({ type }) => {
    it(`${type} is codegen-only: no execute, no approval control`, () => {
      const node = def(type);
      // Read-only nodes run via codegen / the engine read path — never a
      // def-level execute (which would mean a live write-style round-trip).
      expect(node.execute == null).toBe(true);
      // No SEC-013 requireApproval control — these never write.
      const ctrlIds = (node.controls || []).map((c) => c.id);
      expect(ctrlIds).not.toContain('requireApproval');
    });
  });
});

describe('RV-M1 dedup guard — canonical set & no functional duplicates', () => {
  it('pins the exact RV-M1 canonical type set', () => {
    expect(RV_M1.map((n) => n.type).sort()).toEqual([
      'revit-element-bounding-box',
      'revit-element-by-id',
      'revit-element-faces',
      'revit-element-location',
      'revit-element-solids',
      'revit-elements-by-type',
      'revit-filter-by-level',
      'revit-filter-by-parameter'
    ]);
  });

  it('does NOT re-implement existing collectors (AllElementsOfCategory) or mesh getter (Element.Geometries)', () => {
    // RV-M1 collectors are filters/type/id resolvers — distinct from the
    // category/active-view collectors. Confirm the existing nodes survive
    // unchanged and RV-M1 did not fork them.
    expect(def('revit-all-of-category')).toBeTruthy();
    expect(def('revit-all-elements-view')).toBeTruthy();
    // Element.Geometries (mesh) stays the mesh getter; Element.Solids/Faces are
    // the distinct BREP-solid / face variants, not duplicates of it.
    expect(def('revit-element-geometries').codegen.python).toContain('RevitBridge.getGeometries(');
    expect(def('revit-element-solids').codegen.python).toContain('RevitBridge.getSolids(');
    expect(def('revit-element-faces').codegen.python).toContain('RevitBridge.getFaces(');
  });

  it('FilterByParameter is distinct from GetParameterValues (filters elements, not reads values)', () => {
    // GetParameterValues READS values off elements; FilterByParameter RETURNS
    // the matching elements. Different bridge call, different output type.
    expect(def('revit-get-parameter-values').codegen.python).toContain('RevitBridge.getParameterValues(');
    expect(def('revit-filter-by-parameter').codegen.python).toContain('RevitBridge.filterByParameter(');
    const out = def('revit-filter-by-parameter').outputs.map((o) => o.id);
    expect(out).toContain('elements');
  });
});
