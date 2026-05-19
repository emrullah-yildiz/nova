import {
  coreCategories,
  coreNodes,
  createCoreNodeRegistry
} from '../src/nodes/index.js';

describe('core node registry package', () => {
  it('declares pilot categories and nodes', () => {
    expect(coreCategories.map(category => category.id)).toEqual(['input', 'list', 'math']);
    expect(coreNodes.map(node => node.type)).toEqual([
      'input.number',
      'input.text',
      'list.create',
      'list.count',
      'math.absolute',
      'math.add',
      'math.ceiling',
      'math.clamp',
      'math.divide',
      'math.floor',
      'math.max',
      'math.min',
      'math.modulo',
      'math.multiply',
      'math.negate',
      'math.power',
      'math.reciprocal',
      'math.remap',
      'math.round',
      'math.subtract'
    ]);
  });

  it('creates a registry with core pilot nodes', () => {
    const registry = createCoreNodeRegistry();

    expect(registry.getNode('math.add')).toMatchObject({
      displayName: 'Math.Add',
      category: 'math',
      lacing: { mode: 'shortest', preserveStructure: false }
    });
    expect(registry.getCategory('list').nodes).toEqual(['list.create', 'list.count']);
  });

  it('executes pilot scalar node functions directly', () => {
    const registry = createCoreNodeRegistry();

    expect(registry.getNode('math.add').execute({}, { a: 4, b: 6 }, {}))
      .toEqual({ result: 10 });
    expect(registry.getNode('math.subtract').execute({}, { a: 10, b: 3 }, {}))
      .toEqual({ result: 7 });
    expect(registry.getNode('math.multiply').execute({}, { a: 4, b: 6 }, {}))
      .toEqual({ result: 24 });
    expect(registry.getNode('math.divide').execute({}, { a: 12, b: 3 }, {}))
      .toEqual({ result: 4 });
    expect(registry.getNode('math.power').execute({}, { base: 3, exp: 2 }, {}))
      .toEqual({ result: 9 });
    expect(registry.getNode('list.count').execute({}, { list: ['a', 'b'] }, {}))
      .toEqual({ count: 2 });
  });

  it('executes every modern math node with representative values', () => {
    const registry = createCoreNodeRegistry();
    const cases = [
      ['math.absolute', { a: -4 }, {}, { result: 4 }],
      ['math.add', { a: 4, b: 6 }, {}, { result: 10 }],
      ['math.ceiling', { a: 1.2 }, {}, { result: 2 }],
      ['math.clamp', { value: 2 }, { min: 0, max: 1 }, { result: 1 }],
      ['math.divide', { a: 12, b: 3 }, {}, { result: 4 }],
      ['math.floor', { a: 1.8 }, {}, { result: 1 }],
      ['math.max', { a: 2, b: 5 }, {}, { result: 5 }],
      ['math.min', { a: 2, b: 5 }, {}, { result: 2 }],
      ['math.modulo', { a: 7, b: 3 }, {}, { result: 1 }],
      ['math.multiply', { a: 4, b: 6 }, {}, { result: 24 }],
      ['math.negate', { a: 5 }, {}, { result: -5 }],
      ['math.power', { base: 3, exp: 2 }, {}, { result: 9 }],
      ['math.reciprocal', { a: 4 }, {}, { result: 0.25 }],
      ['math.remap', { value: [0, 5, 10] }, { fromMin: 'auto', fromMax: 'auto', toMin: 0, toMax: 1 }, { result: [0, 0.5, 1] }],
      ['math.round', { a: 1.234 }, { digits: 2 }, { result: 1.23 }],
      ['math.subtract', { a: 10, b: 3 }, {}, { result: 7 }]
    ];

    for (const [type, inputs, controls, output] of cases) {
      expect(registry.getNode(type).execute({}, inputs, controls)).toEqual(output);
    }
  });

  it('exports pilot nodes to the legacy library shape', () => {
    const library = createCoreNodeRegistry().toNodeLibrary();
    const math = library.categories.find(category => category.id === 'math');

    expect(math.nodes).toEqual([
      expect.objectContaining({ type: 'math.absolute', name: 'Math.Absolute' }),
      expect.objectContaining({ type: 'math.add', name: 'Math.Add' }),
      expect.objectContaining({ type: 'math.ceiling', name: 'Math.Ceiling' }),
      expect.objectContaining({ type: 'math.clamp', name: 'Math.Clamp' }),
      expect.objectContaining({ type: 'math.divide', name: 'Math.Divide' }),
      expect.objectContaining({ type: 'math.floor', name: 'Math.Floor' }),
      expect.objectContaining({ type: 'math.max', name: 'Math.Max' }),
      expect.objectContaining({ type: 'math.min', name: 'Math.Min' }),
      expect.objectContaining({ type: 'math.modulo', name: 'Math.Modulo' }),
      expect.objectContaining({ type: 'math.multiply', name: 'Math.Multiply' }),
      expect.objectContaining({ type: 'math.negate', name: 'Math.Negate' }),
      expect.objectContaining({ type: 'math.power', name: 'Math.Power' }),
      expect.objectContaining({ type: 'math.reciprocal', name: 'Math.Reciprocal' }),
      expect.objectContaining({ type: 'math.remap', name: 'Math.Remap' }),
      expect.objectContaining({ type: 'math.round', name: 'Math.Round' }),
      expect.objectContaining({ type: 'math.subtract', name: 'Math.Subtract' })
    ]);
  });
});
