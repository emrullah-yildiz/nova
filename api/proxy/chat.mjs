const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function setCorsHeaders(req, res) {
  const origin = process.env.NOVA_CORS_ORIGIN || req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: { message: 'Method not allowed.' } });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.NOVA_GROQ_API_KEY;
  if (!apiKey) {
    sendJson(res, 503, {
      error: {
        message:
          'Free-tier proxy is not configured for this deployment. Set GROQ_API_KEY or NOVA_GROQ_API_KEY in Vercel environment variables, or bring your own API key in Nova Settings.',
        code: 'PROXY_NOT_CONFIGURED'
      }
    });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body || {})
    });
  } catch (err) {
    sendJson(res, 502, {
      error: {
        message: 'Upstream Groq request failed: ' + (err && err.message || 'network error')
      }
    });
    return;
  }

  res.statusCode = upstream.status;
  const contentType = upstream.headers.get('Content-Type');
  if (contentType) res.setHeader('Content-Type', contentType);

  if (!upstream.body) {
    res.end(await upstream.text());
    return;
  }

  for await (const chunk of upstream.body) {
    res.write(chunk);
  }
  res.end();
}
