import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';

function captureEmails() {
  const sent = [];
  return { sent, service: { provider: 'fake', async send(m) { sent.push(m); } } };
}
function tokenFromJoin(message) {
  return ((message.text || '') + ' ' + (message.html || '')).match(/join=([0-9a-f]{64})/)?.[1];
}

async function ownerWithProject(extra = {}) {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  const api = buildApi({ authService, allowDevLogin: true, appUrl: 'https://nova.test', ...extra });
  const login = await api.dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
  const auth = 'Bearer ' + login.body.token;
  const project = await api.dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Shared' } });
  return { ...api, auth, projectId: project.body.id };
}

describe('invite by email', () => {
  it('creates an email-tagged share link and emails a /?join= link', async () => {
    const { sent, service } = captureEmails();
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: service });

    const res = await dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'Friend@Example.com', role: 'Editor' } });
    expect(res.status).toBe(200);
    expect(res.body.emailed).toBe(true);
    expect(res.body.invite.email).toBe('friend@example.com'); // normalized
    expect(res.body.invite.token).toBeUndefined();            // raw token not returned to the inviter
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('friend@example.com'); // normalized recipient
    expect(tokenFromJoin(sent[0])).toBeTruthy();

    // The invite shows up as a pending share link (with the email).
    const links = await dispatch({ method: 'GET', path: '/api/projects/' + projectId + '/share-links', authorization: auth });
    expect(links.body.shareLinks.some(l => l.email === 'friend@example.com' && l.role === 'Editor')).toBe(true);
    expect(links.body.shareLinks.every(l => l.tokenHash === undefined)).toBe(true);
  });

  it('rejects a bad email or role with 400', async () => {
    const { dispatch, auth, projectId } = await ownerWithProject({ emailService: captureEmails().service });
    await expect(dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'nope', role: 'Editor' } })).rejects.toMatchObject({ status: 400 });
    await expect(dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', authorization: auth, body: { email: 'a@b.com', role: 'Admin' } })).rejects.toMatchObject({ status: 400 });
  });

  it('requires authentication', async () => {
    const { dispatch, projectId } = await ownerWithProject({ emailService: captureEmails().service });
    await expect(dispatch({ method: 'POST', path: '/api/projects/' + projectId + '/invites', body: { email: 'a@b.com', role: 'Editor' } })).rejects.toMatchObject({ status: 401 });
  });
});

describe('submit a ticket', () => {
  function fakeIssues() {
    const calls = [];
    return { calls, service: { async create(p) { calls.push(p); return { url: 'https://github.com/x/y/issues/7', number: 7 }; } } };
  }

  it('creates a GitHub issue via the injected service', async () => {
    const { calls, service } = fakeIssues();
    const { dispatch, auth } = await ownerWithProject({ issueService: service });
    const res = await dispatch({ method: 'POST', path: '/api/feedback/ticket', authorization: auth, body: { title: 'Crash on run', body: 'It broke', category: 'bug' } });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe('https://github.com/x/y/issues/7');
    expect(calls[0].title).toBe('[bug] Crash on run');
    expect(calls[0].labels).toContain('bug');
  });

  it('503s when no issue service is configured', async () => {
    const { dispatch, auth } = await ownerWithProject(); // no issueService, no FEEDBACK_GITHUB_TOKEN
    await expect(dispatch({ method: 'POST', path: '/api/feedback/ticket', authorization: auth, body: { title: 't', body: 'b' } }))
      .rejects.toMatchObject({ status: 503, code: 'FEEDBACK_NOT_CONFIGURED' });
  });

  it('requires authentication and a title/body', async () => {
    const { calls, service } = fakeIssues();
    const { dispatch, auth } = await ownerWithProject({ issueService: service });
    await expect(dispatch({ method: 'POST', path: '/api/feedback/ticket', body: { title: 't', body: 'b' } })).rejects.toMatchObject({ status: 401 });
    await expect(dispatch({ method: 'POST', path: '/api/feedback/ticket', authorization: auth, body: { title: '' } })).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });
});
