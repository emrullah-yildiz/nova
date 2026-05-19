import {
  coreCategories,
  coreNodes,
  createCoreNodeRegistry
} from '../src/nodes/index.js';

const modernListNodeTypes = [
  'list.create',
  'list.count',
  'list.first',
  'list.last',
  'list.getItem',
  'list.range',
  'list.sequence',
  'list.repeat',
  'list.reverse',
  'list.flatten',
  'list.take',
  'list.skip',
  'list.slice',
  'list.insert',
  'list.remove',
  'list.join',
  'list.zip',
  'list.crossReference',
  'list.filterByBoolean',
  'list.sum',
  'list.average',
  'list.min',
  'list.max',
  'list.sort',
  'list.shuffle',
  'list.unique',
  'list.chunk',
  'list.transpose',
  'list.pairs',
  'list.indexOf',
  'list.contains',
  'list.map',
  'list.groupBy'
];

describe('core node registry package', () => {
  it('declares pilot categories and nodes', () => {
    expect(coreCategories.map(category => category.id)).toEqual(['input', 'list', 'math']);
    expect(coreNodes.map(node => node.type)).toEqual([
      'input.number',
      'input.text',
      ...modernListNodeTypes,
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
    expect(registry.getCategory('list').nodes).toEqual(modernListNodeTypes);
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

  it('executes every modern list node with representative values', () => {
    const registry = createCoreNodeRegistry();
    const cases = [
      ['list.create', { item0: 'a', item1: 'b', item2: 'c' }, {}, { _dynInputIds: ['item0', 'item1', 'item2'] }, { list: ['a', 'b', 'c'] }],
      ['list.count', { list: ['a', 'b'] }, {}, {}, { count: 2 }],
      ['list.first', { list: ['a', 'b'] }, {}, {}, { item: 'a' }],
      ['list.last', { list: ['a', 'b'] }, {}, {}, { item: 'b' }],
      ['list.getItem', { list: ['a', 'b'], index: 1 }, {}, {}, { item: 'b' }],
      ['list.range', { start: 0, end: 5, step: 2 }, {}, {}, { list: [0, 2, 4] }],
      ['list.sequence', { start: 1, step: 2, count: 3 }, {}, {}, { list: [1, 3, 5] }],
      ['list.repeat', { item: 'x', count: 3 }, {}, {}, { list: ['x', 'x', 'x'] }],
      ['list.reverse', { list: [1, 2, 3] }, {}, {}, { result: [3, 2, 1] }],
      ['list.flatten', { list: [[1, 2], 3] }, {}, {}, { result: [1, 2, 3] }],
      ['list.take', { list: [1, 2, 3], count: 2 }, {}, {}, { result: [1, 2] }],
      ['list.skip', { list: [1, 2, 3], count: 1 }, {}, {}, { result: [2, 3] }],
      ['list.slice', { list: [1, 2, 3, 4], from: 1, to: 3 }, {}, {}, { result: [2, 3] }],
      ['list.insert', { list: [1, 3], item: 2, index: 1 }, {}, {}, { result: [1, 2, 3] }],
      ['list.remove', { list: [1, 2, 3], index: 1 }, {}, {}, { result: [1, 3], removed: 2 }],
      ['list.join', { listA: [1], listB: [2, 3] }, {}, {}, { result: [1, 2, 3] }],
      ['list.zip', { listA: [1, 2], listB: ['a', 'b', 'c'] }, {}, {}, { result: [[1, 'a'], [2, 'b']] }],
      ['list.crossReference', { listA: [1, 2], listB: ['a', 'b'] }, {}, {}, { pairsA: [1, 1, 2, 2], pairsB: ['a', 'b', 'a', 'b'] }],
      ['list.filterByBoolean', { list: [1, 2, 3], mask: [true, false, 1] }, {}, {}, { inList: [1, 3], outList: [2] }],
      ['list.sum', { list: [1, 2, 'x', 3] }, {}, {}, { result: 6 }],
      ['list.average', { list: [1, 2, 'x', 3] }, {}, {}, { result: 2 }],
      ['list.min', { list: [4, 2, 8] }, {}, {}, { result: 2 }],
      ['list.max', { list: [4, 2, 8] }, {}, {}, { result: 8 }],
      ['list.sort', { list: [3, 1, 2] }, { desc: 'Descending' }, {}, { result: [3, 2, 1] }],
      ['list.unique', { list: [1, 2, 1, 3] }, {}, {}, { result: [1, 2, 3] }],
      ['list.chunk', { list: [1, 2, 3, 4, 5], size: 2 }, {}, {}, { result: [[1, 2], [3, 4], [5]] }],
      ['list.transpose', { list: [[1, 2], [3, 4], [5]] }, {}, {}, { result: [[1, 3, 5], [2, 4, undefined]] }],
      ['list.pairs', { list: [1, 2, 3] }, {}, {}, { result: [[1, 2], [2, 3]] }],
      ['list.indexOf', { list: ['a', 'b'], item: 'b' }, {}, {}, { index: 1 }],
      ['list.contains', { list: ['a', 'b'], item: 'b' }, {}, {}, { result: true }],
      ['list.map', { list: [1, 2, 3] }, { code: 'x * 2' }, {}, { result: [2, 4, 6] }],
      ['list.groupBy', { list: [1, 2, 3, 4], keys: ['odd', 'even', 'odd', 'even'] }, {}, {}, { groups: [[1, 3], [2, 4]], groupKeys: ['odd', 'even'] }]
    ];

    for (const [type, inputs, controls, nodeInstance, output] of cases) {
      expect(registry.getNode(type).execute({}, inputs, controls, nodeInstance)).toEqual(output);
    }

    expect(registry.getNode('list.shuffle').execute({}, { list: [1, 2, 3], seed: 7 }, {}))
      .toMatchObject({ result: expect.arrayContaining([1, 2, 3]) });
  });

  it('exports pilot nodes to the legacy library shape', () => {
    const library = createCoreNodeRegistry().toNodeLibrary();
    const math = library.categories.find(category => category.id === 'math');
    const list = library.categories.find(category => category.id === 'list');

    expect(list.nodes.map(node => node.type)).toEqual(modernListNodeTypes);

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
