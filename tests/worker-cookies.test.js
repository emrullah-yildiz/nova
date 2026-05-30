import { describe, it, expect } from 'vitest';
import { serializeSessionCookie, clearSessionCookie, parseCookie, SESSION_COOKIE_NAME } from '../worker/cookies.mjs';

describe('session cookie helpers', () => {
  it('serializes an httpOnly, secure, lax session cookie with max-age', () => {
    const c = serializeSessionCookie('abc.def', 3600);
    expect(c).toContain(SESSION_COOKIE_NAME + '=abc.def');
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Max-Age=3600/);
    expect(c).toMatch(/Path=\//);
  });

  it('clear cookie expires immediately', () => {
    expect(clearSessionCookie()).toMatch(/Max-Age=0/);
  });

  it('parses the session token out of a Cookie header', () => {
    expect(parseCookie('foo=1; nova_session=abc.def; bar=2')).toBe('abc.def');
    expect(parseCookie('nova_session=onlyone')).toBe('onlyone');
    expect(parseCookie('other=1')).toBe('');
    expect(parseCookie('')).toBe('');
    expect(parseCookie(null)).toBe('');
  });
});
