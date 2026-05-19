import { inputCategory, inputNodes } from './categories/input.js';
import { listCategory, listNodes } from './categories/list.js';
import { mathCategory, mathNodes } from './categories/math.js';
import { createNodeRegistry } from './registry.js';

export const coreCategories = [
  inputCategory,
  listCategory,
  mathCategory
];

export const coreNodes = [
  ...inputNodes,
  ...listNodes,
  ...mathNodes
];

export function registerCoreNodes(registry) {
  coreCategories.forEach(category => registry.registerCategory(category));
  registry.registerNodes(coreNodes);
  return registry;
}

export function createCoreNodeRegistry() {
  return registerCoreNodes(createNodeRegistry());
}
