// Phase 10: server-side feedback handler — receives a session's worth of
// plan-mode refusals from the browser and opens ONE summary GitHub issue
// on the maintainer's repo. Token lives in the function's env (never
// reaches the browser), so even users who can read the source can't
// abuse the GH API.
//
// Expected env:
//   FEEDBACK_GITHUB_TOKEN   — fine-grained PAT with `issues: write` scope
//   FEEDBACK_GITHUB_REPO    — "owner/repo" (default: emrullah-yildiz/nova)
//   FEEDBACK_RATE_LIMIT     — requests per IP per hour (default: 6)
//   NOVA_CORS_ORIGIN        — optional CORS allow-origin
//
// Expected payload (POST):
//   {
//     "sessionId": "<random short id, not user-identifying>",
//     "refusals": [
//       { "prompt": "...", "reason": "...", "suggestions": ["..."],
//         "aiProvider": "openai", "aiModel": "gpt-4o",
//         "timestamp": "2026-...Z" }
//     ],
//     "context": { "novaVersion": "0.1.0", "userAgent": "..." }
//   }
//
// Returns { ok, issueUrl, issueNumber } on success or { ok: false, error }.

const DEFAULT_REPO = 'emrullah-yildiz/nova';
const DEFAULT_RATE_LIMIT = 6;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_REFUSALS = 50;
const MAX_PROMPT_LEN = 2000;
const MAX_REASON_LEN = 2000;
const MAX_BODY_LEN = 50_000; // GitHub caps issue bodies around 65k

const rateBuckets = new Map();

function corsHeaders(env = process.env) {
  return {
    'Access-Control-Allow-Origin': env.NOVA_CORS_ORIGIN || '*',
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
  const limit = Number(process.env.FEEDBACK_RATE_LIMIT) || DEFAULT_RATE_LIMIT;
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 2000) {
    for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
  }
  return { over: bucket.count > limit, remaining: Math.max(0, limit - bucket.count) };
}

function sendJson(res, status, payload, env = process.env) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ 'Content-Type': 'application/json', ...corsHeaders(env) })) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(payload));
}

function clip(text, max) {
  if (typeof text !== 'string') return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// Validates and normalises the payload. Drops anything that could cause
// the GitHub body to overflow or carry oversized strings.
export function validatePayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'payload must be an object' };
  const refusals = Array.isArray(body.refusals) ? body.refusals : [];
  if (refusals.length === 0) return { ok: false, error: 'refusals must be a non-empty array' };
  if (refusals.length > MAX_REFUSALS) return { ok: false, error: 'too many refusals (' + refusals.length + ' > ' + MAX_REFUSALS + ')' };
  const normalized = refusals.map((r) => ({
    prompt: clip(r && r.prompt, MAX_PROMPT_LEN),
    reason: clip(r && r.reason, MAX_REASON_LEN),
    suggestions: Array.isArray(r && r.suggestions) ? r.suggestions.slice(0, 6).map((s) => clip(String(s), 300)) : [],
    aiProvider: clip(r && r.aiProvider, 64),
    aiModel: clip(r && r.aiModel, 128),
    timestamp: clip(r && r.timestamp, 64)
  })).filter((r) => r.prompt && r.reason);
  if (normalized.length === 0) return { ok: false, error: 'no refusals had both a prompt and a reason' };
  return {
    ok: true,
    sessionId: clip(body.sessionId, 64) || 'no-session',
    refusals: normalized,
    context: {
      novaVersion: clip(body.context && body.context.novaVersion, 64),
      userAgent: clip(body.context && body.context.userAgent, 256)
    }
  };
}

// Builds the Markdown body for the summary issue. Stable section headings
// so the maintainer (and any future analytics) can grep.
export function buildIssueBody(payload) {
  const lines = [];
  lines.push('## Session refusals (' + payload.refusals.length + ')');
  lines.push('');
  lines.push('Nova\'s AI refused these prompts because no existing composite node satisfied them. Each block can become a separate composite-request triage item.');
  lines.push('');
  payload.refusals.forEach((r, i) => {
    lines.push('### ' + (i + 1) + '. ' + (r.prompt.split('\n')[0].slice(0, 80) || '(empty)'));
    lines.push('');
    lines.push('**Prompt:**');
    lines.push('> ' + r.prompt.replace(/\n/g, '\n> '));
    lines.push('');
    lines.push('**Reason:** ' + r.reason);
    if (r.suggestions.length) {
      lines.push('');
      lines.push('**AI suggestions:**');
      for (const s of r.suggestions) lines.push('- ' + s);
    }
    lines.push('');
    if (r.aiModel) lines.push('_AI: ' + (r.aiProvider || 'unknown') + ' / ' + r.aiModel + ' • ' + r.timestamp + '_');
    lines.push('');
  });
  lines.push('## Context');
  lines.push('');
  if (payload.context.novaVersion) lines.push('- **Nova version:** ' + payload.context.novaVersion);
  if (payload.context.userAgent) lines.push('- **User agent:** ' + payload.context.userAgent);
  lines.push('- **Session id:** `' + payload.sessionId + '`');
  lines.push('');
  lines.push('---');
  lines.push('🤖 _Auto-submitted by Nova on session close. The user opted in to share refusals to help prioritise new composite nodes._');
  const body = lines.join('\n');
  return body.length > MAX_BODY_LEN ? body.slice(0, MAX_BODY_LEN) + '\n\n_(body truncated)_' : body;
}

function buildIssueTitle(payload) {
  const first = payload.refusals[0];
  const head = first.prompt.split('\n')[0].slice(0, 70);
  const more = payload.refusals.length > 1 ? ' (+' + (payload.refusals.length - 1) + ' more)' : '';
  return '[Auto-Feedback] ' + head + more;
}

async function createIssue(payload, token, repo) {
  const url = 'https://api.github.com/repos/' + repo + '/issues';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'nova-feedback-bot'
    },
    body: JSON.stringify({
      title: buildIssueTitle(payload),
      body: buildIssueBody(payload),
      labels: ['composite-request', 'ai-feedback', 'auto-submitted']
    })
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: errBody.slice(0, 500) };
  }
  const data = await res.json();
  return { ok: true, issueUrl: data.html_url, issueNumber: data.number };
}

export async function onRequestOptions(env = process.env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function jsonResponse(status, payload, env) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
  });
}

export async function handleFeedbackRequest(request, env = process.env) {
  if (request.method === 'OPTIONS') return onRequestOptions(env);
  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method not allowed' }, env);
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const rate = checkRate(ip);
  if (rate.over) {
    return jsonResponse(429, { ok: false, error: 'rate limit reached for this IP - try again later' }, env);
  }

  const token = env.FEEDBACK_GITHUB_TOKEN;
  const repo = env.FEEDBACK_GITHUB_REPO || DEFAULT_REPO;
  if (!token) {
    return jsonResponse(503, { ok: false, error: 'feedback not configured: FEEDBACK_GITHUB_TOKEN missing' }, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid JSON body' }, env);
  }

  const valid = validatePayload(body);
  if (!valid.ok) {
    return jsonResponse(400, { ok: false, error: valid.error }, env);
  }

  try {
    const result = await createIssue(valid, token, repo);
    if (!result.ok) {
      console.error('[nova-feedback] github error', result.status, result.error);
      return jsonResponse(502, { ok: false, error: 'github rejected the submission', upstreamStatus: result.status }, env);
    }
    return jsonResponse(201, { ok: true, issueUrl: result.issueUrl, issueNumber: result.issueNumber }, env);
  } catch (err) {
    console.error('[nova-feedback] network error', err && err.message);
    return jsonResponse(502, { ok: false, error: 'network error talking to github' }, env);
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  const ip = clientIp(req);
  const rate = checkRate(ip);
  if (rate.over) {
    sendJson(res, 429, { ok: false, error: 'rate limit reached for this IP — try again later' });
    return;
  }

  const token = process.env.FEEDBACK_GITHUB_TOKEN;
  const repo = process.env.FEEDBACK_GITHUB_REPO || DEFAULT_REPO;
  if (!token) {
    sendJson(res, 503, { ok: false, error: 'feedback not configured: FEEDBACK_GITHUB_TOKEN missing' });
    return;
  }

  const body = req.body || {};
  const valid = validatePayload(body);
  if (!valid.ok) {
    sendJson(res, 400, { ok: false, error: valid.error });
    return;
  }

  try {
    const result = await createIssue(valid, token, repo);
    if (!result.ok) {
      console.error('[nova-feedback] github error', result.status, result.error);
      sendJson(res, 502, { ok: false, error: 'github rejected the submission', upstreamStatus: result.status });
      return;
    }
    sendJson(res, 201, { ok: true, issueUrl: result.issueUrl, issueNumber: result.issueNumber });
  } catch (err) {
    console.error('[nova-feedback] network error', err && err.message);
    sendJson(res, 502, { ok: false, error: 'network error talking to github' });
  }
}
