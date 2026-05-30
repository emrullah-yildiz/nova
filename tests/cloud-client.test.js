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
});
