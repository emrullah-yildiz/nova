import { describe, it, expect } from 'vitest';
import { isTextAttachment, attachmentNames, foldAttachments } from '../src/ai/attachment-fold.js';

describe('chat file attachments', () => {
  it('accepts text/data files by extension or MIME, rejects binaries/images', () => {
    expect(isTextAttachment('data.csv', '')).toBe(true);
    expect(isTextAttachment('graph.nodeflow', '')).toBe(true);
    expect(isTextAttachment('notes', 'text/plain')).toBe(true);
    expect(isTextAttachment('config', 'application/json')).toBe(true);
    expect(isTextAttachment('photo.png', 'image/png')).toBe(false);
    expect(isTextAttachment('model.stl', 'application/octet-stream')).toBe(false);
  });

  it('attachmentNames joins file names and is empty for none', () => {
    expect(attachmentNames([])).toBe('');
    expect(attachmentNames(null)).toBe('');
    expect(attachmentNames([{ name: 'a.csv' }, { name: 'b.json' }])).toBe('a.csv, b.json');
  });

  it('folds file contents into the sent message as fenced, named blocks', () => {
    const out = foldAttachments([{ name: 'pts.csv', text: 'x,y\n1,2' }], 'Plot these points');
    expect(out).toContain('The user attached 1 file:');
    expect(out).toContain('### Attached file: pts.csv');
    expect(out).toContain('```\nx,y\n1,2\n```');
    expect(out.endsWith('Plot these points')).toBe(true);
  });

  it('supports multiple files and a missing user message', () => {
    const out = foldAttachments([{ name: 'a.txt', text: 'A' }, { name: 'b.txt', text: 'B' }], '');
    expect(out).toContain('The user attached 2 files:');
    expect(out).toContain('### Attached file: a.txt');
    expect(out).toContain('### Attached file: b.txt');
    // No trailing user text appended when the message is empty.
    expect(out.trimEnd().endsWith('```')).toBe(true);
  });

  it('returns the plain message unchanged when there are no attachments', () => {
    expect(foldAttachments([], 'hello')).toBe('hello');
    expect(foldAttachments(null, 'hello')).toBe('hello');
  });
});
