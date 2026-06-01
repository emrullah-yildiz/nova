// Phase 14: Custom.Python overhaul + parser auto-registration.
//
// Covers the three problems identified by the user:
//
//   1. Parser had a hardcoded Geo.* → node table. Now auto-builds the
//      mapping from every node's codegen.python so new composites
//      (Phase 8, Phase 12, future) are recognised without editing
//      parser.js.
//   2. Custom.Python's output port was always 'output0'. Now the last
//      top-level assignment determines the output port name, so
//      `result = Geo.X(...)` exposes a port called `result`.
//   3. Custom.Python ports were always 'any'. Now `# in:` / `# out:`
//      header comments declare typed ports so Phase 5 wire-type-check
//      catches mismatches.

import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { CodeParser, _resetAutoGeoMapForTests } from '../src/runtime/parser.js';
import {
  parsePythonPortDecls,
  lastTopLevelAssignment,
  resolvePythonPorts,
  nextPythonPorts
} from '../src/runtime/python-port-decl.js';

getLiveCoreRegistry();
_resetAutoGeoMapForTests();

describe('parsePythonPortDecls', () => {
  it('parses `# in:` and `# out:` headers into typed port lists', () => {
    const code = `# in:  points:list[point], radius:number
# out: mesh:mesh

mesh = Geo.loft(points)`;
    const r = parsePythonPortDecls(code);
    expect(r.hasDecls).toBe(true);
    expect(r.inputs).toEqual([
      { id: 'points', type: 'list[point]' },
      { id: 'radius', type: 'number' }
    ]);
    expect(r.outputs).toEqual([{ id: 'mesh', type: 'mesh' }]);
  });

  it('accepts singular and plural alias spellings (in/inputs, out/outputs)', () => {
    const r = parsePythonPortDecls(`# input: a:number\n# outputs: b:mesh\nb = a`);
    expect(r.inputs).toEqual([{ id: 'a', type: 'number' }]);
    expect(r.outputs).toEqual([{ id: 'b', type: 'mesh' }]);
  });

  it('defaults type to "any" when only a name is given', () => {
    const r = parsePythonPortDecls(`# in: x\n# out: y`);
    expect(r.inputs[0].type).toBe('any');
    expect(r.outputs[0].type).toBe('any');
  });

  it('stops scanning once non-comment code is reached', () => {
    // The header MUST come at the top — a comment further down is just
    // a comment, not a port declaration.
    const code = `mesh = Geo.loft(points)
# in: too_late:number`;
    const r = parsePythonPortDecls(code);
    expect(r.hasDecls).toBe(false);
  });

  it('returns empty declarations for empty / non-string input', () => {
    expect(parsePythonPortDecls('').hasDecls).toBe(false);
    expect(parsePythonPortDecls(null).hasDecls).toBe(false);
  });
});

describe('lastTopLevelAssignment', () => {
  it('returns the variable name of the last top-level assignment', () => {
    const code = `a = 1
b = 2
result = a + b`;
    expect(lastTopLevelAssignment(code)).toBe('result');
  });

  it('ignores indented assignments inside blocks', () => {
    // The for-loop's `inner = i * 2` is indented, so it doesn't count
    // as the output. `total` is the last top-level assignment.
    const code = `total = 0
for i in range(10):
    inner = i * 2
    total += inner`;
    expect(lastTopLevelAssignment(code)).toBe('total');
  });

  it('handles a single-line assignment', () => {
    expect(lastTopLevelAssignment('mesh = Geo.loft(points)')).toBe('mesh');
  });

  it('returns null when there is no assignment', () => {
    expect(lastTopLevelAssignment('print(hello)')).toBe(null);
    expect(lastTopLevelAssignment('')).toBe(null);
  });

  it('does not treat == comparisons as assignments', () => {
    expect(lastTopLevelAssignment(`x = 5\nif x == 5:\n    pass`)).toBe('x');
  });
});

describe('resolvePythonPorts integration', () => {
  it('declared ports beat inferred ones when both are present', () => {
    const code = `# in: pts:list[point]
# out: shell:mesh

shell = Geo.loft(pts)`;
    const r = resolvePythonPorts(code);
    expect(r.source).toBe('declared');
    expect(r.outputs[0].id).toBe('shell');
    expect(r.outputs[0].type).toBe('mesh');
    expect(r.inputs[0].id).toBe('pts');
    expect(r.inputs[0].type).toBe('list[point]');
  });

  it('infers the output port name from the last assignment when no header is given', () => {
    const r = resolvePythonPorts('result = Geo.createBox(p, 1, 1, 1)');
    expect(r.source).toBe('inferred');
    expect(r.outputs[0].id).toBe('result');
    expect(r.outputs[0].type).toBe('any');
  });

  it('falls back to input0/output0 when neither strategy applies', () => {
    const r = resolvePythonPorts('print("hello")');
    expect(r.source).toBe('default');
    expect(r.inputs[0].id).toBe('input0');
    expect(r.outputs[0].id).toBe('output0');
  });
});

describe('nextPythonPorts — live port sync on code edit', () => {
  it('declared headers become the authoritative ports', () => {
    const code = '# in: floors:number, height:number\n# out: profiles:curve\nprofiles = []';
    const r = nextPythonPorts(code, { inputs: ['input0'], outputs: ['output0'] });
    expect(r.source).toBe('declared');
    expect(r.inputs).toEqual(['floors', 'height']);
    expect(r.outputs).toEqual(['profiles']);
    expect(r.inputTypes).toEqual({ floors: 'number', height: 'number' });
    expect(r.inputsChanged).toBe(true);
    expect(r.outputsChanged).toBe(true);
    expect(r.removedInputs).toEqual(['input0']);
    expect(r.removedOutputs).toEqual(['output0']);
  });

  it('without headers, preserves existing (manual/wired) inputs and only tracks the output name', () => {
    const r = nextPythonPorts('result = Geo.createBox(p, 1, 1, 1)', { inputs: ['p', 'size'], outputs: ['output0'] });
    expect(r.source).toBe('inferred');
    expect(r.inputs).toEqual(['p', 'size']); // manual inputs preserved
    expect(r.inputsChanged).toBe(false);
    expect(r.outputs).toEqual(['result']);
    expect(r.outputsChanged).toBe(true);
    expect(r.removedOutputs).toEqual(['output0']);
  });

  it('reports no change when the resolved ports match the current ports', () => {
    const code = '# in: a:number\n# out: b:number\nb = a';
    const r = nextPythonPorts(code, { inputs: ['a'], outputs: ['b'] });
    expect(r.inputsChanged).toBe(false);
    expect(r.outputsChanged).toBe(false);
    expect(r.removedInputs).toEqual([]);
    expect(r.removedOutputs).toEqual([]);
  });

  it('renaming the result variable moves the output port and flags the old one removed', () => {
    const r = nextPythonPorts('tower = Geo.loft(profiles)', { inputs: ['input0'], outputs: ['shell'] });
    expect(r.outputs).toEqual(['tower']);
    expect(r.removedOutputs).toEqual(['shell']);
  });
});

describe('parser auto-registration: new composites map to their real nodes (not Custom.Python)', () => {
  it('Geo.twistedEllipsePlates parses to Pattern.TwistedEllipsePlates with the expected input ports', () => {
    // This is the EXACT production failure shown in the user screenshot.
    // Before the fix: this expression became a Custom.Python node with
    // generic input0/output0 ports, and downstream wires expecting
    // `profiles` pointed at non-existent ports → red warnings.
    _resetAutoGeoMapForTests();
    const code = `profiles = Geo.twistedEllipsePlates(floors, height, baseWidth, baseDepth, twistDeg, taper, resolution)`;
    const g = CodeParser.parseToGraph(code);
    const tep = g.nodes.find(n => n.type === 'Pattern.TwistedEllipsePlates');
    expect(tep).toBeDefined();
    expect(Object.keys(tep.inputRefs)).toEqual(expect.arrayContaining([
      'floors', 'height', 'baseWidth', 'baseDepth', 'twistDeg', 'taper', 'resolution'
    ]));
  });

  it('Geo.hexPanelGrid parses to Pattern.HexPanelGrid with the expected input ports', () => {
    _resetAutoGeoMapForTests();
    const code = `panels = Geo.hexPanelGrid(profiles, True, 1)`;
    const g = CodeParser.parseToGraph(code);
    const hpg = g.nodes.find(n => n.type === 'Pattern.HexPanelGrid');
    expect(hpg).toBeDefined();
    expect(Object.keys(hpg.inputRefs)).toEqual(expect.arrayContaining(['profiles', 'stagger', 'skipRings']));
  });

  it('the rotating-tower full chain produces real Pattern + Solid + Output nodes (no Custom.Python)', () => {
    // End-to-end: simulates the canonical Python that plan-builder would
    // emit from a nova-plan with TwistedEllipsePlates → HexPanelGrid +
    // ByLoft → Watch. Every line must land on its proper node type.
    _resetAutoGeoMapForTests();
    const code = `floors = 20
height = 100
base_w = 18
base_d = 12
twist = 60
profiles = Geo.twistedEllipsePlates(floors, height, base_w, base_d, twist, 0.2, 48)
tower = Geo.loft(profiles)
panels = Geo.hexPanelGrid(profiles, True, 1)
print(tower)`;
    const g = CodeParser.parseToGraph(code);
    const types = g.nodes.map(n => n.type);
    expect(types).toContain('Pattern.TwistedEllipsePlates');
    expect(types).toContain('Pattern.HexPanelGrid');
    expect(types).toContain('Solid.ByLoft');
    // No Custom.Python fallback should fire for these well-known calls.
    expect(types).not.toContain('custom-python');
    expect(types).not.toContain('Custom.Python');
  });

  it('wires from the new composites connect to the right downstream input port', () => {
    _resetAutoGeoMapForTests();
    const code = `profiles = Geo.twistedEllipsePlates(20, 100, 18, 12, 60, 0.2, 48)
tower = Geo.loft(profiles)`;
    const g = CodeParser.parseToGraph(code);
    const tep = g.nodes.find(n => n.type === 'Pattern.TwistedEllipsePlates');
    const loft = g.nodes.find(n => n.type === 'Solid.ByLoft');
    const wire = g.wires.find(w => w.fromNode === tep.id && w.toNode === loft.id);
    expect(wire).toBeDefined();
    expect(wire.fromPort).toBe('profiles');
    expect(wire.toPort).toBe('profiles');
  });

  it('falls back to Custom.Python only when no Geo.* call matches the registry', () => {
    _resetAutoGeoMapForTests();
    // A genuine for-loop with no single-call equivalent must still
    // become a Python block. The fix doesn't remove that fallback —
    // it only stops false-positive fallbacks.
    const code = `profiles = []
for i in range(10):
    profiles.append(i)`;
    const g = CodeParser.parseToGraph(code);
    expect(g.nodes.some(n => n.type === 'custom-python' || n.type === 'Custom.Python')).toBe(true);
  });
});
