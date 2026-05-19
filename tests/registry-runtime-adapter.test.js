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
