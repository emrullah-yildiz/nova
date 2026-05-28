import { NODE_TYPE_MAP } from '../src/core/nodes.js';
import { installNodeHelp } from '../src/ui/node-help.js';
import {
  buildNodeHelpDoc,
  isNodeOutputExempt,
  validateHelpExample,
  validateNodeHelpDoc
} from '../src/ui/node-help-docs.js';

function createHelpRuntime() {
  const runtime = {};
  const app = {
    nodes: [],
    addNodeToCanvas() { return null; },
    addWire() {},
    updatePortDots() {}
  };
  installNodeHelp(app, runtime);
  return runtime;
}

describe('node library contracts', () => {
  const helpRuntime = createHelpRuntime();
  const nodes = Object.values(NODE_TYPE_MAP);

  it('keeps every value-producing node wired to at least one output port', () => {
    const missingOutputs = nodes
      .filter(node => !isNodeOutputExempt(node))
      .filter(node => !Array.isArray(node.outputs) || node.outputs.length === 0)
      .map(node => node.type);

    expect(missingOutputs).toEqual([]);
  });

  it('resolves a help panel document with description and sample content for every node', () => {
    const failures = [];

    nodes.forEach(node => {
      const explicitHelp = helpRuntime.NODE_HELP && helpRuntime.NODE_HELP[node.type];
      const helpDoc = buildNodeHelpDoc(node, explicitHelp);
      const errors = validateNodeHelpDoc(node, helpDoc);
      if (errors.length > 0) failures.push(node.type + ': ' + errors.join(', '));
    });

    expect(failures).toEqual([]);
  });

  it('keeps help panel sample graphs structurally valid', () => {
    const failures = [];

    nodes.forEach(node => {
      const explicitHelp = helpRuntime.NODE_HELP && helpRuntime.NODE_HELP[node.type];
      const helpDoc = buildNodeHelpDoc(node, explicitHelp);
      const errors = validateHelpExample(helpDoc, NODE_TYPE_MAP);
      if (errors.length > 0) failures.push(node.type + ': ' + errors.join('; '));
    });

    expect(failures).toEqual([]);
  });
});
