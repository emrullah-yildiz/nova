// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/app/app.js';

function jsonResponse(ok, body) {
  return {
    ok,
    status: ok ? 200 : 401,
    json: async () => body
  };
}

function resetApp() {
  app.currentUser = null;
  app.currentPage = 'landing';
  app._pendingJoinToken = '';
  app._pendingJoinInvite = null;
  app._pendingJoinEmail = '';
  app._signInReason = '';
  app._accountLoadingLabel = '';
  app._authConfig = { googleClientId: '', devLogin: false };
  app._verifyJustConfirmed = false;
  app.renderRecentProjects = vi.fn();
  app.redeemShareToken = vi.fn(async () => {});
  app._showJoinStatus = vi.fn();
}

describe('invite link auth flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="account-area"></div><div id="recent-list"></div>';
    window.history.replaceState({}, '', '/');
    window.NodeFlow = {
      createNovaCloudClient: () => ({
        previewShareLink: vi.fn(async () => ({
          invite: {
            email: 'invited@example.com',
            projectName: 'Shared Project',
            role: 'Editor'
          }
        }))
      })
    };
    resetApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.NodeFlow;
  });

  it('opens the sign-in modal from an invite link and prefills the invited email', async () => {
    window.history.replaceState({}, '', '/?join=invite-token');
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/auth/config') return jsonResponse(true, { googleClientId: 'google-client-id', devLogin: false });
      if (url === '/api/me') return jsonResponse(false, {});
      throw new Error('unexpected fetch ' + url);
    });

    await app.initAccount();

    expect(document.getElementById('signin-overlay')).not.toBeNull();
    expect(document.getElementById('signin-email').value).toBe('invited@example.com');
    expect(document.getElementById('signin-sub').textContent).toContain('Sign in as invited@example.com');
    expect(document.getElementById('account-area').textContent).toContain('Sign in');
  });

  it('redeems immediately after the invited email signs in', async () => {
    app._pendingJoinToken = 'invite-token';
    app._pendingJoinEmail = 'invited@example.com';
    app._signInReason = 'join';
    app.openSignIn();
    document.getElementById('signin-email').value = 'invited@example.com';
    document.getElementById('signin-password').value = 'password123';
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/auth/login') return jsonResponse(true, { user: { email: 'invited@example.com' } });
      if (url === '/api/me') return jsonResponse(true, { user: { email: 'invited@example.com', displayName: 'Invited' } });
      throw new Error('unexpected fetch ' + url);
    });

    await app._submitEmailAuth({ preventDefault: () => {} });

    expect(app.redeemShareToken).toHaveBeenCalledWith('invite-token');
    expect(document.getElementById('signin-overlay')).toBeNull();
  });

  it('keeps the wrong account on the landing page and does not redeem the invite', async () => {
    app._pendingJoinToken = 'invite-token';
    app._pendingJoinEmail = 'invited@example.com';
    app._signInReason = 'join';
    app.openSignIn();
    document.getElementById('signin-email').value = 'wrong@example.com';
    document.getElementById('signin-password').value = 'password123';
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/auth/login') return jsonResponse(true, { user: { email: 'wrong@example.com' } });
      if (url === '/api/me') return jsonResponse(true, { user: { email: 'wrong@example.com', displayName: 'Wrong' } });
      throw new Error('unexpected fetch ' + url);
    });

    await app._submitEmailAuth({ preventDefault: () => {} });

    expect(app.currentPage).toBe('landing');
    expect(app.redeemShareToken).not.toHaveBeenCalled();
    expect(app._showJoinStatus).toHaveBeenCalledWith({
      loading: false,
      message: 'This invite is for invited@example.com. You signed in as wrong@example.com, so the project was not opened.'
    });
  });
});
