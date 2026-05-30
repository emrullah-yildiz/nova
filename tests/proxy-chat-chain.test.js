import { vi, beforeEach, afterEach } from 'vitest';
import handler, { PROVIDERS } from '../api/proxy/chat.mjs';

// End-to-end chain tests for the free-tier proxy. These mock global fetch
// and invoke the actual handler so the test exercises the same code path
// production hits — provider selection, model picking per provider, the
// fallthrough decision matrix, and the final response shape. This is the
// layer where the .map(resolveProvider) bug, the cross-provider model
// forwarding bug, and the whitespace-key bug all manifested; unit tests on
// the individual helpers didn't catch them because none of them invoked
// the handler's actual sequence.

// Save and restore env + fetch so tests don't leak.
const ENV_KEYS = [
  'GROQ_API_KEY', 'NOVA_GROQ_API_KEY',
  'GEMINI_API_KEY', 'NOVA_GEMINI_API_KEY',
  'OPENROUTER_API_KEY', 'NOVA_OPENROUTER_API_KEY',
  'CEREBRAS_API_KEY', 'NOVA_CEREBRAS_API_KEY'
];

function makeReq({ ip = '10.0.0.1', body = {}, method = 'POST' } = {}) {
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
    write(chunk) { this.chunks.push(String(chunk)); },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); this.ended = true; },
    body() { return this.chunks.join(''); }
  };
}

function upstream(status, body = '', headers = {}) {
  const hMap = new Map(Object.entries({ 'content-type': 'application/json', ...headers })
    .map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get(k) { return hMap.get(k.toLowerCase()) || null; } },
    text: async () => body,
    body: null
  };
}

describe('proxy chat — chain integration', () => {
  let snapshot;
  let fetchMock;
  let ipCounter = 0;

  beforeEach(() => {
    // Snapshot then clear all provider env vars so each test sets exactly
    // what it needs.
    snapshot = {};
    for (const k of ENV_KEYS) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
    vi.unstubAllGlobals();
  });

  // Each test uses a unique IP so the module-level rate bucket counter
  // doesn't bleed between tests (30 req/hr cap would otherwise misfire).
  function freshIp() {
    ipCounter += 1;
    return `10.0.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
  }

  it('returns 503 PROXY_NOT_CONFIGURED when no provider key is set', async () => {
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = JSON.parse(res.body());
    expect(body.error.code).toBe('PROXY_NOT_CONFIGURED');
  });

  it('sends the first request to Groq when only GROQ_API_KEY is set', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_key';
    fetchMock.mockResolvedValueOnce(upstream(200, '{"choices":[{"message":{"content":"hi"}}]}'));
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const groq = PROVIDERS.find(p => p.name === 'groq-8b');
    expect(fetchMock.mock.calls[0][0]).toBe(groq.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Nova-Provider']).toBe('groq-8b');
  });

  it('falls through Groq 429 to the next configured provider', async () => {
    // The exact "Groq TPM cap hit" path the user reported in production.
    process.env.GROQ_API_KEY = 'gsk_test_key';
    process.env.OPENROUTER_API_KEY = 'sk-or-test_key';
    fetchMock
      .mockResolvedValueOnce(upstream(429, 'Too many requests'))
      .mockResolvedValueOnce(upstream(200, '{"choices":[{"message":{"content":"ok"}}]}'));
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const groq = PROVIDERS.find(p => p.name === 'groq-8b');
    const openrouter = PROVIDERS.find(p => p.name === 'openrouter-free');
    expect(fetchMock.mock.calls[0][0]).toBe(groq.url);
    expect(fetchMock.mock.calls[1][0]).toBe(openrouter.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Nova-Provider']).toBe('openrouter-free');
  });

  it('falls through model-not-found 4xx', async () => {
    // The exact Cerebras "Model llama-3.3-70b does not exist or you do not
    // have access to it" path that used to dead-end the chain.
    process.env.CEREBRAS_API_KEY = 'csk_test_key';
    process.env.OPENROUTER_API_KEY = 'sk-or-test_key';
    fetchMock
      .mockResolvedValueOnce(upstream(404, 'Model llama-3.3-70b does not exist or you do not have access to it'))
      .mockResolvedValueOnce(upstream(200, '{"choices":[{"message":{"content":"ok"}}]}'));
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(200);
  });

  it('does NOT fall through 401 auth errors — retrying with another key will not fix a misconfigured one', async () => {
    process.env.GROQ_API_KEY = 'gsk_wrong_key';
    process.env.OPENROUTER_API_KEY = 'sk-or-test_key';
    fetchMock.mockResolvedValueOnce(upstream(401, '{"error":{"message":"Invalid API Key"}}'));
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(401);
    expect(res.body()).toContain('Invalid API Key');
  });

  it('returns 429 RATE_LIMITED with attempts[] when every provider 429s', async () => {
    // Worst-case: every free tier is rate-limited at the same time. The user
    // must see the actual reason (throttled), not a vague outage — so it's a
    // 429 RATE_LIMITED, not a 502.
    process.env.GROQ_API_KEY = 'gsk_test';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    process.env.CEREBRAS_API_KEY = 'csk_test';
    fetchMock
      .mockResolvedValueOnce(upstream(429, 'rate limited'))
      .mockResolvedValueOnce(upstream(429, 'rate limited'))
      .mockResolvedValueOnce(upstream(429, 'rate limited'));
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body());
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(Array.isArray(body.error.attempts)).toBe(true);
    expect(body.error.attempts.length).toBe(3);
    // Attempts must record which provider failed and the status — so the
    // network-tab debugger never has to guess.
    expect(body.error.attempts[0].provider).toBe('groq-8b');
    expect(body.error.attempts[0].status).toBe(429);
  });

  it('sends each provider its OWN default model — never the previous provider\'s model ID', async () => {
    // The cross-provider model-routing bug: Groq used to forward its
    // "llama-3.1-8b-instant" ID to OpenRouter on fallover, and OpenRouter
    // returned 400 "not a valid model ID" because it expects its own
    // naming. Verify each upstream request body carries an ID that
    // belongs to that provider.
    process.env.GROQ_API_KEY = 'gsk_test';
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    process.env.CEREBRAS_API_KEY = 'csk_test';
    fetchMock
      .mockResolvedValueOnce(upstream(429, 'rate limited'))
      .mockResolvedValueOnce(upstream(429, 'rate limited'))
      .mockResolvedValueOnce(upstream(429, 'rate limited'));
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);

    const groq = PROVIDERS.find(p => p.name === 'groq-8b');
    const openrouter = PROVIDERS.find(p => p.name === 'openrouter-free');
    const cerebras = PROVIDERS.find(p => p.name === 'cerebras');

    for (let i = 0; i < fetchMock.mock.calls.length; i++) {
      const url = fetchMock.mock.calls[i][0];
      const sentBody = JSON.parse(fetchMock.mock.calls[i][1].body);
      const expected =
        url === groq.url ? groq.allowedModels :
        url === openrouter.url ? openrouter.allowedModels :
        url === cerebras.url ? cerebras.allowedModels :
        null;
      expect(expected, `attempt ${i} URL not recognized: ${url}`).not.toBe(null);
      expect(expected.has(sentBody.model), `${url} got cross-provider model ${sentBody.model}`).toBe(true);
    }
  });

  it('forwards the client request body messages and caps max_tokens', async () => {
    // Defense against accidental prompt injection / runaway token use.
    // Whatever messages the browser sends, that's what the proxy forwards.
    // max_tokens is clamped to 512 server-side.
    process.env.GROQ_API_KEY = 'gsk_test';
    fetchMock.mockResolvedValueOnce(upstream(200, '{"choices":[]}'));
    const req = makeReq({
      ip: freshIp(),
      body: {
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hi' }
        ],
        max_tokens: 100000,
        temperature: 0.42
      }
    });
    const res = makeRes();
    await handler(req, res);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages).toEqual(req.body.messages);
    expect(sent.max_tokens).toBeLessThanOrEqual(512);
    expect(sent.temperature).toBe(0.42);
  });

  it('rate-limits per IP — 31st request from same IP returns 429 without touching providers', async () => {
    // 30 req/hr cap.
    process.env.GROQ_API_KEY = 'gsk_test';
    const ip = freshIp();
    fetchMock.mockResolvedValue(upstream(200, '{"choices":[]}'));
    for (let i = 0; i < 30; i++) {
      await handler(makeReq({ ip }), makeRes());
    }
    const fetchCallsBefore = fetchMock.mock.calls.length;

    // 31st request — should be blocked before hitting fetch.
    const res = makeRes();
    await handler(makeReq({ ip }), res);
    expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore);
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body());
    expect(body.error.code).toBe('RATE_LIMITED_PER_IP');
  });

  it('skips providers whose key is missing — single-key deployments still work', async () => {
    // Common case: deployer only set GROQ_API_KEY. We must NOT try to call
    // OpenRouter or Cerebras with empty Authorization headers; they're
    // simply not in the chain.
    process.env.GROQ_API_KEY = 'gsk_test';
    fetchMock.mockResolvedValueOnce(upstream(429, 'rate limited'));
    const req = makeReq({ ip: freshIp() });
    const res = makeRes();
    await handler(req, res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const groqUrl = PROVIDERS.find(p => p.name === 'groq-8b').url;
    expect(fetchMock.mock.calls[0][0]).toBe(groqUrl);
    // Only provider was rate-limited → surfaced as RATE_LIMITED (429).
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body()).error.code).toBe('RATE_LIMITED');
  });
});
