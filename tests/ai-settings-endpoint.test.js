import { describe, it, expect } from 'vitest';
import { buildApi } from '../src/enterprise/api-server.mjs';
import { createWebCryptoAuthService } from '../server/auth/webcrypto-auth.mjs';
import { createSecretsService } from '../server/auth/webcrypto.mjs';

// GET/PUT /api/me/ai-settings: encrypted-at-rest storage of a signed-in user's
// BYOK keys, returned in plaintext only to the authenticated owner.

async function setup({ withSecrets = true } = {}) {
  const authService = createWebCryptoAuthService({ sessionSecret: 'test-secret' });
  const secretsService = withSecrets ? await createSecretsService({ sessionSecret: 'test-secret' }) : null;
  const api = buildApi({ authService, secretsService, allowDevLogin: true });
  const login = await api.dispatch({ method: 'POST', path: '/api/auth/dev-login', body: { email: 'owner@demo.nova' } });
  return { ...api, auth: 'Bearer ' + login.body.token, userId: (await api.dispatch({ method: 'GET', path: '/api/me', authorization: 'Bearer ' + login.body.token })).body.user.id };
}

const SETTINGS = { provider: 'groq', model: 'llama-3.1-8b-instant', keys: { groq: 'gsk_secret_1234567890' } };

describe('/api/me/ai-settings', () => {
  it('returns { settings: null } before anything is stored', async () => {
    const { dispatch, auth } = await setup();
    const res = await dispatch({ method: 'GET', path: '/api/me/ai-settings', authorization: auth });
    expect(res.status).toBe(200);
    expect(res.body.settings).toBeNull();
  });

  it('PUT then GET round-trips the plaintext to the owner', async () => {
    const { dispatch, auth } = await setup();
    const put = await dispatch({ method: 'PUT', path: '/api/me/ai-settings', authorization: auth, body: SETTINGS });
    expect(put.status).toBe(200);
    expect(put.body.ok).toBe(true);

    const get = await dispatch({ method: 'GET', path: '/api/me/ai-settings', authorization: auth });
    expect(get.body.settings).toEqual(SETTINGS);
  });

  it('stores the key encrypted (ciphertext, not plaintext) in the user record', async () => {
    const { dispatch, auth, store, userId } = await setup();
    await dispatch({ method: 'PUT', path: '/api/me/ai-settings', authorization: auth, body: SETTINGS });
    const user = store.requireUser(userId);
    expect(user.aiSettingsEncrypted.startsWith('aesgcm$v1$')).toBe(true);
    expect(user.aiSettingsEncrypted).not.toContain('gsk_secret');
  });

  it('never leaks the encrypted blob via /api/me', async () => {
    const { dispatch, auth } = await setup();
    await dispatch({ method: 'PUT', path: '/api/me/ai-settings', authorization: auth, body: SETTINGS });
    const me = await dispatch({ method: 'GET', path: '/api/me', authorization: auth });
    expect(me.body.user.aiSettingsEncrypted).toBeUndefined();
    expect(JSON.stringify(me.body)).not.toContain('gsk_secret');
  });

  it('requires authentication', async () => {
    const { dispatch } = await setup();
    await expect(dispatch({ method: 'GET', path: '/api/me/ai-settings' })).rejects.toMatchObject({ status: 401 });
    await expect(dispatch({ method: 'PUT', path: '/api/me/ai-settings', body: SETTINGS })).rejects.toMatchObject({ status: 401 });
  });

  it('503s when secret storage is not configured', async () => {
    const { dispatch, auth } = await setup({ withSecrets: false });
    await expect(dispatch({ method: 'PUT', path: '/api/me/ai-settings', authorization: auth, body: SETTINGS }))
      .rejects.toMatchObject({ status: 503, code: 'SECRETS_NOT_CONFIGURED' });
  });

  it('ignores unknown providers and rejects oversized keys', async () => {
    const { dispatch, auth } = await setup();
    await dispatch({ method: 'PUT', path: '/api/me/ai-settings', authorization: auth, body: { provider: 'groq', model: 'm', keys: { groq: 'gsk_ok_123', bogus: 'x' } } });
    const get = await dispatch({ method: 'GET', path: '/api/me/ai-settings', authorization: auth });
    expect(get.body.settings.keys.bogus).toBeUndefined();
    expect(get.body.settings.keys.groq).toBe('gsk_ok_123');

    await expect(dispatch({ method: 'PUT', path: '/api/me/ai-settings', authorization: auth, body: { keys: { groq: 'x'.repeat(601) } } }))
      .rejects.toMatchObject({ status: 400 });
  });
});
