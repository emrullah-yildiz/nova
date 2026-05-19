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
      'math.add',
      'math.multiply'
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
    expect(registry.getNode('math.multiply').execute({}, { a: 4, b: 6 }, {}))
      .toEqual({ result: 24 });
    expect(registry.getNode('list.count').execute({}, { list: ['a', 'b'] }, {}))
      .toEqual({ count: 2 });
  });

  it('exports pilot nodes to the legacy library shape', () => {
    const library = createCoreNodeRegistry().toNodeLibrary();
    const math = library.categories.find(category => category.id === 'math');

    expect(math.nodes).toEqual([
      expect.objectContaining({ type: 'math.add', name: 'Math.Add' }),
      expect.objectContaining({ type: 'math.multiply', name: 'Math.Multiply' })
    ]);
  });
});
