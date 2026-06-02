import { describe, it, expect } from 'vitest';
import { analyzeGraphProblems, formatGraphProblems } from '../src/ai/graph-problems.js';

const TYPE_MAP = {
  'Input.Number': { inputs: [], outputs: [{ id: 'value', type: 'number' }], controls: [{ id: 'val' }] },
  'Math.Round': { inputs: [{ id: 'a', type: 'number' }], outputs: [{ id: 'result', type: 'number' }], controls: [{ id: 'a' }, { id: 'digits' }] },
  'Solid.Loft': { inputs: [{ id: 'profiles', type: 'curve' }], outputs: [{ id: 'solid', type: 'mesh' }], controls: [] },
  'Output.Watch': { inputs: [{ id: 'value', type: 'any' }], outputs: [], controls: [] }
};

const kinds = (problems) => problems.map((p) => p.kind);

describe('analyzeGraphProblems', () => {
  it('reports no problems for a clean, complete graph', () => {
    const graph = {
      nodes: [
        { id: 'n1', type: 'Input.Number' },
        { id: 'n2', type: 'Math.Round' },
        { id: 'n3', type: 'Output.Watch' }
      ],
      wires: [
        { fromNode: 'n1', fromPort: 'value', toNode: 'n2', toPort: 'a' },
        { fromNode: 'n2', fromPort: 'result', toNode: 'n3', toPort: 'value' }
      ]
    };
    expect(analyzeGraphProblems(graph, TYPE_MAP)).toEqual([]);
  });

  it('flags a type-mismatched wire', () => {
    // Solid.Loft outputs mesh into Math.Round input a:number → incompatible.
    const graph = {
      nodes: [{ id: 's', type: 'Solid.Loft' }, { id: 'r', type: 'Math.Round' }, { id: 'o', type: 'Output.Watch' }],
      wires: [{ fromNode: 's', fromPort: 'solid', toNode: 'r', toPort: 'a' }]
    };
    const problems = analyzeGraphProblems(graph, TYPE_MAP);
    expect(kinds(problems)).toContain('type-mismatch');
    // Solid.Loft.profiles is curve-typed with no control → also an unconnected input.
    expect(kinds(problems)).toContain('unconnected-input');
  });

  it('flags an orphan wire only when a NODE is missing — never on a port-name mismatch', () => {
    const graph = {
      nodes: [{ id: 'r', type: 'Math.Round' }, { id: 'o', type: 'Output.Watch' }],
      wires: [
        { fromNode: 'ghost', fromPort: 'x', toNode: 'r', toPort: 'a' }, // missing node → orphan
        { fromNode: 'r', fromPort: 'nope', toNode: 'o', toPort: 'value' } // bad port name → NOT flagged (unreliable)
      ]
    };
    expect(kinds(analyzeGraphProblems(graph, TYPE_MAP)).filter((k) => k === 'orphan-wire').length).toBe(1);
  });

  it('does NOT invent problems for a Custom.Python node with dynamic ports (regression)', () => {
    // Real-world: Custom.Python exposes panels/extrude_dir/thick_list, none of
    // which are in its static def (elements/options/result). Resolving against the
    // def previously produced phantom orphan-wires + unconnected-inputs.
    const graph = {
      nodes: [
        { id: 'p', type: 'custom-python' },
        { id: 'c', type: 'Solid.CombineAll' },
        { id: 'o', type: 'Output.Watch' }
      ],
      wires: [
        { fromNode: 'p', fromPort: 'thick_list', toNode: 'c', toPort: 'meshes' },
        { fromNode: 'c', fromPort: 'result', toNode: 'o', toPort: 'value' }
      ]
    };
    const tm = { ...TYPE_MAP, 'custom-python': { inputs: [{ id: 'elements' }, { id: 'options' }], outputs: [{ id: 'result' }] }, 'Solid.CombineAll': { inputs: [{ id: 'meshes', type: 'list' }], outputs: [{ id: 'result', type: 'mesh' }] } };
    const problems = analyzeGraphProblems(graph, tm);
    expect(kinds(problems)).not.toContain('orphan-wire');
    expect(kinds(problems)).not.toContain('unconnected-input');
  });

  it('does not flag an unconnected input that has a control fallback', () => {
    // Math.Round.a has a matching control → not "missing"; digits too.
    const graph = { nodes: [{ id: 'r', type: 'Math.Round' }, { id: 'o', type: 'Output.Watch' }], wires: [{ fromNode: 'r', fromPort: 'result', toNode: 'o', toPort: 'value' }] };
    expect(kinds(analyzeGraphProblems(graph, TYPE_MAP))).not.toContain('unconnected-input');
  });

  it('surfaces runtime node errors', () => {
    const graph = { nodes: [{ id: 'r', type: 'Math.Round' }, { id: 'o', type: 'Output.Watch' }], wires: [{ fromNode: 'r', fromPort: 'result', toNode: 'o', toPort: 'value' }] };
    const problems = analyzeGraphProblems(graph, TYPE_MAP, { nodeErrors: { r: { message: 'boom' } } });
    expect(problems.find((p) => p.kind === 'node-error').message).toContain('boom');
  });

  it('flags a graph with no Output.* sink', () => {
    const graph = { nodes: [{ id: 'n1', type: 'Input.Number' }], wires: [] };
    expect(kinds(analyzeGraphProblems(graph, TYPE_MAP))).toContain('no-output-sink');
  });

  it('returns nothing for an empty graph', () => {
    expect(analyzeGraphProblems({ nodes: [], wires: [] }, TYPE_MAP)).toEqual([]);
  });
});

describe('formatGraphProblems', () => {
  it('is empty when there are no problems', () => {
    expect(formatGraphProblems([])).toBe('');
  });
  it('renders a bounded, labelled list', () => {
    const text = formatGraphProblems([{ kind: 'no-output-sink', message: 'No Output.* node.' }]);
    expect(text).toContain('PROBLEMS (1)');
    expect(text).toContain('- [no-output-sink] No Output.* node.');
  });
  it('caps the list and reports the overflow', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ kind: 'x', message: 'm' + i }));
    const text = formatGraphProblems(many, { max: 2 });
    expect(text).toContain('…(+3 more)');
  });
});
