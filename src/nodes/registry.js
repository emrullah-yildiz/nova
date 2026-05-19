import { defineNode } from './defineNode.js';

export class NodeRegistry {
  constructor() {
    this.categories = new Map();
    this.nodes = new Map();
  }

  registerCategory(category) {
    if (!category || typeof category !== 'object') {
      throw new TypeError('Category must be an object.');
    }
    if (!category.id || typeof category.id !== 'string') {
      throw new TypeError('Category requires a string id.');
    }

    var existing = this.categories.get(category.id);
    var normalized = {
      id: category.id,
      name: category.name || category.id,
      color: category.color || '',
      icon: category.icon || '',
      metadata: category.metadata || {},
      nodes: existing ? existing.nodes : []
    };

    this.categories.set(category.id, normalized);
    return normalized;
  }

  registerNode(definition) {
    var node = defineNode(definition);
    if (this.nodes.has(node.type)) {
      throw new Error('Node type already registered: ' + node.type);
    }

    var category = this.categories.get(node.category) || this.registerCategory({ id: node.category });
    category.nodes.push(node.type);
    this.nodes.set(node.type, node);
    return node;
  }

  registerNodes(definitions) {
    return definitions.map(this.registerNode, this);
  }

  getNode(type) {
    return this.nodes.get(type) || null;
  }

  hasNode(type) {
    return this.nodes.has(type);
  }

  getCategory(id) {
    return this.categories.get(id) || null;
  }

  listNodes() {
    return Array.from(this.nodes.values());
  }

  listCategories() {
    return Array.from(this.categories.values());
  }

  toNodeLibrary() {
    return {
      categories: this.listCategories().map(category => ({
        id: category.id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        nodes: category.nodes
          .map(type => this.nodes.get(type))
          .filter(Boolean)
          .map(toLegacyNodeDefinition)
      }))
    };
  }
}

export function createNodeRegistry() {
  return new NodeRegistry();
}

export function toLegacyNodeDefinition(node) {
  return {
    type: node.type,
    name: node.displayName,
    icon: node.icon,
    inputs: cloneList(node.inputs),
    outputs: cloneList(node.outputs),
    controls: cloneList(node.controls),
    preview: node.preview,
    dynamicInputs: node.dynamicInputs,
    codegen: { ...node.codegen }
  };
}

function cloneList(items) {
  return items.map(item => ({ ...item }));
}

export const defaultNodeRegistry = createNodeRegistry();
