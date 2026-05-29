import {
  isWireTypeCompatible,
  resolveWireTypes,
  describeWireTypeMismatch,
  refreshWireTypeFlags
} from '../src/core/wire-type-check.js';

describe('graph-time wire type check', () => {
  describe('isWireTypeCompatible', () => {
    it('accepts identical types', () => {
      expect(isWireTypeCompatible('point', 'point')).toBe(true);
      expect(isWireTypeCompatible('mesh', 'mesh')).toBe(true);
      expect(isWireTypeCompatible('number', 'number')).toBe(true);
    });

    it('accepts known interchangeable pairs (point↔vector, mesh↔solid, curve↔line)', () => {
      expect(isWireTypeCompatible('point', 'vector')).toBe(true);
      expect(isWireTypeCompatible('vector', 'point')).toBe(true);
      expect(isWireTypeCompatible('mesh', 'solid')).toBe(true);
      expect(isWireTypeCompatible('curve', 'line')).toBe(true);
      expect(isWireTypeCompatible('curve', 'circle')).toBe(true);
      expect(isWireTypeCompatible('curve', 'polyline')).toBe(true);
      expect(isWireTypeCompatible('curve', 'nurbscurve')).toBe(true);
      expect(isWireTypeCompatible('surface', 'nurbssurface')).toBe(true);
    });

    it('accepts any/list/pattern/field on either side (permissive slots)', () => {
      expect(isWireTypeCompatible('any', 'mesh')).toBe(true);
      expect(isWireTypeCompatible('mesh', 'any')).toBe(true);
      expect(isWireTypeCompatible('list', 'mesh')).toBe(true);
      expect(isWireTypeCompatible('mesh', 'list')).toBe(true);
    });

    it('treats missing schema info as permissive (never false-fires)', () => {
      // Some legacy nodes or AI-generated definitions may not declare a
      // type; we don't want to flag those as mismatches.
      expect(isWireTypeCompatible(null, 'mesh')).toBe(true);
      expect(isWireTypeCompatible('mesh', undefined)).toBe(true);
      expect(isWireTypeCompatible('', 'mesh')).toBe(true);
    });

    it('flags the common manual-wiring mistakes', () => {
      // These are real bugs we want to surface as red wires:
      expect(isWireTypeCompatible('point', 'mesh')).toBe(false);
      expect(isWireTypeCompatible('mesh', 'point')).toBe(false);
      expect(isWireTypeCompatible('number', 'mesh')).toBe(false);
      expect(isWireTypeCompatible('mesh', 'number')).toBe(false);
      expect(isWireTypeCompatible('string', 'mesh')).toBe(false);
      expect(isWireTypeCompatible('curve', 'mesh')).toBe(false);
    });
  });

  describe('resolveWireTypes', () => {
    const nodes = [
      { id: 'a', def: { outputs: [{ id: 'value', type: 'point' }] } },
      { id: 'b', def: { inputs: [{ id: 'center', type: 'point' }, { id: 'radius', type: 'number' }] } },
      { id: 'c', def: { inputs: [], outputs: [] } }
    ];

    it('looks up the output type and input type from the node definitions', () => {
      const w = { fromNode: 'a', fromPort: 'value', toNode: 'b', toPort: 'center' };
      expect(resolveWireTypes(w, nodes)).toEqual({ fromType: 'point', toType: 'point' });
    });

    it('returns null when a node or port is missing', () => {
      expect(resolveWireTypes({ fromNode: 'missing', fromPort: 'x', toNode: 'b', toPort: 'center' }, nodes)).toBe(null);
      expect(resolveWireTypes({ fromNode: 'a', fromPort: 'unknown', toNode: 'b', toPort: 'center' }, nodes)).toBe(null);
      expect(resolveWireTypes({ fromNode: 'a', fromPort: 'value', toNode: 'c', toPort: 'whatever' }, nodes)).toBe(null);
    });

    it('returns null for malformed inputs (defensive)', () => {
      expect(resolveWireTypes(null, nodes)).toBe(null);
      expect(resolveWireTypes({ fromNode: 'a', fromPort: 'value', toNode: 'b', toPort: 'center' }, null)).toBe(null);
    });
  });

  describe('describeWireTypeMismatch', () => {
    const nodes = [
      // Phyllotaxis-like: outputs a list of points
      { id: 'gen', def: { outputs: [{ id: 'points', type: 'list' }] } },
      // CombineAll-like: takes a list input
      { id: 'combine', def: { inputs: [{ id: 'meshes', type: 'list' }] } },
      // A point producer
      { id: 'pt', def: { outputs: [{ id: 'p', type: 'point' }] } },
      // A mesh-only sink (e.g. boolean union)
      { id: 'meshOp', def: { inputs: [{ id: 'a', type: 'mesh' }] } }
    ];

    it('returns null for compatible wires', () => {
      // list → list is permissive (we can't distinguish list-of-X at the
      // schema level; Phase 3 handles that at code-time)
      expect(describeWireTypeMismatch(
        { fromNode: 'gen', fromPort: 'points', toNode: 'combine', toPort: 'meshes' },
        nodes
      )).toBe(null);
    });

    it('returns mismatch info with a human-readable reason for incompatible wires', () => {
      // point → mesh (the most common manual wiring mistake)
      const mm = describeWireTypeMismatch(
        { fromNode: 'pt', fromPort: 'p', toNode: 'meshOp', toPort: 'a' },
        nodes
      );
      expect(mm).toBeDefined();
      expect(mm.fromType).toBe('point');
      expect(mm.toType).toBe('mesh');
      expect(mm.reason).toContain('point');
      expect(mm.reason).toContain('mesh');
    });

    it('returns null when the schema is incomplete (cannot validate)', () => {
      const partial = [
        { id: 'x', def: { outputs: [{ id: 'out', type: 'mesh' }] } },
        { id: 'y', def: { inputs: [{ id: 'in' /* no type */ }] } }
      ];
      const mm = describeWireTypeMismatch(
        { fromNode: 'x', fromPort: 'out', toNode: 'y', toPort: 'in' },
        partial
      );
      expect(mm).toBe(null);
    });
  });

  describe('refreshWireTypeFlags', () => {
    const nodes = [
      { id: 'pt', def: { outputs: [{ id: 'p', type: 'point' }] } },
      { id: 'meshOp', def: { inputs: [{ id: 'a', type: 'mesh' }] } },
      { id: 'goodTo', def: { inputs: [{ id: 'pt', type: 'point' }] } }
    ];

    it('sets typeMismatch on incompatible wires and clears it on compatible ones', () => {
      const wires = [
        // bad: point → mesh
        { fromNode: 'pt', fromPort: 'p', toNode: 'meshOp', toPort: 'a' },
        // good: point → point
        { fromNode: 'pt', fromPort: 'p', toNode: 'goodTo', toPort: 'pt' }
      ];
      refreshWireTypeFlags(wires, nodes);
      expect(wires[0].typeMismatch).toBeDefined();
      expect(wires[0].typeMismatch.fromType).toBe('point');
      expect(wires[0].typeMismatch.toType).toBe('mesh');
      expect(wires[1].typeMismatch).toBeUndefined();
    });

    it('clears stale typeMismatch when a wire becomes valid after a node change', () => {
      // Sim: wire was previously bad, then node def changed to make it good.
      const wires = [
        { fromNode: 'pt', fromPort: 'p', toNode: 'goodTo', toPort: 'pt', typeMismatch: { reason: 'stale' } }
      ];
      refreshWireTypeFlags(wires, nodes);
      expect(wires[0].typeMismatch).toBeUndefined();
    });

    it('is a no-op on non-array inputs', () => {
      expect(() => refreshWireTypeFlags(null, nodes)).not.toThrow();
      expect(() => refreshWireTypeFlags([], null)).not.toThrow();
    });
  });
});
