import { describe, it, expect, vi } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';

// Handler-level tests for HONEST invite delivery. The invite/link is always
// created (ok:true) and a copyable joinUrl is always returned; delivery.delivered
// is the ONLY signal about whether an email actually went out.

async function ownerWithProject(extra = {}) {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  const api = buildApi({ authService, allowDevLogin: true, appUrl: 'https://nova.test', ...extra });
  const login = await api.dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
  const auth = 'Bearer ' + login.body.token;
  const project = await api.dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Shared' } });
  return { ...api, auth, projectId: project.body.id };
}

const TOKEN_JOIN = /^https:\/\/nova\.test\/\?join=[0-9a-f]{64}$/;

describe('invite delivery honesty', () => {
  it('provider confirms delivery → delivery.delivered:true, joinUrl present', async () => {
    const sent = [];
    const service = { provider: 'resend', async send(m) { sent.push(m); return { delivered: true, provider: 'resend', id: 'x' }; } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery).toMatchObject({ delivered: true, provider: 'resend' });
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
    expect(sent).toHaveLength(1);
  });

  it('console provider (not delivered) → ok:true, delivered:false, joinUrl still returned', async () => {
    const service = { provider: 'console', async send() { return { delivered: false, provider: 'console' }; } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery).toMatchObject({ delivered: false, provider: 'console' });
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
  });

  it('service that THROWS → ok:true, delivered:false, error captured, joinUrl present', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = { provider: 'resend', async send() { throw new Error('kaboom'); } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery.delivered).toBe(false);
    expect(res.body.delivery.error).toContain('kaboom');
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
    errSpy.mockRestore();
  });

  it('real provider send fails → ok:true, provider:"resend", delivered:false, error + joinUrl present', async () => {
    const service = { provider: 'resend', async send() { return { delivered: false, provider: 'resend', error: 'Resend send failed (401): Unauthorized' }; } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery.delivered).toBe(false);
    expect(res.body.delivery.provider).toBe('resend');
    expect(res.body.delivery.error).toBeTruthy();
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
  });

  it('no email service configured → delivery.provider:"none", delivered:false, joinUrl present', async () => {
    const { dispatch, auth, projectId } = await ownerWithProject(); // no emailService
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery).toEqual({ delivered: false, provider: 'none' });
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
    expect(res.body.emailed).toBeUndefined();
  });
});
