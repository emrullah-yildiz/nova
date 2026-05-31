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

function jwtWithPayload(payload) {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return encode({ alg: 'none' }) + '.' + encode(payload) + '.sig';
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
    app._setRememberedAuth(false);
    app.renderRecentProjects = vi.fn();
  app.redeemShareToken = vi.fn(async () => {});
  app._showJoinStatus = vi.fn();
}

describe('invite link auth flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="account-area"></div><div id="recent-list"></div>';
    window.history.replaceState({}, '', '/');
    sessionStorage.clear();
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
    app._setRememberedAuth(false);
    delete window.NodeFlow;
  });

  it('opens the sign-in modal from an invite link and prefills the invited email', async () => {
    window.history.replaceState({}, '', '/?join=invite-token');
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/auth/config') return jsonResponse(true, { googleClientId: 'google-client-id', devLogin: false });
      if (url === '/api/auth/logout') return jsonResponse(true, { ok: true });
      if (url === '/api/me') return jsonResponse(false, {});
      throw new Error('unexpected fetch ' + url);
    });

    await app.initAccount();

    expect(document.getElementById('signin-overlay')).not.toBeNull();
    expect(document.getElementById('signin-email').value).toBe('invited@example.com');
    expect(document.getElementById('signin-sub').textContent).toContain('Sign in as invited@example.com');
    expect(document.getElementById('account-area').textContent).toContain('Sign in');
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ scope: 'all' })
    }));
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
    expect(JSON.parse(global.fetch.mock.calls.find(call => call[0] === '/api/auth/login')[1].body).remember).toBe(false);
  });

  it('keeps the invite through a private-window Google redirect and opens the shared project', async () => {
    window.history.replaceState({}, '', '/?join=invite-token');
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/auth/config') return jsonResponse(true, { googleClientId: 'google-client-id', devLogin: false });
      if (url === '/api/auth/logout') return jsonResponse(true, { ok: true });
      if (url === '/api/me') return jsonResponse(false, {});
      throw new Error('unexpected fetch before redirect ' + url);
    });

    await app.initAccount();
    expect(document.getElementById('signin-overlay')).not.toBeNull();
    expect(sessionStorage.getItem('nova:pendingJoinToken')).toBe('invite-token');
    expect(sessionStorage.getItem('nova:pendingJoinEmail')).toBe('invited@example.com');

    document.body.innerHTML = '<div id="account-area"></div><div id="recent-list"></div>';
    resetApp();
    app.redeemShareToken = vi.fn(async (token) => {
      app.currentPage = 'workspace';
      app._cloudProjectId = token === 'invite-token' ? 'shared-project-id' : '';
    });
    sessionStorage.setItem('nova:oidc:state', 'state-1');
    sessionStorage.setItem('nova:oidc:nonce', 'nonce-1');
    sessionStorage.setItem('nova:oidc:remember', '0');
    window.history.replaceState({}, '', '/#id_token=' + encodeURIComponent(jwtWithPayload({ nonce: 'nonce-1' })) + '&state=state-1');
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/auth/config') return jsonResponse(true, { googleClientId: 'google-client-id', devLogin: false });
      if (url === '/api/auth/oidc/callback') return jsonResponse(true, { user: { email: 'invited@example.com' } });
      if (url === '/api/me') return jsonResponse(true, { user: { email: 'invited@example.com', displayName: 'Invited' } });
      throw new Error('unexpected fetch after redirect ' + url);
    });

    await app.initAccount();

    expect(app.redeemShareToken).toHaveBeenCalledWith('invite-token');
    expect(app.currentPage).toBe('workspace');
    expect(sessionStorage.getItem('nova:pendingJoinToken')).toBeNull();
  });

  it('sends remember=true only when the user checks Remember me', async () => {
    app.openSignIn();
    document.getElementById('signin-email').value = 'remember@example.com';
    document.getElementById('signin-password').value = 'password123';
    document.getElementById('signin-remember').checked = true;
    global.fetch = vi.fn(async (url) => {
      if (url === '/api/auth/login') return jsonResponse(true, { user: { email: 'remember@example.com' } });
      if (url === '/api/me') return jsonResponse(true, { user: { email: 'remember@example.com', displayName: 'Remember' } });
      throw new Error('unexpected fetch ' + url);
    });

    await app._submitEmailAuth({ preventDefault: () => {} });

    expect(JSON.parse(global.fetch.mock.calls.find(call => call[0] === '/api/auth/login')[1].body).remember).toBe(true);
    expect(app._hasRememberedAuth()).toBe(true);
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
