// Session cookie helpers for the Worker. The session token is stored in an
// httpOnly cookie (not localStorage) so page JS can't read it (XSS-resistant).
// Same-origin (the Worker serves SPA + API), so SameSite=Lax is fine.

export const SESSION_COOKIE_NAME = 'nova_session';

export function serializeSessionCookie(token, maxAgeSeconds = 8 * 60 * 60) {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function parseCookie(header, name = SESSION_COOKIE_NAME) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return '';
}

// ── Multi-account: indexed session cookies + a readable active-slot pointer ──
// Each signed-in account gets `nova_session_<slot>` (httpOnly). `nova_active`
// holds the active slot index — readable (not a secret); a forged value just
// points at a missing httpOnly token → unauthenticated, no escalation. The
// legacy single `nova_session` is still read as a fallback and migrated away.
export const ACTIVE_SLOT_COOKIE = 'nova_active';
export const MAX_ACCOUNT_SLOTS = 5;
const SLOT_PREFIX = 'nova_session_';
const COOKIE_ATTRS = 'Path=/; Secure; SameSite=Lax';

// Returns an integer slot in [0, MAX) or null for anything invalid/out-of-range.
export function clampSlot(value) {
  // Reject empty/missing explicitly — Number('') is 0, which would wrongly
  // resolve a missing pointer to slot 0.
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < MAX_ACCOUNT_SLOTS ? n : null;
}

export function serializeSlotCookie(slot, token, maxAgeSeconds = 8 * 60 * 60) {
  const s = clampSlot(slot);
  if (s === null) return '';
  return `${SLOT_PREFIX}${s}=${token}; ${COOKIE_ATTRS}; HttpOnly; Max-Age=${maxAgeSeconds}`;
}

export function clearSlotCookie(slot) {
  const s = clampSlot(slot);
  if (s === null) return '';
  return `${SLOT_PREFIX}${s}=; ${COOKIE_ATTRS}; HttpOnly; Max-Age=0`;
}

// Readable (no HttpOnly) — just the active slot index.
export function serializeActivePointer(slot, maxAgeSeconds = 8 * 60 * 60) {
  const s = clampSlot(slot);
  if (s === null) return '';
  return `${ACTIVE_SLOT_COOKIE}=${s}; ${COOKIE_ATTRS}; Max-Age=${maxAgeSeconds}`;
}

export function clearActivePointer() {
  return `${ACTIVE_SLOT_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`;
}

// Parse all `nova_session_<n>` cookies → { [slot:int]: token }. Ignores
// out-of-range / non-numeric slot names.
export function parseAllSlots(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (!name.startsWith(SLOT_PREFIX)) continue;
    const slot = clampSlot(name.slice(SLOT_PREFIX.length));
    if (slot === null) continue;
    out[slot] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function parseActiveSlot(header) {
  return clampSlot(parseCookie(header, ACTIVE_SLOT_COOKIE));
}
