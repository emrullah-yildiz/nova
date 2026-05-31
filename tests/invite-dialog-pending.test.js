// @vitest-environment jsdom
//
// Regression test for the share/invite dialog: an invite that is still
// in-flight (spinner) when the user clicks "Done" must STILL show as a
// loading/spinner row when the dialog is reopened, and keep resolving to its
// final icon. Drives the REAL installed handlers (showShareDialog, _sendInvites,
// _renderInvitedRows, _renderShareLinks) so it exercises the close/reopen path.

import { describe, it, expect, beforeEach } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

// A manually-resolvable promise so we can assert the PENDING state mid-flight.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Build a minimal fake app wired enough to run the real handlers, with a
// controllable inviteByEmail. installSaveLoad mutates the object it's given, so
// we install onto our fake directly.
function makeApp(inviteImpl) {
  const client = {
    inviteByEmail: inviteImpl,
    listShareLinks: async () => ({ shareLinks: [] }),
    revokeShareLink: async () => ({ ok: true }),
    createShareLink: async () => ({ id: 'l1', token: 't1' }),
  };
  const app = {
    _cloudProjectId: 'proj-1',
    currentUser: { email: 'owner@example.com', displayName: 'Owner' },
    addAIMessage: () => {},
    _saveCloudProjectId: () => {},
    signIn: () => {},
    // installSaveLoad patches this at install time (app.renderRecentProjects.bind),
    // so it must exist as a function on the fake app.
    renderRecentProjects: () => {},
  };
  installSaveLoad(app);
  // installSaveLoad installs its own app.getNovaCloudClient that caches/returns
  // app._novaCloudClient — so seed the cache with our stub client. Every handler
  // resolves the client through getNovaCloudClient(), so this is all that's needed.
  app._novaCloudClient = client;
  return app;
}

const spinCount = () => document.querySelectorAll('#invite-list .invite-stat.spin').length;
const okCount = () => document.querySelectorAll('#invite-list .invite-stat.ok').length;
const errCount = () => document.querySelectorAll('#invite-list .invite-stat.err').length;
const flush = () => Promise.resolve();

describe('invite dialog: in-flight spinners survive close/reopen', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps a pending spinner row after closing and reopening, then resolves to a green check live', async () => {
    const d = deferred();
    const app = makeApp(() => d.promise);

    // a. Open dialog, type an email, fire _sendInvites (do NOT await).
    app.showShareDialog();
    document.getElementById('invite-email').value = 'friend@example.com';
    const sendPromise = app._sendInvites();

    // b. A spinner row exists for that email (rendered synchronously before the
    //    first await inside _sendInvites).
    expect(spinCount()).toBe(1);

    // c. Click "Done" — remove the overlay while the invite is still in-flight.
    document.getElementById('share-dialog-overlay').remove();
    expect(document.getElementById('share-dialog-overlay')).toBeNull();

    // d. Reopen the dialog.
    app.showShareDialog();

    // e. SYNCHRONOUSLY (before resolving the deferred) the spinner row is back.
    //    This is the regression: before the fix the reopened list is blank here.
    expect(spinCount()).toBe(1);

    // f. Resolve the in-flight invite; the row turns into a green check (ok)
    //    live in the reopened dialog.
    d.resolve({
      ok: true,
      joinUrl: 'https://x/?join=' + 'a'.repeat(64),
      delivery: { delivered: true, provider: 'resend' },
    });
    await sendPromise;
    await flush();

    expect(okCount()).toBe(1);
    expect(spinCount()).toBe(0);
  });

  it('closing while pending then rejecting shows a red cross after reopen', async () => {
    const d = deferred();
    const app = makeApp(() => d.promise);

    app.showShareDialog();
    document.getElementById('invite-email').value = 'oops@example.com';
    const sendPromise = app._sendInvites();

    expect(spinCount()).toBe(1);

    // Close while pending, then reopen — spinner must still be there.
    document.getElementById('share-dialog-overlay').remove();
    app.showShareDialog();
    expect(spinCount()).toBe(1);

    // Reject the in-flight invite → red cross.
    d.reject(new Error('network down'));
    await sendPromise;
    await flush();

    expect(errCount()).toBe(1);
    expect(spinCount()).toBe(0);
  });
});
