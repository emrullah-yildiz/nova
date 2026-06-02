// Pure helpers for auto-filing unhandled app errors as bug tickets. The app-side
// installer (app/auto-bug-reporter.js) owns the listeners, gating, and the actual
// submitTicket() call; this module just decides what's reportable, fingerprints
// errors for dedup, and formats the GitHub-issue payload. Pure + unit-testable.

// Stable fingerprint for dedup: normalized message + first source frame, with
// line/col and origin stripped so the same bug from different builds collapses.
export function errorFingerprint(message, stack) {
  const msg = String(message || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  let frame = '';
  if (typeof stack === 'string' && stack) {
    const lines = stack.split('\n').map((s) => s.trim()).filter(Boolean);
    const f = lines.find((l) => /\.(m?[jt]s):\d+/.test(l)) || lines[1] || lines[0] || '';
    frame = f.replace(/:\d+:\d+/g, '').replace(/https?:\/\/[^/]+/g, '').slice(0, 200);
  }
  return (msg + '|' + frame).toLowerCase();
}

// Skip noise: empty messages and cross-origin "Script error." with no stack
// carry nothing actionable, so they should never become a ticket.
export function isReportableError(message, stack) {
  const m = String(message || '').trim();
  if (!m) return false;
  if (/^script error\.?$/i.test(m) && !stack) return false;
  return true;
}

// Builds the { title, body, category:'bug' } payload for submitTicket(). The
// server attaches the verified reporter identity, so we only include technical
// context here (message, location, stack, environment) — no extra PII.
export function buildBugTicket(err, context = {}) {
  const message = String((err && err.message) || 'Unknown error').trim();
  const title = message.slice(0, 120);
  const loc = (err && (err.filename || err.source))
    ? `${err.filename || err.source}:${err.lineno != null ? err.lineno : '?'}:${err.colno != null ? err.colno : '?'}`
    : '';
  const stack = String((err && err.stack) || '').split('\n').slice(0, 12).join('\n').slice(0, 2000);

  const lines = ['**Auto-captured unhandled error.**', '', '**Message:** ' + message];
  if (loc) lines.push('**Location:** `' + loc + '`');
  if (context.url) lines.push('**URL:** ' + context.url);
  if (context.route) lines.push('**Page:** ' + context.route);
  if (typeof context.nodeCount === 'number') lines.push('**Graph:** ' + context.nodeCount + ' nodes');
  if (context.novaVersion) lines.push('**Version:** ' + context.novaVersion);
  if (context.userAgent) lines.push('**User agent:** ' + context.userAgent);
  if (stack) lines.push('', '**Stack:**', '```', stack, '```');
  lines.push('', '_Filed automatically by Nova when an unhandled error occurred._');

  return { title: title || 'Unhandled error', body: lines.join('\n'), category: 'bug' };
}
