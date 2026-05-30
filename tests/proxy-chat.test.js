import { PROVIDERS, pickModel, shouldFallthrough, resolveProvider } from '../api/proxy/chat.mjs';

describe('proxy chat — pickModel', () => {
  const groq = PROVIDERS.find(p => p.name === 'groq-8b');
  const gemini = PROVIDERS.find(p => p.name === 'gemini-flash');

  it('exposes exactly the Groq + Gemini chain', () => {
    expect(groq).toBeDefined();
    expect(gemini).toBeDefined();
    expect(PROVIDERS.length).toBe(2);
    expect(PROVIDERS.map(p => p.name)).toEqual(['groq-8b', 'gemini-flash']);
  });

  it('places Groq first (fastest) and Gemini second (most generous fallback)', () => {
    expect(PROVIDERS[0].name).toBe('groq-8b');
    expect(PROVIDERS[1].name).toBe('gemini-flash');
  });

  it('Gemini provider has an OpenAI-compatible endpoint and accepts flash models', () => {
    expect(gemini.url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(gemini.allowedModels.has('gemini-2.0-flash')).toBe(true);
    expect(gemini.allowedModels.has('gemini-1.5-flash')).toBe(true);
    expect(gemini.defaultModel).toBe('gemini-2.0-flash');
  });

  it('honors the client request only when it is on the provider allowlist', () => {
    expect(pickModel(groq, 'llama-3.1-8b-instant')).toBe('llama-3.1-8b-instant');
    expect(pickModel(groq, 'llama-3.3-70b-versatile')).toBe('llama-3.3-70b-versatile');
  });

  it('falls back to provider default when the client requests another provider\'s model', () => {
    // A Groq-style id forwarded to Gemini must not be honored, and vice versa.
    expect(pickModel(gemini, 'llama-3.1-8b-instant')).toBe(gemini.defaultModel);
    expect(pickModel(groq, 'gemini-2.0-flash')).toBe(groq.defaultModel);
  });

  it('falls back to default when no model is requested', () => {
    expect(pickModel(groq, undefined)).toBe(groq.defaultModel);
    expect(pickModel(gemini, null)).toBe(gemini.defaultModel);
    expect(pickModel(gemini, '')).toBe(gemini.defaultModel);
  });

  it('each provider default is on its own allowlist', () => {
    expect(groq.allowedModels.has(groq.defaultModel)).toBe(true);
    expect(gemini.allowedModels.has(gemini.defaultModel)).toBe(true);
  });

  it('provider allowlists are disjoint (no silent misrouting)', () => {
    const allIds = [...groq.allowedModels, ...gemini.allowedModels];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('proxy chat — resolveProvider', () => {
  it('reads the key and applies an env model override', () => {
    const groq = PROVIDERS.find(p => p.name === 'groq-8b');
    const resolved = resolveProvider(groq, { GROQ_API_KEY: 'gsk_x', NOVA_GROQ_MODEL: 'llama-3.3-70b-versatile' });
    expect(resolved.apiKey).toBe('gsk_x');
    expect(resolved.defaultModel).toBe('llama-3.3-70b-versatile');
    expect(resolved.headers.Authorization).toBe('Bearer gsk_x');
  });

  it('returns null when no key is set', () => {
    const groq = PROVIDERS.find(p => p.name === 'groq-8b');
    expect(resolveProvider(groq, {})).toBeNull();
  });
});

describe('proxy chat — shouldFallthrough', () => {
  it('falls through on 429 and 5xx', () => {
    expect(shouldFallthrough(429)).toBe(true);
    expect(shouldFallthrough(503)).toBe(true);
  });
  it('does not fall through on auth errors', () => {
    expect(shouldFallthrough(401, 'Invalid API Key')).toBe(false);
  });
});
