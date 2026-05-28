import { NODE_LIBRARY, NODE_TYPE_MAP } from '../core/nodes.js';
import { curvesCategory, curvesNodes } from './categories/curves.js';
import { geometryCategory, geometryNodes } from './categories/geometry.js';
import { inputCategory, inputNodes } from './categories/input.js';
import { listCategory, listNodes } from './categories/list.js';
import { logicCategory, logicNodes } from './categories/logic.js';
import { mathCategory, mathNodes } from './categories/math.js';
import { outputCategory, outputNodes } from './categories/output.js';
import { planeCategory, planeNodes } from './categories/plane.js';
import { pointCategory, pointNodes } from './categories/point.js';
import { solidsCategory, solidsNodes } from './categories/solids.js';
import { surfacesCategory, surfacesNodes } from './categories/surfaces.js';
import { vectorCategory, vectorNodes } from './categories/vector.js';
import { legacyCoreCategories, legacyCoreNodes } from './legacyCoreNodes.js';
import { createNodeRegistry, toLegacyNodeDefinition } from './registry.js';

const modernCategories = [
  curvesCategory,
  geometryCategory,
  inputCategory,
  listCategory,
  logicCategory,
  mathCategory,
  outputCategory,
  planeCategory,
  pointCategory,
  solidsCategory,
  surfacesCategory,
  vectorCategory
];

const modernCategoryIds = new Set(modernCategories.map((category) => category.id));

export const coreCategories = [
  ...modernCategories,
  ...legacyCoreCategories.filter((category) => !modernCategoryIds.has(category.id))
];

export const coreNodes = [
  ...curvesNodes,
  ...geometryNodes,
  ...inputNodes,
  ...listNodes,
  ...logicNodes,
  ...mathNodes,
  ...outputNodes,
  ...planeNodes,
  ...pointNodes,
  ...solidsNodes,
  ...surfacesNodes,
  ...vectorNodes,
  ...legacyCoreNodes
];

export function registerCoreNodes(registry) {
  coreCategories.forEach((category) => registry.registerCategory(category));
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

function isModernNode(node) {
  return node && (!node.metadata || node.metadata.source !== 'legacy-node-library');
}

function mergeRegistryIntoLegacyMaps(registry) {
  const existingCategoryIds = new Set(NODE_LIBRARY.categories.map((category) => category.id));

  registry.listCategories().forEach((category) => {
    const modernNodes = category.nodes
      .map((type) => registry.getNode(type))
      .filter(isModernNode);

    if (modernNodes.length === 0) return;

    const legacyShapes = modernNodes
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

  const modernCanonicalTypes = new Set(
    registry.listNodes()
      .filter(isModernNode)
      .map((node) => node.type)
  );

  registry.aliases.forEach((canonical, alias) => {
    if (!modernCanonicalTypes.has(canonical)) return;
    if (!NODE_TYPE_MAP[alias]) {
      NODE_TYPE_MAP[alias] = NODE_TYPE_MAP[canonical];
    }
  });
}
