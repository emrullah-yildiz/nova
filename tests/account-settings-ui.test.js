// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/app/app.js';

function jsonResponse(ok, body, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

describe('account settings UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="account-area"></div><div id="recent-list"></div>';
    app.currentUser = { email: 'owner@example.com', displayName: 'Owner', hasPassword: true };
    app.currentPage = 'landing';
    app._accountLoadingLabel = '';
    app._escAccountSettings = null;
    app.renderRecentProjects = vi.fn();
    app._updateChatStatus = vi.fn();
    app._stopCollab = vi.fn();
    app.renderAccount();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    app.closeAccountSettings();
    app.currentUser = null;
  });

  it('opens account settings from the signed-in account menu', () => {
    expect(document.getElementById('account-area').textContent).toContain('Owner');
    document.getElementById('account-btn').click();
    expect(document.getElementById('account-menu').textContent).toContain('Account settings');

    app.openAccountSettings();

    expect(document.getElementById('account-settings-overlay')).not.toBeNull();
    expect(document.getElementById('account-settings-overlay').textContent).toContain('Change password');
    expect(document.getElementById('account-settings-overlay').textContent).toContain('Delete account');
  });

  it('submits password changes to the account password endpoint', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/me/password') {
        return jsonResponse(true, { ok: true, user: { email: 'owner@example.com', displayName: 'Owner', hasPassword: true } });
      }
      throw new Error('unexpected fetch ' + url);
    });
    app.openAccountSettings();
    document.getElementById('account-current-password').value = 'old-pass-123';
    document.getElementById('account-new-password').value = 'new-pass-123';

    await app._submitPasswordChange({ preventDefault: () => {} });

    const call = global.fetch.mock.calls.find(item => item[0] === '/api/me/password');
    expect(call).toBeTruthy();
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ currentPassword: 'old-pass-123', newPassword: 'new-pass-123' });
    expect(document.getElementById('account-password-message').textContent).toBe('Password updated.');
  });

  it('submits account deletion only after email confirmation', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/me') return jsonResponse(true, { ok: true });
      throw new Error('unexpected fetch ' + url);
    });
    app.openAccountSettings();
    document.getElementById('account-delete-password').value = 'old-pass-123';
    document.getElementById('account-delete-confirm').value = 'wrong@example.com';

    await app._submitAccountDelete({ preventDefault: () => {} });
    expect(global.fetch).not.toHaveBeenCalled();

    document.getElementById('account-delete-confirm').value = 'owner@example.com';
    await app._submitAccountDelete({ preventDefault: () => {} });

    const call = global.fetch.mock.calls.find(item => item[0] === '/api/me');
    expect(call).toBeTruthy();
    expect(call[1].method).toBe('DELETE');
    expect(JSON.parse(call[1].body)).toEqual({ password: 'old-pass-123', confirmEmail: 'owner@example.com' });
    expect(app.currentUser).toBeNull();
  });
});
