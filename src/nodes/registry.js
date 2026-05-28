import { defineNode } from './defineNode.js';

export class NodeRegistry {
  constructor() {
    this.categories = new Map();
    this.nodes = new Map();
    this.aliases = new Map();
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
    if (Array.isArray(node.aliases)) {
      node.aliases.forEach((alias) => this.registerAlias(alias, node.type));
    }
    return node;
  }

  registerNodes(definitions) {
    return definitions.map(this.registerNode, this);
  }

  registerAlias(alias, canonicalType) {
    if (typeof alias !== 'string' || !alias) {
      throw new TypeError('Alias must be a non-empty string.');
    }
    if (typeof canonicalType !== 'string' || !canonicalType) {
      throw new TypeError('Alias requires a canonical node type.');
    }
    if (alias === canonicalType) return;
    if (this.nodes.has(alias)) {
      throw new Error('Cannot register alias "' + alias + '": already used as a canonical node type.');
    }
    var existing = this.aliases.get(alias);
    if (existing && existing !== canonicalType) {
      throw new Error('Alias "' + alias + '" already points to "' + existing + '".');
    }
    this.aliases.set(alias, canonicalType);
  }

  resolveType(type) {
    if (this.nodes.has(type)) return type;
    return this.aliases.get(type) || null;
  }

  getNode(type) {
    if (this.nodes.has(type)) return this.nodes.get(type);
    var canonical = this.aliases.get(type);
    return canonical ? this.nodes.get(canonical) || null : null;
  }

  hasNode(type) {
    return this.nodes.has(type) || this.aliases.has(type);
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
    description: node.description || '',
    subGroup: node.subGroup || '',
    inputs: cloneList(node.inputs),
    outputs: cloneList(node.outputs),
    controls: cloneList(node.controls),
    preview: node.preview,
    dynamicInputs: node.dynamicInputs,
    lacing: node.lacing ? { ...node.lacing } : undefined,
    codegen: { ...node.codegen },
    help: node.help ? cloneHelp(node.help) : null
  };
}

function cloneHelp(help) {
  return {
    description: help.description,
    inputs: help.inputs.map((input) => ({ ...input })),
    outputs: help.outputs.map((output) => ({ ...output })),
    example: help.example ? JSON.parse(JSON.stringify(help.example)) : null,
    sampleCode: help.sampleCode
  };
}

function cloneList(items) {
  return items.map(item => ({ ...item }));
}

export const defaultNodeRegistry = createNodeRegistry();
