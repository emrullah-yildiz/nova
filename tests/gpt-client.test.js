import { afterEach, beforeEach, vi } from 'vitest';
import { GPTClient } from '../src/ai/gpt-client.js';

describe('GPTClient', () => {
  let store;
  let originalFetch;
  let originalLocalStorage;
  let originalNFLogger;
  let originalBuildNodeReference;

  beforeEach(() => {
    store = new Map();
    originalFetch = globalThis.fetch;
    originalLocalStorage = globalThis.localStorage;
    originalNFLogger = globalThis.NFLogger;
    originalBuildNodeReference = globalThis.buildNodeReference;

    globalThis.localStorage = {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
      clear: () => store.clear()
    };
    globalThis.NFLogger = {
      aiRequest: vi.fn(),
      aiError: vi.fn(),
      aiResponse: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      aiParsed: vi.fn(),
      warn: vi.fn()
    };
    globalThis.buildNodeReference = () => 'Node reference';
    GPTClient._histories = { landing: [], workspace: [] };
    GPTClient._rateLimited = false;
    GPTClient._originalProvider = null;
    GPTClient._originalModel = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.NFLogger = originalNFLogger;
    globalThis.buildNodeReference = originalBuildNodeReference;
  });

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

  it('sends non-streaming chat requests with provider headers and saves history', async () => {
    GPTClient.setProvider('openrouter');
    GPTClient.setApiKey('sk-or-valid-test-key');
    GPTClient.setModel('openrouter/free');
    globalThis.window = { location: { href: 'https://nova.test/workspace' } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'AI reply' } }] })
    });

    const reply = await GPTClient.call('make a box', 'workspace', 'box = old_code');
    const [url, request] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(reply).toBe('AI reply');
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request.method).toBe('POST');
    expect(request.headers.Authorization).toBe('Bearer sk-or-valid-test-key');
    expect(request.headers['HTTP-Referer']).toBe('https://nova.test/workspace');
    expect(body.model).toBe('openrouter/free');
    expect(body.stream).toBeUndefined();
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'make a box' });
    expect(body.messages[0].content).toContain('box = old_code');
    expect(GPTClient._histories.workspace).toEqual([
      { role: 'user', content: 'make a box' },
      { role: 'assistant', content: 'AI reply' }
    ]);
  });

  it('throws parsed provider errors for failed non-streaming responses', async () => {
    GPTClient.setProvider('openai');
    GPTClient.setApiKey('sk-valid-test-key');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Invalid API key' } })
    });

    await expect(GPTClient.call('hello', 'workspace')).rejects.toThrow('Invalid API key');
    expect(globalThis.NFLogger.aiError).toHaveBeenCalledWith('Invalid API key', 'openai');
  });

  it('switches to a configured free provider on non-streaming rate limits', async () => {
    GPTClient.setProvider('openai');
    GPTClient.setApiKey('sk-valid-test-key');
    localStorage.setItem('nodeflow_key_groq', 'gsk_valid_free_key');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => ''
    });

    await expect(GPTClient.call('hello', 'workspace')).rejects.toThrow('__RATE_LIMIT_SWITCHED__groq');
    expect(GPTClient.getProvider()).toBe('groq');
    expect(GPTClient.getModel()).toBe('llama-3.3-70b-versatile');
  });

  it('streams chunks, builds the final text, and stores conversation history', async () => {
    GPTClient.setProvider('groq');
    GPTClient.setApiKey('gsk_valid_free_key');
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n',
      'data: [DONE]\n'
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader() {
          let index = 0;
          return {
            read: async () => (
              index < chunks.length
                ? { done: false, value: encoder.encode(chunks[index++]) }
                : { done: true }
            )
          };
        }
      }
    });
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await GPTClient.callStream('say hi', 'landing', '', onChunk, onDone, onError);

    expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello', 'Hello');
    expect(onChunk).toHaveBeenNthCalledWith(2, ' world', 'Hello world');
    expect(onDone).toHaveBeenCalledWith('Hello world');
    expect(onError).not.toHaveBeenCalled();
    expect(GPTClient._histories.landing).toEqual([
      { role: 'user', content: 'say hi' },
      { role: 'assistant', content: 'Hello world' }
    ]);
  });

  it('reports streaming errors without throwing when provider returns an error response', async () => {
    GPTClient.setProvider('openai');
    GPTClient.setApiKey('sk-valid-test-key');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'Provider unavailable' } })
    });
    const onError = vi.fn();

    await GPTClient.callStream('hello', 'workspace', '', vi.fn(), vi.fn(), onError);

    expect(onError).toHaveBeenCalledWith('Provider unavailable');
  });
});
