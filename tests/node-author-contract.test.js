import { describe, it, expect } from 'vitest';
import { createCoreNodeRegistry } from '../src/nodes/coreNodes.js';
import { createNodeTypeMapFromRegistry } from '../src/nodes/legacyBridge.js';
import { validateHelpExample } from '../src/ui/node-help-docs.js';

const TYPE_PATTERN = /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]+)+$/;
const MIN_DESCRIPTION_LENGTH = 60;
const HOST_REQUIRED_KEY = 'requiresHost';

function isV1(node) {
  return node && node.metadata && node.metadata.standardVersion === 'v1';
}

function hasText(value, min = 1) {
  return typeof value === 'string' && value.trim().length >= min;
}

describe('node author contract (v1)', () => {
  const registry = createCoreNodeRegistry();
  const v1Nodes = registry.listNodes().filter(isV1);

  it('every v1 node uses the ParentName.NodeName type pattern', () => {
    const violations = v1Nodes
      .filter((node) => !TYPE_PATTERN.test(node.type))
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every v1 node has display name equal to type', () => {
    const violations = v1Nodes
      .filter((node) => node.displayName !== node.type)
      .map((node) => `${node.type} (displayName="${node.displayName}")`);

    expect(violations).toEqual([]);
  });

  it('every v1 node has a description of at least 60 characters', () => {
    const violations = v1Nodes
      .filter((node) => !hasText(node.description, MIN_DESCRIPTION_LENGTH))
      .map((node) => `${node.type} (description length=${(node.description || '').length})`);

    expect(violations).toEqual([]);
  });

  it('every v1 node port has a non-empty description', () => {
    const violations = [];
    v1Nodes.forEach((node) => {
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

  it('every v1 node icon is a symbol (no alphabetic characters)', () => {
    const violations = v1Nodes
      .filter((node) => /[A-Za-z]/.test(node.icon || ''))
      .map((node) => `${node.type} (icon="${node.icon}")`);

    expect(violations).toEqual([]);
  });

  it('every v1 node icon is non-empty', () => {
    const violations = v1Nodes
      .filter((node) => !node.icon || node.icon.length === 0)
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every v1 node provides Python codegen', () => {
    const violations = v1Nodes
      .filter((node) => !hasText(node.codegen && node.codegen.python))
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every v1 node is executable in JS unless it explicitly requires a host', () => {
    const violations = v1Nodes
      .filter((node) => !node.metadata[HOST_REQUIRED_KEY])
      .filter((node) => typeof node.execute !== 'function')
      .map((node) => node.type);

    expect(violations).toEqual([]);
  });

  it('every v1 help example references valid node types and ports', () => {
    const nodeTypeMap = createNodeTypeMapFromRegistry(registry);
    const violations = [];

    v1Nodes.forEach((node) => {
      if (!node.help || !node.help.example) return;
      const errors = validateHelpExample(node.help, nodeTypeMap);
      if (errors.length > 0) {
        violations.push(`${node.type}: ${errors.join('; ')}`);
      }
    });

    expect(violations).toEqual([]);
  });

  it('every v1 help example is a workflow (focal node has inputs wired in and result wired out)', () => {
    const violations = [];

    v1Nodes.forEach((node) => {
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

  it('every v1 alias resolves to its canonical type via the registry', () => {
    const violations = [];

    v1Nodes.forEach((node) => {
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
