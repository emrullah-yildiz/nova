import { createComputeContext, computeNodeValue } from '../src/core/compute-engine.js';
import {
  createCoreNodeRegistry,
  createRegistryComputeInner
} from '../src/nodes/index.js';

describe('registry runtime adapter', () => {
  it('executes a registered input node through the compute engine', () => {
    const registry = createCoreNodeRegistry();
    const nodes = [
      { id: 'n1', type: 'input.number', controlValues: { val: '42' } }
    ];
    const ctx = createComputeContext(nodes, [], {
      computeInner: createRegistryComputeInner(registry)
    });

    expect(computeNodeValue(ctx, nodes[0])).toBe(42);
    expect(nodes[0]._portValues).toEqual({ result: 42 });
  });

  it('resolves wires between registered nodes', () => {
    const registry = createCoreNodeRegistry();
    const nodes = [
      { id: 'a', type: 'input.number', controlValues: { val: '4' } },
      { id: 'b', type: 'input.number', controlValues: { val: '6' } },
      { id: 'sum', type: 'math.add', controlValues: { a: '0', b: '0' } }
    ];
    const wires = [
      { fromNode: 'a', fromPort: 'result', toNode: 'sum', toPort: 'a' },
      { fromNode: 'b', fromPort: 'result', toNode: 'sum', toPort: 'b' }
    ];
    const ctx = createComputeContext(nodes, wires, {
      computeInner: createRegistryComputeInner(registry)
    });

    expect(computeNodeValue(ctx, nodes[2])).toBe(10);
    expect(nodes[2]._portValues).toEqual({ result: 10 });
  });

  it('applies shortest lacing for registered math nodes', () => {
    const registry = createCoreNodeRegistry();
    const nodes = [
      { id: 'list-a', type: 'list.create', controlValues: {} },
      { id: 'list-b', type: 'list.create', controlValues: {} },
      { id: 'sum', type: 'math.add', controlValues: { a: '0', b: '0' } }
    ];
    nodes[0]._portValues = { list: [1, 2, 3] };
    nodes[1]._portValues = { list: [10, 20] };
    const wires = [
      { fromNode: 'list-a', fromPort: 'list', toNode: 'sum', toPort: 'a' },
      { fromNode: 'list-b', fromPort: 'list', toNode: 'sum', toPort: 'b' }
    ];
    const ctx = createComputeContext(nodes, wires, {
      computeInner(node) {
        if (node._portValues) return node._portValues.list;
        return createRegistryComputeInner(registry)(node, portId => {
          const wire = wires.find(w => w.toNode === node.id && w.toPort === portId);
          const source = wire && nodes.find(n => n.id === wire.fromNode);
          return source && source._portValues ? source._portValues[wire.fromPort] : undefined;
        }, () => undefined);
      }
    });

    expect(computeNodeValue(ctx, nodes[2])).toEqual([11, 22]);
    expect(nodes[2]._portValues).toEqual({ result: [11, 22] });
  });

  it('uses node lacing overrides before the registry default', () => {
    const registry = createCoreNodeRegistry();
    const nodes = [
      { id: 'list-a', type: 'test.source', controlValues: {}, _portValues: { list: [1, 2, 3] } },
      { id: 'list-b', type: 'test.source', controlValues: {}, _portValues: { list: [10, 20] } },
      { id: 'sum', type: 'math.add', controlValues: { a: '0', b: '0', _lacingMode: 'longest' } }
    ];
    const wires = [
      { fromNode: 'list-a', fromPort: 'list', toNode: 'sum', toPort: 'a' },
      { fromNode: 'list-b', fromPort: 'list', toNode: 'sum', toPort: 'b' }
    ];
    const ctx = createComputeContext(nodes, wires, {
      computeInner: createRegistryComputeInner(registry, {
        fallbackComputeInner(node) {
          return node._portValues ? node._portValues.list : undefined;
        }
      })
    });

    expect(computeNodeValue(ctx, nodes[2])).toEqual([11, 22, 23]);
    expect(nodes[2]._portValues).toEqual({ result: [11, 22, 23] });
  });

  it('groups cross product results by the first list input', () => {
    const registry = createCoreNodeRegistry();
    const nodes = [
      { id: 'list-a', type: 'test.source', controlValues: {}, _portValues: { list: [1, 2] } },
      { id: 'list-b', type: 'test.source', controlValues: {}, _portValues: { list: [10, 20, 30] } },
      { id: 'sum', type: 'math.add', controlValues: { a: '0', b: '0', _lacingMode: 'crossProduct' } }
    ];
    const wires = [
      { fromNode: 'list-a', fromPort: 'list', toNode: 'sum', toPort: 'a' },
      { fromNode: 'list-b', fromPort: 'list', toNode: 'sum', toPort: 'b' }
    ];
    const ctx = createComputeContext(nodes, wires, {
      computeInner: createRegistryComputeInner(registry, {
        fallbackComputeInner(node) {
          return node._portValues ? node._portValues.list : undefined;
        }
      })
    });

    expect(computeNodeValue(ctx, nodes[2])).toEqual([
      [11, 21, 31],
      [12, 22, 32]
    ]);
    expect(nodes[2]._portValues).toEqual({
      result: [
        [11, 21, 31],
        [12, 22, 32]
      ]
    });
  });

  it('supports multi-output registered nodes', () => {
    const registry = createCoreNodeRegistry();
    registry.registerCategory({ id: 'test', name: 'Test' });
    registry.registerNode({
      type: 'test.multi',
      category: 'test',
      outputs: [
        { id: 'a', type: 'number' },
        { id: 'b', type: 'number' }
      ],
      execute() {
        return { a: 1, b: 2 };
      }
    });
    const nodes = [{ id: 'multi', type: 'test.multi', controlValues: {} }];
    const ctx = createComputeContext(nodes, [], {
      computeInner: createRegistryComputeInner(registry)
    });

    expect(computeNodeValue(ctx, nodes[0])).toEqual({ a: 1, b: 2 });
    expect(nodes[0]._portValues).toEqual({ a: 1, b: 2 });
  });

  it('falls back for nodes that are not registered', () => {
    const registry = createCoreNodeRegistry();
    const nodes = [{ id: 'legacy', type: 'legacy.node', controlValues: {} }];
    const ctx = createComputeContext(nodes, [], {
      computeInner: createRegistryComputeInner(registry, {
        fallbackComputeInner(node) {
          return node.type === 'legacy.node' ? 'legacy-result' : undefined;
        }
      })
    });

    expect(computeNodeValue(ctx, nodes[0])).toBe('legacy-result');
  });
});
