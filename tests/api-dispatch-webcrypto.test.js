import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';
import { verifySessionPayload } from '../server/auth/webcrypto.mjs';

// Proves the Cloudflare Worker's request path works: the shared dispatcher
// (api-dispatch.mjs) driven by the async WebCrypto auth service, end to end.
// This runs in Node, but exercises exactly the auth + routing the Worker uses.

function setup() {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  return buildApi({ authService, allowDevLogin: true });
}

describe('API dispatcher + WebCrypto auth (Worker request path)', () => {
  it('dev-login issues a WebCrypto token that /api/me authenticates', async () => {
    const { dispatch } = setup();

    const login = await dispatch({
      method: 'POST', path: '/api/auth/dev-login',
      body: { email: 'owner@demo.nova', organizationSlug: 'demo' }
    });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');

    // The token really is a WebCrypto-signed session token.
    const payload = await verifySessionPayload(login.body.token, 'test-secret');
    expect(payload).toBeTruthy();
    expect(payload.sub).toBeTruthy();

    const me = await dispatch({
      method: 'GET', path: '/api/me',
      authorization: 'Bearer ' + login.body.token
    });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('owner@demo.nova');
  });

  it('creates and reads a project through the dispatcher with a WebCrypto token', async () => {
    const { dispatch } = setup();
    const login = await dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
    const auth = 'Bearer ' + login.body.token;

    const created = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'CF Test' } });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('CF Test');

    const list = await dispatch({ method: 'GET', path: '/api/projects', authorization: auth });
    expect(list.body.projects.some((p) => p.id === created.body.id)).toBe(true);
  });

  it('deletes a project through the dispatcher with a WebCrypto token', async () => {
    const { dispatch } = setup();
    const login = await dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
    const auth = 'Bearer ' + login.body.token;

    const created = await dispatch({ method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Delete Me' } });
    expect(created.status).toBe(201);

    const deleted = await dispatch({ method: 'DELETE', path: '/api/projects/' + created.body.id, authorization: auth });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true, projectId: created.body.id });

    const list = await dispatch({ method: 'GET', path: '/api/projects', authorization: auth });
    expect(list.body.projects.some((p) => p.id === created.body.id)).toBe(false);
    await expect(dispatch({ method: 'GET', path: '/api/projects/' + created.body.id, authorization: auth })).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a protected route without a token (401) and unknown routes (404)', async () => {
    const { dispatch } = setup();
    await expect(dispatch({ method: 'GET', path: '/api/me' })).rejects.toMatchObject({ status: 401 });
    await expect(dispatch({ method: 'GET', path: '/api/me', authorization: 'Bearer garbage.token' })).rejects.toMatchObject({ status: 401 });
    await expect(dispatch({ method: 'GET', path: '/api/does-not-exist' })).rejects.toMatchObject({ status: 404 });
  });
});
