// @vitest-environment jsdom
//
// Invited-by-email people must get a working "Can edit / Can view" role dropdown
// immediately after sending — wired to _updateShareLinkRole with the invite's
// real link id — so the owner can change access in place, without re-inviting.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

const flush = () => Promise.resolve();

function makeApp(overrides = {}) {
  const client = {
    inviteByEmail: vi.fn(async () => ({
      ok: true,
      invite: { id: 'shl_invite1', email: 'friend@example.com', role: 'Editor' },
      joinUrl: 'https://x/?join=' + 'a'.repeat(64),
      delivery: { delivered: true, provider: 'resend' }
    })),
    // The list refresh deliberately returns nothing — the dropdown must still
    // appear from the session-invite cache, proving it doesn't depend on this.
    listShareLinks: async () => ({ shareLinks: [] }),
    updateShareLinkRole: vi.fn(async (_pid, _id, { role }) => ({ id: _id, email: 'friend@example.com', role })),
    revokeShareLink: async () => ({ ok: true }),
    createShareLink: async () => ({ id: 'l1', token: 't1' }),
    ...overrides
  };
  const app = {
    _cloudProjectId: 'proj-1',
    currentUser: { email: 'owner@example.com', displayName: 'Owner' },
    addAIMessage: () => {},
    _saveCloudProjectId: () => {},
    signIn: () => {},
    renderRecentProjects: () => {}
  };
  installSaveLoad(app);
  app._novaCloudClient = client;
  return app;
}

const inviteRow = () => document.querySelector('#invite-list .share-link-row');
const roleSelect = () => document.querySelector('#invite-list select');

describe('invited people: changeable permission level', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows a role dropdown on the invited row immediately after sending', async () => {
    const app = makeApp();
    app.showShareDialog();
    document.getElementById('invite-email').value = 'friend@example.com';
    await app._sendInvites();
    await flush();

    // The row exists with the email and a role <select> (not static text).
    expect(inviteRow().textContent).toContain('friend@example.com');
    const sel = roleSelect();
    expect(sel).not.toBeNull();
    // Wired to the role updater with the REAL invite link id.
    expect(sel.getAttribute('onchange')).toContain('_updateShareLinkRole');
    expect(sel.getAttribute('onchange')).toContain('shl_invite1');
    // Reflects the invited role (Editor → "Can edit" selected).
    expect(sel.value).toBe('Editor');
  });

  it('changing the dropdown updates the role in place via PATCH, no re-invite', async () => {
    const app = makeApp();
    app.showShareDialog();
    document.getElementById('invite-email').value = 'friend@example.com';
    await app._sendInvites();
    await flush();

    const inviteCalls = app._novaCloudClient.inviteByEmail.mock.calls.length;

    // Simulate the user picking "Can view".
    await app._updateShareLinkRole('shl_invite1', 'Viewer');
    await flush();

    // It PATCHed the existing link's role — and did NOT send another invite.
    expect(app._novaCloudClient.updateShareLinkRole).toHaveBeenCalledWith(
      'proj-1', 'shl_invite1', { role: 'Viewer' }
    );
    expect(app._novaCloudClient.inviteByEmail.mock.calls.length).toBe(inviteCalls);

    // The row's dropdown now reflects Viewer.
    expect(roleSelect().value).toBe('Viewer');
  });

  it('an in-flight invite (no id yet) still falls back to the spinner row with no dropdown', async () => {
    let resolveInvite;
    const app = makeApp({ inviteByEmail: () => new Promise(r => { resolveInvite = r; }) });
    app.showShareDialog();
    document.getElementById('invite-email').value = 'friend@example.com';
    const p = app._sendInvites();

    // Before the response: spinner row, no dropdown.
    expect(document.querySelector('#invite-list .invite-stat.spin')).not.toBeNull();
    expect(roleSelect()).toBeNull();

    resolveInvite({ ok: true, invite: { id: 'shl_x', email: 'friend@example.com', role: 'Editor' }, delivery: { delivered: true, provider: 'resend' } });
    await p; await flush();

    // After the response: the dropdown appears.
    expect(roleSelect()).not.toBeNull();
  });
});
