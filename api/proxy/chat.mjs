// Free-tier AI proxy with provider chain + per-IP rate limit.
//
// Tries providers in order. A provider is "tried" only if its env-var key is
// set. On 429/5xx we move to the next provider so a single overloaded tier
// doesn't take the whole free experience down.
//
// Rate limit is in-memory per IP — Vercel may run multiple instances so the
// cap is approximate, but it deters casual hammering. Swap to Upstash/Redis
// if abuse becomes real. See [[ai-free-tier-proxy]].

const PROVIDERS = [
  // Order: fastest + most generous free tier first.
  {
    name: 'groq-8b',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    altEnvKey: 'NOVA_GROQ_API_KEY',
    defaultModel: 'llama-3.1-8b-instant',
    allowedModels: new Set([
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'mixtral-8x7b-32768'
    ])
  },
  {
    // Gemini's free tier is the most generous on the market: 1500 RPD on
    // Flash 2.0, ~10x Groq's free TPM headroom. Their OpenAI-compatible
    // endpoint accepts standard chat-completion bodies and supports
    // streaming, so it slots in as just-another-provider with no custom
    // request shape.
    name: 'gemini-flash',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
    altEnvKey: 'NOVA_GEMINI_API_KEY',
    // gemini-2.0-flash-exp was removed; gemini-2.0-flash is the GA replacement.
    defaultModel: 'gemini-2.0-flash',
    allowedModels: new Set([
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-2.0-flash-exp'
    ])
  },
  {
    name: 'openrouter-free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    altEnvKey: 'NOVA_OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    allowedModels: new Set([
      'meta-llama/llama-3.3-70b-instruct:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'google/gemini-2.0-flash-exp:free',
      'deepseek/deepseek-chat:free'
    ]),
    extraHeaders: () => ({
      'HTTP-Referer': process.env.NOVA_PUBLIC_URL || 'https://nova.app',
      'X-Title': 'Nova'
    })
  },
  {
    name: 'cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    envKey: 'CEREBRAS_API_KEY',
    altEnvKey: 'NOVA_CEREBRAS_API_KEY',
    // Cerebras model ids (verify against your account — availability varies by
    // tier). llama-3.3-70b is the broadly-available default; shouldFallthrough()
    // skips Cerebras on "model not found"/auth errors so it never dead-ends.
    defaultModel: 'llama-3.3-70b',
    allowedModels: new Set(['llama-3.3-70b', 'llama3.1-8b', 'llama-4-scout-17b-16e-instruct', 'qwen-3-32b'])
  }
];

const MAX_TOKENS_CAP = 512;          // Proxy is for chat, not novel-writing.
const RATE_LIMIT = 30;               // Requests...
const RATE_WINDOW_MS = 60 * 60 * 1000; // ...per IP per hour.

// In-memory rate buckets. Survives between requests on a warm instance.
// Cold start wipes it, which is fine — a fresh instance means the user
// effectively gets a small grace allowance.
const rateBuckets = new Map();

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.NOVA_CORS_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRate(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt < now) rateBuckets.delete(k);
    }
  }
  return {
    over: bucket.count > RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - bucket.count),
    resetSeconds: Math.ceil((bucket.resetAt - now) / 1000)
  };
}

function sendJson(res, status, payload, extraHeaders) {
  res.statusCode = status;
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(), ...(extraHeaders || {}) };
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

export function resolveProvider(p, env) {
  // The env param is for tests. In production we ignore anything that
  // isn't a plain env-like object — guards against the classic Array.map
  // gotcha (.map(resolveProvider) calls back with (element, index, array),
  // so without this check `env` becomes the array index and every
  // resolveProvider call returns null because numbers have no env keys).
  const envSource = (env && typeof env === 'object' && !Array.isArray(env)) ? env : process.env;
  // Trim whitespace defensively — keys pasted from web dashboards often
  // carry leading/trailing whitespace or newlines, which silently corrupts
  // the Authorization header into "Bearer  sk-..." (double space) and
  // the provider returns 401. Strip it once at config time.
  const raw = envSource[p.envKey] || envSource[p.altEnvKey];
  const key = raw ? String(raw).trim() : '';
  if (!key) return null;
  return {
    ...p,
    apiKey: key,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(p.extraHeaders ? p.extraHeaders() : {})
    }
  };
}

export function pickModel(provider, requested) {
  // Only honor the client's requested model if THIS provider explicitly
  // recognizes it. Without the allowlist gate, a fallback chain would
  // forward Groq-style IDs (e.g. "llama-3.1-8b-instant") to OpenRouter,
  // which then returns 400 "not a valid model ID" and dead-ends the user.
  if (requested && provider.allowedModels && provider.allowedModels.has(requested)) {
    return requested;
  }
  return provider.defaultModel;
}

// Treats responses as "this provider can't serve this request, try next"
// rather than "fatal client error". Covers rate limits, server errors,
// and model-availability errors (which 4xx surface inconsistently across
// providers — sometimes 400, sometimes 404).
export function shouldFallthrough(status, bodyText) {
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status >= 400 && status < 500 && status !== 401 && status !== 403) {
    if (!bodyText) return false;
    const lower = String(bodyText).toLowerCase();
    if (lower.includes('model') && (lower.includes('not exist') || lower.includes('not found') || lower.includes('invalid') || lower.includes('not a valid') || lower.includes('access') || lower.includes('decommissioned'))) {
      return true;
    }
  }
  return false;
}

export { PROVIDERS };

// Turn the per-provider failure list into a single user-facing error. A rate
// limit (429) is surfaced as its own RATE_LIMITED status so the UI can tell the
// user "you're being throttled, wait or BYOK" instead of a vague outage.
export function summarizeFailure(attempts = [], lastError) {
  const rateLimited = attempts.find(a => a && a.status === 429);
  if (rateLimited) {
    return {
      status: 429,
      retryAfter: 30,
      body: {
        error: {
          message: 'The free AI tier is rate-limited right now (too many requests in a short window). Wait about a minute and try again — or add your own free API key in Settings → Preferences for unlimited use.',
          code: 'RATE_LIMITED',
          attempts,
          lastError
        }
      }
    };
  }
  return {
    status: 502,
    retryAfter: null,
    body: {
      error: {
        message: 'All free-tier AI providers are temporarily unavailable. Bring your own free API key in Settings → Preferences for direct access.',
        code: 'ALL_PROVIDERS_FAILED',
        attempts,
        lastError
      }
    }
  };
}

async function tryProvider(provider, body) {
  const forwardBody = {
    model: pickModel(provider, body.model),
    messages: Array.isArray(body.messages) ? body.messages : [],
    max_tokens: Math.min(Number(body.max_tokens) || 512, MAX_TOKENS_CAP),
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
    stream: body.stream === true
  };
  return fetch(provider.url, {
    method: 'POST',
    headers: provider.headers,
    body: JSON.stringify(forwardBody)
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v);
    res.end();
    return;
  }


  if (req.method !== 'POST') {
    sendJson(res, 405, { error: { message: 'Method not allowed.' } });
    return;
  }

  const ip = clientIp(req);
  const rate = checkRate(ip);
  if (rate.over) {
    sendJson(res, 429, {
      error: {
        message: 'Free-tier rate limit reached for this session. Bring your own API key in Settings → Preferences for unlimited use (Groq is free, no card needed).',
        code: 'RATE_LIMITED_PER_IP'
      }
    }, { 'Retry-After': String(rate.resetSeconds) });
    return;
  }

  const available = PROVIDERS.map(resolveProvider).filter(Boolean);
  if (available.length === 0) {
    sendJson(res, 503, {
      error: {
        message: 'Free-tier proxy is not configured for this deployment. Set GROQ_API_KEY (and optionally OPENROUTER_API_KEY, CEREBRAS_API_KEY) in Vercel environment variables, or bring your own API key in Nova Settings.',
        code: 'PROXY_NOT_CONFIGURED'
      }
    });
    return;
  }

  const body = req.body || {};
  const attempts = [];
  let lastError;
  for (const provider of available) {
    let upstream;
    try {
      upstream = await tryProvider(provider, body);
    } catch (err) {
      lastError = { provider: provider.name, message: err && err.message || 'network error' };
      attempts.push(lastError);
      console.error('[nova-proxy] %s network error: %s', provider.name, lastError.message);
      continue;
    }

    let cachedBody = null;
    if (upstream.status >= 400) {
      try { cachedBody = await upstream.text(); } catch { cachedBody = ''; }
      if (shouldFallthrough(upstream.status, cachedBody)) {
        lastError = { provider: provider.name, status: upstream.status, message: (cachedBody || '').slice(0, 200) };
        attempts.push(lastError);
        console.error('[nova-proxy] %s %d → fallthrough: %s', provider.name, upstream.status, lastError.message);
        continue;
      }
    }

    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('Content-Type');
    if (contentType) res.setHeader('Content-Type', contentType);
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v);
    res.setHeader('X-Nova-Provider', provider.name);
    res.setHeader('X-Nova-Rate-Remaining', String(rate.remaining));

    // 4xx that didn't trigger fallthrough — already read the body above,
    // so just pass the buffered text through. Streaming is reserved for 2xx.
    if (cachedBody !== null) {
      res.end(cachedBody);
      return;
    }
    if (!upstream.body) {
      res.end(await upstream.text());
      return;
    }

    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
    return;
  }

  // All providers failed — surface the real reason (rate limit vs outage).
  console.error('[nova-proxy] all providers failed:', JSON.stringify(attempts));
  const fail = summarizeFailure(attempts, lastError);
  sendJson(res, fail.status, fail.body, fail.retryAfter ? { 'Retry-After': String(fail.retryAfter) } : undefined);
}
