import { NODE_LIBRARY, NODE_TYPE_MAP } from '../core/nodes.js';
import { inputCategory, inputNodes } from './categories/input.js';
import { listCategory, listNodes } from './categories/list.js';
import { logicCategory, logicNodes } from './categories/logic.js';
import { mathCategory, mathNodes } from './categories/math.js';
import { legacyCoreCategories, legacyCoreNodes } from './legacyCoreNodes.js';
import { createNodeRegistry, toLegacyNodeDefinition } from './registry.js';

const modernCategories = [
  inputCategory,
  listCategory,
  logicCategory,
  mathCategory
];

const modernCategoryIds = new Set(modernCategories.map(category => category.id));

export const coreCategories = [
  ...modernCategories,
  ...legacyCoreCategories.filter(category => !modernCategoryIds.has(category.id))
];

export const coreNodes = [
  ...inputNodes,
  ...listNodes,
  ...logicNodes,
  ...mathNodes,
  ...legacyCoreNodes
];

export function registerCoreNodes(registry) {
  coreCategories.forEach(category => registry.registerCategory(category));
  registry.registerNodes(coreNodes);
  return registry;
}

export function createCoreNodeRegistry() {
  return registerCoreNodes(createNodeRegistry());
}

let _liveCoreRegistry = null;

export function getLiveCoreRegistry() {
  if (!_liveCoreRegistry) {
    _liveCoreRegistry = createCoreNodeRegistry();
    mergeRegistryIntoLegacyMaps(_liveCoreRegistry);
  }
  return _liveCoreRegistry;
}

function mergeRegistryIntoLegacyMaps(registry) {
  const existingCategoryIds = new Set(NODE_LIBRARY.categories.map((category) => category.id));

  registry.listCategories().forEach((category) => {
    const v1NodeDefs = category.nodes
      .map((type) => registry.getNode(type))
      .filter((node) => node && node.metadata && node.metadata.standardVersion === 'v1');

    if (v1NodeDefs.length === 0) return;

    const legacyShapes = v1NodeDefs
      .map(toLegacyNodeDefinition)
      .filter((node) => !NODE_TYPE_MAP[node.type]);

    if (legacyShapes.length === 0) return;

    if (existingCategoryIds.has(category.id)) {
      const target = NODE_LIBRARY.categories.find((entry) => entry.id === category.id);
      target.nodes.push(...legacyShapes);
    } else {
      NODE_LIBRARY.categories.push({
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        nodes: legacyShapes
      });
      existingCategoryIds.add(category.id);
    }

    legacyShapes.forEach((node) => {
      NODE_TYPE_MAP[node.type] = Object.assign({}, node, {
        categoryId: category.id,
        categoryColor: category.color
      });
    });
  });

  const v1CanonicalTypes = new Set(
    registry.listNodes()
      .filter((node) => node.metadata && node.metadata.standardVersion === 'v1')
      .map((node) => node.type)
  );

  registry.aliases.forEach((canonical, alias) => {
    if (!v1CanonicalTypes.has(canonical)) return;
    if (!NODE_TYPE_MAP[alias]) {
      NODE_TYPE_MAP[alias] = NODE_TYPE_MAP[canonical];
    }
  });
}
