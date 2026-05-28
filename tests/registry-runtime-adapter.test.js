import { describe, it, expect } from 'vitest';
import { createComputeContext, computeNodeValue } from '../src/core/compute-engine.js';
import { createNodeRegistry, createRegistryComputeInner } from '../src/nodes/index.js';

function makeTestRegistry() {
  const registry = createNodeRegistry();
  registry.registerCategory({ id: 'test', name: 'Test' });

  registry.registerNode({
    type: 'test.number',
    category: 'test',
    outputs: [{ id: 'result', type: 'number' }],
    controls: [{ id: 'val', type: 'formula', default: '0' }],
    execute(context, inputs, controls) {
      return { result: Number(controls.val) };
    }
  });

  registry.registerNode({
    type: 'test.add',
    category: 'test',
    lacing: { mode: 'shortest' },
    inputs: [
      { id: 'a', type: 'number' },
      { id: 'b', type: 'number' }
    ],
    outputs: [{ id: 'result', type: 'number' }],
    controls: [
      { id: 'a', type: 'formula', default: '0' },
      { id: 'b', type: 'formula', default: '0' }
    ],
    execute(context, inputs) {
      return { result: Number(inputs.a) + Number(inputs.b) };
    }
  });

  registry.registerNode({
    type: 'test.passthroughList',
    category: 'test',
    outputs: [{ id: 'list', type: 'list' }],
    execute(context, inputs, controls, nodeInstance) {
      return { list: nodeInstance && nodeInstance._portValues ? nodeInstance._portValues.list : [] };
    }
  });

  return registry;
}

describe('registry runtime adapter', () => {
  it('executes a registered single-output node through the compute engine', () => {
    const registry = makeTestRegistry();
    const nodes = [
      { id: 'n1', type: 'test.number', controlValues: { val: '42' } }
    ];
    const ctx = createComputeContext(nodes, [], {
      computeInner: createRegistryComputeInner(registry)
    });

    expect(computeNodeValue(ctx, nodes[0])).toBe(42);
    expect(nodes[0]._portValues).toEqual({ result: 42 });
  });

  it('resolves wires between registered nodes', () => {
    const registry = makeTestRegistry();
    const nodes = [
      { id: 'a', type: 'test.number', controlValues: { val: '4' } },
      { id: 'b', type: 'test.number', controlValues: { val: '6' } },
      { id: 'sum', type: 'test.add', controlValues: { a: '0', b: '0' } }
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

  it('applies shortest lacing for registered nodes with list inputs', () => {
    const registry = makeTestRegistry();
    const nodes = [
      { id: 'list-a', type: 'test.passthroughList', controlValues: {}, _portValues: { list: [1, 2, 3] } },
      { id: 'list-b', type: 'test.passthroughList', controlValues: {}, _portValues: { list: [10, 20] } },
      { id: 'sum', type: 'test.add', controlValues: { a: '0', b: '0' } }
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

    expect(computeNodeValue(ctx, nodes[2])).toEqual([11, 22]);
    expect(nodes[2]._portValues).toEqual({ result: [11, 22] });
  });

  it('honors a per-instance lacing override over the registry default', () => {
    const registry = makeTestRegistry();
    const nodes = [
      { id: 'list-a', type: 'test.passthroughList', controlValues: {}, _portValues: { list: [1, 2, 3] } },
      { id: 'list-b', type: 'test.passthroughList', controlValues: {}, _portValues: { list: [10, 20] } },
      { id: 'sum', type: 'test.add', controlValues: { a: '0', b: '0', _lacingMode: 'longest' } }
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
    const registry = makeTestRegistry();
    const nodes = [
      { id: 'list-a', type: 'test.passthroughList', controlValues: {}, _portValues: { list: [1, 2] } },
      { id: 'list-b', type: 'test.passthroughList', controlValues: {}, _portValues: { list: [10, 20, 30] } },
      { id: 'sum', type: 'test.add', controlValues: { a: '0', b: '0', _lacingMode: 'crossProduct' } }
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
    const registry = createNodeRegistry();
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
    const registry = createNodeRegistry();
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
