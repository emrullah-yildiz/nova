import { describe, it, expect } from 'vitest';
import { securityHeaders, applySecurity } from '../worker/security-headers.mjs';

// SEC-015 — HSTS (Strict-Transport-Security) on production Worker responses.
// Production enables it via NOVA_HSTS=1 (wrangler.toml [vars]); dev/preview leave
// it off. These tests pin the directive and prove dev/default omits it, so a
// regression that drops HSTS in prod — or accidentally pins HTTP dev — is caught.

describe('SEC-015 HSTS', () => {
  it('emits Strict-Transport-Security with the expected directives when { hsts: true }', () => {
    const sts = securityHeaders({ hsts: true }).get('Strict-Transport-Security');
    expect(sts).toBe('max-age=63072000; includeSubDomains');
    // 2 years, the recommended long max-age for an established HTTPS site.
    expect(sts).toMatch(/max-age=63072000/);
    expect(sts).toContain('includeSubDomains');
    // Deliberately NO preload — opting into the browser preload list is a
    // near-irreversible commitment we don't want to bake in here.
    expect(sts).not.toContain('preload');
  });

  it('omits Strict-Transport-Security by default and with { hsts: false } (dev/preview not pinned)', () => {
    expect(securityHeaders().get('Strict-Transport-Security')).toBeNull();
    expect(securityHeaders({ hsts: false }).get('Strict-Transport-Security')).toBeNull();
  });

  it('honours an explicit hstsMaxAge override but still without preload', () => {
    const sts = securityHeaders({ hsts: true, hstsMaxAge: 31536000 }).get('Strict-Transport-Security');
    expect(sts).toBe('max-age=31536000; includeSubDomains');
  });

  it('applySecurity adds HSTS to a prod response and never duplicates the hardening headers', async () => {
    const original = new Response('<!DOCTYPE html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
    const prod = applySecurity(original, { hsts: true });
    // HSTS present on the merged prod response...
    expect(prod.headers.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains');
    // ...alongside the SEC-010 hardening headers, exactly once each (Headers.set
    // overwrites, so a single value confirms no duplication).
    expect(prod.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(prod.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(prod.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    // Asset body/status untouched.
    expect(prod.status).toBe(200);
    expect(await prod.text()).toContain('<!DOCTYPE html>');
  });

  it('applySecurity without hsts (dev) carries the SEC-010 headers but no HSTS', () => {
    const dev = applySecurity(new Response('x', { status: 200 }), { hsts: false });
    expect(dev.headers.get('Strict-Transport-Security')).toBeNull();
    expect(dev.headers.get('X-Content-Type-Options')).toBe('nosniff'); // SEC-010 still applies
  });
});
