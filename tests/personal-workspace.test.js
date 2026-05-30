import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';

// A Google/SSO user with no organization should land in their own personal
// workspace (auto-created), so accounts work without joining a team.

describe('personal workspace via OIDC login', () => {
  const identity = { email: 'jane@gmail.com', displayName: 'Jane', sub: 'google|jane', externalSubject: 'google|jane' };

  it('auto-creates a personal org and authenticates the user', async () => {
    const { dispatch, store } = buildApi({ oidcVerifier: async () => identity, bootstrapDemo: false });

    const login = await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'x' } });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe('jane@gmail.com');

    const me = await dispatch({ method: 'GET', path: '/api/me', authorization: 'Bearer ' + login.body.token });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('jane@gmail.com');

    expect(store.organizations.size).toBe(1);
    const org = Array.from(store.organizations.values())[0];
    expect(org.settings.personal).toBe(true);
  });

  it('is idempotent — a second login reuses the same workspace', async () => {
    const { dispatch, store } = buildApi({ oidcVerifier: async () => identity, bootstrapDemo: false });
    await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'x' } });
    await dispatch({ method: 'POST', path: '/api/auth/oidc/callback', body: { idToken: 'x' } });
    expect(store.organizations.size).toBe(1);
  });
});
