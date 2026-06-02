import { describe, it, expect } from 'vitest';
import { parseNovaActions, SHOW_OPS } from '../src/ai/graph-actions.js';

describe('parseNovaActions', () => {
  it('extracts show ops and strips the block from the text', () => {
    const text = 'Your Math.Round node is here.\n\n```nova-action\n{"ops":[{"op":"focusNode","id":"node-2"}]}\n```\n';
    const r = parseNovaActions(text);
    expect(r.ops).toEqual([{ op: 'focusNode', id: 'node-2' }]);
    expect(r.cleanedText).toBe('Your Math.Round node is here.');
    expect(r.cleanedText).not.toContain('nova-action');
  });

  it('accepts a bare ops array as well as an {ops:[...]} object', () => {
    const r = parseNovaActions('```nova-action\n[{"op":"openInspector","id":"n1"}]\n```');
    expect(r.ops).toEqual([{ op: 'openInspector', id: 'n1' }]);
  });

  it('drops unknown / non-show ops (e.g. edit ops are not in P3)', () => {
    const r = parseNovaActions('```nova-action\n{"ops":[{"op":"addWire","from":"a.x","to":"b.y"},{"op":"focusNode","id":"n1"}]}\n```');
    expect(r.ops).toEqual([{ op: 'focusNode', id: 'n1' }]);
    expect(SHOW_OPS.has('addWire')).toBe(false);
  });

  it('caps highlight ops so the assistant cannot flood the UI', () => {
    const ids = Array.from({ length: 32 }, (_, i) => 'node-' + (i + 1));
    const r = parseNovaActions('```nova-action\n' + JSON.stringify({ ops: [{ op: 'highlightNodes', ids }] }) + '\n```');
    expect(r.ops).toEqual([{ op: 'highlightNodes', ids: ids.slice(0, 5), totalIds: 32 }]);
  });

  it('returns no ops and the original text when there is no block', () => {
    const r = parseNovaActions('Just a normal explanation.');
    expect(r.ops).toEqual([]);
    expect(r.cleanedText).toBe('Just a normal explanation.');
  });

  it('is resilient to malformed JSON — no ops, text unchanged', () => {
    const text = 'hi\n```nova-action\n{ not valid json }\n```';
    const r = parseNovaActions(text);
    expect(r.ops).toEqual([]);
    expect(r.cleanedText).toBe(text);
  });

  it('handles empty/non-string input', () => {
    expect(parseNovaActions('').ops).toEqual([]);
    expect(parseNovaActions(null).cleanedText).toBe('');
  });
});
