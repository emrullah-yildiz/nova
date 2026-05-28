import { describe, it, expect } from 'vitest';
import { createCoreNodeRegistry, getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { createNodeTypeMapFromRegistry } from '../src/nodes/legacyBridge.js';
import { NODE_LIBRARY } from '../src/core/nodes.js';
import { validateHelpExample } from '../src/ui/node-help-docs.js';

const TYPE_PATTERN = /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]+)+$/;
const MIN_DESCRIPTION_LENGTH = 60;
const HOST_REQUIRED_KEY = 'requiresHost';

function isModernNode(node) {
  return node && (!node.metadata || node.metadata.source !== 'legacy-node-library');
}

function hasText(value, min = 1) {
  return typeof value === 'string' && value.trim().length >= min;
}

describe('node author contract', () => {
  const registry = createCoreNodeRegistry();
  const modernNodes = registry.listNodes().filter(isModernNode);

  it('every modern node uses the ParentName.NodeName type pattern', () => {
    const violations = modernNodes
      .filter((node) => !TYPE_PATTERN.test(node.type))
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every modern node has display name equal to type', () => {
    const violations = modernNodes
      .filter((node) => node.displayName !== node.type)
      .map((node) => `${node.type} (displayName="${node.displayName}")`);

    expect(violations).toEqual([]);
  });

  it('every modern node has a description of at least 60 characters', () => {
    const violations = modernNodes
      .filter((node) => !hasText(node.description, MIN_DESCRIPTION_LENGTH))
      .map((node) => `${node.type} (description length=${(node.description || '').length})`);

    expect(violations).toEqual([]);
  });

  it('every modern node port has a non-empty description', () => {
    const violations = [];
    modernNodes.forEach((node) => {
      (node.inputs || []).forEach((port) => {
        if (!hasText(port.description)) {
          violations.push(`${node.type} input "${port.id}"`);
        }
      });
      (node.outputs || []).forEach((port) => {
        if (!hasText(port.description)) {
          violations.push(`${node.type} output "${port.id}"`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it('every modern node icon is a symbol (no alphabetic characters)', () => {
    const violations = modernNodes
      .filter((node) => /[A-Za-z]/.test(node.icon || ''))
      .map((node) => `${node.type} (icon="${node.icon}")`);

    expect(violations).toEqual([]);
  });

  it('every modern node icon is non-empty', () => {
    const violations = modernNodes
      .filter((node) => !node.icon || node.icon.length === 0)
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every modern node provides Python codegen', () => {
    const violations = modernNodes
      .filter((node) => !hasText(node.codegen && node.codegen.python))
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every modern node is executable in JS unless it explicitly requires a host', () => {
    const violations = modernNodes
      .filter((node) => !(node.metadata && node.metadata[HOST_REQUIRED_KEY]))
      .filter((node) => typeof node.execute !== 'function')
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every modern help example references valid node types and ports', () => {
    const nodeTypeMap = createNodeTypeMapFromRegistry(registry);
    const violations = [];

    modernNodes.forEach((node) => {
      if (!node.help || !node.help.example) return;
      const errors = validateHelpExample(node.help, nodeTypeMap);
      if (errors.length > 0) {
        violations.push(`${node.type}: ${errors.join('; ')}`);
      }
    });

    expect(violations).toEqual([]);
  });

  it('every modern help example is a workflow (focal node has inputs wired in and result wired out)', () => {
    const violations = [];

    modernNodes.forEach((node) => {
      const example = node.help && node.help.example;
      if (!example) {
        violations.push(`${node.type}: missing example`);
        return;
      }
      const nodes = Array.isArray(example.nodes) ? example.nodes : [];
      const wires = Array.isArray(example.wires) ? example.wires : [];
      const focalIndexes = nodes
        .map((sampleNode, index) => (sampleNode.type === node.type ? index : -1))
        .filter((index) => index >= 0);

      if (focalIndexes.length === 0) {
        violations.push(`${node.type}: example does not contain the focal node`);
        return;
      }

      const hasInputs = (node.inputs || []).length > 0;
      const hasOutputs = (node.outputs || []).length > 0;
      const focalSet = new Set(focalIndexes);

      if (hasInputs) {
        const producerWires = wires.filter((wire) => focalSet.has(wire[2]) && !focalSet.has(wire[0]));
        if (producerWires.length === 0) {
          violations.push(`${node.type}: example has no producer wired into the focal node`);
        }
      }

      if (hasOutputs) {
        const consumerWires = wires.filter((wire) => focalSet.has(wire[0]) && !focalSet.has(wire[2]));
        if (consumerWires.length === 0) {
          violations.push(`${node.type}: example has no consumer wired from the focal node`);
        }
      }
    });

    expect(violations).toEqual([]);
  });

  it('every modern alias resolves to its canonical type via the registry', () => {
    const violations = [];

    modernNodes.forEach((node) => {
      (node.aliases || []).forEach((alias) => {
        const resolved = registry.resolveType(alias);
        if (resolved !== node.type) {
          violations.push(`${node.type} alias "${alias}" resolved to "${resolved}"`);
        }
      });
    });

    expect(violations).toEqual([]);
  });
});

describe('library panel merge', () => {
  it('NODE_LIBRARY has no duplicate display names within any category after the live merge', () => {
    getLiveCoreRegistry();

    const violations = [];
    NODE_LIBRARY.categories.forEach((category) => {
      const counts = new Map();
      category.nodes.forEach((node) => {
        const name = node.name || node.type;
        counts.set(name, (counts.get(name) || 0) + 1);
      });
      counts.forEach((count, name) => {
        if (count > 1) {
          violations.push(`${category.id}: "${name}" appears ${count} times`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it('NODE_LIBRARY has no duplicate type IDs within any category after the live merge', () => {
    getLiveCoreRegistry();

    const violations = [];
    NODE_LIBRARY.categories.forEach((category) => {
      const seen = new Set();
      category.nodes.forEach((node) => {
        if (seen.has(node.type)) {
          violations.push(`${category.id}: "${node.type}" appears more than once`);
        }
        seen.add(node.type);
      });
    });

    expect(violations).toEqual([]);
  });
});
