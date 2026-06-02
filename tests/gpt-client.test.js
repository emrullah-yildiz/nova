import { GPTClient } from '../src/ai/gpt-client.js';

describe('GPTClient', () => {
  const previousLocalStorage = globalThis.localStorage;
  const previousSessionStorage = globalThis.sessionStorage;

  afterEach(() => {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previousSessionStorage;
    // Rebuild the backend so the next test starts from a clean anonymous store.
    GPTClient._sessionBackend = null;
    GPTClient._useAnonymousPrefs();
  });

  function makeStore(initial = {}) {
    const values = { ...initial };
    return {
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) { values[key] = String(value); },
      removeItem(key) { delete values[key]; }
    };
  }

  // AI prefs route through the anonymous (sessionStorage) backend, so seed there
  // and rebuild the backend. A fresh empty localStorage keeps migration a no-op.
  function installLocalStorage(initial = {}) {
    globalThis.sessionStorage = makeStore(initial);
    globalThis.localStorage = makeStore({});
    GPTClient._sessionBackend = null;
    GPTClient._useAnonymousPrefs();
  }

  it('returns the correct default provider URL', () => {
    expect(GPTClient.getApiUrl('openai')).toBe('https://api.openai.com/v1/chat/completions');
    expect(GPTClient.getApiUrl('groq')).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('detects provider from key prefix', () => {
    expect(GPTClient.detectProvider('gsk_123')).toBe('groq');
    expect(GPTClient.detectProvider('sk-or-abc')).toBe('openrouter');
    // A direct Anthropic key now routes to the native anthropic provider,
    // not OpenRouter — sk-or- (checked first) keeps OpenRouter keys distinct.
    expect(GPTClient.detectProvider('sk-ant-xyz')).toBe('anthropic');
    expect(GPTClient.detectProvider('AIzaSyExample')).toBe('gemini');
    expect(GPTClient.detectProvider('sk-abc')).toBe('openai');
  });

  it('validates API keys', () => {
    expect(GPTClient.isApiKeyValid('short')).toBe(false);
    expect(GPTClient.isApiKeyValid('sk-12345678901')).toBe(true);
  });

  it('stores the API key in sessionStorage (anonymous backend), not localStorage', () => {
    installLocalStorage();
    GPTClient.setProvider('groq');
    GPTClient.setApiKey('gsk_anon_1234567890');
    expect(globalThis.sessionStorage.getItem('nodeflow_key_groq')).toBe('gsk_anon_1234567890');
    expect(globalThis.localStorage.getItem('nodeflow_key_groq')).toBeNull();
    expect(GPTClient.getApiKey()).toBe('gsk_anon_1234567890');
  });

  it('migrates legacy localStorage AI prefs into sessionStorage once, then purges them', () => {
    // Simulate a returning anonymous user whose key still lives in localStorage.
    globalThis.sessionStorage = makeStore({});
    globalThis.localStorage = makeStore({ nodeflow_provider: 'groq', nodeflow_key_groq: 'gsk_legacy_1234567890' });
    GPTClient._sessionBackend = null;
    GPTClient._useAnonymousPrefs();
    GPTClient._migrateLegacyLocalPrefs();
    // Copied into sessionStorage and removed from localStorage (so a closed tab clears).
    expect(globalThis.sessionStorage.getItem('nodeflow_key_groq')).toBe('gsk_legacy_1234567890');
    expect(globalThis.localStorage.getItem('nodeflow_key_groq')).toBeNull();
    expect(GPTClient.getApiKey()).toBe('gsk_legacy_1234567890');
  });

  it('is inactive (not proxy mode) when no API key and the free tier is off', () => {
    installLocalStorage();

    // BYOK-only default: no shared free-tier proxy, so "no key" => inactive.
    expect(GPTClient.FREE_TIER_ENABLED).toBe(false);
    expect(GPTClient.isProxyMode()).toBe(false);
    expect(GPTClient.canChat()).toBe(false);
  });

  it('uses the shared proxy when the free tier is explicitly enabled', () => {
    installLocalStorage();
    const previous = GPTClient.FREE_TIER_ENABLED;
    GPTClient.FREE_TIER_ENABLED = true;
    try {
      expect(GPTClient.isProxyMode()).toBe(true);
      expect(GPTClient.canChat()).toBe(true);
      expect(GPTClient.getEffectiveApiUrl()).toBe('/api/proxy/chat');
      expect(GPTClient.getEffectiveModel()).toBe('llama-3.1-8b-instant');
      expect(GPTClient.buildRequestHeaders()).toEqual({ 'Content-Type': 'application/json' });
    } finally {
      GPTClient.FREE_TIER_ENABLED = previous;
    }
  });

  it('uses provider settings when an API key is configured', () => {
    installLocalStorage({
      nodeflow_provider: 'groq',
      nodeflow_key_groq: 'gsk_123456789012345',
      nodeflow_openai_model: 'llama-3.1-8b-instant'
    });

    expect(GPTClient.isProxyMode()).toBe(false);
    expect(GPTClient.getEffectiveApiUrl()).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(GPTClient.getEffectiveModel()).toBe('llama-3.1-8b-instant');
    expect(GPTClient.buildRequestHeaders()).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer gsk_123456789012345'
    });
  });

  it('detects enterprise AI mode from runtime config', () => {
    const previousConfig = globalThis.__NOVA_CONFIG__;
    try {
      globalThis.__NOVA_CONFIG__ = {
        apiBaseUrl: 'https://api.nova.example',
        enterpriseAiEnabled: true
      };
      expect(GPTClient.isEnterpriseAiEnabled()).toBe(true);

      globalThis.__NOVA_CONFIG__ = {
        apiBaseUrl: 'https://api.nova.example',
        enterpriseAiEnabled: false
      };
      expect(GPTClient.isEnterpriseAiEnabled()).toBe(false);
    } finally {
      globalThis.__NOVA_CONFIG__ = previousConfig;
    }
  });

  describe('slim-vs-full prompt heuristics', () => {
    it('detects build intent in casual phrasing', () => {
      expect(GPTClient.hasBuildIntent('build me a tower')).toBe(true);
      expect(GPTClient.hasBuildIntent('Create a parametric building')).toBe(true);
      expect(GPTClient.hasBuildIntent('show me a hyperboloid')).toBe(true);
      expect(GPTClient.hasBuildIntent("let's build a pavilion")).toBe(true);
      expect(GPTClient.hasBuildIntent('add a slider')).toBe(true);
    });

    it('does NOT detect build intent in option-pick echoes', () => {
      // The exact regression we hit: clicking "Pavilion" sent "Options: 2.
      // Pavilion" as the user message, which has zero build verbs, so slim
      // prompt was used and the AI hallucinated Geo.Edge from its tiny
      // example list. historyHasCode() now compensates.
      expect(GPTClient.hasBuildIntent('Options: 2. Pavilion')).toBe(false);
      expect(GPTClient.hasBuildIntent('Geodesic Dome')).toBe(false);
      expect(GPTClient.hasBuildIntent('hi')).toBe(false);
    });

    it('sticky-upgrades to full prompt when the recent history contains code', () => {
      const noCode = [
        { role: 'user', text: 'hi' },
        { role: 'ai', text: 'Hello, what do you want to build?' }
      ];
      expect(GPTClient.historyHasCode(noCode)).toBe(false);

      const withCode = [
        { role: 'user', text: 'hi' },
        { role: 'ai', text: 'Here it is\n```python\nbox = Geo.createBox(...)\n```' },
        { role: 'user', text: 'Geodesic Dome' }
      ];
      expect(GPTClient.historyHasCode(withCode)).toBe(true);
    });

    it('historyHasCode works with the OpenAI-style {content} message shape too', () => {
      const withCode = [
        { role: 'assistant', content: 'sure\n```python\npass\n```' }
      ];
      expect(GPTClient.historyHasCode(withCode)).toBe(true);
    });

    it('historyHasCode returns false for empty / non-array history', () => {
      expect(GPTClient.historyHasCode([])).toBe(false);
      expect(GPTClient.historyHasCode(null)).toBe(false);
      expect(GPTClient.historyHasCode(undefined)).toBe(false);
    });

    it('isFixPrompt detects the auto-retry prompt shape from _validateAndPresent', () => {
      // gpt-integration's fixPrompt format must always get the full Geo API
      // reference, since by definition it's correcting broken code and
      // can't rely on the slim prompt's tiny example list.
      const fixPrompt = 'The code you generated has a runtime error:\n\nError: Geo.Edge is not a function\n\nOriginal code:\n```python\nedge = Geo.Edge(...)\n```\n\n...';
      expect(GPTClient.isFixPrompt(fixPrompt)).toBe(true);
    });

    it('isFixPrompt does NOT match unrelated messages that happen to mention error', () => {
      expect(GPTClient.isFixPrompt('what is a runtime error?')).toBe(false);
      expect(GPTClient.isFixPrompt('I got a runtime error earlier')).toBe(false);
      expect(GPTClient.isFixPrompt('')).toBe(false);
      expect(GPTClient.isFixPrompt(null)).toBe(false);
    });
  });

  describe('direct BYOK providers (Gemini + Claude, no OpenRouter)', () => {
    it('registers Gemini and Anthropic with the right endpoints and formats', () => {
      const gemini = GPTClient.PROVIDERS.gemini;
      const anthropic = GPTClient.PROVIDERS.anthropic;
      expect(gemini).toBeDefined();
      expect(gemini.apiUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
      expect(gemini.format).toBe('openai'); // OpenAI-compatible, no adapter
      expect(anthropic).toBeDefined();
      expect(anthropic.apiUrl).toBe('https://api.anthropic.com/v1/messages');
      expect(anthropic.format).toBe('anthropic');
      expect(anthropic.keyPrefix).toBe('sk-ant-');
    });

    it('getProviderFormat reflects the active provider (proxy mode is always openai)', () => {
      installLocalStorage(); // no key → proxy
      expect(GPTClient.getProviderFormat()).toBe('openai');
      installLocalStorage({ nodeflow_provider: 'anthropic', nodeflow_key_anthropic: 'sk-ant-1234567890' });
      expect(GPTClient.getProviderFormat()).toBe('anthropic');
      expect(GPTClient.getProviderFormat('gemini')).toBe('openai');
    });
  });

  describe('wire-format adapters', () => {
    const sys = { role: 'system', content: 'be brief' };
    const user = { role: 'user', content: 'hi' };

    it('OpenAI auth uses Bearer; Anthropic uses x-api-key + version + browser-access', () => {
      expect(GPTClient.buildAuthHeaders('openai', 'sk-test', { 'X-Title': 'Nova' })).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test',
        'X-Title': 'Nova'
      });
      const a = GPTClient.buildAuthHeaders('anthropic', 'sk-ant-test');
      expect(a['x-api-key']).toBe('sk-ant-test');
      expect(a['anthropic-version']).toBe('2023-06-01');
      expect(a['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(a.Authorization).toBeUndefined();
    });

    it('OpenAI payload keeps system as a message; stream flag only when requested', () => {
      const body = GPTClient.buildChatPayload('openai', 'gpt-4o', [sys, user], 100, 0.7, false);
      expect(body).toEqual({ model: 'gpt-4o', messages: [sys, user], max_tokens: 100, temperature: 0.7 });
      expect(GPTClient.buildChatPayload('openai', 'gpt-4o', [user], 100, 0.7, true).stream).toBe(true);
    });

    it('uses the provider token-param name (OpenAI reasoning models need max_completion_tokens)', () => {
      const body = GPTClient.buildChatPayload('openai', 'gpt-5.5', [user], 200, 0.7, false, 'max_completion_tokens');
      expect(body.max_completion_tokens).toBe(200);
      expect(body.max_tokens).toBeUndefined();
    });

    it('omits temperature for OpenAI reasoning models, keeps it for classic chat models', () => {
      // gpt-5.x / o-series reject a non-default temperature on Chat Completions.
      expect(GPTClient.buildChatPayload('openai', 'gpt-5.4-mini', [user], 50, 0.7, false, 'max_completion_tokens').temperature).toBeUndefined();
      expect(GPTClient.buildChatPayload('openai', 'o3', [user], 50, 0.7, false, 'max_completion_tokens').temperature).toBeUndefined();
      expect(GPTClient.buildChatPayload('openai', 'gpt-4o', [user], 50, 0.7, false, 'max_completion_tokens').temperature).toBe(0.7);
    });

    it('isReasoningModel matches gpt-5.x and o-series only', () => {
      expect(GPTClient.isReasoningModel('gpt-5.5')).toBe(true);
      expect(GPTClient.isReasoningModel('o1')).toBe(true);
      expect(GPTClient.isReasoningModel('o3')).toBe(true);
      expect(GPTClient.isReasoningModel('gpt-4o')).toBe(false);
      expect(GPTClient.isReasoningModel('gpt-4.1')).toBe(false);
      expect(GPTClient.isReasoningModel('openai/gpt-oss-120b')).toBe(false);
    });

    it('getTokenParam returns max_completion_tokens only for OpenAI', () => {
      installLocalStorage({ nodeflow_provider: 'openai', nodeflow_key_openai: 'sk-1234567890' });
      expect(GPTClient.getTokenParam()).toBe('max_completion_tokens');
      installLocalStorage({ nodeflow_provider: 'groq', nodeflow_key_groq: 'gsk_1234567890' });
      expect(GPTClient.getTokenParam()).toBe('max_tokens');
      installLocalStorage(); // proxy
      expect(GPTClient.getTokenParam()).toBe('max_tokens');
    });

    it('Anthropic payload hoists system out of messages and requires max_tokens', () => {
      const body = GPTClient.buildChatPayload('anthropic', 'claude-sonnet-4-6', [sys, user], 256, 0.7, true);
      expect(body.system).toBe('be brief');
      expect(body.messages).toEqual([user]); // system removed from the array
      expect(body.max_tokens).toBe(256);
      expect(body.stream).toBe(true);
    });

    it('Anthropic payload concatenates multiple system messages', () => {
      const body = GPTClient.buildChatPayload('anthropic', 'm', [sys, { role: 'system', content: 'and kind' }, user], 10, 0.7, false);
      expect(body.system).toBe('be brief\n\nand kind');
      expect(body.stream).toBeUndefined();
    });

    it('extracts non-stream content from each provider shape', () => {
      expect(GPTClient.extractMessageContent('openai', { choices: [{ message: { content: 'hello' } }] })).toBe('hello');
      expect(GPTClient.extractMessageContent('anthropic', { content: [{ type: 'text', text: 'hel' }, { type: 'text', text: 'lo' }] })).toBe('hello');
      // Anthropic interleaves non-text blocks (e.g. thinking) — only text is kept.
      expect(GPTClient.extractMessageContent('anthropic', { content: [{ type: 'tool_use' }, { type: 'text', text: 'ok' }] })).toBe('ok');
    });

    it('extracts streaming deltas from each provider SSE shape', () => {
      expect(GPTClient.extractStreamDelta('openai', { choices: [{ delta: { content: 'x' } }] })).toBe('x');
      expect(GPTClient.extractStreamDelta('anthropic', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'y' } })).toBe('y');
      // Non-text Anthropic events produce no output.
      expect(GPTClient.extractStreamDelta('anthropic', { type: 'message_start' })).toBe('');
      expect(GPTClient.extractStreamDelta('openai', { choices: [{ delta: {} }] })).toBe('');
    });
  });

  describe('extended thinking', () => {
    it('parses Anthropic thinking_delta separately from text', () => {
      const tEvt = { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'let me think' } };
      expect(GPTClient.extractThinkingDelta('anthropic', tEvt)).toBe('let me think');
      expect(GPTClient.extractStreamDelta('anthropic', tEvt)).toBe(''); // not text
      const textEvt = { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } };
      expect(GPTClient.extractThinkingDelta('anthropic', textEvt)).toBe('');
      expect(GPTClient.extractThinkingDelta('openai', { choices: [{ delta: { content: 'x' } }] })).toBe('');
    });

    it('only enables thinking for thinking-capable Anthropic models', () => {
      expect(GPTClient.isThinkingModel('anthropic/claude-sonnet-4.6')).toBe(true);
      expect(GPTClient.isThinkingModel('claude-3-7-sonnet-20250219')).toBe(true);
      expect(GPTClient.isThinkingModel('claude-3-5-haiku')).toBe(false);
      expect(GPTClient.isThinkingModel('gpt-4o')).toBe(false);
      expect(GPTClient.isThinkingEnabled('openai', 'anthropic/claude-sonnet-4.6')).toBe(false);
      expect(GPTClient.isThinkingEnabled('anthropic', 'claude-3-5-haiku')).toBe(false);
      expect(GPTClient.isThinkingEnabled('anthropic', 'anthropic/claude-sonnet-4.6')).toBe(true);
    });

    it('dropLastTurn removes the last user→assistant pair, keeping earlier turns', () => {
      GPTClient._histories = GPTClient._histories || {};
      GPTClient._histories.retryctx = [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'one' },
        { role: 'user', content: 'second' },
        { role: 'assistant', content: 'two' }
      ];
      GPTClient.dropLastTurn('retryctx');
      expect(GPTClient._histories.retryctx).toEqual([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'one' }
      ]);
      // Safe on empty / unknown contexts.
      GPTClient._histories.retryctx = [];
      expect(() => GPTClient.dropLastTurn('retryctx')).not.toThrow();
      expect(() => GPTClient.dropLastTurn('nope')).not.toThrow();
    });

    it('stopStream aborts the active stream and clears it; no-op when idle', () => {
      let aborted = false;
      GPTClient._activeStream = { signal: {}, abort() { aborted = true; } };
      GPTClient.stopStream();
      expect(aborted).toBe(true);
      expect(GPTClient._activeStream).toBeNull();
      expect(() => GPTClient.stopStream()).not.toThrow();
    });

    it('adds a thinking block, temperature 1, and a larger max_tokens to the Anthropic payload', () => {
      const base = GPTClient.buildChatPayload('anthropic', 'claude-sonnet-4.6', [{ role: 'user', content: 'hi' }], 2048, 0.7, true, 'max_tokens', false);
      expect(base.thinking).toBeUndefined();
      expect(base.temperature).toBe(0.7);

      const think = GPTClient.buildChatPayload('anthropic', 'claude-sonnet-4.6', [{ role: 'user', content: 'hi' }], 2048, 0.7, true, 'max_tokens', true);
      expect(think.thinking).toEqual({ type: 'enabled', budget_tokens: GPTClient.THINKING_BUDGET });
      expect(think.temperature).toBe(1);
      expect(think.max_tokens).toBeGreaterThan(GPTClient.THINKING_BUDGET);
    });
  });
});
