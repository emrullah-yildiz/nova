import { describe, it, expect } from 'vitest';
import { describeShowOp, summarizeShowOps } from '../src/ai/turn-steps.js';

const names = { n1: 'Tower', n2: 'Loft' };
const resolve = (id) => names[id] || null;

describe('turn-steps (tool/action chips)', () => {
  it('describes each show-op with an icon and a resolved node name', () => {
    expect(describeShowOp({ op: 'focusNode', id: 'n1' }, resolve)).toEqual({ icon: '⊙', label: 'Focused Tower' });
    expect(describeShowOp({ op: 'openInspector', id: 'n2' }, resolve)).toEqual({ icon: '◳', label: 'Opened Loft' });
    expect(describeShowOp({ op: 'highlightNodes', ids: ['n1'] }, resolve)).toEqual({ icon: '⦿', label: 'Highlighted Tower' });
    expect(describeShowOp({ op: 'highlightNodes', ids: ['n1', 'n2', 'x'] }, resolve)).toEqual({ icon: '⦿', label: 'Highlighted 3 nodes' });
    expect(describeShowOp({ op: 'highlightNodes', ids: ['n1', 'n2', 'x', 'y', 'z'], totalIds: 32 }, resolve)).toEqual({ icon: '⦿', label: 'Highlighted 5 of 32 nodes' });
    expect(describeShowOp({ op: 'revealLibraryNode', type: 'Solid.ByLoft' }, resolve)).toEqual({ icon: '⌕', label: 'Revealed Solid.ByLoft in library' });
  });

  it('falls back to "a node" when the id is unknown and ignores unknown ops', () => {
    expect(describeShowOp({ op: 'focusNode', id: 'zzz' }, resolve)).toEqual({ icon: '⊙', label: 'Focused a node' });
    expect(describeShowOp({ op: 'deleteEverything' }, resolve)).toBeNull();
    expect(describeShowOp(null, resolve)).toBeNull();
  });

  it('summarizes ops, dedupes identical labels, and caps the count', () => {
    const ops = [
      { op: 'focusNode', id: 'n1' },
      { op: 'focusNode', id: 'n1' }, // duplicate label → dropped
      { op: 'openInspector', id: 'n2' },
      { op: 'badop' }                // unknown → dropped
    ];
    expect(summarizeShowOps(ops, resolve)).toEqual([
      { icon: '⊙', label: 'Focused Tower' },
      { icon: '◳', label: 'Opened Loft' }
    ]);

    const many = Array.from({ length: 9 }, (_, i) => ({ op: 'focusNode', id: 'k' + i }));
    expect(summarizeShowOps(many, (id) => id, 5)).toHaveLength(5);
    expect(summarizeShowOps(null, resolve)).toEqual([]);
  });
});
