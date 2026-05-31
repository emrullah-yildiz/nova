import { describe, it, expect, vi } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';

// Handler-level tests for invite delivery behaviour.
//
// Email is sent fire-and-forget: the HTTP response returns as soon as the
// invite link is persisted, without waiting for the email provider. The
// delivery object in the response therefore always carries
// { delivered: false, provider: 'pending' } when an email service is
// configured, and { delivered: false, provider: 'none' } when it is not.
// The invite link (joinUrl) is always present regardless of delivery status.

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
  it('email service configured → delivery.provider:"pending", joinUrl present, email fired', async () => {
    const sent = [];
    const service = { provider: 'resend', async send(m) { sent.push(m); return { delivered: true, provider: 'resend', id: 'x' }; } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    // Response returns immediately with pending status (fire-and-forget).
    expect(res.body.delivery).toMatchObject({ delivered: false, provider: 'pending' });
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
    // Give the microtask queue a turn so the async send fires.
    await new Promise(r => setTimeout(r, 10));
    expect(sent).toHaveLength(1);
  });

  it('console provider → delivery.provider:"pending", joinUrl still returned', async () => {
    const service = { provider: 'console', async send() { return { delivered: false, provider: 'console' }; } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery).toMatchObject({ delivered: false, provider: 'pending' });
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
  });

  it('service that THROWS → ok:true, pending delivery, joinUrl present (error logged async)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = { provider: 'resend', async send() { throw new Error('kaboom'); } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery).toMatchObject({ delivered: false, provider: 'pending' });
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
    // Let the async send fire and log.
    await new Promise(r => setTimeout(r, 10));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('nova-invite'), expect.anything(), expect.stringContaining('kaboom'));
    errSpy.mockRestore();
  });

  it('real provider send fails → ok:true, pending delivery, joinUrl present (error logged async)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = { provider: 'resend', async send() { return { delivered: false, provider: 'resend', error: 'Resend send failed (401): Unauthorized' }; } };
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });
    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'f@e.com', role: 'Editor' } });
    expect(res.body.ok).toBe(true);
    expect(res.body.delivery).toMatchObject({ delivered: false, provider: 'pending' });
    expect(res.body.joinUrl).toMatch(TOKEN_JOIN);
    await new Promise(r => setTimeout(r, 10));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('nova-invite'), expect.anything(), 'resend', expect.stringContaining('Unauthorized'));
    errSpy.mockRestore();
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
