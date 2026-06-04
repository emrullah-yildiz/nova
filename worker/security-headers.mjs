// Security response headers for Nova's static SPA / asset responses (SEC-010).
//
// `securityHeaders(opts)` returns a `Headers` object carrying a
// Content-Security-Policy and the standard hardening headers. `applySecurity`
// clones an existing Response and merges these headers onto it (so we keep the
// ASSETS binding's Content-Type, ETag, caching, body, and status untouched).
//
// Design note — this is the single extension point for header hardening:
//  - SEC-010 (this ticket): CSP, X-Content-Type-Options, Referrer-Policy,
//    X-Frame-Options + frame-ancestors.
//  - SEC-015 (later): HSTS. The `{ hsts }` option is a wired stub below — set
//    `hsts: true` (prod, behind HTTPS) to emit Strict-Transport-Security
//    without touching the CSP or call sites.

// AI provider origins the BYOK client (src/ai/gpt-client.js) talks to directly
// from the browser, plus the app's own origin ('self' covers /api on-origin).
// connect-src must allow these or BYOK chat/streaming breaks.
const AI_CONNECT_ORIGINS = [
  'https://api.openai.com',
  'https://api.groq.com',
  'https://generativelanguage.googleapis.com', // Google Gemini
  'https://api.anthropic.com',
  'https://openrouter.ai'
];

// Third-party SCRIPT origins index.html legitimately loads (three.js + addons).
// Kept tight: only these CDNs, never a blanket https:.
const SCRIPT_CDN_ORIGINS = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net'
];

// Build the Content-Security-Policy.
//
// Residual compromise (documented, SEC-010): index.html ships dozens of inline
// event handlers (onclick=, oninput=, onkeydown=, …) and inline style="" attrs,
// so script-src and style-src must include 'unsafe-inline'. We cannot use a
// nonce/hash strategy without rewriting the markup, and 'unsafe-inline' is
// ignored by browsers when a nonce/hash is present, so mixing them buys nothing
// here. We still block the highest-value vectors: object-src 'none' (no Flash/
// plugin script), base-uri 'self' (no <base> hijack), frame-ancestors 'none'
// (clickjacking), no 'unsafe-eval', and a tight allow-list for 3rd-party
// script/connect origins — so arbitrary EXTERNAL script injection and framing
// are blocked even though same-origin inline handlers are permitted.
export function contentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' required for index.html's inline event handlers (residual).
    // No 'unsafe-eval'. CDN origins for three.js + OrbitControls/GLTFLoader.
    `script-src 'self' 'unsafe-inline' ${SCRIPT_CDN_ORIGINS.join(' ')}`,
    // 'unsafe-inline' required for inline style="" attributes; Google Fonts CSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src \'self\' https://fonts.gstatic.com',
    // data:/blob: cover chat image thumbnails and viewer textures.
    "img-src 'self' data: blob:",
    // Same-origin /api + the BYOK AI providers (direct browser calls).
    `connect-src 'self' ${AI_CONNECT_ORIGINS.join(' ')}`,
    // Hard locks.
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ];
  return directives.join('; ');
}

// Returns a Headers object with Nova's security headers.
// opts.hsts (boolean) — SEC-015 extension point; emits Strict-Transport-Security
//   when true. Default false so dev/preview over plain HTTP isn't pinned.
// opts.hstsMaxAge (number, seconds) — override the default HSTS max-age.
export function securityHeaders(opts = {}) {
  const headers = new Headers();
  headers.set('Content-Security-Policy', contentSecurityPolicy());
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Legacy clickjacking header (frame-ancestors is the modern equivalent;
  // X-Frame-Options covers older browsers that ignore CSP framing).
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  if (opts.hsts) {
    const maxAge = Number.isFinite(opts.hstsMaxAge) ? opts.hstsMaxAge : 63072000; // 2y
    headers.set('Strict-Transport-Security', `max-age=${maxAge}; includeSubDomains; preload`);
  }
  return headers;
}

// Clones `response`, merging the security headers on top of its existing headers
// (preserving Content-Type / caching / body / status from the ASSETS binding).
// Safe to call on any Response; returns a new Response.
export function applySecurity(response, opts = {}) {
  const merged = new Headers(response.headers);
  const sec = securityHeaders(opts);
  for (const [name, value] of sec.entries()) merged.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged
  });
}
