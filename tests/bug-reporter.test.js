import { describe, it, expect } from 'vitest';
import { errorFingerprint, isReportableError, buildBugTicket } from '../src/ai/bug-reporter.js';

describe('errorFingerprint', () => {
  it('is stable across origin and line/col (so the same bug dedups across reloads)', () => {
    const a = errorFingerprint('x is not a function', 'Error\n  at foo (https://a.com/assets/index.js:10:5)');
    const b = errorFingerprint('x is not a function', 'Error\n  at foo (https://b.net/assets/index.js:99:1)');
    expect(a).toBe(b);
  });
  it('differs for different messages', () => {
    expect(errorFingerprint('boom', '')).not.toBe(errorFingerprint('bang', ''));
  });
});

describe('isReportableError', () => {
  it('reports real errors', () => {
    expect(isReportableError('Cannot read properties of undefined', 'Error\n at x')).toBe(true);
  });
  it('skips empty messages and bare cross-origin "Script error."', () => {
    expect(isReportableError('', null)).toBe(false);
    expect(isReportableError('Script error.', null)).toBe(false);
    // ...but a Script error WITH a stack is still reportable
    expect(isReportableError('Script error.', 'Error\n at y')).toBe(true);
  });
});

describe('buildBugTicket', () => {
  it('produces a bug-category ticket with message, location, and stack', () => {
    const t = buildBugTicket(
      { message: 'TypeError: nope', stack: 'Error\n at a (f.js:1:1)\n at b', filename: 'f.js', lineno: 1, colno: 1 },
      { url: 'https://nova-dev/x', route: 'workspace', nodeCount: 3, novaVersion: '1.0', userAgent: 'UA' }
    );
    expect(t.category).toBe('bug');
    expect(t.title).toBe('TypeError: nope');
    expect(t.body).toContain('**Message:** TypeError: nope');
    expect(t.body).toContain('**Location:** `f.js:1:1`');
    expect(t.body).toContain('**Graph:** 3 nodes');
    expect(t.body).toContain('```');
    expect(t.body).toContain('Filed automatically by Nova');
  });
  it('clips the title and falls back when message is missing', () => {
    expect(buildBugTicket({ message: 'x'.repeat(200) }).title.length).toBe(120);
    expect(buildBugTicket({}).title).toBe('Unknown error');
  });
});
