import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';

// The dispatcher must not block the HTTP response on the Neon snapshot write.
// When a waitUntil is supplied (Cloudflare), it offloads the flush to the
// runtime (fast response, isolate kept alive until the write finishes). Without
// one (Node/tests), it awaits so the write still completes before responding.

function slowPersistence() {
  const state = { started: 0, done: 0 };
  return {
    state,
    async readSnapshot() { return null; },
    async writeSnapshot() {
      state.started++;
      await new Promise(resolve => setTimeout(resolve, 40));
      state.done++;
    }
  };
}

async function ownerApi(persistence) {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  const api = buildApi({ authService, allowDevLogin: true, appUrl: 'https://nova.test', persistence });
  const login = await api.dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova', organizationSlug: 'demo' } });
  return { dispatch: api.dispatch, auth: 'Bearer ' + login.body.token };
}

describe('persistence flush offloading', () => {
  it('hands the flush to waitUntil and returns before the slow write finishes', async () => {
    const persistence = slowPersistence();
    const { dispatch, auth } = await ownerApi(persistence);

    persistence.state.done = 0; // ignore the dev-login flush
    const handed = [];
    const res = await dispatch({
      method: 'POST', path: '/api/projects', authorization: auth,
      body: { name: 'Async' }, waitUntil: (p) => handed.push(p)
    });

    expect(res.status).toBe(201);
    // The flush was handed off, and the response returned BEFORE it completed.
    expect(handed).toHaveLength(1);
    expect(persistence.state.done).toBe(0);

    await Promise.all(handed); // drain the offloaded flush
    expect(persistence.state.done).toBeGreaterThan(0);
  });

  it('awaits the flush when no waitUntil is provided (write done before response)', async () => {
    const persistence = slowPersistence();
    const { dispatch, auth } = await ownerApi(persistence);

    persistence.state.done = 0;
    const res = await dispatch({
      method: 'POST', path: '/api/projects', authorization: auth, body: { name: 'Sync' }
      // no waitUntil
    });

    expect(res.status).toBe(201);
    // The write already completed by the time the response returned.
    expect(persistence.state.done).toBeGreaterThan(0);
  });
});
