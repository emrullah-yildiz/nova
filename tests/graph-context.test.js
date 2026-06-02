import { describe, it, expect } from 'vitest';
import { buildGraphContext } from '../src/ai/graph-context.js';

const TYPE_MAP = {
  'Input.Number': { name: 'Input.Number', inputs: [], outputs: [{ id: 'value', type: 'number' }] },
  'Math.Round': { name: 'Math.Round', inputs: [{ id: 'a', type: 'number' }], outputs: [{ id: 'result', type: 'number' }] },
  'Output.Watch': { name: 'Output.Watch', inputs: [{ id: 'value', type: 'any' }], outputs: [] }
};

describe('buildGraphContext', () => {
  it('returns empty text + zero stats for an empty graph', () => {
    const r = buildGraphContext({ nodes: [], wires: [] }, TYPE_MAP);
    expect(r.text).toBe('');
    expect(r.stats).toEqual({ nodeCount: 0, wireCount: 0, droppedNodes: 0, droppedWires: 0 });
  });

  it('renders nodes with type, ports, position, and wires', () => {
    const graph = {
      nodes: [
        { id: 'node-1', type: 'Input.Number', x: 0, y: 0, controlValues: { val: 5 } },
        { id: 'node-2', type: 'Math.Round', x: 240, y: 10, controlValues: {} },
        { id: 'node-3', type: 'Output.Watch', x: 480, y: 0, controlValues: {} }
      ],
      wires: [
        { fromNode: 'node-1', fromPort: 'value', toNode: 'node-2', toPort: 'a' },
        { fromNode: 'node-2', fromPort: 'result', toNode: 'node-3', toPort: 'value' }
      ]
    };
    const r = buildGraphContext(graph, TYPE_MAP);
    expect(r.text).toContain('LIVE GRAPH — 3 nodes, 2 wires');
    expect(r.text).toContain('node-1  Input.Number @(0,0) out[value:number]  {val:5}');
    expect(r.text).toContain('node-2  Math.Round @(240,10) in[a:number] out[result:number]');
    expect(r.text).toContain('node-1.value → node-2.a');
    expect(r.text).toContain('node-2.result → node-3.value');
    expect(r.stats.nodeCount).toBe(3);
    expect(r.stats.wireCount).toBe(2);
  });

  it('shows a version tag only when the node is pinned above v1', () => {
    const graph = {
      nodes: [
        { id: 'a', type: 'Math.Round', x: 0, y: 0, version: 2, controlValues: {} },
        { id: 'b', type: 'Math.Round', x: 0, y: 0, version: 1, controlValues: {} }
      ],
      wires: []
    };
    const r = buildGraphContext(graph, TYPE_MAP);
    expect(r.text).toContain('a  Math.Round v2');
    expect(r.text).toContain('b  Math.Round @');
    expect(r.text).not.toContain('b  Math.Round v1');
  });

  it('prefers a node\'s dynamic ports over the static def ports', () => {
    const graph = {
      nodes: [{ id: 'py', type: 'Custom.Python', x: 0, y: 0, controlValues: {}, _dynInputs: ['Ele', 'options'], _dynOutputs: ['result'] }],
      wires: []
    };
    const r = buildGraphContext(graph, { 'Custom.Python': { inputs: [{ id: 'elements' }], outputs: [{ id: 'out0' }] } });
    expect(r.text).toContain('in[Ele, options]');
    expect(r.text).toContain('out[result]');
    expect(r.text).not.toContain('elements');
  });

  it('truncates long control values', () => {
    const graph = { nodes: [{ id: 'n', type: 'Custom.Python', x: 0, y: 0, controlValues: { code: 'x'.repeat(200) } }], wires: [] };
    const r = buildGraphContext(graph, {}, { maxControlLen: 10 });
    expect(r.text).toContain('code:xxxxxxxxxx…');
    expect(r.text).not.toContain('x'.repeat(50));
  });

  it('caps node/wire counts and reports what was dropped (no silent truncation)', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({ id: 'n' + i, type: 'Output.Watch', x: 0, y: 0, controlValues: {} }));
    const r = buildGraphContext({ nodes, wires: [] }, TYPE_MAP, { maxNodes: 2 });
    expect(r.text).toContain('…(+3 more nodes not shown)');
    expect(r.stats.droppedNodes).toBe(3);
    expect(r.stats.nodeCount).toBe(5);
  });
});
