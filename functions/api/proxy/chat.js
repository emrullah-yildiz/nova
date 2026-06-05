// Cloudflare Pages Function — free-tier AI proxy.
//
// Nova's browser code POSTs an OpenAI-shaped chat completion request here
// when the user has not configured their own API key. We forward it to
// Groq's free tier (server-side `GROQ_API_KEY`), then pipe the streamed
// response straight back to the client. The key never reaches the browser.
//
// Setup (one-time):
//   - Cloudflare dashboard → Pages → nova → Settings → Environment
//     variables → add `GROQ_API_KEY` for Production and Preview.
//   - Recommended: WAF → Rate limiting rules → block /api/proxy/* over
//     20 req/min per IP so one user can't burn the entire free tier.
//
// Behaviour:
//   - 503 with a clear message when GROQ_API_KEY is not set.
//   - 429 from Groq is forwarded verbatim so the client can show its own
//     rate-limit message and prompt for BYOK.
//   - Any other upstream error is surfaced with the original status code.

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

  // Re-emit the body. We intentionally do not parse-and-rebuild — the
  // OpenAI-shaped payload from gpt-client.js is forwarded as-is so future
  // additions (tool_calls, response_format, ...) work without changes here.
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

  // Stream the response straight through. Groq returns Server-Sent Events
  // when `stream: true` was set; for non-streaming the body is plain JSON.
  // Either way ReadableStream pipe-through is correct.
  const respHeaders = new Headers(CORS_HEADERS);
  const ct = upstream.headers.get('Content-Type');
  if (ct) respHeaders.set('Content-Type', ct);
  respHeaders.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders
  });
}
