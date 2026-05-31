import { describe, it, expect } from 'vitest';
import { NovaCloudClient } from '../src/enterprise/cloud-client.js';

// The SPA authenticates the cloud client via the httpOnly session cookie
// (same identity as the rest of the app), not a Bearer token. Token mode is
// retained for dev-login / non-browser callers.

function recordingFetch() {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ projects: [] }) };
  };
  return { impl, calls };
}

describe('NovaCloudClient auth transport', () => {
  it('cookie mode: relative URL, credentials included, no Authorization header', async () => {
    const { impl, calls } = recordingFetch();
    const client = new NovaCloudClient({ useCookie: true, fetchImpl: impl });
    expect(client.isAuthenticated()).toBe(true); // ready without a JS-readable token
    await client.listProjects({ limit: 5 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/projects?limit=5'); // same-origin relative
    expect(calls[0].init.credentials).toBe('include');
    expect(calls[0].init.headers.Authorization).toBeUndefined();
  });

  it('token mode: absolute URL via apiBaseUrl with a Bearer header', async () => {
    const { impl, calls } = recordingFetch();
    const client = new NovaCloudClient({
      token: 'tok_123',
      fetchImpl: impl,
      config: { apiBaseUrl: 'https://api.example.com' }
    });
    await client.listProjects();
    expect(calls[0].url).toBe('https://api.example.com/api/projects');
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok_123');
    expect(calls[0].init.credentials).toBeUndefined();
  });

  it('share-link + shared endpoints use the right paths/methods (cookie mode)', async () => {
    const { impl, calls } = recordingFetch();
    const client = new NovaCloudClient({ useCookie: true, fetchImpl: impl });

    await client.listSharedProjects({ limit: 10 });
    await client.createShareLink('prj_1', { role: 'Editor' });
    await client.listShareLinks('prj_1');
    await client.updateShareLinkRole('prj_1', 'shl_9', { role: 'Viewer' });
    await client.revokeShareLink('prj_1', 'shl_9');
    await client.redeemShareLink('tok abc/?');

    expect(calls.map(c => c.init.method + ' ' + c.url)).toEqual([
      'GET /api/projects/shared?limit=10',
      'POST /api/projects/prj_1/share-links',
      'GET /api/projects/prj_1/share-links',
      'PATCH /api/projects/prj_1/share-links/shl_9',
      'POST /api/projects/prj_1/share-links/shl_9/revoke',
      'POST /api/share/tok%20abc%2F%3F' // token is URL-encoded
    ]);
    expect(calls[1].init.body).toBe(JSON.stringify({ role: 'Editor', expiresInMs: 0 }));
    expect(calls[3].init.body).toBe(JSON.stringify({ role: 'Viewer' }));
    expect(calls.every(c => c.init.credentials === 'include')).toBe(true);
  });

  it('invite + ticket endpoints (cookie mode)', async () => {
    const { impl, calls } = recordingFetch();
    const client = new NovaCloudClient({ useCookie: true, fetchImpl: impl });
    await client.inviteByEmail('prj_1', { email: 'a@b.com', role: 'Viewer' });
    await client.submitTicket({ title: 'T', body: 'B', category: 'bug' });
    expect(calls.map(c => c.init.method + ' ' + c.url)).toEqual([
      'POST /api/projects/prj_1/invites',
      'POST /api/feedback/ticket'
    ]);
    expect(calls[0].init.body).toBe(JSON.stringify({ email: 'a@b.com', role: 'Viewer' }));
    expect(calls[1].init.body).toBe(JSON.stringify({ title: 'T', body: 'B', category: 'bug' }));
  });
});
