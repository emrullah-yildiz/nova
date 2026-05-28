import { NODE_LIBRARY } from '../core/nodes.js';
import { legacyNodeToRegistryDefinition } from './legacyBridge.js';

export const legacyCoreCategories = NODE_LIBRARY.categories.map(category => ({
  id: category.id,
  name: category.name,
  color: category.color,
  icon: category.icon,
  metadata: {
    source: 'legacy-node-library',
    compatibility: true
  }
}));

export const legacyCoreNodes = NODE_LIBRARY.categories.flatMap(category =>
  category.nodes.map(node => ({
    ...legacyNodeToRegistryDefinition(node, category),
    metadata: {
      source: 'legacy-node-library',
      categoryName: category.name || category.id,
      compatibility: true
    }
  }))
);
