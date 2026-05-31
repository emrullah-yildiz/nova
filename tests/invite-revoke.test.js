// @vitest-environment jsdom
//
// Tests for the two-step confirm + optimistic removal when revoking an invite
// or an anon share link. Drives the REAL installed handlers (showShareDialog,
// _renderShareLinks, _renderInvitedRows, _renderAnonLinks, _askRevokeShareLink,
// _cancelRevokeShareLink, _confirmRevokeShareLink) so it exercises the full path.

import { describe, it, expect, beforeEach } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

// A manually-resolvable promise so we can assert state mid-flight.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Build a minimal fake app wired enough to run the real handlers. installSaveLoad
// mutates the object it's given, so we install onto our fake directly and seed
// the cached client at app._novaCloudClient (getNovaCloudClient returns it).
function makeApp(client) {
  const app = {
    _cloudProjectId: 'proj-1',
    currentUser: { email: 'owner@example.com', displayName: 'Owner' },
    _aiMessages: [],
    _saveCloudProjectId: () => {},
    signIn: () => {},
    renderRecentProjects: () => {},
  };
  // addAIMessage as a spy that captures args so we can assert the failure message.
  app.addAIMessage = (...a) => { app._aiMessages.push(a); };
  installSaveLoad(app);
  app._novaCloudClient = client;
  return app;
}

const flush = () => Promise.resolve();
const inviteHtml = () => document.getElementById('invite-list').innerHTML;
const linkHtml = () => document.getElementById('share-link-list').innerHTML;
const hasRowFor = (html, id) => html.includes("'" + id + "'") || html.includes('app._askRevokeShareLink(\'' + id + '\')') || html.includes('app._confirmRevokeShareLink(\'' + id + '\')');

describe('invite revoke: confirm + optimistic removal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('1. requires confirm: clicking trash only asks (no network), shows confirm button', async () => {
    const client = {
      listShareLinks: async () => ({ shareLinks: [{ id: 'inv1', email: 'a@example.com', role: 'Editor', createdAt: Date.now() }] }),
      revokeShareLink: () => { client._revokeCalls++; return Promise.resolve({ ok: true }); },
      _revokeCalls: 0,
    };
    const app = makeApp(client);

    app.showShareDialog();
    await flush(); // let _renderShareLinks fetch + paint
    expect(inviteHtml()).toContain('🗑');

    app._askRevokeShareLink('inv1');

    expect(document.querySelector('#invite-list .share-icon-btn.confirm')).not.toBeNull();
    expect(inviteHtml()).not.toContain('🗑');
    expect(client._revokeCalls).toBe(0);
  });

  it('2. cancel restores the trash button without calling revoke', async () => {
    const client = {
      listShareLinks: async () => ({ shareLinks: [{ id: 'inv1', email: 'a@example.com', role: 'Editor', createdAt: Date.now() }] }),
      revokeShareLink: () => { client._revokeCalls++; return Promise.resolve({ ok: true }); },
      _revokeCalls: 0,
    };
    const app = makeApp(client);

    app.showShareDialog();
    await flush();
    app._askRevokeShareLink('inv1');
    expect(document.querySelector('#invite-list .share-icon-btn.confirm')).not.toBeNull();

    app._cancelRevokeShareLink();

    expect(document.querySelector('#invite-list .share-icon-btn.confirm')).toBeNull();
    expect(inviteHtml()).toContain('🗑');
    expect(client._revokeCalls).toBe(0);
  });

  it('3. optimistic remove: row disappears synchronously before the revoke resolves', async () => {
    const d = deferred();
    const client = {
      listShareLinks: async () => ({ shareLinks: [{ id: 'inv1', email: 'a@example.com', role: 'Editor', createdAt: Date.now() }] }),
      revokeShareLink: (...args) => { client._revokeArgs = args; return d.promise; },
      _revokeArgs: null,
    };
    const app = makeApp(client);

    app.showShareDialog();
    await flush();
    expect(hasRowFor(inviteHtml(), 'inv1')).toBe(true);

    app._askRevokeShareLink('inv1');
    // Fire confirm but do NOT await — assert synchronous optimistic removal.
    const p = app._confirmRevokeShareLink('inv1');

    expect(hasRowFor(inviteHtml(), 'inv1')).toBe(false); // gone immediately
    expect(client._revokeArgs).toEqual(['proj-1', 'inv1']); // request was fired

    // Resolve + tick — row stays gone.
    d.resolve({ ok: true });
    await p;
    await flush();
    expect(hasRowFor(inviteHtml(), 'inv1')).toBe(false);
  });

  it('4. rollback on failure: row is restored and an error is surfaced', async () => {
    const d = deferred();
    const client = {
      listShareLinks: async () => ({ shareLinks: [{ id: 'inv1', email: 'a@example.com', role: 'Editor', createdAt: Date.now() }] }),
      revokeShareLink: () => d.promise,
    };
    const app = makeApp(client);

    app.showShareDialog();
    await flush();
    app._askRevokeShareLink('inv1');
    const p = app._confirmRevokeShareLink('inv1');
    expect(hasRowFor(inviteHtml(), 'inv1')).toBe(false); // optimistic gone

    d.reject(new Error('network down'));
    await p.catch(() => {}); // _confirmRevokeShareLink swallows internally, but be safe
    await flush();

    expect(hasRowFor(inviteHtml(), 'inv1')).toBe(true); // restored
    const msgs = app._aiMessages.map(a => a.join(' '));
    expect(msgs.some(m => m.includes('Could not remove'))).toBe(true);
  });

  it('5. anon list parity: anon row disappears synchronously on confirm', async () => {
    const d = deferred();
    const client = {
      listShareLinks: async () => ({ shareLinks: [{ id: 'anon1', role: 'Viewer', createdAt: Date.now() }] }),
      revokeShareLink: (...args) => { client._revokeArgs = args; return d.promise; },
      _revokeArgs: null,
    };
    const app = makeApp(client);

    app.showShareDialog();
    await flush();
    expect(hasRowFor(linkHtml(), 'anon1')).toBe(true);

    app._askRevokeShareLink('anon1');
    const p = app._confirmRevokeShareLink('anon1');

    expect(hasRowFor(linkHtml(), 'anon1')).toBe(false); // gone immediately
    expect(client._revokeArgs).toEqual(['proj-1', 'anon1']);

    d.resolve({ ok: true });
    await p;
    await flush();
    expect(hasRowFor(linkHtml(), 'anon1')).toBe(false);
  });
});
