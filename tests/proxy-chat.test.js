import { PROVIDERS, pickModel, shouldFallthrough, resolveProvider } from '../api/proxy/chat.mjs';

describe('proxy chat — pickModel', () => {
  const groq = PROVIDERS.find(p => p.name === 'groq-8b');
  const openrouter = PROVIDERS.find(p => p.name === 'openrouter-free');
  const cerebras = PROVIDERS.find(p => p.name === 'cerebras');

  it('exposes all three providers', () => {
    expect(groq).toBeDefined();
    expect(openrouter).toBeDefined();
    expect(cerebras).toBeDefined();
  });

  it('honors the client request only when it is on the provider allowlist', () => {
    // Groq has llama-3.1-8b-instant on its list → honored.
    expect(pickModel(groq, 'llama-3.1-8b-instant')).toBe('llama-3.1-8b-instant');
    expect(pickModel(groq, 'llama-3.3-70b-versatile')).toBe('llama-3.3-70b-versatile');
  });

  it('falls back to provider default when client requests a model from a different provider', () => {
    // Regression: forwarding a Groq-style ID to OpenRouter used to dead-end
    // the chain because OpenRouter doesn't have "llama-3.1-8b-instant".
    expect(pickModel(openrouter, 'llama-3.1-8b-instant')).toBe(openrouter.defaultModel);
    expect(pickModel(cerebras, 'llama-3.1-8b-instant')).toBe(cerebras.defaultModel);
    // And forwarding an OpenRouter ID to Groq must not be honored either.
    expect(pickModel(groq, 'meta-llama/llama-3.3-70b-instruct:free')).toBe(groq.defaultModel);
  });

  it('falls back to default when no model is requested', () => {
    expect(pickModel(groq, undefined)).toBe(groq.defaultModel);
    expect(pickModel(openrouter, null)).toBe(openrouter.defaultModel);
    expect(pickModel(cerebras, '')).toBe(cerebras.defaultModel);
  });

  it('each provider default is on its own allowlist', () => {
    // Sanity: the default we fall back to must always be servable.
    expect(groq.allowedModels.has(groq.defaultModel)).toBe(true);
    expect(openrouter.allowedModels.has(openrouter.defaultModel)).toBe(true);
    expect(cerebras.allowedModels.has(cerebras.defaultModel)).toBe(true);
  });

  it('cross-provider allowlists are disjoint enough to prevent silent misrouting', () => {
    // No two providers should claim the same model ID — that would mean
    // a request that looks valid for provider A might go to provider B
    // and be silently mishandled.
    const allIds = [
      ...groq.allowedModels,
      ...openrouter.allowedModels,
      ...cerebras.allowedModels
    ];
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });
});

describe('proxy chat — shouldFallthrough', () => {
  it('falls through on rate limits', () => {
    expect(shouldFallthrough(429, '')).toBe(true);
    expect(shouldFallthrough(429, 'Too Many Requests')).toBe(true);
  });

  it('falls through on server errors', () => {
    expect(shouldFallthrough(500, '')).toBe(true);
    expect(shouldFallthrough(502, '')).toBe(true);
    expect(shouldFallthrough(503, '')).toBe(true);
    expect(shouldFallthrough(504, '')).toBe(true);
  });

  it('falls through on 4xx that indicate model unavailability', () => {
    // The exact bug the user hit: Cerebras 404 "Model llama-3.3-70b does
    // not exist or you do not have access to it" used to dead-end the
    // chain. Now we recognize it as "try next provider".
    expect(shouldFallthrough(404, 'Model llama-3.3-70b does not exist or you do not have access to it')).toBe(true);
    expect(shouldFallthrough(400, 'llama-3.1-8b-instant is not a valid model ID')).toBe(true);
    expect(shouldFallthrough(404, '{"error":{"message":"model not found"}}')).toBe(true);
    expect(shouldFallthrough(400, 'The model gpt-4o is decommissioned')).toBe(true);
  });

  it('does NOT fall through on auth errors (those are dead-ends per provider)', () => {
    // If the deployer set a wrong key, retrying with the next provider's
    // key won't fix the misconfigured one.
    expect(shouldFallthrough(401, '{"message":"Wrong API Key"}')).toBe(false);
    expect(shouldFallthrough(403, 'Forbidden')).toBe(false);
  });

  it('does NOT fall through on generic 4xx that look like user error', () => {
    expect(shouldFallthrough(400, 'Bad request body — missing messages array')).toBe(false);
    expect(shouldFallthrough(422, 'Unprocessable entity')).toBe(false);
  });

  it('does not fall through on success', () => {
    expect(shouldFallthrough(200, '')).toBe(false);
    expect(shouldFallthrough(201, '')).toBe(false);
  });
});

describe('proxy chat — resolveProvider', () => {
  const groq = PROVIDERS.find(p => p.name === 'groq-8b');

  it('returns null when no env var is set', () => {
    expect(resolveProvider(groq, {})).toBe(null);
  });

  it('trims leading and trailing whitespace from keys', () => {
    // Regression: when users paste API keys from web dashboards they often
    // include a leading space or newline. Without trimming, the
    // Authorization header becomes "Bearer  key..." (double space) and the
    // upstream returns 401 with confusing "missing auth" messages,
    // dead-ending the whole chain on the very first 4xx.
    const resolved = resolveProvider(groq, { GROQ_API_KEY: '  gsk_abcdefghij\n' });
    expect(resolved.apiKey).toBe('gsk_abcdefghij');
    expect(resolved.headers.Authorization).toBe('Bearer gsk_abcdefghij');
  });

  it('falls back to the alt env key when the primary is missing', () => {
    const resolved = resolveProvider(groq, { NOVA_GROQ_API_KEY: 'gsk_alt_key_value' });
    expect(resolved.apiKey).toBe('gsk_alt_key_value');
  });

  it('ignores non-object env arg and falls back to process.env', () => {
    // Regression: this is the exact production-handler shape and used to
    // break the proxy chain because Array.map calls back with
    // (element, index, array) — the number index overrode the env arg
    // and every resolveProvider call returned null on POST despite all
    // keys being present in process.env. The chain returned 503
    // PROXY_NOT_CONFIGURED to the user.
    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_from_env_for_test';
    try {
      // .map(resolveProvider) shape — array index gets passed as 2nd arg.
      const mapped = [groq].map(resolveProvider);
      expect(mapped[0]).not.toBe(null);
      expect(mapped[0].apiKey).toBe('gsk_from_env_for_test');

      // Direct call with garbage env arg should also fall back.
      expect(resolveProvider(groq, 0)).not.toBe(null);
      expect(resolveProvider(groq, 'not-an-object')).not.toBe(null);
      expect(resolveProvider(groq, [])).not.toBe(null);
      expect(resolveProvider(groq, null)).not.toBe(null);
    } finally {
      if (prevKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = prevKey;
    }
  });

  it('still uses an explicit object env arg over process.env (test override path)', () => {
    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_from_process_env';
    try {
      const resolved = resolveProvider(groq, { GROQ_API_KEY: 'gsk_from_override' });
      expect(resolved.apiKey).toBe('gsk_from_override');
    } finally {
      if (prevKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = prevKey;
    }
  });
});
