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
