import { inputCategory, inputNodes } from './categories/input.js';
import { listCategory, listNodes } from './categories/list.js';
import { mathCategory, mathNodes } from './categories/math.js';
import { legacyCoreCategories, legacyCoreNodes } from './legacyCoreNodes.js';
import { createNodeRegistry } from './registry.js';

const modernCategories = [
  inputCategory,
  listCategory,
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
