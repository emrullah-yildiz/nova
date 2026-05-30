import { describe, it, expect } from 'vitest';
import {
  serializeSessionCookie, clearSessionCookie, parseCookie, SESSION_COOKIE_NAME,
  serializeSlotCookie, clearSlotCookie, serializeActivePointer, clearActivePointer,
  parseAllSlots, parseActiveSlot, clampSlot, ACTIVE_SLOT_COOKIE, MAX_ACCOUNT_SLOTS
} from '../worker/cookies.mjs';

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

describe('multi-account slot cookies', () => {
  it('slot cookie is httpOnly; the active pointer is NOT', () => {
    const slot = serializeSlotCookie(2, 'tok', 3600);
    expect(slot).toContain('nova_session_2=tok');
    expect(slot).toMatch(/HttpOnly/);
    expect(slot).toMatch(/Secure/);
    expect(slot).toMatch(/SameSite=Lax/);
    const ptr = serializeActivePointer(2, 3600);
    expect(ptr).toContain(ACTIVE_SLOT_COOKIE + '=2');
    expect(ptr).not.toMatch(/HttpOnly/); // readable by JS — it's just an index
    expect(ptr).toMatch(/Secure/);
  });

  it('clamps the slot index — rejects non-numeric, negative, and over-cap', () => {
    expect(clampSlot(0)).toBe(0);
    expect(clampSlot('3')).toBe(3);
    expect(clampSlot(MAX_ACCOUNT_SLOTS)).toBeNull();   // out of range (cap is exclusive)
    expect(clampSlot(-1)).toBeNull();
    expect(clampSlot('x')).toBeNull();
    expect(clampSlot(1.5)).toBeNull();
    // serialize/clear refuse invalid slots
    expect(serializeSlotCookie(99, 'tok')).toBe('');
    expect(clearSlotCookie('x')).toBe('');
  });

  it('parses all slot cookies and the active pointer, ignoring junk slot names', () => {
    const header = 'a=1; nova_session_0=tokA; nova_session_1=tokB; nova_active=1; nova_session_x=bad; nova_session_99=bad; nova_session=legacy';
    expect(parseAllSlots(header)).toEqual({ 0: 'tokA', 1: 'tokB' }); // x and 99 ignored
    expect(parseActiveSlot(header)).toBe(1);
    expect(parseActiveSlot('nova_active=9')).toBeNull(); // out of range → null
    expect(parseActiveSlot('no=pointer')).toBeNull();
    // legacy single cookie still parseable for migration
    expect(parseCookie(header)).toBe('legacy');
  });

  it('clear helpers expire immediately', () => {
    expect(clearSlotCookie(0)).toMatch(/nova_session_0=; .*Max-Age=0/);
    expect(clearActivePointer()).toMatch(/nova_active=; .*Max-Age=0/);
  });
});
