import {
  createNodeRegistry,
  defineNode
} from '../src/nodes/index.js';

describe('NodeRegistry', () => {
  it('normalizes node definitions', () => {
    const node = defineNode({
      type: 'math.add',
      category: 'math',
      inputs: [{ id: 'a' }, { id: 'b', type: 'number' }],
      outputs: [{ id: 'result', type: 'number' }],
      execute({ a, b }) {
        return { result: a + b };
      }
    });

    expect(node.displayName).toBe('math.add');
    expect(node.inputs[0]).toMatchObject({ id: 'a', name: 'a', type: 'any' });
    expect(node.lacing).toEqual({ mode: 'none', preserveStructure: false });
    expect(Object.isFrozen(node)).toBe(true);
  });

  it('registers categories and nodes', () => {
    const registry = createNodeRegistry();
    registry.registerCategory({
      id: 'math',
      name: 'Math',
      color: '#a6e3a1',
      icon: 'Σ'
    });
    registry.registerNode({
      type: 'math.add',
      name: 'Math.Add',
      category: 'math',
      icon: '+',
      inputs: [{ id: 'a', type: 'number' }, { id: 'b', type: 'number' }],
      outputs: [{ id: 'result', type: 'number' }]
    });

    expect(registry.getNode('math.add')).toMatchObject({ displayName: 'Math.Add' });
    expect(registry.getCategory('math').nodes).toEqual(['math.add']);
  });

  it('rejects duplicate node types', () => {
    const registry = createNodeRegistry();
    registry.registerNode({ type: 'math.add', category: 'math' });

    expect(() => registry.registerNode({ type: 'math.add', category: 'math' }))
      .toThrow('Node type already registered: math.add');
  });

  it('resolves nodes by registered alias', () => {
    const registry = createNodeRegistry();
    registry.registerNode({
      type: 'Math.Add',
      name: 'Math.Add',
      category: 'math',
      aliases: ['math.add', 'math-add'],
      inputs: [{ id: 'a', type: 'number' }, { id: 'b', type: 'number' }],
      outputs: [{ id: 'result', type: 'number' }]
    });

    expect(registry.resolveType('Math.Add')).toBe('Math.Add');
    expect(registry.resolveType('math.add')).toBe('Math.Add');
    expect(registry.resolveType('math-add')).toBe('Math.Add');
    expect(registry.resolveType('unknown.type')).toBeNull();
    expect(registry.hasNode('math-add')).toBe(true);
    expect(registry.getNode('math.add')).toMatchObject({ type: 'Math.Add' });
  });

  it('rejects an alias that collides with a canonical node type', () => {
    const registry = createNodeRegistry();
    registry.registerNode({ type: 'Math.Add', category: 'math' });

    expect(() => registry.registerAlias('Math.Add', 'Math.Sum'))
      .toThrow('Cannot register alias "Math.Add": already used as a canonical node type.');
  });

  it('rejects an alias re-registered to a different canonical type', () => {
    const registry = createNodeRegistry();
    registry.registerNode({ type: 'Math.Add', category: 'math' });
    registry.registerNode({ type: 'Math.Sum', category: 'math' });
    registry.registerAlias('math-add', 'Math.Add');

    expect(() => registry.registerAlias('math-add', 'Math.Sum'))
      .toThrow('Alias "math-add" already points to "Math.Add".');
  });

  it('exports a legacy NODE_LIBRARY compatible shape', () => {
    const registry = createNodeRegistry();
    registry.registerCategory({ id: 'list', name: 'List', color: '#fab387', icon: '☰' });
    registry.registerNode({
      type: 'list.create',
      name: 'List.Create',
      category: 'list',
      dynamicInputs: true,
      lacing: { mode: 'shortest' },
      inputs: [{ id: 'item0', type: 'any' }],
      outputs: [{ id: 'list', type: 'list' }],
      controls: [],
      codegen: { python: 'result = []' }
    });

    const library = registry.toNodeLibrary();

    expect(library.categories).toHaveLength(1);
    expect(library.categories[0]).toMatchObject({
      id: 'list',
      name: 'List',
      nodes: [
        expect.objectContaining({
          type: 'list.create',
          name: 'List.Create',
          dynamicInputs: true,
          lacing: { mode: 'shortest', preserveStructure: false }
        })
      ]
    });
  });
});
