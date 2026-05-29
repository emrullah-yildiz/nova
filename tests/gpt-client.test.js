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
    expect(GPTClient.detectProvider('sk-ant-xyz')).toBe('openrouter');
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
});
