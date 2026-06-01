// Phase 10: auto-feedback pipeline.
//
// Covers BOTH sides:
//
// 1. The server-side handler validates payloads, rate-limits, builds the
//    GitHub issue body, POSTs through (with a mocked fetch). Same shape
//    as the proxy-chain tests so the seams stay testable.
// 2. The browser client — consent state machine, session buffer,
//    payload format, and the unload-flush handoff via sendBeacon
//    (mocked).

import { vi, beforeEach, afterEach } from 'vitest';
import handler, { validatePayload, buildIssueBody } from '../api/feedback/refusals.mjs';
import {
  getConsent, setConsent, clearConsent,
  queueRefusal, peekBuffer, clearBuffer,
  buildPayload, flushSession, _resetClientForTests
} from '../src/ai/feedback-client.js';

// ─── Mock req/res helpers shared with the proxy tests ─────────────
function makeReq({ ip = '203.0.113.1', body = {}, method = 'POST' } = {}) {
  return {
    method,
    headers: { 'x-forwarded-for': ip },
    body,
    socket: { remoteAddress: ip }
  };
}
function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    setHeader(k, v) { this.headers[k] = v; },
    write(c) { this.chunks.push(String(c)); },
    end(c) { if (c) this.chunks.push(String(c)); this.ended = true; },
    body() { return this.chunks.join(''); }
  };
}
function upstream(status, body = '') {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
    json: async () => (body ? JSON.parse(body) : {})
  };
}

describe('server: validatePayload', () => {
  it('accepts a well-formed payload with at least one valid refusal', () => {
    const r = validatePayload({
      sessionId: 'ses_abc',
      refusals: [{ prompt: 'tower', reason: 'no node', suggestions: ['try X'] }]
    });
    expect(r.ok).toBe(true);
    expect(r.refusals).toHaveLength(1);
    expect(r.refusals[0].prompt).toBe('tower');
  });

  it('rejects an empty / missing refusals array', () => {
    expect(validatePayload({}).ok).toBe(false);
    expect(validatePayload({ refusals: [] }).ok).toBe(false);
    expect(validatePayload(null).ok).toBe(false);
  });

  it('drops refusals missing either prompt or reason but keeps the valid ones', () => {
    const r = validatePayload({
      refusals: [
        { prompt: 'good', reason: 'no node' },
        { prompt: 'no reason' },
        { reason: 'no prompt' },
        { prompt: 'also good', reason: 'no node' }
      ]
    });
    expect(r.ok).toBe(true);
    expect(r.refusals).toHaveLength(2);
  });

  it('clips oversized fields to keep the GitHub body within limits', () => {
    const big = 'x'.repeat(5000);
    const r = validatePayload({ refusals: [{ prompt: big, reason: big }] });
    expect(r.ok).toBe(true);
    expect(r.refusals[0].prompt.length).toBeLessThan(big.length);
    expect(r.refusals[0].reason.length).toBeLessThan(big.length);
  });

  it('caps suggestions at six items', () => {
    const many = Array.from({ length: 20 }, (_, i) => 'suggestion ' + i);
    const r = validatePayload({ refusals: [{ prompt: 'p', reason: 'r', suggestions: many }] });
    expect(r.refusals[0].suggestions).toHaveLength(6);
  });

  it('rejects a payload with too many refusals at once', () => {
    const refusals = Array.from({ length: 60 }, () => ({ prompt: 'p', reason: 'r' }));
    const r = validatePayload({ refusals });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('too many');
  });
});

describe('server: buildIssueBody structure (stable for grep/analytics)', () => {
  it('renders every section the maintainer needs to triage', () => {
    const payload = {
      sessionId: 'ses_z',
      refusals: [
        { prompt: 'tower of glass', reason: 'no composite', suggestions: ['use X', 'use Y'],
          aiProvider: 'openai', aiModel: 'gpt-4o', timestamp: '2026-05-30T01:00:00Z' },
        { prompt: 'voronoi roof', reason: 'no composite', suggestions: [],
          aiProvider: '', aiModel: '', timestamp: '' }
      ],
      context: { novaVersion: '0.1.0', userAgent: 'test' }
    };
    const body = buildIssueBody(payload);
    expect(body).toContain('## Session refusals (2)');
    expect(body).toContain('### 1.');
    expect(body).toContain('### 2.');
    expect(body).toContain('**Prompt:**');
    expect(body).toContain('**Reason:**');
    expect(body).toContain('**AI suggestions:**');
    expect(body).toContain('## Context');
    expect(body).toContain('0.1.0');
    expect(body).toContain('Auto-submitted by Nova');
  });

  it('truncates the body if it would exceed GitHub limits', () => {
    const big = 'x'.repeat(60_000);
    const payload = {
      sessionId: 's',
      refusals: [{ prompt: 'p', reason: big, suggestions: [], aiProvider: '', aiModel: '', timestamp: '' }],
      context: { novaVersion: '', userAgent: '' }
    };
    const body = buildIssueBody(payload);
    expect(body.length).toBeLessThanOrEqual(50_100);
    expect(body).toContain('truncated');
  });
});

describe('server: handler end-to-end (mocked fetch)', () => {
  let fetchMock;
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = {
      FEEDBACK_GITHUB_TOKEN: process.env.FEEDBACK_GITHUB_TOKEN,
      FEEDBACK_GITHUB_REPO: process.env.FEEDBACK_GITHUB_REPO,
      FEEDBACK_RATE_LIMIT: process.env.FEEDBACK_RATE_LIMIT
    };
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envSnapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
  });

  it('returns 503 when FEEDBACK_GITHUB_TOKEN is missing', async () => {
    delete process.env.FEEDBACK_GITHUB_TOKEN;
    const res = makeRes();
    await handler(makeReq({ body: { refusals: [{ prompt: 'p', reason: 'r' }] } }), res);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body()).error).toContain('not configured');
  });

  it('returns 400 on a malformed payload', async () => {
    process.env.FEEDBACK_GITHUB_TOKEN = 'fake-token';
    const res = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rate-limits per IP — 7th request from same IP gets 429 without calling GitHub', async () => {
    process.env.FEEDBACK_GITHUB_TOKEN = 'fake-token';
    process.env.FEEDBACK_RATE_LIMIT = '6';
    fetchMock.mockResolvedValue(upstream(201, JSON.stringify({ html_url: 'https://github.com/issue/1', number: 1 })));
    const ip = '198.51.100.7'; // unique per test
    for (let i = 0; i < 6; i++) {
      await handler(makeReq({ ip, body: { refusals: [{ prompt: 'p' + i, reason: 'r' }] } }), makeRes());
    }
    const before = fetchMock.mock.calls.length;
    const res = makeRes();
    await handler(makeReq({ ip, body: { refusals: [{ prompt: 'p', reason: 'r' }] } }), res);
    expect(res.statusCode).toBe(429);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('creates a GitHub issue on success and returns the URL + number', async () => {
    process.env.FEEDBACK_GITHUB_TOKEN = 'fake-token';
    fetchMock.mockResolvedValueOnce(upstream(201, JSON.stringify({
      html_url: 'https://github.com/acme/repo/issues/42',
      number: 42
    })));
    const res = makeRes();
    await handler(makeReq({
      ip: '203.0.113.99',
      body: { refusals: [{ prompt: 'a tower', reason: 'no node' }] }
    }), res);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body());
    expect(body.ok).toBe(true);
    expect(body.issueUrl).toContain('/issues/42');
    expect(body.issueNumber).toBe(42);
    // Verify the call shape to GitHub
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('api.github.com/repos/');
    expect(opts.headers.Authorization).toContain('Bearer fake-token');
    expect(opts.headers.Accept).toContain('vnd.github');
    const sent = JSON.parse(opts.body);
    expect(sent.labels).toEqual(expect.arrayContaining(['composite-request', 'ai-feedback', 'auto-submitted']));
    expect(sent.title.startsWith('[Auto-Feedback]')).toBe(true);
  });

  it('returns 502 when GitHub rejects the call', async () => {
    process.env.FEEDBACK_GITHUB_TOKEN = 'fake-token';
    fetchMock.mockResolvedValueOnce(upstream(401, JSON.stringify({ message: 'Bad credentials' })));
    const res = makeRes();
    await handler(makeReq({
      ip: '203.0.113.55',
      body: { refusals: [{ prompt: 'p', reason: 'r' }] }
    }), res);
    expect(res.statusCode).toBe(502);
  });
});

describe('browser client: consent state machine', () => {
  // Tests use a minimal localStorage stub so they're hermetic.
  let storage;
  beforeEach(() => {
    storage = {};
    globalThis.localStorage = {
      getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem(k, v) { storage[k] = String(v); },
      removeItem(k) { delete storage[k]; }
    };
    _resetClientForTests();
  });
  afterEach(() => { delete globalThis.localStorage; });

  it('returns null until a consent decision is made', () => {
    expect(getConsent()).toBe(null);
  });

  it('persists each of the three valid consent values', () => {
    setConsent('auto');   expect(getConsent()).toBe('auto');
    setConsent('manual'); expect(getConsent()).toBe('manual');
    setConsent('never');  expect(getConsent()).toBe('never');
  });

  it('ignores attempts to set an invalid consent value', () => {
    setConsent('something-weird');
    expect(getConsent()).toBe(null);
  });

  it('clearConsent removes the stored value', () => {
    setConsent('auto');
    clearConsent();
    expect(getConsent()).toBe(null);
  });
});

describe('browser client: session buffer', () => {
  let storage;
  beforeEach(() => {
    storage = {};
    globalThis.localStorage = {
      getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem(k, v) { storage[k] = String(v); },
      removeItem(k) { delete storage[k]; }
    };
    _resetClientForTests();
  });
  afterEach(() => { delete globalThis.localStorage; });

  it('does not queue when consent is anything other than auto', () => {
    setConsent('manual');
    expect(queueRefusal({ prompt: 'p', reason: 'r' })).toBe(0);
    setConsent('never');
    expect(queueRefusal({ prompt: 'p', reason: 'r' })).toBe(0);
    expect(peekBuffer()).toHaveLength(0);
  });

  it('queues refusals when consent is auto and returns the running count', () => {
    setConsent('auto');
    expect(queueRefusal({ prompt: 'a', reason: 'r' })).toBe(1);
    expect(queueRefusal({ prompt: 'b', reason: 'r' })).toBe(2);
    expect(peekBuffer()).toHaveLength(2);
  });

  it('normalises the queued shape so downstream payload is consistent', () => {
    setConsent('auto');
    queueRefusal({ prompt: 'p', reason: 'r', suggestions: ['s1', 's2'], aiProvider: 'openai', aiModel: 'gpt-4o' });
    const e = peekBuffer()[0];
    expect(e.prompt).toBe('p');
    expect(e.reason).toBe('r');
    expect(e.suggestions).toEqual(['s1', 's2']);
    expect(e.aiProvider).toBe('openai');
    expect(e.aiModel).toBe('gpt-4o');
    expect(typeof e.timestamp).toBe('string');
  });

  it('buildPayload includes session id, refusals, and context', () => {
    setConsent('auto');
    queueRefusal({ prompt: 'p', reason: 'r' });
    const p = buildPayload({ novaVersion: '9.9.9' });
    expect(p.sessionId.startsWith('ses_')).toBe(true);
    expect(p.refusals).toHaveLength(1);
    expect(p.context.novaVersion).toBe('9.9.9');
  });

  it('clearBuffer empties the queue', () => {
    setConsent('auto');
    queueRefusal({ prompt: 'p', reason: 'r' });
    clearBuffer();
    expect(peekBuffer()).toHaveLength(0);
  });
});

describe('browser client: flushSession via sendBeacon', () => {
  let storage;
  let beaconCalls;
  beforeEach(() => {
    storage = {};
    beaconCalls = [];
    globalThis.localStorage = {
      getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem(k, v) { storage[k] = String(v); },
      removeItem(k) { delete storage[k]; }
    };
    vi.stubGlobal('navigator', {
      sendBeacon: (url, body) => { beaconCalls.push({ url, body }); return true; }
    });
    _resetClientForTests();
  });
  afterEach(() => {
    delete globalThis.localStorage;
    vi.unstubAllGlobals();
  });

  it('returns ok with empty:true when there is nothing to send', async () => {
    setConsent('auto');
    const r = await flushSession({ useBeacon: true });
    expect(r.empty).toBe(true);
  });

  it('uses sendBeacon when useBeacon is true and clears the buffer on success', async () => {
    setConsent('auto');
    queueRefusal({ prompt: 'p1', reason: 'r1' });
    queueRefusal({ prompt: 'p2', reason: 'r2' });
    const r = await flushSession({ useBeacon: true });
    expect(r.ok).toBe(true);
    expect(r.beacon).toBe(true);
    expect(beaconCalls).toHaveLength(1);
    expect(beaconCalls[0].url).toBe('/api/feedback/refusals');
    expect(peekBuffer()).toHaveLength(0);
  });

  it('sends a payload whose JSON contains the queued refusals', async () => {
    setConsent('auto');
    queueRefusal({ prompt: 'pavilion', reason: 'no node' });
    await flushSession({ useBeacon: true });
    // Blob doesn't exist in the test env so beacon receives the raw string.
    const sent = typeof beaconCalls[0].body === 'string'
      ? JSON.parse(beaconCalls[0].body)
      : null;
    if (sent) {
      expect(sent.refusals).toHaveLength(1);
      expect(sent.refusals[0].prompt).toBe('pavilion');
      expect(sent.sessionId.startsWith('ses_')).toBe(true);
    }
  });
});
