// Regression coverage for the parser-to-node port mapping bug observed
// in production. When the AI generates a multi-line Python block that
// builds a list inside a for-loop (a tower's `profiles` list, a
// pavilion's profile rings, etc.), the parser correctly identifies the
// list variable as the block's output AND wires it through to a
// downstream node like Solid.ByLoft. But before the fix the rendered
// Python node fell back to a generic `output0` port — so the wire from
// the parser pointed at a port that didn't exist, and Solid.ByLoft
// showed a warning badge because its `profiles` input was effectively
// unconnected.
//
// This test exercises the parser's output without touching the DOM:
// given a realistic multi-line Python tower fragment, parseToGraph
// should produce a block node whose outputVars include the list
// variable, and a wire whose fromPort matches that variable name.

import { CodeParser } from '../src/runtime/parser.js';
import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
// Side-effect: hydrates NODE_TYPE_MAP with the modern node registry +
// legacy aliases. The parser's wire-resolution step early-returns for
// any node whose type isn't in NODE_TYPE_MAP, which is exactly the
// host environment (browser) where the parser is designed to run.
// Tests need to mirror that.
getLiveCoreRegistry();

describe('parser → node port mapping for multi-line Python blocks', () => {
  it('captures the list variable assigned in a `var = []` + for-loop block as outputVars', () => {
    const code = `import math
floors = 20
profiles = []
for i in range(floors):
    ring = []
    for j in range(48):
        a = 2 * math.pi * j / 48
        ring.append(Geo.Point3(math.cos(a), math.sin(a), i))
    profiles.append(ring)
tower = Geo.loft(profiles)`;

    const graph = CodeParser.parseToGraph(code);
    const pyNode = graph.nodes.find(n => n.type === 'custom-python' || n.type === 'Custom.Python');
    expect(pyNode).toBeDefined();
    // The parser MUST expose `profiles` as the block's outputVars so the
    // canvas-build step can promote it to a real output port.
    expect(pyNode.outputVars).toContain('profiles');
  });

  it('builds the downstream wire targeting the same variable-name port', () => {
    // The fromPort on the wire into the loft node must literally be
    // `profiles` (not `output0`). If this regresses, the connected node
    // ends up with a phantom wire and an unsatisfied input.
    const code = `profiles = []
for i in range(3):
    profiles.append(i)
tower = Geo.loft(profiles)`;

    const graph = CodeParser.parseToGraph(code);
    const pyNode = graph.nodes.find(n => n.type === 'custom-python' || n.type === 'Custom.Python');
    const loftNode = graph.nodes.find(n => {
      const t = n.type || '';
      return t === 'op-loft' || t === 'Solid.ByLoft';
    });
    expect(pyNode).toBeDefined();
    expect(loftNode).toBeDefined();
    const wire = graph.wires.find(w => w.fromNode === pyNode.id && w.toNode === loftNode.id);
    expect(wire).toBeDefined();
    expect(wire.fromPort).toBe('profiles');
    expect(wire.toPort).toBe('profiles');
  });

  it('also carries dynamic inputs (variables the block reads from upstream nodes)', () => {
    // The block reads `floors` and `resolution` from upstream Input.Number
    // nodes; parser stashes them in controls._dynInputs so the rendered
    // node creates matching input ports.
    const code = `floors = 20
resolution = 48
profiles = []
for i in range(floors):
    ring = []
    for j in range(resolution):
        ring.append((i, j))
    profiles.append(ring)`;

    const graph = CodeParser.parseToGraph(code);
    const pyNode = graph.nodes.find(n => n.type === 'custom-python' || n.type === 'Custom.Python');
    expect(pyNode).toBeDefined();
    expect(pyNode.controls && pyNode.controls._dynInputs).toBeDefined();
    expect(pyNode.controls._dynInputs).toEqual(expect.arrayContaining(['floors', 'resolution']));
  });

  it('produces wires from each upstream Input.Number into the matching dynamic input port', () => {
    // The wires that come INTO the Python block should target ports named
    // after the variables the block consumes — not generic `input0`.
    const code = `floors = 20
resolution = 48
profiles = []
for i in range(floors):
    for j in range(resolution):
        profiles.append(i + j)`;

    const graph = CodeParser.parseToGraph(code);
    const pyNode = graph.nodes.find(n => n.type === 'custom-python' || n.type === 'Custom.Python');
    expect(pyNode).toBeDefined();
    const inwardWires = graph.wires.filter(w => w.toNode === pyNode.id);
    const ports = new Set(inwardWires.map(w => w.toPort));
    expect(ports.has('floors')).toBe(true);
    expect(ports.has('resolution')).toBe(true);
  });
});
