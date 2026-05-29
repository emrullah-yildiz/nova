// Cloudflare Pages Function for Nova's free-tier AI proxy.
//
// Browser requests arrive as OpenAI-shaped chat completion payloads. This
// function forwards them to Groq with the server-side GROQ_API_KEY so the key
// never reaches the client.

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    return json(503, {
      error: {
        message:
          'Free-tier proxy is not configured for this deployment. Set GROQ_API_KEY in Cloudflare Pages environment variables, or bring your own API key in Nova Settings.',
        code: 'PROXY_NOT_CONFIGURED'
      }
    });
  }

  let body;
  try {
    body = await request.text();
    if (!body) throw new Error('empty body');
  } catch (err) {
    return json(400, { error: { message: 'Empty or unreadable request body.' } });
  }

  let upstream;
  try {
    upstream = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body
    });
  } catch (err) {
    return json(502, { error: { message: 'Upstream Groq request failed: ' + (err && err.message || 'network error') } });
  }

  const respHeaders = new Headers(CORS_HEADERS);
  const ct = upstream.headers.get('Content-Type');
  if (ct) respHeaders.set('Content-Type', ct);
  respHeaders.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders
  });
}
