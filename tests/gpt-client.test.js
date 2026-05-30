import { GPTClient } from '../src/ai/gpt-client.js';

describe('GPTClient', () => {
  const previousLocalStorage = globalThis.localStorage;

  afterEach(() => {
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousLocalStorage;
    }
  });

  function installLocalStorage(initial = {}) {
    const values = { ...initial };
    globalThis.localStorage = {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      },
      setItem(key, value) {
        values[key] = String(value);
      },
      removeItem(key) {
        delete values[key];
      }
    };
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

  it('uses proxy mode when no API key is configured', () => {
    installLocalStorage();

    expect(GPTClient.isProxyMode()).toBe(true);
    expect(GPTClient.canChat()).toBe(true);
    expect(GPTClient.getEffectiveApiUrl()).toBe('/api/proxy/chat');
    expect(GPTClient.getEffectiveModel()).toBe('llama-3.1-8b-instant');
    expect(GPTClient.buildRequestHeaders()).toEqual({ 'Content-Type': 'application/json' });
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
});
