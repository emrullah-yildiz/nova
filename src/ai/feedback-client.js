// Phase 10: browser-side feedback client.
//
// Holds the user's auto-submit consent (decided once, remembered in
// localStorage) and accumulates plan-mode refusals during a session.
// When the page unloads we flush the buffer to /api/feedback/refusals
// via navigator.sendBeacon — the server function holds the GitHub
// token and creates one summary issue.
//
// State machine:
//
//   no decision yet      ─► first refusal shows consent dialog
//   consent: 'auto'      ─► every refusal queued, flushed on unload
//   consent: 'manual'    ─► no auto-submit; user uses the per-refusal
//                            "Request on GitHub" button from Phase 9
//   consent: 'never'     ─► no auto-submit, no inline button either
//
// Privacy: only the user's prompt, AI reason, AI suggestions, and the
// AI provider/model name are sent. No chat history, no system prompt,
// no IP (the server reads it from headers but never embeds in the
// issue body), no user identity.

const CONSENT_KEY = 'nova:refusal-consent';
const ENDPOINT_PATH = '/api/feedback/refusals';

let sessionBuffer = [];
let sessionId = null;
let unloadHookInstalled = false;

function ensureSessionId() {
  if (sessionId) return sessionId;
  // Short, non-correlatable random id. Not persistent — every page load
  // is a new session from the server's perspective.
  sessionId = 'ses_' + Math.random().toString(36).slice(2, 10);
  return sessionId;
}

export function getConsent() {
  try {
    const v = (typeof localStorage !== 'undefined') ? localStorage.getItem(CONSENT_KEY) : null;
    if (v === 'auto' || v === 'manual' || v === 'never') return v;
    return null;
  } catch {
    return null;
  }
}

export function setConsent(value) {
  if (value !== 'auto' && value !== 'manual' && value !== 'never') return;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // localStorage may be disabled — degrade gracefully, no throw.
  }
}

export function clearConsent() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CONSENT_KEY);
  } catch { /* ignore */ }
}

// Adds a refusal to the in-memory session buffer. Returns the buffer
// size so the caller can update any UI counter. Returns 0 if consent
// is anything other than 'auto' — we don't accumulate what we won't
// send.
export function queueRefusal(refusal) {
  if (getConsent() !== 'auto') return 0;
  if (!refusal || typeof refusal !== 'object') return sessionBuffer.length;
  sessionBuffer.push({
    prompt: String(refusal.prompt || ''),
    reason: String(refusal.reason || ''),
    suggestions: Array.isArray(refusal.suggestions) ? refusal.suggestions.slice(0, 6).map(String) : [],
    aiProvider: refusal.aiProvider ? String(refusal.aiProvider) : '',
    aiModel: refusal.aiModel ? String(refusal.aiModel) : '',
    timestamp: refusal.timestamp || new Date().toISOString()
  });
  ensureUnloadHook();
  return sessionBuffer.length;
}

export function peekBuffer() {
  return sessionBuffer.slice();
}

export function clearBuffer() {
  sessionBuffer = [];
}

// Builds the payload we POST. Exported so the integration layer can show
// a "preview" of what will be sent if it wants to.
export function buildPayload(extraContext) {
  return {
    sessionId: ensureSessionId(),
    refusals: sessionBuffer.slice(),
    context: {
      novaVersion: (extraContext && extraContext.novaVersion) || (typeof window !== 'undefined' && window.NOVA_VERSION) || '',
      userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || ''
    }
  };
}

// Sends the buffer to the server. Uses sendBeacon when called from a
// page-unload context (no async, fire-and-forget); falls back to fetch
// for normal in-page calls so the integration layer can await the
// result and surface an issue URL toast.
export function flushSession(opts) {
  if (sessionBuffer.length === 0) return Promise.resolve({ ok: true, empty: true });
  const useBeacon = !!(opts && opts.useBeacon) && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function';
  const payload = buildPayload(opts && opts.extraContext);
  const body = JSON.stringify(payload);
  if (useBeacon) {
    try {
      const blob = (typeof Blob !== 'undefined') ? new Blob([body], { type: 'application/json' }) : body;
      const ok = navigator.sendBeacon(ENDPOINT_PATH, blob);
      // Beacon is fire-and-forget; clear the buffer so retries don't
      // duplicate if the page somehow stays open.
      if (ok) clearBuffer();
      return Promise.resolve({ ok, beacon: true });
    } catch (err) {
      return Promise.resolve({ ok: false, error: err && err.message });
    }
  }
  // Foreground fetch path.
  return fetch(ENDPOINT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  }).then((res) => res.json().then((json) => ({ ok: !!json.ok, status: res.status, ...json }))
    .catch(() => ({ ok: res.ok, status: res.status }))
  ).then((result) => {
    if (result.ok) clearBuffer();
    return result;
  }).catch((err) => ({ ok: false, error: err && err.message }));
}

// Installs page-unload / page-hide listeners exactly once per session.
// Listens for both because mobile browsers don't reliably fire
// beforeunload but do fire visibilitychange/pagehide.
function ensureUnloadHook() {
  if (unloadHookInstalled || typeof window === 'undefined') return;
  unloadHookInstalled = true;
  const flush = () => { flushSession({ useBeacon: true }); };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
}

// Test seam — lets unit tests reset all module-level state.
export function _resetClientForTests() {
  sessionBuffer = [];
  sessionId = null;
  unloadHookInstalled = false;
}
