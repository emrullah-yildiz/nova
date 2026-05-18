import { createComputeContext, computeNodeValue } from '../src/core/compute-engine.js';

describe('Compute engine', () => {
  it('caches node results and avoids repeated computeInner calls', () => {
    let computeCalls = 0;
    const nodes = [
      { id: 'n1', type: 'const', value: 7 },
      { id: 'n2', type: 'add', controlValues: { a: '2', b: '3' } }
    ];
    const wires = [
      { fromNode: 'n1', fromPort: 'value', toNode: 'n2', toPort: 'a' }
    ];
    const ctx = createComputeContext(nodes, wires, {
      computeInner(nd, getInput, getVal) {
        computeCalls += 1;
        if (nd.type === 'const') return nd.value;
        if (nd.type === 'add') return getInput('a') + getVal('b', 0);
        return undefined;
      }
    });

    const result = computeNodeValue(ctx, nodes[1]);
    expect(result).toBe(10);
    expect(computeCalls).toBe(2);
    expect(computeNodeValue(ctx, nodes[1])).toBe(10);
    expect(computeCalls).toBe(2);
  });

  it('handles cycles gracefully by returning undefined for in-progress nodes', () => {
    const nodes = [
      { id: 'a', type: 'cycle' },
      { id: 'b', type: 'cycle' }
    ];
    const wires = [
      { fromNode: 'a', fromPort: 'value', toNode: 'b', toPort: 'a' },
      { fromNode: 'b', fromPort: 'value', toNode: 'a', toPort: 'a' }
    ];
    const ctx = createComputeContext(nodes, wires, {
      computeInner(nd, getInput) {
        return getInput('a');
      }
    });

    const resultA = computeNodeValue(ctx, nodes[0]);
    const resultB = computeNodeValue(ctx, nodes[1]);
    expect(resultA).toBeUndefined();
    expect(resultB).toBeUndefined();
  });

  it('uses formula evaluator when control value is a string expression', () => {
    const nodes = [{ id: 'x', type: 'formula', controlValues: { expr: '2+3' } }];
    const ctx = createComputeContext(nodes, [], {
      formulaEval: { eval(expr) { return { value: 5, error: null }; } },
      computeInner(nd, getInput, getVal) {
        return getVal('expr', 0);
      }
    });

    expect(computeNodeValue(ctx, nodes[0])).toBe(5);
  });

  it('prefers pre-evaluated _eval_ values over raw control values', () => {
    const nodes = [{ id: 'y', type: 'formula', controlValues: { _eval_z: 42, z: '99' } }];
    const ctx = createComputeContext(nodes, [], {
      computeInner(nd, getInput, getVal) {
        return getVal('z', 0);
      }
    });

    expect(computeNodeValue(ctx, nodes[0])).toBe(42);
  });

  it('resolves multi-output nodes through _portValues', () => {
    const nodes = [
      { id: 'multi', type: 'multi', _portValues: { a: 8, b: 12 } },
      { id: 'consumer', type: 'use', controlValues: {} }
    ];
    const wires = [{ fromNode: 'multi', fromPort: 'a', toNode: 'consumer', toPort: 'input' }];
    const ctx = createComputeContext(nodes, wires, {
      computeInner(nd, getInput) {
        if (nd.type === 'use') return getInput('input');
        return undefined;
      }
    });

    expect(computeNodeValue(ctx, nodes[1])).toBe(8);
  });
});
