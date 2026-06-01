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

  it('does not expose local loop temporaries as Custom.Python outputs or self inputs', () => {
    const code = `num_petals = 8
petal_height = 8
base_radius = 2.5
twist_degrees = 40
hole_radius = 0.35
holes = []
for p in range(num_petals):
    petal_angle = 2 * math.pi * p / num_petals
    for i in range(6):
        t = (i + 1) / 7
        twist_angle = math.radians(twist_degrees * t)
        total_angle = petal_angle + twist_angle
        lean = base_radius + 3.5 * math.sin(t * math.pi * 0.9)
        hole = Geo.createSphere(Geo.Point3(lean, 0, t * petal_height), hole_radius)
        holes.append(hole)
cutters = Geo.combineAll(holes)`;

    const graph = CodeParser.parseToGraph(code);
    const pyNode = graph.nodes.find(n => n.type === 'custom-python' || n.type === 'Custom.Python');
    expect(pyNode).toBeDefined();
    expect(pyNode.outputVars).toEqual(['holes']);
    expect(pyNode.controls._dynInputs).toEqual(expect.arrayContaining([
      'num_petals', 'petal_height', 'base_radius', 'twist_degrees', 'hole_radius'
    ]));
    expect(pyNode.controls._dynInputs).not.toEqual(expect.arrayContaining([
      'petal_angle', 'twist_angle', 'total_angle', 'lean'
    ]));
    expect(graph.wires.some(w => w.fromNode === w.toNode)).toBe(false);
  });

  it('keeps a multi-line list literal as ONE node instead of fragmenting per line', () => {
    const code = `shift_x_odd = 6.0
shift_x_even = -6.0
seg_data = [
    (shift_x_odd,  0.0, 0),
    (shift_x_even, 0.0, 1),
    (shift_x_odd,  0.0, 2),
]
result = Geo.combineAll(seg_data)`;

    const graph = CodeParser.parseToGraph(code);
    const segNodes = graph.nodes.filter(n =>
      (n.type === 'custom-python' || n.type === 'Custom.Python') &&
      (n.outputVars || []).includes('seg_data'));
    // Exactly one node owns seg_data, and it holds the WHOLE literal.
    expect(segNodes).toHaveLength(1);
    const seg = segNodes[0];
    expect(seg.controls.code).toContain('seg_data = [');
    expect(seg.controls.code).toContain('0.0, 2');
    expect(seg.controls.code.trim().endsWith(']')).toBe(true);
    // Its reads are wired by variable name; loop temporaries are not invented.
    expect(seg.controls._dynInputs).toEqual(expect.arrayContaining(['shift_x_odd', 'shift_x_even']));
    // No stray fragment nodes from the tuple lines or the closing bracket.
    const fragments = graph.nodes.filter(n =>
      (n.type === 'custom-python' || n.type === 'Custom.Python') &&
      /^[\])]/.test((n.controls.code || '').trim()));
    expect(fragments).toHaveLength(0);
    expect(graph.wires.some(w => w.fromNode === w.toNode)).toBe(false);
  });

  it('wires a reassigned variable input from the previous producer, not the new node itself', () => {
    const code = `origin = Geo.Point3(0, 0, 0)
result = Geo.createSphere(origin, 1)
result = Geo.smooth(result, 3, 0.5)
print(result)`;

    const graph = CodeParser.parseToGraph(code);
    const smooth = graph.nodes.find(n => n.type === 'op-smooth' || n.type === 'Solid.Smooth');
    expect(smooth).toBeDefined();
    const smoothInput = graph.wires.find(w => w.toNode === smooth.id && w.toPort === 'mesh');
    expect(smoothInput).toBeDefined();
    expect(smoothInput.fromNode).not.toBe(smooth.id);
    expect(graph.wires.some(w => w.fromNode === w.toNode)).toBe(false);
  });
});
