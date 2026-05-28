import { createNodeRegistry } from './registry.js';

export function registerLegacyNodeLibrary(registry, nodeLibrary) {
  if (!registry) throw new TypeError('A NodeRegistry instance is required.');
  validateNodeLibrary(nodeLibrary);

  nodeLibrary.categories.forEach(function(category) {
    registry.registerCategory({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      metadata: {
        source: 'legacy-node-library'
      }
    });

    (category.nodes || []).forEach(function(node) {
      registry.registerNode(legacyNodeToRegistryDefinition(node, category));
    });
  });

  return registry;
}

export function createRegistryFromNodeLibrary(nodeLibrary) {
  return registerLegacyNodeLibrary(createNodeRegistry(), nodeLibrary);
}

export function legacyNodeToRegistryDefinition(node, category) {
  if (!node || typeof node !== 'object') {
    throw new TypeError('Legacy node definition must be an object.');
  }
  if (!node.type) {
    throw new TypeError('Legacy node definition requires a type.');
  }

  return {
    type: node.type,
    name: node.name || node.type,
    category: category.id,
    icon: node.icon || '',
    color: category.color || '',
    inputs: cloneList(node.inputs || []),
    outputs: cloneList(node.outputs || []),
    controls: cloneList(node.controls || []),
    preview: node.preview !== false,
    dynamicInputs: node.dynamicInputs === true,
    lacing: node.lacing,
    codegen: node.codegen || {},
    metadata: {
      source: 'legacy-node-library',
      categoryName: category.name || category.id
    }
  };
}

export function createNodeTypeMapFromRegistry(registry) {
  var map = {};
  registry.listNodes().forEach(function(node) {
    map[node.type] = registryNodeToLegacyDefinition(node);
  });
  return map;
}

export function registryNodeToLegacyDefinition(node) {
  return {
    type: node.type,
    name: node.displayName,
    icon: node.icon,
    inputs: cloneList(node.inputs),
    outputs: cloneList(node.outputs),
    controls: cloneList(node.controls),
    preview: node.preview,
    dynamicInputs: node.dynamicInputs,
    lacing: node.lacing,
    codegen: { ...node.codegen }
  };
}

function validateNodeLibrary(nodeLibrary) {
  if (!nodeLibrary || typeof nodeLibrary !== 'object') {
    throw new TypeError('Node library must be an object.');
  }
  if (!Array.isArray(nodeLibrary.categories)) {
    throw new TypeError('Node library requires a categories array.');
  }
}

function cloneList(items) {
  return items.map(function(item) {
    return { ...item };
  });
}
