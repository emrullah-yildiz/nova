import {
  createNodeTypeMapFromRegistry,
  createRegistryFromNodeLibrary,
  legacyNodeToRegistryDefinition
} from '../src/nodes/index.js';
import {
  NODE_LIBRARY,
  NODE_TYPE_MAP
} from '../src/core/nodes.js';

describe('legacy node library bridge', () => {
  it('converts a legacy node into a registry definition', () => {
    const definition = legacyNodeToRegistryDefinition({
      type: 'math-add',
      name: 'Math.Add',
      icon: '+',
      inputs: [{ id: 'a', type: 'number' }],
      outputs: [{ id: 'result', type: 'number' }],
      controls: [{ id: 'a', type: 'formula', default: '0' }],
      preview: true,
      codegen: { python: '{{result}} = {{a}}' }
    }, {
      id: 'math',
      name: 'Math',
      color: '#a6e3a1',
      icon: 'Σ'
    });

    expect(definition).toMatchObject({
      type: 'math-add',
      name: 'Math.Add',
      category: 'math',
      metadata: {
        source: 'legacy-node-library',
        categoryName: 'Math'
      }
    });
  });

  it('imports the full legacy NODE_LIBRARY into a registry', () => {
    const registry = createRegistryFromNodeLibrary(NODE_LIBRARY);

    expect(registry.listCategories()).toHaveLength(NODE_LIBRARY.categories.length);
    expect(registry.listNodes()).toHaveLength(Object.keys(NODE_TYPE_MAP).length);
    expect(registry.getNode('revit-send-geometry')).toMatchObject({
      displayName: 'Revit.SendGeometry',
      category: 'revit'
    });
  });

  it('exports a registry node type map compatible with NODE_TYPE_MAP', () => {
    const registry = createRegistryFromNodeLibrary(NODE_LIBRARY);
    const nodeTypeMap = createNodeTypeMapFromRegistry(registry);

    expect(Object.keys(nodeTypeMap).sort()).toEqual(
      Object.keys(NODE_TYPE_MAP)
        .filter((type) => Object.prototype.hasOwnProperty.call(NODE_TYPE_MAP, type))
        .sort()
    );
    // Picks a canonical legacy entry that has not been migrated yet.
    expect(nodeTypeMap['revit-send-geometry']).toMatchObject({
      type: 'revit-send-geometry',
      name: 'Revit.SendGeometry'
    });
  });
});
