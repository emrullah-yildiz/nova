import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';
import { EnterpriseStore } from '../src/enterprise/domain.mjs';

// Persistence is write-behind. A snapshot-write failure must NEVER turn a
// mutation that already succeeded in memory into an error for the client.
// Regression for: an invite that was created + emailed still showed
// "Could not send the invite" because the post-handler flushPersistence threw.

function failingPersistence() {
  return { readSnapshot: () => null, writeSnapshot: async () => { throw new Error('db down'); } };
}
function captureEmails() {
  const sent = [];
  return { sent, service: { provider: 'fake', async send(m) { sent.push(m); } } };
}

describe('mutations succeed for the client even when snapshot writes fail', () => {
  it('dev-login + createProject still return success', async () => {
    const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
    const { dispatch } = buildApi({ authService, persistence: failingPersistence(), allowDevLogin: true });
    const login = await dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
    expect(login.status).toBe(200);
    const auth = 'Bearer ' + login.body.token;
    const created = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'P' } });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
  });

  it('invite returns ok, emails, and lists the invitee even when the write fails (the reported bug)', async () => {
    const { sent, service } = captureEmails();
    const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
    const { dispatch } = buildApi({ authService, persistence: failingPersistence(), allowDevLogin: true, emailService: service, appUrl: 'https://nova.test' });
    const login = await dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
    const auth = 'Bearer ' + login.body.token;
    const project = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Shared' } });

    const invite = await dispatch({ method: 'POST', path: '/api/projects/' + project.body.id + '/invites', authorization: auth, body: { email: 'friend@example.com', role: 'Viewer' } });
    expect(invite.status).toBe(200);   // NOT a 500 — the bug surfaced a false "could not send"
    expect(invite.body.ok).toBe(true);
    expect(sent).toHaveLength(1);       // the email really went out

    // …and the invitee appears in the list (it was created in memory).
    const links = await dispatch({ method: 'GET', path: '/api/projects/' + project.body.id + '/share-links', authorization: auth });
    expect(links.body.shareLinks.some(l => l.email === 'friend@example.com')).toBe(true);
  });
});

describe('snapshot writes serialize (no concurrent full-snapshot transactions)', () => {
  it('max in-flight write = 1 and a transient failure does not reject flushPersistence', async () => {
    let active = 0, maxActive = 0, n = 0;
    const persistence = {
      readSnapshot: () => null,
      async writeSnapshot() {
        active++; maxActive = Math.max(maxActive, active); n++;
        await new Promise(r => setTimeout(r, 5));
        active--;
        if (n === 2) throw new Error('transient'); // a middle write fails
        return true;
      }
    };
    const store = new EnterpriseStore({ persistence });
    await store.ready();
    store.createOrganization({ name: 'A' });
    store.createOrganization({ name: 'B' });
    store.createOrganization({ name: 'C' });
    await expect(store.flushPersistence()).resolves.toBeUndefined();
    expect(maxActive).toBe(1);
  });
});
