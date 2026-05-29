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
    name: 'openrouter-free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    altEnvKey: 'NOVA_OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    allowedModels: null,
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
    defaultModel: 'llama-3.3-70b',
    allowedModels: new Set(['llama-3.3-70b', 'llama3.1-8b'])
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

function resolveProvider(p) {
  const key = process.env[p.envKey] || process.env[p.altEnvKey];
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

function pickModel(provider, requested) {
  if (requested && provider.allowedModels === null) return requested;
  if (requested && provider.allowedModels && provider.allowedModels.has(requested)) return requested;
  return provider.defaultModel;
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
  let lastError;
  for (const provider of available) {
    let upstream;
    try {
      upstream = await tryProvider(provider, body);
    } catch (err) {
      lastError = { provider: provider.name, message: err && err.message || 'network error' };
      continue;
    }

    if (upstream.status === 429 || upstream.status >= 500) {
      lastError = { provider: provider.name, message: 'upstream ' + upstream.status };
      // Drain the body so the connection doesn't hang
      try { await upstream.text(); } catch { /* ignore */ }
      continue;
    }

    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('Content-Type');
    if (contentType) res.setHeader('Content-Type', contentType);
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v);
    res.setHeader('X-Nova-Provider', provider.name);
    res.setHeader('X-Nova-Rate-Remaining', String(rate.remaining));

    if (!upstream.body) {
      res.end(await upstream.text());
      return;
    }

    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
    return;
  }

  // All providers failed.
  sendJson(res, 502, {
    error: {
      message: 'All free-tier providers are temporarily unavailable. Bring your own API key in Settings → Preferences for direct access.',
      code: 'ALL_PROVIDERS_FAILED',
      lastError
    }
  });
}
