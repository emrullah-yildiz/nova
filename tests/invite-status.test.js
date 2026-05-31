import { describe, it, expect } from 'vitest';
import { buildInviteStatus } from '../src/app/invite-status.js';

// Pure unit tests for the invite status-message logic — the part that must
// never lie about delivery. (Extracted from the DOM-coupled _sendInvites so it
// is testable in isolation.) Three distinct non-delivered outcomes:
//   created     — link made but email delivery isn't configured
//   undelivered — a real provider tried and the send genuinely failed
//   failed      — the request failed entirely (no link)

describe('buildInviteStatus', () => {
  it('all delivered → ok state, says "emailed", no fallback links', () => {
    const r = buildInviteStatus({ delivered: 2, created: 0, undelivered: 0, failed: 0, links: [] });
    expect(r.state).toBe('ok');
    expect(r.text).toMatch(/emailed/i);
    expect(r.text).not.toMatch(/configured/i);
    expect(r.links).toHaveLength(0);
  });

  it('single delivered → singular wording', () => {
    const r = buildInviteStatus({ delivered: 1 });
    expect(r.text).toBe('Invitation emailed.');
    expect(r.state).toBe('ok');
  });

  it('created (not configured) → warn state, says NOT configured, surfaces links', () => {
    const links = [{ email: 'a@b.com', joinUrl: 'https://x/?join=tok' }];
    const r = buildInviteStatus({ delivered: 0, created: 1, undelivered: 0, failed: 0, links });
    expect(r.state).toBe('warn');
    expect(r.text).toMatch(/isn.t configured/i);
    expect(r.text).not.toMatch(/\bemailed\b/i); // must NOT claim it was emailed
    expect(r.links).toEqual(links);
  });

  it('undelivered (real provider failed) → warn, says couldn’t be delivered, NOT "configured"', () => {
    const links = [{ email: 'a@b.com', joinUrl: 'https://x/?join=tok' }];
    const r = buildInviteStatus({ delivered: 0, created: 0, undelivered: 1, failed: 0, links });
    expect(r.state).toBe('warn');
    expect(r.text).toMatch(/couldn.t be delivered/i);
    expect(r.text).not.toMatch(/configured/i); // a real provider WAS configured
    expect(r.text).not.toMatch(/\bemailed\b/i);
    expect(r.links).toEqual(links);
  });

  it('mix of delivered + created → mentions both, warn state', () => {
    const r = buildInviteStatus({ delivered: 1, created: 1, undelivered: 0, failed: 0, links: [{ email: 'c@d.com', joinUrl: 'u' }] });
    expect(r.text).toMatch(/emailed/i);
    expect(r.text).toMatch(/isn.t configured/i);
    expect(r.state).toBe('warn');
  });

  it('created AND undelivered together → both clauses present, warn', () => {
    const r = buildInviteStatus({ created: 1, undelivered: 1, links: [{ email: 'e@f.com', joinUrl: 'u' }] });
    expect(r.text).toMatch(/isn.t configured/i);
    expect(r.text).toMatch(/couldn.t be delivered/i);
    expect(r.state).toBe('warn');
  });

  it('failures → err state and a "N failed" tail', () => {
    const r = buildInviteStatus({ delivered: 1, created: 0, undelivered: 0, failed: 2, links: [] });
    expect(r.state).toBe('err');
    expect(r.text).toMatch(/2 failed/);
  });

  it('only failures → err state', () => {
    const r = buildInviteStatus({ delivered: 0, created: 0, undelivered: 0, failed: 3, links: [] });
    expect(r.state).toBe('err');
    expect(r.text).toMatch(/3 failed/);
  });

  it('mixed delivered + created + failed → err, all clauses present', () => {
    const r = buildInviteStatus({ delivered: 1, created: 1, undelivered: 0, failed: 1, links: [{ email: 'g@h.com', joinUrl: 'u' }] });
    expect(r.state).toBe('err');
    expect(r.text).toMatch(/emailed/i);
    expect(r.text).toMatch(/isn.t configured/i);
    expect(r.text).toMatch(/1 failed/);
  });

  it('nothing at all → err, never claims success', () => {
    const r = buildInviteStatus({});
    expect(r.state).toBe('err');
    expect(r.text).toBe('Nothing to invite.');
    expect(r.text).not.toMatch(/emailed/i);
  });
});
