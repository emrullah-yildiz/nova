import { describe, it, expect } from 'vitest';
import {
  securityHeaders,
  contentSecurityPolicy,
  applySecurity
} from '../worker/security-headers.mjs';
import { app } from '../src/app/app.js';

// SEC-010 — Content-Security-Policy + hardening headers on SPA/asset responses,
// and confirmation that the AI/user-content render sink escapes markup.

describe('SEC-010 security headers', () => {
  it('emits a CSP that blocks 3rd-party script and clickjacking', () => {
    const headers = securityHeaders();
    const csp = headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    // Clickjacking + base-uri + object hard locks.
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    // script-src is self + the explicit three.js CDNs only — no blanket https:.
    expect(csp).toMatch(/script-src [^;]*'self'/);
    expect(csp).not.toMatch(/script-src [^;]*\bhttps:(?!\/\/)/); // no bare https: token
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('sets nosniff, Referrer-Policy, and X-Frame-Options', () => {
    const headers = securityHeaders();
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('allows the AI provider origins in connect-src (BYOK must keep working)', () => {
    const csp = contentSecurityPolicy();
    const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
    expect(connect).toBeTruthy();
    for (const origin of [
      'https://api.groq.com',
      'https://generativelanguage.googleapis.com',
      'https://api.anthropic.com',
      'https://openrouter.ai',
      'https://api.openai.com'
    ]) {
      expect(connect).toContain(origin);
    }
    expect(connect).toContain("'self'");
  });

  it('allows the Nova Connect / Revit hub WebSocket in connect-src (live integration must keep working)', () => {
    const csp = contentSecurityPolicy();
    const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
    expect(connect).toBeTruthy();
    // Default hub is ws://127.0.0.1:8765 (runtime-config.js), user-configurable to
    // localhost; remote hubs use wss:. All three must be allowed or the browser
    // blocks new WebSocket(url) in src/integrations/connect/client.js.
    expect(connect).toContain('ws://127.0.0.1:*');
    expect(connect).toContain('ws://localhost:*');
    expect(connect).toContain('wss:');
    // The same-origin collab WebSocket stays covered by 'self' (not regressed).
    expect(connect).toContain("'self'");
  });

  it("allows the app's own assets, fonts, and the three.js CDNs (does not block itself)", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain('https://fonts.googleapis.com'); // Google Fonts CSS
    expect(csp).toContain('https://fonts.gstatic.com');    // font files
    expect(csp).toContain('https://cdnjs.cloudflare.com'); // three.min.js
    expect(csp).toContain('https://cdn.jsdelivr.net');     // OrbitControls/GLTFLoader
    expect(csp).toMatch(/img-src [^;]*data:/);             // chat thumbnails
  });

  it('HSTS is off by default and only emitted with { hsts: true } (SEC-015 stub)', () => {
    expect(securityHeaders().get('Strict-Transport-Security')).toBeNull();
    const withHsts = securityHeaders({ hsts: true });
    expect(withHsts.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(withHsts.get('Strict-Transport-Security')).toContain('includeSubDomains');
  });

  it('applySecurity preserves the asset body/status/content-type and adds CSP', async () => {
    const original = new Response('<!DOCTYPE html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"abc"' }
    });
    const hardened = applySecurity(original);
    expect(hardened.status).toBe(200);
    expect(hardened.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(hardened.headers.get('ETag')).toBe('"abc"'); // caching preserved
    expect(hardened.headers.get('Content-Security-Policy')).toBeTruthy();
    expect(hardened.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await hardened.text()).toContain('<!DOCTYPE html>'); // SPA HTML still served
  });
});

describe('SEC-010 AI/user content render sink', () => {
  it('app.fmt escapes injected markup so AI/user content cannot inject script', () => {
    const html = app.fmt('Answer **bold** <img src=x onerror=alert(1)><script>alert(2)</script>');
    expect(html).toContain('<strong>bold</strong>');     // markdown still works
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
});
