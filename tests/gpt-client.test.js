import { GPTClient } from '../src/ai/gpt-client.js';

describe('GPTClient', () => {
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
