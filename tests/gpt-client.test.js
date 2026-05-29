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
    expect(GPTClient.getEffectiveModel()).toBe('llama-3.3-70b-versatile');
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
});
