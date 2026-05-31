import { AIEngine } from '../ai/ai-engine.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from '../core/nodes.js';
import { describeWireTypeMismatch } from '../core/wire-type-check.js';
import { computeFitView } from '../core/graph-layout.js';
import { CodeParser } from '../runtime/parser.js';
import { Viewer3D } from '../viewer/viewer3d.js';

// ============================================

// NOVA — Application v5

// Fixes: output port dot order, new node z-index,

//        chat bottom not covering library

// ============================================

const app = {

  currentPage: 'landing',

  initialized: false,

  nodes: [], wires: [], selectedNodes: [],

  nextNodeId: 1, nodeZCounter: 10,

  zoom: 1, panX: 0, panY: 0,

  isPanning: false, panStart: null,

  draggingNode: null, dragOffset: {x:0,y:0},

  connectingWire: null,

  codeLang: 'python', // 'python' or 'csharp'

  codeViewerOpen: false,

  chatDock: 'right',

  chatWidth: 360,  // for left/right dock

  chatHeight: 280, // for bottom dock

  isResizingChat: false,

  chatVisible: true,

  isDraggingChat: false,

  chatDragOffset: {x:0,y:0},

  chatHistories: { landing: [], workspace: [] },



  init() {

    this.renderTemplates();

    this.renderRecentProjects();

    this.renderNodeLibrary();

    this.initLandingChat();

    this.initCanvasEvents();

    this.initKeyboard();

    document.addEventListener('click', e => {

      this.hideContextMenu();

      if (!e.target.closest('#account-area')) {
        const am = document.getElementById('account-menu');
        if (am) am.classList.remove('visible');
      }

      if (!e.target.closest('.dock-selector') && !e.target.closest('.chat-header-btn'))

        document.getElementById('dock-selector').classList.remove('visible');

    });

    // Chat resize handle

    const chatHandle = document.getElementById('chat-resize-handle');

    if (chatHandle) {

      chatHandle.addEventListener('mousedown', e => { e.preventDefault(); this.isResizingChat = true; });

    }

    this.initAccount();

    this.initialized = true;

  },

  // ── ACCOUNTS (sign in with Google / SSO; session via httpOnly cookie) ──

  async initAccount() {
    this._handleJoinParam();
    const googleRedirectPending = this._hasGoogleRedirect();
    const joinRedirectPending = !!this._pendingJoinToken && !googleRedirectPending;
    if (googleRedirectPending) this._setAccountLoading('Signing in...');
    else if (joinRedirectPending) this._setAccountLoading('Opening invite...');
    else this.renderAccount();
    const configPromise = fetch('/api/auth/config', { credentials: 'include' })
      .then(res => res.ok ? res.json() : { googleClientId: '', devLogin: false })
      .catch(() => ({ googleClientId: '', devLogin: false }));
    const verifyPromise = this._handleVerifyParam();
    const previewPromise = this._loadPendingJoinInvite();
    await verifyPromise;
    try {
      this._authConfig = await configPromise;
    } catch {
      this._authConfig = { googleClientId: '', devLogin: false };
    }
    await previewPromise;
    // If we just came back from Google's account chooser, complete the sign-in
    // (sets the session cookie) BEFORE reading the session below.
    const handledGoogle = await this._handleGoogleRedirect();
    if (!handledGoogle) await this.refreshSession();
  },

  _hasGoogleRedirect() {
    try { return (window.location.hash || '').indexOf('id_token=') !== -1; }
    catch { return false; }
  },

  _setAccountLoading(label) {
    this._accountLoadingLabel = label || '';
    this.renderAccount();
  },

  // If opened from a share link (?join=<token>), stash the token and strip it
  // from the URL. It's redeemed once the user is signed in (see refreshSession);
  // if they're not, the sign-in prompt is shown and redemption runs after.
  _handleJoinParam() {
    try {
      const token = new URLSearchParams(window.location.search).get('join') || '';
      if (token) {
        this._pendingJoinToken = token;
        this._signInReason = 'join';
        this._pendingJoinInvite = null;
        this._pendingJoinEmail = '';
      }
      const u = new URL(window.location.href);
      u.searchParams.delete('join');
      window.history.replaceState({}, document.title, u.pathname + u.search + u.hash);
    } catch { /* ignore */ }
  },

  async _loadPendingJoinInvite() {
    const token = this._pendingJoinToken;
    if (!token) return null;
    try {
      const client = this.getNovaCloudClient
        ? this.getNovaCloudClient()
        : (window.NodeFlow && window.NodeFlow.createNovaCloudClient
            ? window.NodeFlow.createNovaCloudClient({ useCookie: true })
            : null);
      if (!client || !client.previewShareLink) return null;
      const res = await client.previewShareLink(token);
      const invite = res && (res.invite || res.shareLink || res);
      this._pendingJoinInvite = invite || null;
      this._pendingJoinEmail = invite && invite.email ? String(invite.email).trim().toLowerCase() : '';
      return this._pendingJoinInvite;
    } catch {
      return null;
    }
  },

  _joinExpectedEmail() {
    return this._pendingJoinEmail || (this._pendingJoinInvite && this._pendingJoinInvite.email) || '';
  },

  _joinEmailMismatchMessage(actualEmail) {
    const expected = this._joinExpectedEmail();
    if (!expected) return '';
    return 'This invite is for ' + expected + '. You signed in as ' + (actualEmail || 'another account') + ', so the project was not opened.';
  },

  _pendingJoinMatchesUser(user) {
    const expected = String(this._joinExpectedEmail() || '').trim().toLowerCase();
    if (!expected) return true;
    const actual = String((user && user.email) || '').trim().toLowerCase();
    return actual === expected;
  },

  _handleJoinEmailMismatch(user) {
    const msg = this._joinEmailMismatchMessage(user && user.email);
    this._pendingJoinToken = '';
    this._pendingJoinInvite = null;
    this._pendingJoinEmail = '';
    this._signInReason = '';
    if (this._showJoinStatus && msg) this._showJoinStatus({ loading: false, message: msg });
  },

  // Before redeeming an invite, confirm which signed-in account joins — an
  // invite is redeemed by whoever is signed in, so opening it shouldn't
  // silently join as the wrong account.
  showJoinChooser(token) {
    if (!token) return;
    this._pendingJoinToken = token;
    const existing = document.getElementById('join-chooser-overlay');
    if (existing) existing.remove();
    const u = this.currentUser || {};
    const label = u.displayName || u.email || 'this account';
    const initial = (String(label)[0] || '?').toUpperCase();
    const overlay = document.createElement('div');
    overlay.id = 'join-chooser-overlay';
    overlay.className = 'project-save-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = '<div class="project-save-dialog" role="dialog" aria-modal="true" style="width:min(420px,100%)">' +
      '<div class="project-save-header"><div class="project-save-mark">↗</div>' +
      '<div><h3>Open shared project</h3><p>You were invited to a project — open it as which account?</p></div></div>' +
      '<div class="join-account-row"><span class="account-avatar">' + this.escapeHtml(initial) + '</span>' +
      '<span class="join-account-email">' + this.escapeHtml(u.email || label) + '</span></div>' +
      '<div class="project-save-footer" style="gap:8px;justify-content:flex-end">' +
        '<button class="share-link-btn" onclick="app._joinUseDifferent()">Use a different account</button>' +
        '<button class="share-create-btn" onclick="app._joinContinue()">Continue</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
  },

  async _joinContinue() {
    const token = this._pendingJoinToken;
    // Clear the pending token so refreshSession doesn't reprocess it, but AWAIT
    // the redeem+open so the chooser isn't torn down (leaving the user on the
    // landing page) while it runs. redeemShareToken shows its own visible
    // loading/error state and switches to the workspace on success.
    this._pendingJoinToken = '';
    const o = document.getElementById('join-chooser-overlay'); if (o) o.remove();
    if (token && this.redeemShareToken) await this.redeemShareToken(token);
  },

  _joinUseDifferent() {
    const o = document.getElementById('join-chooser-overlay'); if (o) o.remove();
    // Keep _pendingJoinToken set and ADD another account (no sign-out — this is
    // multi-account). The new login becomes active; refreshSession then re-runs
    // the join chooser for that account, where the user clicks Continue.
    this._signInReason = 'join';
    if (this.signIn) this.signIn();
  },

  // If the page was opened from a verification email (?verify=<token>), confirm
  // the token, then strip it from the URL so a refresh doesn't re-submit it.
  async _handleVerifyParam() {
    let token = '';
    try { token = new URLSearchParams(window.location.search).get('verify') || ''; } catch { token = ''; }
    if (!token) return;
    try {
      const r = await fetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      this._verifyJustConfirmed = r.ok;
    } catch { /* ignore — banner stays until they retry */ }
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('verify');
      window.history.replaceState({}, document.title, u.pathname + u.search + u.hash);
    } catch { /* ignore */ }
  },

  async refreshSession(options = {}) {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      this.currentUser = res.ok ? (await res.json()).user : null;
    } catch {
      this.currentUser = null;
    }
    this._accountLoadingLabel = '';
    this.renderAccount();
    // A pending share link: confirm WHICH account joins before redeeming (an
    // invite is redeemed by whoever's signed in — don't silently join as the
    // wrong account). Signed out → prompt sign-in; redeems on next refresh.
    if (this._pendingJoinToken) {
      if (this.currentUser && this.showJoinChooser) {
        if (!this._pendingJoinMatchesUser(this.currentUser)) {
          this._handleJoinEmailMismatch(this.currentUser);
          return;
        }
        if (options.autoJoinPendingShare && this.redeemShareToken) {
          const token = this._pendingJoinToken;
          this._pendingJoinToken = '';
          await this.redeemShareToken(token);
          return;
        }
        this.showJoinChooser(this._pendingJoinToken);
        return;
      } else if (!this.currentUser && this.signIn) {
        this._signInReason = 'join';
        this.signIn();
      }
    }
    await this._syncAiPrefsForSession();
    // Refresh the landing project list: account projects when signed in, local
    // recents when signed out.
    if (this.currentPage === 'landing' && this.renderRecentProjects) {
      const el = document.getElementById('recent-list');
      if (el) delete el.dataset.cloudLoaded;
      this.renderRecentProjects();
    }
  },

  // Route AI prefs to the right backend for the current session. Signed in:
  // swap to the account-backed cache and hydrate it from the server (claiming
  // any anonymously-entered key if the account has none). Signed out: anonymous
  // sessionStorage. Never blocks session refresh.
  async _syncAiPrefsForSession() {
    const G = window.GPTClient;
    if (!G) return;
    try {
      if (this.currentUser) {
        // Capture an anon key (if any) before swapping backends, to claim it.
        const anon = G.hasApiKey && G.hasApiKey() ? G._collectAiSettings() : null;
        G._useSignedInPrefs();
        let settings = null;
        try {
          const res = await fetch('/api/me/ai-settings', { credentials: 'include' });
          if (res.ok) settings = (await res.json()).settings;
        } catch { settings = null; }
        if (settings && settings.keys && Object.keys(settings.keys).length) {
          G.hydrateFromServer(settings);
        } else if (anon && anon.keys && Object.keys(anon.keys).length) {
          G.hydrateFromServer(anon);   // one-way claim into the empty account
          G._scheduleSync();
        } else {
          G._aiSettingsHydrated = true; // signed in, nothing stored yet
        }
      } else {
        G._useAnonymousPrefs();
      }
    } catch {
      /* never block on pref sync */
    }
    if (this._updateChatStatus) this._updateChatStatus();
  },

  renderAccount() {
    const el = document.getElementById('account-area');
    if (!el) return;
    const u = this.currentUser;
    if (u) {
      const label = u.displayName || u.email || 'Account';
      const initial = (String(label)[0] || '?').toUpperCase();
      el.innerHTML =
        '<button class="account-btn" id="account-btn" title="' + this.escapeHtml(u.email || '') + '">' +
        '<span class="account-avatar">' + this.escapeHtml(initial) + '</span><span class="account-name">' + this.escapeHtml(label) + '</span></button>' +
        '<div class="account-menu" id="account-menu">' +
          '<div class="account-switch-list" id="account-switch-list"><div class="account-menu-email">' + this.escapeHtml(u.email || '') + '</div></div>' +
          '<button class="account-menu-item" onclick="app.signIn()">+ Add account</button>' +
          '<div class="account-menu-sep"></div>' +
          '<button class="account-menu-item" onclick="app.logout(\'current\')">Sign out</button>' +
          '<button class="account-menu-item account-menu-muted" onclick="app.logout(\'all\')">Sign out of all</button>' +
        '</div>';
      const btn = document.getElementById('account-btn');
      const menu = document.getElementById('account-menu');
      if (btn && menu) btn.onclick = (e) => {
        e.stopPropagation();
        menu.classList.toggle('visible');
        if (menu.classList.contains('visible')) this._renderAccountSwitcher();
      };
    } else {
      const loading = this._accountLoadingLabel;
      if (loading) {
        el.innerHTML = '<button class="account-btn account-loading" disabled><span class="account-spinner" aria-hidden="true"></span><span>' + this.escapeHtml(loading) + '</span></button>';
      } else {
        el.innerHTML = '<button class="account-btn account-signin" onclick="app.signIn()">Sign in</button>';
      }
    }
    this.renderVerifyBanner();
  },

  // Populate the account dropdown with all signed-in accounts (the switcher).
  async _renderAccountSwitcher() {
    const list = document.getElementById('account-switch-list');
    if (!list) return;
    let accounts = [];
    try {
      const r = await fetch('/api/me/accounts', { credentials: 'include' });
      if (r.ok) accounts = (await r.json()).accounts || [];
    } catch { /* keep the email-only fallback */ }
    if (accounts.length <= 1) return;
    list.innerHTML = accounts.map(a => {
      const init = (String(a.displayName || a.email || '?')[0] || '?').toUpperCase();
      return '<button class="account-switch-row' + (a.active ? ' active' : '') + '" onclick="app.switchAccount(' + a.slot + ')">' +
        '<span class="account-avatar">' + this.escapeHtml(init) + '</span>' +
        '<span class="account-switch-email">' + this.escapeHtml(a.email || '') + '</span>' +
        (a.active ? '<span class="account-switch-check">✓</span>' : '') + '</button>';
    }).join('');
  },

  async switchAccount(slot) {
    try {
      const r = await fetch('/api/auth/switch', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot })
      });
      if (!r.ok) { await this._renderAccountSwitcher(); return; } // expired → refresh list
      const menu = document.getElementById('account-menu'); if (menu) menu.classList.remove('visible');
      // Switching changes the active account → drop the open project (it belongs
      // to the previous account) and re-sync everything.
      this._cloudProjectId = '';
      this._lastCloudSaveSerialized = null;
      await this.refreshSession();
    } catch { /* ignore */ }
  },

  // Top banner nudging the user to confirm their email. Shows while the signed-
  // in user is unverified; flashes a success note right after verification.
  renderVerifyBanner() {
    const u = this.currentUser;
    let el = document.getElementById('verify-banner');
    if (this._verifyJustConfirmed && (!u || u.emailVerified)) {
      if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
      el.id = 'verify-banner';
      el.className = 'verify-banner ok';
      el.innerHTML = '<span>✓ Your email is verified.</span>';
      this._verifyJustConfirmed = false;
      setTimeout(() => { const b = document.getElementById('verify-banner'); if (b) b.remove(); }, 4000);
      return;
    }
    if (!u || u.emailVerified !== false) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'verify-banner'; document.body.appendChild(el); }
    el.className = 'verify-banner';
    el.innerHTML =
      '<span>⚠ Please verify your email — we sent a link to <strong>' + (u.email || '') + '</strong>.</span>' +
      '<button class="verify-resend" onclick="app.resendVerification()">Resend</button>' +
      '<button class="verify-dismiss" onclick="app.dismissVerifyBanner()" aria-label="Dismiss">&times;</button>';
  },

  dismissVerifyBanner() {
    const b = document.getElementById('verify-banner');
    if (b) b.remove();
  },

  async resendVerification() {
    const el = document.getElementById('verify-banner');
    try {
      const r = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'include' });
      if (el) {
        if (r.ok) {
          el.className = 'verify-banner ok';
          el.innerHTML = '<span>✓ Verification email sent — check your inbox.</span>';
        } else {
          const d = await r.json().catch(() => ({}));
          el.innerHTML = '<span>Could not send: ' + ((d.error && d.error.message) || 'try again later') + '</span>' +
            '<button class="verify-dismiss" onclick="app.dismissVerifyBanner()" aria-label="Dismiss">&times;</button>';
        }
      }
    } catch { /* ignore */ }
  },

  // Google sign-in uses an OpenID Connect redirect with prompt=select_account,
  // NOT the GIS One Tap / credential button. One Tap silently reuses the single
  // active Google session (and self-suppresses after a few dismissals), so it
  // can't let the user choose or switch accounts. The redirect always shows
  // Google's account chooser ("Use another account" included) and returns an
  // id_token the existing /api/auth/oidc/callback verifier accepts unchanged.

  // Where Google redirects back to. Must EXACTLY match an Authorized redirect URI
  // on the Google Cloud OAuth client — Google compares the full string, so the
  // trailing slash matters. We use the bare origin (scheme+host+port, no path,
  // no trailing slash), e.g. https://hi-nova.work, https://nova.ey-myacc.workers.dev,
  // http://127.0.0.1:8080. Path-independent, so it's the same wherever the app loads.
  _googleRedirectUri() {
    return window.location.origin;
  },

  _randomToken() {
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  },

  // Decode a JWT payload (unverified — only used client-side to check the nonce
  // for replay protection; the server is the real trust anchor).
  _decodeJwtPayload(token) {
    try {
      const part = String(token).split('.')[1];
      const json = decodeURIComponent(
        atob(part.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    } catch { return null; }
  },

  // On boot: if Google redirected back with an id_token in the URL fragment,
  // validate state/nonce and exchange it for a session.
  async _handleGoogleRedirect() {
    let hash = '';
    try { hash = window.location.hash || ''; } catch { return false; }
    if (hash.indexOf('id_token=') === -1) return false;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const idToken = params.get('id_token');
    const state = params.get('state');
    // Strip the fragment immediately so a refresh can't replay it and the raw
    // token never lingers in the address bar.
    try {
      const u = new URL(window.location.href);
      window.history.replaceState({}, document.title, u.pathname + u.search);
    } catch { /* ignore */ }
    let expectedState = '';
    let expectedNonce = '';
    try {
      expectedState = sessionStorage.getItem('nova:oidc:state') || '';
      expectedNonce = sessionStorage.getItem('nova:oidc:nonce') || '';
      sessionStorage.removeItem('nova:oidc:state');
      sessionStorage.removeItem('nova:oidc:nonce');
    } catch { /* ignore */ }
    if (!idToken) { this._accountLoadingLabel = ''; this.renderAccount(); return true; }
    // CSRF: the redirect must echo the state we generated.
    if (expectedState && state !== expectedState) { this._accountLoadingLabel = ''; this.renderAccount(); return true; }
    // Replay: the token's nonce must match the one we sent.
    if (expectedNonce) {
      const claims = this._decodeJwtPayload(idToken);
      if (!claims || claims.nonce !== expectedNonce) { this._accountLoadingLabel = ''; this.renderAccount(); return true; }
    }
    await this._completeGoogleSignIn(idToken);
    return true;
  },

  signIn() { this.openSignIn(); },

  // Sign-in modal: the user picks how to authenticate — Google (if configured)
  // or email+password (sign in to an existing account, or create a new one).
  openSignIn() {
    if (document.getElementById('signin-overlay')) return;
    const cfg = this._authConfig || {};
    const reason = this._signInReason || '';
    const joinEmail = reason === 'join' ? this._joinExpectedEmail() : '';
    const subtitle = reason === 'join'
      ? (joinEmail ? 'Sign in as ' + joinEmail + ' to open this shared project.' : 'Sign in to open this shared project.')
      : reason === 'share'
        ? 'Sign in to invite people to this project.'
        : 'Sign in to save and sync your work.';
    const overlay = document.createElement('div');
    overlay.id = 'signin-overlay';
    overlay.innerHTML =
      '<div class="signin-panel" role="dialog" aria-modal="true" aria-label="Sign in to Nova">' +
        '<button class="signin-close" aria-label="Close" onclick="app.closeSignIn()">&times;</button>' +
        '<div class="signin-title">Welcome to Nova</div>' +
        '<div class="signin-sub" id="signin-sub">' + this.escapeHtml(subtitle) + '</div>' +
        (cfg.googleClientId
          ? '<div class="signin-google" id="signin-google"></div><div class="signin-divider"><span>or</span></div>'
          : '') +
        '<form class="signin-form" id="signin-form" autocomplete="on">' +
          '<div class="signin-field" id="signin-name-field" style="display:none">' +
            '<label for="signin-name">Name</label>' +
            '<input id="signin-name" type="text" autocomplete="name" placeholder="Your name">' +
          '</div>' +
          '<div class="signin-field">' +
            '<label for="signin-email">Email</label>' +
            '<input id="signin-email" type="email" autocomplete="email" placeholder="you@example.com" required value="' + this.escapeHtml(joinEmail || '') + '">' +
          '</div>' +
          '<div class="signin-field">' +
            '<label for="signin-password">Password</label>' +
            '<input id="signin-password" type="password" autocomplete="current-password" placeholder="At least 8 characters" required minlength="8">' +
          '</div>' +
          '<div class="signin-error" id="signin-error"></div>' +
          '<button class="signin-submit" id="signin-submit" type="submit">Sign in</button>' +
        '</form>' +
        '<div class="signin-toggle" id="signin-toggle">New to Nova? <button type="button" onclick="app.toggleSignInMode()">Create an account</button></div>' +
      '</div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeSignIn(); });
    document.body.appendChild(overlay);
    this._signInMode = 'login';
    this._escSignIn = (e) => { if (e.key === 'Escape') this.closeSignIn(); };
    document.addEventListener('keydown', this._escSignIn);
    const form = document.getElementById('signin-form');
    if (form) form.addEventListener('submit', (e) => this._submitEmailAuth(e));
    this._renderGoogleButton();
    const email = document.getElementById('signin-email');
    if (email) setTimeout(() => email.focus(), 50);
  },

  closeSignIn() {
    const overlay = document.getElementById('signin-overlay');
    if (overlay) overlay.remove();
    this._signInReason = '';
    if (this._escSignIn) { document.removeEventListener('keydown', this._escSignIn); this._escSignIn = null; }
  },

  // Render the "Continue with Google" button into the modal. Clicking it starts
  // the redirect flow (see signInWithGoogle), so no GIS script load is needed.
  _renderGoogleButton() {
    const host = document.getElementById('signin-google');
    const clientId = this._authConfig && this._authConfig.googleClientId;
    if (!host || !clientId) return;
    host.innerHTML = '<button type="button" class="signin-google-btn" onclick="app.signInWithGoogle()">Continue with Google</button>';
  },

  // Send the user to Google's account chooser. prompt=select_account forces the
  // chooser every time so they can pick or switch accounts; the id_token comes
  // back in the redirect fragment and is handled by _handleGoogleRedirect.
  signInWithGoogle() {
    const clientId = this._authConfig && this._authConfig.googleClientId;
    if (!clientId) { this._showSignInError('Google sign-in is not configured.'); return; }
    const nonce = this._randomToken();
    const state = this._randomToken();
    try {
      sessionStorage.setItem('nova:oidc:nonce', nonce);
      sessionStorage.setItem('nova:oidc:state', state);
    } catch { /* sign-in still works; we just skip the client-side replay check */ }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this._googleRedirectUri(),
      response_type: 'id_token',
      scope: 'openid email profile',
      prompt: 'select_account',
      nonce,
      state
    });
    const joinEmail = this._joinExpectedEmail();
    if (joinEmail) params.set('login_hint', joinEmail);
    window.location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
  },

  // Flip the modal between "sign in" and "create account".
  toggleSignInMode() {
    this._signInMode = this._signInMode === 'login' ? 'signup' : 'login';
    const signup = this._signInMode === 'signup';
    const nameField = document.getElementById('signin-name-field');
    const submit = document.getElementById('signin-submit');
    const sub = document.getElementById('signin-sub');
    const toggle = document.getElementById('signin-toggle');
    const pw = document.getElementById('signin-password');
    if (nameField) nameField.style.display = signup ? '' : 'none';
    if (submit) submit.textContent = signup ? 'Create account' : 'Sign in';
    if (sub) {
      const joinEmail = this._joinExpectedEmail();
      if (this._signInReason === 'join') sub.textContent = signup
        ? (joinEmail ? 'Create or verify ' + joinEmail + ' to open this shared project.' : 'Create an account to open this shared project.')
        : (joinEmail ? 'Sign in as ' + joinEmail + ' to open this shared project.' : 'Sign in to open this shared project.');
      else if (this._signInReason === 'share') sub.textContent = signup ? 'Create an account to invite people to this project.' : 'Sign in to invite people to this project.';
      else sub.textContent = signup ? 'Create an account to save and sync your work.' : 'Sign in to save and sync your work.';
    }
    if (toggle) toggle.innerHTML = signup
      ? 'Already have an account? <button type="button" onclick="app.toggleSignInMode()">Sign in</button>'
      : 'New to Nova? <button type="button" onclick="app.toggleSignInMode()">Create an account</button>';
    if (pw) pw.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    const joinEmail = this._joinExpectedEmail();
    if (this._signInReason === 'join' && joinEmail) {
      const email = document.getElementById('signin-email');
      if (email && !email.value) email.value = joinEmail;
    }
    this._showSignInError('');
  },

  async _submitEmailAuth(event) {
    if (event) event.preventDefault();
    const signup = this._signInMode === 'signup';
    const emailEl = document.getElementById('signin-email');
    const pwEl = document.getElementById('signin-password');
    const nameEl = document.getElementById('signin-name');
    const email = (emailEl && emailEl.value || '').trim();
    const password = (pwEl && pwEl.value) || '';
    const displayName = signup ? ((nameEl && nameEl.value || '').trim()) : '';
    if (!email || !password) { this._showSignInError('Email and password are required.'); return false; }
    if (signup && password.length < 8) { this._showSignInError('Password must be at least 8 characters.'); return false; }
    const submit = document.getElementById('signin-submit');
    const original = submit ? submit.textContent : '';
    if (submit) { submit.disabled = true; submit.textContent = signup ? 'Creating…' : 'Signing in…'; }
    try {
      const endpoint = signup ? '/api/auth/signup' : '/api/auth/login';
      const r = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signup ? { email, password, displayName } : { email, password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = data && data.error && data.error.code;
        const msg = (data && data.error && data.error.message) || (signup ? 'Could not create your account.' : 'Invalid email or password.');
        // Unverified login: don't sign in — explain and offer to resend the link.
        if (code === 'EMAIL_NOT_VERIFIED') { this._showVerifyNotice(email, msg); return false; }
        this._showSignInError(msg);
        return false;
      }
      // Sign-up no longer signs you in — it requires email verification first.
      if (signup && data.verificationRequired) {
        if (this._signInMode === 'signup') this.toggleSignInMode(); // back to the Sign-in form
        const verifyMsg = this._signInReason === 'join'
          ? 'Account created. We emailed a verification link to ' + email + ' — click it, then open the invite link again.'
          : 'Account created. We emailed a verification link to ' + email + ' — click it to finish signing in.';
        this._showVerifyNotice(email, verifyMsg);
        return false;
      }
      // Verified login succeeded.
      const autoJoin = this._signInReason === 'join';
      this.closeSignIn();
      await this.refreshSession({ autoJoinPendingShare: autoJoin });
    } catch (e) {
      this._showSignInError('Network error — please try again.');
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = original; }
    }
    return false;
  },

  _showSignInError(msg) {
    const el = document.getElementById('signin-error');
    if (el) { el.classList.remove('signin-notice'); el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
  },

  // Info notice (not a hard error) shown when sign-in is pending email
  // verification, with a one-tap "Resend link".
  _showVerifyNotice(email, msg) {
    const el = document.getElementById('signin-error');
    if (!el) return;
    el.style.display = 'block';
    el.classList.add('signin-notice');
    const safe = String(email || '').replace(/'/g, "\\'");
    el.innerHTML = (msg ? this.escapeHtml(msg) + ' ' : '') +
      '<button type="button" class="signin-resend" onclick="app.resendVerificationEmail(\'' + safe + '\')">Resend link</button>';
  },

  async resendVerificationEmail(email) {
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
    } catch { /* generic — never reveal account state */ }
    const el = document.getElementById('signin-error');
    if (el) { el.classList.add('signin-notice'); el.textContent = 'Verification link sent — check your inbox (and spam).'; }
  },

  // Exchange a Google id_token for a Nova session. Called after the redirect
  // back from Google's account chooser (see _handleGoogleRedirect).
  async _completeGoogleSignIn(idToken) {
    if (!idToken) {
      this._accountLoadingLabel = '';
      this.renderAccount();
      this.openSignIn();
      this._showSignInError('Google did not return a sign-in. Try again, or use email + password.');
      return;
    }
    const autoJoin = this._signInReason === 'join';
    this._setAccountLoading('Signing in...');
    try {
      const r = await fetch('/api/auth/oidc/callback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Surface the server's real reason (e.g. audience/issuer mismatch)
        // rather than a generic message. The modal isn't open after a redirect,
        // so open it to show the error.
        this._accountLoadingLabel = '';
        this.renderAccount();
        this.openSignIn();
        this._showSignInError((data.error && data.error.message) || 'Google sign-in failed. Please try again.');
        return;
      }
      this.closeSignIn();
      // refreshSession runs right after this in initAccount; if we were called
      // some other way, reflect the new session now.
      await this.refreshSession({ autoJoinPendingShare: autoJoin });
    } catch (e) {
      this._accountLoadingLabel = '';
      this.renderAccount();
      this.openSignIn();
      this._showSignInError('Network error during Google sign-in — please try again.');
    }
  },

  async logout(scope) {
    const sc = scope === 'current' ? 'current' : 'all';
    try {
      await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: sc })
      });
    } catch { /* ignore */ }
    // Signing out one account may leave another active — refresh and let
    // refreshSession reflect whoever's now active (or signed out).
    this._cloudProjectId = '';
    this._lastCloudSaveSerialized = null;
    if (sc === 'current') {
      await this.refreshSession();
      return;
    }
    // Sign out of all.
    this.currentUser = null;
    if (window.GPTClient) window.GPTClient._useAnonymousPrefs();
    this.renderAccount();
    if (this._updateChatStatus) this._updateChatStatus();
    if (this.currentPage === 'landing' && this.renderRecentProjects) {
      const el = document.getElementById('recent-list');
      if (el) delete el.dataset.cloudLoaded;
      this.renderRecentProjects();
    }
  },



  // ── MENU STATE ──

  updateMenuState() {

    const ws = this.currentPage === 'workspace';

    const has = this.nodes.length > 0;

    document.getElementById('menu-edit').classList.toggle('disabled', !ws);

    document.getElementById('menu-view').classList.toggle('disabled', !ws);

    const run = document.getElementById('menu-run');

    if (run) {

      run.classList.toggle('disabled', !ws || !has);

      run.style.color = (ws && has) ? 'var(--accent-green)' : '';

      run.onclick = (ws && has) ? () => app.runGraph() : null;

    }

    const cl = document.getElementById('mi-close');

    if (cl) cl.classList.toggle('disabled', !ws);

    const invite = document.getElementById('btn-invite');
    if (invite) {
      invite.style.display = ws ? 'inline-flex' : 'none';
      invite.disabled = !ws;
    }

    ['mi-save','mi-saveas','mi-cloud-open','mi-export','mi-import'].forEach(id => {

      const el = document.getElementById(id);

      if (el) el.classList.toggle('disabled', !ws);

    });

    if (this._updateHistoryMenuState) this._updateHistoryMenuState();

  },



  // ── LANDING ──

  renderTemplates() {

    const t = [

      {id:'blank',name:'Blank Canvas',desc:'Start from scratch',icon:'✦',color:'var(--accent-teal)'}

    ];

    document.getElementById('templates-grid').innerHTML = t.map(x => `

      <div class="template-card" style="--card-accent:${x.color}" onclick="app.openTemplate('${x.id}')">

        <div class="template-icon" style="background:${x.color}22;color:${x.color}">${x.icon}</div>

        <h4>${x.name}</h4><p>${x.desc}</p>

      </div>`).join('');

  },

  renderRecentProjects() {

    document.getElementById('recent-list').innerHTML = [

      {name:'Parametric Facade',date:'2 hours ago'},

      {name:'Grid Analysis',date:'Yesterday'},

      {name:'Data Conversion',date:'3 days ago'}

    ].map(r => `<button class="recent-item" onclick="app.newProject()"><span class="ri-icon">📄</span><span class="ri-name">${r.name}</span><span class="ri-date">${r.date}</span></button>`).join('');

  },



  // ── NAVIGATION ──

  goHome() { if (this.currentPage === 'workspace') this.closeProject(); },

  closeProject() {

    this.nodes=[]; this.wires=[]; this.selectedNodes=[]; this._undoStack=[]; this._redoStack=[]; this._lastHistorySnapshot=null;
    this._hasRun=false; this._isRunningGraph=false; this._lastRunVersion=0;
    this._cloudProjectId='';

    this.nextNodeId=1; this.nodeZCounter=10; this.zoom=1; this.panX=0; this.panY=0;

    const c=document.getElementById('node-canvas'); if(c) c.innerHTML='';

    const svg=document.getElementById('wire-svg'); if(svg) svg.innerHTML='';

    this.chatHistories.workspace=[];

    this.switchPage('landing');

  },

  newProject() {

    this.nodes=[]; this.wires=[]; this.selectedNodes=[]; this._undoStack=[]; this._redoStack=[]; this._lastHistorySnapshot=null;
    this._hasRun=false; this._isRunningGraph=false; this._lastRunVersion=0;
    this._cloudProjectId='';

    this.nextNodeId=1; this.nodeZCounter=10; this.zoom=1; this.panX=0; this.panY=0;

    const c=document.getElementById('node-canvas'); if(c) c.innerHTML='';

    const svg=document.getElementById('wire-svg'); if(svg) svg.innerHTML='';

    this.chatHistories.workspace=[];

    this.switchPage('workspace');

    this.initWorkspaceChat();

  },

  openTemplate(id) {

    this.newProject();
    // Legacy fallback retained only so callers don't crash; the modern
    // landing-page templates live in node-library.js and logger-patch.js.
    void id;

  },

  addWire(fn,fp,tn,tp) {

    this.wires = this.wires.filter(w => !(w.toNode===tn && w.toPort===tp));

    const wire = {fromNode:fn,fromPort:fp,toNode:tn,toPort:tp};
    // Phase 5: flag type mismatches at connect time. Renderer reads
    // wire.typeMismatch to draw the wire in red/dashed with a tooltip.
    const mm = describeWireTypeMismatch(wire, this.nodes);
    if (mm) wire.typeMismatch = mm;
    this.wires.push(wire); if(typeof Viewer3D!=='undefined') Viewer3D._needsRebuild=true;

    if(this.invalidateCompute) this.invalidateCompute();

  },

  switchPage(p) {

    document.getElementById('landing-page').style.display = p==='landing'?'flex':'none';

    document.getElementById('workspace-page').style.display = p==='workspace'?'block':'none';

    this.currentPage = p;

    this.updateMenuState();

    if (p==='workspace') {
      this.syncWorkspaceLayout();
      this.queueWorkspaceLayoutSync();
      setTimeout(()=>this.renderWires(),50);
    }

  },



  // ── NODE LIBRARY ──

  renderNodeLibrary() {
    var html = '';
    NODE_LIBRARY.categories.forEach(function(cat) {
      // Group nodes by their 'group' property
      var groups = {};
      cat.nodes.forEach(function(n) {
        var g = n.subGroup || n.group || '_ungrouped';
        if (!groups[g]) groups[g] = [];
        groups[g].push(n);
      });
      var groupKeys = Object.keys(groups).sort(function(a, b) {
        // Order: specific named groups first, then ungrouped
        if (a === '_ungrouped') return 1;
        if (b === '_ungrouped') return -1;
        return a.localeCompare(b);
      });
      // Skip the sub-folder header when the category contains only one
      // non-ungrouped group — a single sub-folder under a category just
      // adds a click for no organizational value.
      var namedGroupCount = groupKeys.filter(function(g) { return g !== '_ungrouped'; }).length;
      var skipSubgroupHeaders = namedGroupCount <= 1;

      html += `<div class="node-category open" data-cat="${cat.id}">
        <button class="node-category-header" onclick="app.toggleCategory('${cat.id}')">
          <span class="node-category-dot" style="background:${cat.color}"></span>
          <span class="node-category-name">${cat.name}</span>
          <span class="node-category-count">${cat.nodes.length}</span>
          <svg class="node-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
        <div class="node-category-items">`;

      groupKeys.forEach(function(g) {
        var renderSubgroupHeader = g !== '_ungrouped' && !skipSubgroupHeaders;
        if (renderSubgroupHeader) {
          html += `<div class="node-subgroup">
            <button class="node-subgroup-header" onclick="app.toggleSubGroup(this)">
              <svg class="node-subgroup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
              <span class="node-subgroup-name">${g}</span>
            </button>
            <div class="node-subgroup-items">`;
        }
        groups[g].forEach(function(n) {
          html += `<button class="node-lib-item" draggable="true" ondragstart="app.onLibDragStart(event,'${n.type}')" onclick="app.addNodeFromLib('${n.type}')"><span class="nli-icon" style="color:${cat.color}">${n.icon}</span>${n.name}</button>`;
        });
        if (renderSubgroupHeader) {
          html += `</div></div>`;
        }
      });

      html += `</div></div>`;
    });
    document.getElementById('node-categories').innerHTML = html;
  },

  toggleCategory(id) { const el=document.querySelector(`.node-category[data-cat="${id}"]`); if(el) el.classList.toggle('open'); },
  toggleSubGroup(btn) { const container = btn.parentElement; if (container) container.classList.toggle('open'); },

  filterNodes(q) {

    q=q.toLowerCase().trim();

    document.querySelectorAll('.node-category').forEach(cat => {

      let any=false;

      cat.querySelectorAll('.node-lib-item').forEach(item => {

        const v=!q||item.textContent.toLowerCase().includes(q); item.style.display=v?'':'none'; if(v) any=true;

      });

      cat.style.display=any?'':'none'; if(q&&any) cat.classList.add('open');

    });

  },

  toggleNodeLibrary() {
    const l=document.getElementById('node-library');
    l.style.display=l.style.display==='none'?'':'none';
    this.syncWorkspaceLayout();
  },

  toggleViewerGrid() {
    if (typeof Viewer3D === 'undefined') return;
    Viewer3D.setGridVisible(!Viewer3D._gridVisible);
    this._syncViewerMenuChecks();
  },

  toggleViewerAxes() {
    if (typeof Viewer3D === 'undefined') return;
    Viewer3D.setAxesVisible(!Viewer3D._axesVisible);
    this._syncViewerMenuChecks();
  },

  toggleViewerEdges() {
    if (typeof Viewer3D === 'undefined') return;
    Viewer3D.setEdgesVisible(!Viewer3D._edgesVisible);
    this._syncViewerMenuChecks();
  },

  _syncViewerMenuChecks() {
    if (typeof Viewer3D === 'undefined') return;
    const set = (id, on) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const mark = btn.querySelector('.menu-check');
      if (mark) mark.setAttribute('data-on', on ? '1' : '0');
    };
    set('menu-toggle-grid',  Viewer3D._gridVisible);
    set('menu-toggle-axes',  Viewer3D._axesVisible);
    set('menu-toggle-edges', Viewer3D._edgesVisible);
  },

  onLibDragStart(e,type) { e.dataTransfer.setData('text/plain',type); e.dataTransfer.effectAllowed='copy'; },

  addNodeFromLib(type) {

    const a=document.getElementById('canvas-area'), r=a.getBoundingClientRect();

    const cx=(r.width/2-this.panX)/this.zoom, cy=(r.height/2-this.panY)/this.zoom;

    const off=this.nodes.length*20;

    return this.addNodeToCanvas(type,cx+off,cy+off);

  },



  // ── NODES ──

  addNodeToCanvas(type,x,y) {

    const def=NODE_TYPE_MAP[type]; if(!def) return null;

    const id='node-'+this.nextNodeId++;

    this.nodeZCounter++;

    const nd={id,type,x:Math.round(x),y:Math.round(y),def:{...def,inputs:(def.inputs||[]).map(function(inp){return{...inp};}),outputs:(def.outputs||[]).map(function(out){return{...out};})},controlValues:{},dataPanelOpen:false,zIndex:this.nodeZCounter};

    def.controls.forEach(c=>{nd.controlValues[c.id]=c.default;});

    this.nodes.push(nd); this.renderNode(nd); this.updateMenuState(); if(typeof Viewer3D!=='undefined') Viewer3D._needsRebuild=true;

    return nd;

  },

  // Convert hex (#rrggbb) to rgba string

  hexToGlow(hex, alpha) {

    const r = parseInt(hex.slice(1,3),16);

    const g = parseInt(hex.slice(3,5),16);

    const b = parseInt(hex.slice(5,7),16);

    return `rgba(${r},${g},${b},${alpha})`;

  },

  renderNode(nd) {

    const canvas=document.getElementById('node-canvas');

    const def=nd.def, cc=def.categoryColor;

    const el=document.createElement('div');

    el.className='node'; el.id=nd.id;

    el.style.left=nd.x+'px'; el.style.top=nd.y+'px';

    el.style.zIndex=nd.zIndex;

    el.style.setProperty('--node-color',cc);

    el.style.setProperty('--node-select-color',cc);

    // Set glow colors for selection — derived from category color

    el.style.setProperty('--node-glow-mid', this.hexToGlow(cc, 0.40));

    el.style.setProperty('--node-glow-soft', this.hexToGlow(cc, 0.20));

    el.style.setProperty('--node-glow-wide', this.hexToGlow(cc, 0.08));



    let h=`<div class="node-header" style="background:${cc}12"><span class="node-header-icon" style="color:${cc};background:${cc}20">${def.icon}</span><span class="node-header-title">${def.name}</span><button class="node-header-menu" onclick="event.stopPropagation();app.showNodeMenu('${nd.id}')">⋮</button></div><div class="node-body">`;

    const mx=Math.max(def.inputs.length,def.outputs.length);

    for(let i=0;i<mx;i++){

      const inp=def.inputs[i], out=def.outputs[i];

      let rc='node-port-row'; if(inp&&!out) rc+=' input-only'; if(!inp&&out) rc+=' output-only';

      h+=`<div class="${rc}">`;

      // INPUT port: dot on LEFT, then label

      if(inp){

        const pt='port-type-'+(inp.type||'any');

        h+=`<div class="node-port input ${pt}">`;

        h+=`<span class="port-dot ${pt}" data-port="${inp.id}" data-dir="input" data-node="${nd.id}"></span>`;

        h+=`<span class="port-label">${inp.name}</span>`;

        h+=`</div>`;

      }

      // OUTPUT port: label on LEFT, then dot on RIGHT

      if(out){

        const pt='port-type-'+(out.type||'any');

        h+=`<div class="node-port output ${pt}">`;

        h+=`<span class="port-label">${out.name}</span>`;

        h+=`<span class="port-dot ${pt}" data-port="${out.id}" data-dir="output" data-node="${nd.id}"></span>`;

        h+=`</div>`;

      }

      h+=`</div>`;

    }

    def.controls.forEach(c=>{

      h+=`<div class="node-control">`;

      if(c.type==='dropdown') h+=`<select onchange="app.onCtrl('${nd.id}','${c.id}',this.value)">${c.options.map(o=>`<option value="${o}" ${o===nd.controlValues[c.id]?'selected':''}>${o}</option>`).join('')}</select>`;

      else if(c.type==='number') h+=`<input type="number" step="any" value="${nd.controlValues[c.id]}" onchange="app.onCtrl('${nd.id}','${c.id}',this.value)" placeholder="${c.label}">`;

      else if(c.type==='text') h+=`<input type="text" value="${nd.controlValues[c.id]}" onchange="app.onCtrl('${nd.id}','${c.id}',this.value)" placeholder="${c.label}">`;

      else if(c.type==='range') h+=`<input type="range" min="0" max="100" value="${nd.controlValues[c.id]}" oninput="app.onCtrl('${nd.id}','${c.id}',this.value)">`;

      h+=`</div>`;

    });

    h+=`</div>`;

    if(def.preview) h+=`<div class="node-preview-toggle" onclick="app.toggleDataPanel('${nd.id}')"><button class="node-preview-toggle-btn"><span id="${nd.id}-arrow">▸</span> Data Inspector</button></div><div class="node-data-panel" id="${nd.id}-data"><div class="node-data-content" id="${nd.id}-dc">${this.nodeDataHTML(nd)}</div></div>`;

    el.innerHTML=h;



    // Bring to front on click + start drag

    el.querySelector('.node-header').addEventListener('mousedown',e=>{ this.bringToFront(nd); this.onNodeDragStart(e,nd); });

    el.addEventListener('mousedown',e=>{ e.stopPropagation(); this.bringToFront(nd); this.selectNode(nd.id,e.shiftKey); });

    el.querySelectorAll('.port-dot').forEach(d=>{

      d.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();this.onPortDown(e,d.dataset.node,d.dataset.port,d.dataset.dir);});

    });

    canvas.appendChild(el);

  },

  bringToFront(nd) {

    this.nodeZCounter++;

    nd.zIndex = this.nodeZCounter;

    const el = document.getElementById(nd.id);

    if (el) el.style.zIndex = nd.zIndex;

  },

  // Compute a node's output value based on its inputs and controls

  computeNodeValue(nd) {

    const getInput = (portId) => {

      const wire = this.wires.find(w => w.toNode === nd.id && w.toPort === portId);

      if (wire) {

        const srcNd = this.nodes.find(n => n.id === wire.fromNode);

        if (srcNd) return this.computeNodeValue(srcNd);

      }

      // No wire connected — fall back to control value if control exists with matching id
      const ctrl = nd.controlValues;
      if (ctrl && ctrl[portId] !== undefined && ctrl[portId] !== null && ctrl[portId] !== '') {
        return parseFloat(ctrl[portId]) || 0;
      }

      return undefined;

    };

    const ctrl = nd.controlValues;



    try {

      switch (nd.type) {

        case 'number-input': case 'slider-input': return parseFloat(ctrl.val) || 0;

        case 'integer-input': return parseInt(ctrl.val) || 0;

        case 'text-input': return ctrl.val || '';

        case 'boolean-input': return ctrl.val === 'True';

        case 'math-add': { const a = getInput('a'), b = getInput('b'); return (a !== undefined && b !== undefined) ? a + b : undefined; }

        case 'math-subtract': { const a = getInput('a'), b = getInput('b'); return (a !== undefined && b !== undefined) ? a - b : undefined; }

        case 'math-multiply': { const a = getInput('a'), b = getInput('b'); return (a !== undefined && b !== undefined) ? a * b : undefined; }

        case 'math-divide': { const a = getInput('a'), b = getInput('b'); return (a !== undefined && b !== undefined && b !== 0) ? a / b : undefined; }

        case 'math-power': { const base = getInput('base'), exp = getInput('exp'); return (base !== undefined && exp !== undefined) ? Math.pow(base, exp) : undefined; }

        case 'logic-and': { const a = getInput('a'), b = getInput('b'); return (a !== undefined && b !== undefined) ? a && b : undefined; }

        case 'logic-or': { const a = getInput('a'), b = getInput('b'); return (a !== undefined && b !== undefined) ? a || b : undefined; }

        case 'logic-not': { const v = getInput('value'); return v !== undefined ? !v : undefined; }

        case 'logic-compare': {

          const a = getInput('a'), b = getInput('b'), op = ctrl.op;

          if (a === undefined || b === undefined) return undefined;

          switch(op) { case '==': return a===b; case '!=': return a!==b; case '<': return a<b; case '>': return a>b; case '<=': return a<=b; case '>=': return a>=b; }

          return undefined;

        }

        case 'logic-if': { const c = getInput('condition'), t = getInput('ifTrue'), f = getInput('ifFalse'); return c !== undefined ? (c ? t : f) : undefined; }

        case 'geo-point': { const x=getInput('x'),y=getInput('y'),z=getInput('z'); return (x!==undefined||y!==undefined||z!==undefined) ? `(${x||0}, ${y||0}, ${z||0})` : undefined; }

        case 'geo-distance': { const a=getInput('a'),b=getInput('b'); return (typeof a==='string'&&typeof b==='string') ? 'dist(A,B)' : undefined; }

        case 'list-length': { const l=getInput('list'); return Array.isArray(l)?l.length:undefined; }

        case 'list-create': { const items=[getInput('item0'),getInput('item1'),getInput('item2')].filter(x=>x!==undefined); return items.length>0?items:undefined; }

        case 'list-range': { const s=getInput('start'),e=getInput('end'),st=getInput('step'); if(s!==undefined&&e!==undefined){const r=[];for(let i=s;i<e;i+=(st||1))r.push(i);return r;} return undefined; }

        case 'output-watch': return getInput('value');

        default: return undefined;

      }

    } catch(e) { return undefined; }

  },



  formatValue(val) {

    if (val === undefined) return '<span style="color:var(--text-muted)">—</span>';

    if (val === null) return '<span style="color:var(--text-muted)">null</span>';

    if (typeof val === 'boolean') return `<span style="color:var(--accent-red)">${val}</span>`;

    if (typeof val === 'number') {

      const display = Number.isInteger(val) ? val : val.toFixed(4).replace(/\.?0+$/, '');

      return `<span style="color:var(--accent-green)">${display}</span>`;

    }

    if (typeof val === 'string') return `<span style="color:var(--accent-yellow)">"${val}"</span>`;

    if (Array.isArray(val)) {

      const items = val.map((v, i) => {
        const display = typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v);
        return `<div class="data-list-row"><span class="data-list-index">${i}</span><span class="data-list-item" style="color:var(--accent-peach)">${display}</span></div>`;
      }).join('');


      return `<div class="data-list-view"><div class="data-list-header"><span style="font-size:8px;color:var(--text-muted)">List</span><span style="font-size:8px;color:var(--accent-peach)">(${val.length})</span></div><div class="data-list-body">${items}</div></div>`;

    }

    return `<span style="color:var(--text-secondary)">${val}</span>`;

  },



  nodeDataHTML(nd) {

    let r = '';

    const computed = this.computeNodeValue(nd);



    // Inputs: show source and resolved value

    nd.def.inputs.forEach(inp => {

      const wire = this.wires.find(w => w.toNode === nd.id && w.toPort === inp.id);

      if (wire) {

        const srcNd = this.nodes.find(n => n.id === wire.fromNode);

        const srcVal = srcNd ? this.computeNodeValue(srcNd) : undefined;

        r += `<div class="data-row"><span class="data-label">⊙ ${inp.name}</span>${this.formatValue(srcVal)}</div>`;

      } else {

        r += `<div class="data-row"><span class="data-label">⊙ ${inp.name}</span><span style="color:var(--text-muted)">—</span></div>`;

      }

    });



    // Controls

    nd.def.controls.forEach(c => {

      const val = nd.controlValues[c.id];

      r += `<div class="data-row"><span class="data-label">⚙ ${c.label || c.id}</span><span style="color:var(--accent-purple)">${val}</span></div>`;

    });



    // Output: show computed value

    if (nd.def.outputs.length > 0) {

      r += `<div class="data-row" style="border-top:1px solid rgba(49,50,68,0.8);margin-top:2px;padding-top:4px"><span class="data-label" style="color:var(--text-primary)">▸ Output</span>${this.formatValue(computed)}</div>`;

    }



    return r || '<span style="color:var(--text-muted)">No data</span>';

  },

  toggleDataPanel(id) {

    const nd=this.nodes.find(n=>n.id===id); if(!nd) return;

    nd.dataPanelOpen=!nd.dataPanelOpen;

    const p=document.getElementById(id+'-data'); if(p) p.classList.toggle('open',nd.dataPanelOpen);

    const a=document.getElementById(id+'-arrow'); if(a) a.textContent=nd.dataPanelOpen?'▾':'▸';

    const dc=document.getElementById(id+'-dc'); if(dc) dc.innerHTML=this.nodeDataHTML(nd);

  },

  onCtrl(nid,cid,val) { const nd=this.nodes.find(n=>n.id===nid); if(nd) nd.controlValues[cid]=val; if(this.invalidateCompute) this.invalidateCompute(); if(typeof Viewer3D!=='undefined') Viewer3D._needsRebuild=true; },

  removeNode(id) { if(this.invalidateCompute) this.invalidateCompute(); if(typeof Viewer3D!=='undefined') Viewer3D._needsRebuild=true;

    this.wires=this.wires.filter(w=>w.fromNode!==id&&w.toNode!==id);

    this.nodes=this.nodes.filter(n=>n.id!==id);

    const el=document.getElementById(id); if(el) el.remove();

    this.renderWires(); this.updateMenuState();

  },

  selectNode(id,add) {

    if(!add){this.selectedNodes.forEach(i=>{const e=document.getElementById(i);if(e)e.classList.remove('selected');});this.selectedNodes=[];}

    if(!this.selectedNodes.includes(id)) this.selectedNodes.push(id);

    const el=document.getElementById(id); if(el) el.classList.add('selected');

  },

  deselectAll() {this.selectedNodes.forEach(i=>{const e=document.getElementById(i);if(e)e.classList.remove('selected');});this.selectedNodes=[];},

  showNodeMenu(id) {

    const el=document.getElementById(id); if(!el) return;

    const r=el.getBoundingClientRect();

    this.showContextMenuAt(r.right+4,r.top,[

      {label:'View Code',icon:'{ }',action:()=>this.showNodeCode(id)},

      {label:'Inspect Data',icon:'🔍',action:()=>this.toggleDataPanel(id)},

      {label:'Duplicate',icon:'📋',action:()=>this.duplicateNode(id)},

      {label:'Delete',icon:'🗑',action:()=>this.removeNode(id)}

    ]);

  },

  duplicateNode(id) {const nd=this.nodes.find(n=>n.id===id);if(nd)this.addNodeToCanvas(nd.type,nd.x+40,nd.y+40);},



  // ── NODE DRAG ──

  _dragGroup: null,
  onNodeDragStart(e,nd) {if(e.button!==0)return;e.preventDefault();const el=document.getElementById(nd.id);const r=el.getBoundingClientRect();this.draggingNode=nd;this.dragOffset={x:e.clientX-r.left,y:e.clientY-r.top};if(this.selectedNodes.indexOf(nd.id)>=0&&this.selectedNodes.length>1){const a=document.getElementById('canvas-area').getBoundingClientRect();const ax=Math.round((e.clientX-a.left-this.dragOffset.x-this.panX)/this.zoom);const ay=Math.round((e.clientY-a.top-this.dragOffset.y-this.panY)/this.zoom);this._dragGroup=[];for(var i=0;i<this.selectedNodes.length;i++){var snd=this.nodes.find(function(n){return n.id===this.selectedNodes[i];}.bind(this));if(snd)this._dragGroup.push({nd:snd,dx:snd.x-ax,dy:snd.y-ay});}}else{this._dragGroup=null;}},

  onNodeDragMove(e) {

    if(!this.draggingNode) return;

    const a=document.getElementById('canvas-area').getBoundingClientRect();

    var nx=Math.round((e.clientX-a.left-this.dragOffset.x-this.panX)/this.zoom);var ny=Math.round((e.clientY-a.top-this.dragOffset.y-this.panY)/this.zoom);if(this._dragGroup&&this._dragGroup.length>1){for(var gi=0;gi<this._dragGroup.length;gi++){var g=this._dragGroup[gi];g.nd.x=nx+g.dx;g.nd.y=ny+g.dy;var gel=document.getElementById(g.nd.id);if(gel){gel.style.left=g.nd.x+'px';gel.style.top=g.nd.y+'px';}}}else{this.draggingNode.x=nx;this.draggingNode.y=ny;var _sel=document.getElementById(this.draggingNode.id);if(_sel){_sel.style.left=nx+'px';_sel.style.top=ny+'px';}

    }

    // single drag DOM update handled above

    // (moved into else block above)

    this.renderWires();

  },



  // ── WIRES ──

  onPortDown(e,nid,pid,dir) {

    const a=document.getElementById('canvas-area').getBoundingClientRect();

    const dr=e.target.getBoundingClientRect();

    this.connectingWire={fromNode:nid,fromPort:pid,fromDir:dir,

      startX:dr.left+dr.width/2-a.left,startY:dr.top+dr.height/2-a.top,

      endX:dr.left+dr.width/2-a.left,endY:dr.top+dr.height/2-a.top};

  },

  onWireMove(e) {

    if(!this.connectingWire) return;

    const a=document.getElementById('canvas-area').getBoundingClientRect();

    this.connectingWire.endX=e.clientX-a.left;

    this.connectingWire.endY=e.clientY-a.top;

    this.renderWires();

  },

  onWireEnd(e) {

    if(!this.connectingWire) return;

    const tgt=document.elementFromPoint(e.clientX,e.clientY);

    if(tgt&&tgt.classList.contains('port-dot')){

      const tn=tgt.dataset.node,tp=tgt.dataset.port,td=tgt.dataset.dir;

      if(this.connectingWire.fromDir!==td&&this.connectingWire.fromNode!==tn){

        const w=this.connectingWire.fromDir==='output'

          ?{fromNode:this.connectingWire.fromNode,fromPort:this.connectingWire.fromPort,toNode:tn,toPort:tp}

          :{fromNode:tn,fromPort:tp,toNode:this.connectingWire.fromNode,toPort:this.connectingWire.fromPort};

        this.addWire(w.fromNode,w.fromPort,w.toNode,w.toPort);

        this.updatePortDots();

      }

    }

    this.connectingWire=null;

    this.renderWires();

  },

  updatePortDots() {

    document.querySelectorAll('.port-dot').forEach(d=>d.classList.remove('connected'));

    this.wires.forEach(w=>{

      const f=document.querySelector(`#${w.fromNode} .port-dot[data-port="${w.fromPort}"][data-dir="output"]`);

      const t=document.querySelector(`#${w.toNode} .port-dot[data-port="${w.toPort}"][data-dir="input"]`);

      if(f)f.classList.add('connected');if(t)t.classList.add('connected');

    });

  },

  getWireColor(w) {

    const nd=this.nodes.find(n=>n.id===w.fromNode);

    if(nd){const o=nd.def.outputs.find(x=>x.id===w.fromPort);if(o&&TYPE_COLORS[o.type])return TYPE_COLORS[o.type];}

    return '#a6adc8';

  },

  renderWires() {

    const svg=document.getElementById('wire-svg');

    const ar=document.getElementById('canvas-area').getBoundingClientRect();

    let s='';

    this.wires.forEach((w,i)=>{

      const fd=document.querySelector(`#${w.fromNode} .port-dot[data-port="${w.fromPort}"][data-dir="output"]`);

      const td=document.querySelector(`#${w.toNode} .port-dot[data-port="${w.toPort}"][data-dir="input"]`);

      if(!fd||!td) return;

      const fr=fd.getBoundingClientRect(),tr=td.getBoundingClientRect();

      const x1=fr.left+fr.width/2-ar.left,y1=fr.top+fr.height/2-ar.top;

      const x2=tr.left+tr.width/2-ar.left,y2=tr.top+tr.height/2-ar.top;

      const dx=Math.max(Math.abs(x2-x1)*0.5,50);

      const c=this.getWireColor(w);

      const d=`M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`;

      // Wire path + animated data dot. Phase 5: when wire.typeMismatch
      // is set, draw red+dashed and embed an SVG <title> tooltip so the
      // user can hover for the reason.
      const mm = w.typeMismatch;
      if (mm) {
        const tip = (mm.reason || 'Type mismatch').replace(/[<&>]/g, ch => ({'<':'&lt;','&':'&amp;','>':'&gt;'}[ch]));
        s+=`<g class="wire-mismatch"><title>${tip}</title><path d="${d}" fill="none" stroke="#f38ba8" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.85"/></g>`;
      } else {
        s+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="2.5" opacity="0.7"/>`;
      }

      // Data dot: fades in at start, fades out at end (respects wire animations setting) — like data flowing through the wire

      if(localStorage.getItem('nodeflow_wire_animations')!=='false'){const dur=(2.5+i*0.4).toFixed(1);

      s+=`<circle r="3" fill="${c}" opacity="0"><animateMotion dur="${dur}s" repeatCount="indefinite" path="${d}"/><animate attributeName="opacity" values="0;0;0.9;0.9;0.9;0;0" keyTimes="0;0.05;0.15;0.5;0.85;0.95;1" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="r" values="1.5;3;3;3;1.5" keyTimes="0;0.1;0.5;0.9;1" dur="${dur}s" repeatCount="indefinite"/></circle>`;

      }// Animated circles removed — CSS wire-path animation handles visual feedback

    });

    let defs=`<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

    if(this.connectingWire){

      const {startX:sx,startY:sy,endX:ex,endY:ey,fromDir:fd}=this.connectingWire;

      const dx=Math.max(Math.abs(ex-sx)*0.5,40);

      if(fd==='output') s+=`<path class="wire-connecting" d="M${sx},${sy} C${sx+dx},${sy} ${ex-dx},${ey} ${ex},${ey}" fill="none" stroke="#89b4fa" stroke-width="2"/>`;

      else s+=`<path class="wire-connecting" d="M${ex},${ey} C${ex+dx},${ey} ${sx-dx},${sy} ${sx},${sy}" fill="none" stroke="#89b4fa" stroke-width="2"/>`;

    }

    svg.innerHTML=defs+s;

  },



  // ── CANVAS EVENTS ──

  initCanvasEvents() {

    const area=document.getElementById('canvas-area');

    area.addEventListener('mousedown',e=>{

      // Anything inside the 3D viewport is owned by OrbitControls — the 2D
      // canvas must not pan, deselect, or otherwise react when the user is
      // working in 3D (including split mode with 3D as the active layer).
      if(e.target.closest('#viewport-3d')) return;

      if(e.target.closest('.node')||e.target.closest('.canvas-toolbar')||e.target.closest('.canvas-zoom')) return;

      this.deselectAll();

      if(e.button===1||(e.button===0&&e.altKey)){

        this.isPanning=true;this.panStart={x:e.clientX-this.panX,y:e.clientY-this.panY};

        area.style.cursor='grabbing';e.preventDefault();

      }

    });

    document.addEventListener('mousemove',e=>{

      if(this.isPanning&&this.panStart){this.panX=e.clientX-this.panStart.x;this.panY=e.clientY-this.panStart.y;this.applyTransform();}

      this.onNodeDragMove(e);this.onWireMove(e);

      if(this.isDraggingChat) this.onChatDrag(e);

      if(this.isResizingCV) this.onCodeViewerResize(e);

      if(this.isResizingChat) this.onChatResize(e);

    });

    document.addEventListener('mouseup',e=>{

      if(this.isPanning){this.isPanning=false;this.panStart=null;area.style.cursor='';}

      if(this.draggingNode){this.draggingNode=null;this._dragGroup=null;}

      this.onWireEnd(e);

      if(this.isDraggingChat) this.isDraggingChat=false;

      if(this.isResizingCV) this.isResizingCV=false;

      if(this.isResizingChat) this.isResizingChat=false;

    });

    area.addEventListener('wheel',e=>{

      // Wheel over the 3D viewport belongs to OrbitControls — don't dolly
      // both views at once.
      if(e.target.closest('#viewport-3d')) return;

      e.preventDefault();this.zoom=Math.max(0.25,Math.min(3,this.zoom+(e.deltaY>0?-0.08:0.08)));

      this.applyTransform();document.getElementById('zoom-indicator').textContent=Math.round(this.zoom*100)+'%';

    },{passive:false});

    area.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});

    area.addEventListener('drop',e=>{

      e.preventDefault();const type=e.dataTransfer.getData('text/plain');if(!type||!NODE_TYPE_MAP[type])return;

      const r=area.getBoundingClientRect();

      this.addNodeToCanvas(type,(e.clientX-r.left-this.panX)/this.zoom,(e.clientY-r.top-this.panY)/this.zoom);

    });

    area.addEventListener('contextmenu',e=>{

      // OrbitControls uses right-mouse for PAN. Suppressing the browser
      // context menu over the 3D viewport prevents the node search popup
      // from appearing the moment the user releases a right-drag pan.
      if(e.target.closest('#viewport-3d')){e.preventDefault();return;}

      if(e.target.closest('.node'))return;

      e.preventDefault();this.showContextMenu(e.clientX,e.clientY);

    });

  },

  applyTransform() {

    document.getElementById('node-canvas').style.transform=`translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;

    const sm=document.getElementById('smallGrid'),bg=document.getElementById('bigGrid');

    if(sm){const s=24*this.zoom;sm.setAttribute('width',s);sm.setAttribute('height',s);sm.querySelector('path').setAttribute('d',`M ${s} 0 L 0 0 0 ${s}`);sm.setAttribute('patternTransform',`translate(${this.panX%s},${this.panY%s})`);}

    if(bg){const b=120*this.zoom;bg.setAttribute('width',b);bg.setAttribute('height',b);bg.querySelector('path').setAttribute('d',`M ${b} 0 L 0 0 0 ${b}`);bg.querySelector('rect').setAttribute('width',b);bg.querySelector('rect').setAttribute('height',b);bg.setAttribute('patternTransform',`translate(${this.panX%b},${this.panY%b})`);}

    this.renderWires();

  },

  zoomIn(){this.zoom=Math.min(3,this.zoom+0.15);this.applyTransform();document.getElementById('zoom-indicator').textContent=Math.round(this.zoom*100)+'%';},

  zoomOut(){this.zoom=Math.max(0.25,this.zoom-0.15);this.applyTransform();document.getElementById('zoom-indicator').textContent=Math.round(this.zoom*100)+'%';},

  fitAll(){
    const area=document.getElementById('canvas-area');
    const in3D = area && area.classList.contains('view-3d');
    const inSplit = area && area.classList.contains('split-view');
    // 3D / split view: frame the geometry in the 3D camera.
    if((in3D||inSplit) && typeof Viewer3D!=='undefined' && Viewer3D.isInitialized && Viewer3D.fitAll){
      Viewer3D.fitAll();
      if(in3D && !inSplit) return; // pure 3D — nothing else to fit
    }
    if(!area) return;
    // Fit the current selection if any, otherwise every node.
    const ids=(this.selectedNodes && this.selectedNodes.length)
      ? this.selectedNodes : this.nodes.map(n=>n.id);
    const targets=this.nodes.filter(n=>ids.indexOf(n.id)>=0);
    const zi=document.getElementById('zoom-indicator');
    if(targets.length===0){
      this.zoom=1;this.panX=0;this.panY=0;this.applyTransform();
      if(zi)zi.textContent='100%';
      return;
    }
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    targets.forEach(n=>{
      const el=document.getElementById(n.id);
      const w=el?(el.offsetWidth||180):180, h=el?(el.offsetHeight||100):100;
      if(n.x<minX)minX=n.x; if(n.y<minY)minY=n.y;
      if(n.x+w>maxX)maxX=n.x+w; if(n.y+h>maxY)maxY=n.y+h;
    });
    const rect=area.getBoundingClientRect();
    const view=computeFitView({minX,minY,maxX,maxY},{width:rect.width,height:rect.height},{padding:60});
    this.zoom=view.zoom;this.panX=view.panX;this.panY=view.panY;
    this.applyTransform();
    if(zi)zi.textContent=Math.round(this.zoom*100)+'%';
  },

  // Read-only overlay listing the available keyboard shortcuts (Settings menu).
  showShortcuts(){
    const existing=document.getElementById('shortcuts-overlay');
    if(existing){existing.remove();return;} // toggle off if already open
    const SC=[
      ['Z','Zoom to Fit — selection, or all nodes'],
      ['L','Auto Layout'],
      ['P','Toggle Properties (selected)'],
      ['D','Toggle Data Inspector (selected)'],
      ['W','Toggle Warnings (selected)'],
      ['Ctrl + Z','Undo'],
      ['Ctrl + Y','Redo'],
      ['Ctrl + C','Copy nodes'],
      ['Ctrl + V','Paste nodes'],
      ['Delete','Delete selected nodes'],
      ['Esc','Deselect / close menus']
    ];
    const rows=SC.map(s=>`<div class="sc-row"><span class="sc-key">${s[0]}</span><span class="sc-desc">${s[1]}</span></div>`).join('');
    const ov=document.createElement('div');
    ov.id='shortcuts-overlay';
    ov.innerHTML=`<div class="sc-panel" role="dialog" aria-label="Keyboard Shortcuts"><div class="sc-head"><span>Keyboard Shortcuts</span><button class="sc-close" title="Close">×</button></div><div class="sc-sub">Read-only reference</div><div class="sc-list">${rows}</div></div>`;
    ov.addEventListener('click',e=>{ if(e.target===ov||e.target.classList.contains('sc-close')) ov.remove(); });
    document.body.appendChild(ov);
  },



  // ── CONTEXT MENU ──

  showContextMenu(x,y){const m=document.getElementById('context-menu');m.style.left=x+'px';m.style.top=y+'px';m.classList.add('visible');},

  showContextMenuAt(x,y,items){

    const m=document.getElementById('context-menu');

    m.innerHTML=items.map(i=>`<button class="context-menu-item"><span class="cmi-icon">${i.icon}</span> ${i.label}</button>`).join('');

    m.querySelectorAll('.context-menu-item').forEach((btn,i)=>{btn.onclick=()=>{items[i].action();app.hideContextMenu();};});

    m.style.left=x+'px';m.style.top=y+'px';m.classList.add('visible');

  },

  hideContextMenu(){document.getElementById('context-menu').classList.remove('visible');},

  ctxAction(a){this.hideContextMenu();if(a==='add'){const i=document.getElementById('node-search-input');if(i)i.focus();}else if(a==='fit')this.fitAll();},

  runGraph(){

    const code = this.generateFullScript();

    this.showCodeViewer(code);

    this.addAIMessage('workspace',`▶️ **Graph compiled!** Generated ${this.codeLang === 'python' ? 'Python' : 'C#'} code from ${this.nodes.length} nodes.\n\nCheck the **Code Viewer** panel at the bottom to see the output.`);

  },



  // ── KEYBOARD ──

  initKeyboard(){

    document.addEventListener('keydown',e=>{

      if(this.currentPage!=='workspace') return;

      if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

      if(e.key==='Delete'||e.key==='Backspace'){this.selectedNodes.forEach(id=>this.removeNode(id));this.selectedNodes=[];}

      if(e.key==='Escape'){const so=document.getElementById('shortcuts-overlay');if(so)so.remove();this.deselectAll();this.hideContextMenu();}

    });

  },



  // ── CHAT DOCKING ──

  toggleChat() {

    const p=document.getElementById('ws-chat-panel'),btn=document.getElementById('chat-toggle-btn');

    this.chatVisible=!this.chatVisible;

    p.classList.toggle('chat-hidden',!this.chatVisible);

    btn.classList.toggle('hidden',this.chatVisible);

    this.syncWorkspaceLayout();

    this.syncCodeViewerLayout();

  },

  showDockSelector(e) {

    e.stopPropagation();

    const s=document.getElementById('dock-selector'),r=e.target.getBoundingClientRect();

    s.style.left=(r.left-40)+'px';s.style.top=(r.bottom+6)+'px';

    s.classList.toggle('visible');

    s.querySelectorAll('.dock-opt').forEach(o=>{o.classList.toggle('active',o.dataset.pos===this.chatDock);});

  },

  dockChat(pos) {

    const p=document.getElementById('ws-chat-panel');

    document.getElementById('dock-selector').classList.remove('visible');

    p.classList.remove('dock-right','dock-left','dock-bottom','floating','chat-hidden');

    p.style.left='';p.style.top='';p.style.right='';p.style.bottom='';p.style.width='';p.style.height='';

    document.getElementById('ws-chat-header').onmousedown=null;

    this.chatDock=pos;this.chatVisible=true;

    document.getElementById('chat-toggle-btn').classList.add('hidden');

    p.classList.add('dock-'+pos);

    this.applyChatSize();

    this.syncWorkspaceLayout();

    this.syncCodeViewerLayout();

  },

  detachChat() {

    const p=document.getElementById('ws-chat-panel');

    document.getElementById('dock-selector').classList.remove('visible');

    p.classList.remove('dock-right','dock-left','dock-bottom','chat-hidden');

    p.classList.add('floating');

    p.style.left=Math.round((window.innerWidth-380)/2)+'px';

    p.style.top=Math.round((window.innerHeight-500)/2)+'px';

    p.style.right='auto';p.style.bottom='auto';

    this.chatDock='float';this.chatVisible=true;

    document.getElementById('chat-toggle-btn').classList.add('hidden');

    this.syncWorkspaceLayout();

    this.syncCodeViewerLayout();

    document.getElementById('ws-chat-header').onmousedown=e=>{

      if(e.target.closest('.chat-header-btn'))return;

      e.preventDefault();this.isDraggingChat=true;

      const r=p.getBoundingClientRect();

      this.chatDragOffset={x:e.clientX-r.left,y:e.clientY-r.top};

    };

  },

  onChatDrag(e) {

    const p=document.getElementById('ws-chat-panel');

    p.style.left=(e.clientX-this.chatDragOffset.x)+'px';

    p.style.top=(e.clientY-this.chatDragOffset.y)+'px';

  },



  // ── AI CHAT ──

  initLandingChat() {

    this.addAIMessage('landing',"👋 Welcome to **Nova** — your computational design studio!\n\nI'm powered by a **computational design AI** — creating parametric architecture, fluid forms, and complex geometries like Rhino/Grasshopper.\n\n• **Architecture** — towers, pavilions, facades, shells, canopies\\n• **NURBS** — smooth curves and surfaces\\n• **Organic forms** — noise, attractors, Voronoi\\n• Ask me to build **anything** — math, data pipelines\n• I generate Python code → visual nodes automatically\n• Simple requests are instant, complex ones bridge to the full AI\n\nWhat would you like to build?");

    this.setChatSuggestions('landing',['Create a parametric building with facade','Design a Zaha Hadid style pavilion','Build a twisted tower','Explore NURBS surfaces']);

  },

  initWorkspaceChat() {

    if(this.chatHistories.workspace.length>0) return;

    this.addAIMessage('workspace',"🎨 **Workspace ready!** Connected to **gpt-4o**.\n\n• **Drag** nodes from the library on the left\n• **Connect** ports by dragging between dots\n• **Ask me anything** — I'll generate the code for you\n\nI specialize in **parametric design** — NURBS, organic forms, Voronoi, attractor facades, twisted towers, and more.\n\nTry asking me to build something!");

    this.setChatSuggestions('workspace',['Show me a hyperboloid tower','Build a catenary pavilion','Run the large mesh stress test','Start a blank canvas']);

  },

  addAIMessage(ch,txt) {

    const c=document.getElementById(ch==='landing'?'landing-chat-messages':'ws-chat-messages');

    this.chatHistories[ch].push({role:'ai',text:txt});

    const m=document.createElement('div');m.className='chat-msg ai';

    m.innerHTML=`<div class="chat-avatar">✦</div><div class="chat-bubble">${this.fmt(txt)}</div>`;

    c.appendChild(m);c.scrollTop=c.scrollHeight;

  },

  addUserMessage(ch,txt) {

    const c=document.getElementById(ch==='landing'?'landing-chat-messages':'ws-chat-messages');

    this.chatHistories[ch].push({role:'user',text:txt});

    const m=document.createElement('div');m.className='chat-msg user';

    const d=document.createElement('div');d.textContent=txt;

    m.innerHTML=`<div class="chat-avatar">U</div><div class="chat-bubble">${d.innerHTML}</div>`;

    c.appendChild(m);c.scrollTop=c.scrollHeight;

  },

  escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  fmt(t){
    const escaped = this.escapeHtml(t);
    return escaped
      .replace(/\*\*([^*\n][\s\S]*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\n/g,'<br>')
      .replace(/• /g,'&bull; ');
  },

  setChatSuggestions(ch,items) {

    document.getElementById(ch==='landing'?'landing-chat-suggestions':'ws-chat-suggestions').innerHTML=

      items.map(s=>`<button class="chat-suggestion-btn" onclick="app.useSuggestion('${ch}',this.textContent)">${s}</button>`).join('');

  },

  useSuggestion(ch,txt){document.getElementById(ch==='landing'?'landing-chat-input':'ws-chat-input').value=txt;this.sendChat(ch);},

  sendChat(ch) {

    const inp=document.getElementById(ch==='landing'?'landing-chat-input':'ws-chat-input');

    const txt=inp.value.trim();if(!txt)return;

    // BYOK gate: the assistant is inactive until a key is connected. Surface the
    // Settings CTA instead of sending (covers programmatic callers too).
    if(window.GPTClient&&!window.GPTClient.canChat()){if(this._updateAssistantGate)this._updateAssistantGate();return;}

    inp.value='';this.addUserMessage(ch,txt);

    document.getElementById(ch==='landing'?'landing-chat-suggestions':'ws-chat-suggestions').innerHTML='';

    const c=document.getElementById(ch==='landing'?'landing-chat-messages':'ws-chat-messages');

    const ti=document.createElement('div');ti.className='chat-msg ai';ti.id=ch+'-typing';

    ti.innerHTML=`<div class="chat-avatar">✦</div><div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;

    c.appendChild(ti);c.scrollTop=c.scrollHeight;

    setTimeout(()=>{const el=document.getElementById(ch+'-typing');if(el)el.remove();this.respond(ch,txt);},600+Math.random()*500);

  },

  respond(ch,txt) {

    const l=txt.toLowerCase();

    if(ch==='landing'){

      if(l.includes('started')||l.includes('help')) this.addAIMessage('landing',"Click **New Project** or choose a **template** to begin!\n\n1. Drag nodes from the library\n2. Connect outputs → inputs\n3. Click **▸ Data Inspector** to see data\n4. Ask me anything!");

      else if(l.includes('node')&&l.includes('available')) this.addAIMessage('landing',"**35 nodes** in 7 categories:\n\n• **Input** — Number, Text, Boolean, Slider, Integer\n• **Math** — Add, Subtract, Multiply, Divide, Power\n• **Logic** — AND, OR, NOT, Compare, If/Branch\n• **List** — Create, Get, Length, Range, Reverse\n• **Geometry** — Point, Vector, Line, Circle, Distance\n• **Output** — Watch, Display, Log, Chart, Export\n• **Custom/AI** — Code, Formula, Python, Comment, AI");

      else this.addAIMessage('landing',"Click **New Project** or a **template** to get started! 🚀");

    } else {

      // Try local AI code generation first

      const existingCode = document.getElementById('cv-code') ? document.getElementById('cv-code').value : '';

      const aiResult = AIEngine.generateCode(txt, existingCode);



      if (aiResult) {

        if (aiResult.action === 'replace' && this.codeViewerOpen) {

          this._pendingCode = aiResult.code;

          this.showCodeViewer(aiResult.code, null);

          this.addAIMessage('workspace', `✨ ${aiResult.explanation}\n\n**Approve** to apply to canvas, or **Cancel** to discard.`);

          this.showApproveButtons();

        } else {

          this._pendingCode = aiResult.code;

          this.showCodeViewer(aiResult.code, null);

          this.addAIMessage('workspace', `✨ ${aiResult.explanation}\n\nReview the code below. **Approve** to build the visual graph, or **Cancel**.`);

          this.showApproveButtons();

        }

      }

      // Direct node placement

      else if (l.includes('add') && (l.includes('node') || l.includes('number') || l.includes('point') || l.includes('watch'))) {

        let t='number-input';

        if(l.includes('point')) t='geo-point'; else if(l.includes('watch')) t='output-watch'; else if(l.includes('text')||l.includes('string')) t='text-input'; else if(l.includes('slider')) t='slider-input';

        const nd=this.addNodeFromLib(t);

        if(nd) this.addAIMessage('workspace',`✅ Added **${nd.def.name}** to canvas!`);

      }

      else if(l.includes('delete')||l.includes('remove')){

        if(this.selectedNodes.length>0){const c=this.selectedNodes.length;this.selectedNodes.forEach(id=>this.removeNode(id));this.selectedNodes=[];this.addAIMessage('workspace',`🗑️ Removed ${c} node(s)`);}

        else this.addAIMessage('workspace',"Select a node first, then ask me to delete it.");

      }

      else if(l.includes('explain')||l.includes('what')) this.addAIMessage('workspace',`📊 **Graph:** ${this.nodes.length} nodes, ${this.wires.length} connections`);

      // Not recognized by simple patterns → use universal AI engine

      else {

        const fallback = AIEngine.generateFromDescription(txt);

        if (fallback) {

          this._pendingCode = fallback.code;

          this.addAIMessage('workspace', `✨ ${fallback.explanation}\n\nReview the code below and **Approve** to build the visual graph, or **Cancel** to discard.`);

          this.showApproveButtons();

          // Show preview in code viewer without applying

          this.showCodeViewer(fallback.code, null);

        }

      }

    }

  },

  handleChatKey(e,ch){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.sendChat(ch);}},



  // ══════════════════════════════════════

  // AI APPROVE / CANCEL FLOW

  // ══════════════════════════════════════

  _pendingCode: null,



  showApproveButtons() {

    const sug = document.getElementById('ws-chat-suggestions');

    if (sug) {

      sug.innerHTML =

        '<button class="chat-suggestion-btn" style="background:rgba(166,227,161,0.15);border-color:rgba(166,227,161,0.3);color:var(--accent-green);font-weight:600" onclick="app.approveCode()">✅ Approve</button>' +

        '<button class="chat-suggestion-btn" style="background:rgba(243,139,168,0.1);border-color:rgba(243,139,168,0.2);color:var(--accent-red)" onclick="app.cancelCode()">✕ Cancel</button>' +

        '<button class="chat-suggestion-btn" onclick="app.editBeforeApprove()">✏️ Edit first</button>';

    }

  },



  approveCode() {

    const sug = document.getElementById('ws-chat-suggestions');

    if (sug) sug.innerHTML = '';



    // Phase 7: if a nova-plan handler stashed a built graph, prefer it
    // over re-parsing Python. We synthesise canonical Python from the
    // plan (using each node's codegen.python) and feed that through the
    // existing canvas-build pipeline — keeps a single battle-tested code
    // path while eliminating the "lossy parse" failure mode.

    if (this._pendingPlanGraph && this._pendingPlanGraph.plan) {

      const canonicalPy = this._pendingPlanGraph.canonicalPy;

      const codeEl = document.getElementById('cv-code');

      if (codeEl && canonicalPy) {

        codeEl.value = canonicalPy;

      }

      this.runEditedCode();

      this._pendingPlanGraph = null;

      this._pendingCode = null;

      this.addAIMessage('workspace', '✅ **Applied!** Graph built from the nova-plan.');

      return;

    }



    // The code is already in the code editor — run it to build nodes

    this.runEditedCode();

    this._pendingCode = null;

    this.addAIMessage('workspace', '✅ **Applied!** The visual graph has been built from the code.');

  },



  cancelCode() {

    const sug = document.getElementById('ws-chat-suggestions');

    if (sug) sug.innerHTML = '';

    this._pendingCode = null;



    // Close code viewer if it was just opened for this

    if (this.codeViewerOpen) this.toggleCodeViewer();

    this.addAIMessage('workspace', '❌ Cancelled. Ask me something else or drag nodes from the library.');

  },



  editBeforeApprove() {

    const sug = document.getElementById('ws-chat-suggestions');

    if (sug) sug.innerHTML =

      '<button class="chat-suggestion-btn" style="background:rgba(166,227,161,0.15);border-color:rgba(166,227,161,0.3);color:var(--accent-green);font-weight:600" onclick="app.approveCode()">✅ Approve</button>' +

      '<button class="chat-suggestion-btn" style="background:rgba(243,139,168,0.1);border-color:rgba(243,139,168,0.2);color:var(--accent-red)" onclick="app.cancelCode()">✕ Cancel</button>';

    this.addAIMessage('workspace', '✏️ Edit the code in the editor below, then click **Approve** when ready.');

    // Focus the code editor

    const codeEl = document.getElementById('cv-code');

    if (codeEl) codeEl.focus();

  },



  // ══════════════════════════════════════

  // CODE GENERATION ENGINE

  // ══════════════════════════════════════



  // Get a unique variable name for a node's port

  varName(nodeId, portId) {

    const nd = this.nodes.find(n => n.id === nodeId);

    if (!nd) return portId;

    const shortId = nodeId.replace('node-', '');

    const name = nd.def.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    return `${name}${shortId}_${portId}`;

  },



  // Resolve what variable name feeds into a node's input port

  resolveInput(nodeId, portId) {

    const wire = this.wires.find(w => w.toNode === nodeId && w.toPort === portId);

    if (wire) return this.varName(wire.fromNode, wire.fromPort);

    // No wire — use a default placeholder

    const nd = this.nodes.find(n => n.id === nodeId);

    if (nd) {

      const inp = nd.def.inputs.find(i => i.id === portId);

      if (inp) {

        if (inp.type === 'number') return '0';

        if (inp.type === 'string') return '""';

        if (inp.type === 'boolean') return this.codeLang === 'python' ? 'False' : 'false';

        return 'None' ;

      }

    }

    return 'None';

  },



  // Generate code for a single node

  generateNodeCode(nd) {

    // Python/Custom nodes: output their raw code directly for perfect round-trip

    if ((nd.type === 'custom-python' || nd.type === 'custom-code' || nd.type === 'Custom.Python') && nd.controlValues.code) {

      return nd.controlValues.code;

    }



    const cg = nd.def.codegen;

    if (!cg) return '# No code template';

    let template = cg[this.codeLang] || cg.python || '';



    // Replace output variable names: {{portId}}

    nd.def.outputs.forEach(out => {

      const vn = this.varName(nd.id, out.id);

      template = template.split('{{' + out.id + '}}').join(vn);

    });



    // Replace input variable names: {{portId}}

    nd.def.inputs.forEach(inp => {

      const resolved = this.resolveInput(nd.id, inp.id);

      template = template.split('{{' + inp.id + '}}').join(resolved);

    });



    // Replace control values: {{ctrl.controlId}}

    nd.def.controls.forEach(c => {

      const val = nd.controlValues[c.id] !== undefined ? nd.controlValues[c.id] : c.default;

      template = template.split('{{ctrl.' + c.id + '}}').join(val);

      template = template.split('{{ctrl.' + c.id + '_lower}}').join(String(val).toLowerCase());

    });



    return template;

  },



  // Topological sort of nodes based on wire dependencies

  topoSort() {

    const sorted = [];

    const visited = new Set();

    const visiting = new Set();

    const adj = {};

    this.nodes.forEach(n => { adj[n.id] = []; });

    this.wires.forEach(w => {

      if (adj[w.toNode]) adj[w.toNode].push(w.fromNode);

    });

    const visit = (id) => {

      if (visited.has(id)) return;

      if (visiting.has(id)) return; // cycle

      visiting.add(id);

      (adj[id] || []).forEach(dep => visit(dep));

      visiting.delete(id);

      visited.add(id);

      sorted.push(id);

    };

    this.nodes.forEach(n => visit(n.id));

    return sorted.map(id => this.nodes.find(n => n.id === id)).filter(Boolean);

  },



  // Generate the full script from the graph

  generateFullScript() {

    const sorted = this.topoSort();

    const isPy = this.codeLang === 'python';

    const lines = [];



    // Header

    if (isPy) {

      lines.push('# ═══════════════════════════════════');

      lines.push('# Generated by Nova');

      lines.push('# Language: Python');

      lines.push('# ═══════════════════════════════════');

      lines.push('import math');

      lines.push('');

    } else {

      lines.push('// ═══════════════════════════════════');

      lines.push('// Generated by Nova');

      lines.push('// Language: C#');

      lines.push('// ═══════════════════════════════════');

      lines.push('using System;');

      lines.push('using System.Linq;');

      lines.push('using System.Collections.Generic;');

      lines.push('');

    }



    // Node code in topological order

    sorted.forEach(nd => {

      const code = this.generateNodeCode(nd);

      const comment = isPy

        ? `# [${nd.def.name}] (${nd.id})`

        : `// [${nd.def.name}] (${nd.id})`;

      lines.push(comment);

      lines.push(code);

      lines.push('');

    });



    return lines.join('\n');

  },



  // Show code for a single node — opens full code and scrolls/highlights the relevant section

  showNodeCode(nodeId) {

    const nd = this.nodes.find(n => n.id === nodeId);

    if (!nd) return;



    // Generate full script if not already open

    const fullCode = this.generateFullScript();

    this.showCodeViewer(fullCode, null);



    // Find the node's tagged comment in the full code

    const isPy = this.codeLang === 'python';

    const tag = isPy ? '# [' + nd.def.name + '] (' + nd.id + ')' : '// [' + nd.def.name + '] (' + nd.id + ')';

    const codeEl = document.getElementById('cv-code');

    if (!codeEl) return;



    const code = codeEl.value;

    const tagStart = code.indexOf(tag);

    if (tagStart === -1) return;



    // Find the end of this node's block (next tag or end)

    const afterTag = code.substring(tagStart + tag.length);

    const nextTag = isPy ? afterTag.search(/\n# \[/) : afterTag.search(/\n\/\/ \[/);

    const tagEnd = nextTag > 0 ? tagStart + tag.length + nextTag : tagStart + tag.length + afterTag.length;



    // Select the node's code block in the textarea

    codeEl.focus();

    codeEl.setSelectionRange(tagStart, tagEnd);



    // Scroll the textarea to show the selection

    // Calculate approximate scroll position based on line number

    const linesBefore = code.substring(0, tagStart).split('\n').length - 1;

    const lineHeight = 20; // approximate

    codeEl.scrollTop = Math.max(0, linesBefore * lineHeight - 40);



    // Update label to show which node is highlighted

    const labelEl = document.getElementById('cv-node-label');

    if (labelEl) {

      labelEl.textContent = ' — Viewing: ' + nd.def.name + ' (' + nd.id + ')';

      labelEl.style.color = nd.def.categoryColor;

    }

  },



  // Show / hide the code viewer panel

  codeViewerHeight: 240,

  isResizingCV: false,



  showCodeViewer(code, singleNode) {

    let panel = document.getElementById('code-viewer-panel');

    if (!panel) {

      panel = document.createElement('div');

      panel.id = 'code-viewer-panel';

      panel.innerHTML = `

        <div class="cv-resize-handle" id="cv-resize-handle"></div>

        <div class="cv-header">

          <div class="cv-title-area">

            <span class="cv-icon">{ }</span>

            <span class="cv-title">Generated Code</span>

            <span class="cv-node-label" id="cv-node-label"></span>

          </div>

          <div class="cv-actions">

            <button class="cv-lang-btn cv-lang-active" id="cv-btn-python" onclick="app.setCodeLang('python')">Python</button>

            <button class="cv-lang-btn" id="cv-btn-csharp" onclick="app.setCodeLang('csharp')">C#</button>

            <button class="cv-btn" onclick="app.runEditedCode()" title="Run edited code">▶</button>

            <button class="cv-btn" onclick="app.copyCode()" title="Copy">📋</button>

            <button class="cv-btn" onclick="app.toggleCodeViewer()" title="Close">✕</button>

          </div>

        </div>

        <div class="cv-editor-wrap">

          <pre class="cv-code-highlight" id="cv-code-highlight" aria-hidden="true"></pre>

          <textarea class="cv-code" id="cv-code" spellcheck="false"></textarea>

        </div>`;

      document.getElementById('workspace-page').appendChild(panel);



      // Resize handle

      const handle = document.getElementById('cv-resize-handle');

      handle.addEventListener('mousedown', e => {

        e.preventDefault();

        this.isResizingCV = true;

      });



      // Sync textarea input → highlighted overlay

      const codeTA = document.getElementById('cv-code');

      const codeHL = document.getElementById('cv-code-highlight');

      codeTA.addEventListener('input', () => { this.highlightCode(); });

      codeTA.addEventListener('scroll', () => { codeHL.scrollTop = codeTA.scrollTop; codeHL.scrollLeft = codeTA.scrollLeft; });

      codeTA.addEventListener('keydown', (e) => {

        // Tab key inserts 4 spaces

        if (e.key === 'Tab') {

          e.preventDefault();

          const s = codeTA.selectionStart, end = codeTA.selectionEnd;

          codeTA.value = codeTA.value.substring(0, s) + '    ' + codeTA.value.substring(end);

          codeTA.selectionStart = codeTA.selectionEnd = s + 4;

          this.highlightCode();

        }

      });

    }

    panel.style.display = 'flex';

    panel.style.height = this.codeViewerHeight + 'px';

    this.codeViewerOpen = true;

    this._codeViewerNode = singleNode || null;

    this.updateCodeViewer(code, singleNode);

    this.syncCodeViewerLayout();

  },



  // Python syntax highlighter

  highlightCode() {

    const codeEl = document.getElementById('cv-code');

    const hlEl = document.getElementById('cv-code-highlight');

    if (!codeEl || !hlEl) return;

    const code = codeEl.value;



    // Escape HTML

    const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');



    // Tokenize and highlight

    const keywords = new Set(['import','from','as','def','class','return','yield','if','elif','else','for','while','in','not','and','or','is','with','try','except','finally','raise','pass','break','continue','lambda','global','nonlocal','assert','del','async','await']);

    const builtins = new Set(['print','len','range','int','float','str','bool','list','dict','set','tuple','type','isinstance','hasattr','getattr','setattr','enumerate','zip','map','filter','sorted','reversed','sum','min','max','abs','round','open','input','super','property','staticmethod','classmethod','__init__']);

    const constants = new Set(['True','False','None']);



    let result = '';

    let i = 0;

    while (i < code.length) {

      // Comments

      if (code[i] === '#') {

        let cm = '';

        while (i < code.length && code[i] !== '\n') { cm += code[i]; i++; }

        result += '<span class="sh-cm">' + esc(cm) + '</span>';

        continue;

      }

      // Strings (single/double, including triple-quoted)

      if ((code[i] === '"' || code[i] === "'")) {

        const q = code[i];

        const triple = code.substring(i, i+3) === q+q+q;

        const end = triple ? q+q+q : q;

        let s = '';

        if (triple) { s = q+q+q; i += 3; } else { s = q; i++; }

        while (i < code.length) {

          if (code[i] === '\\' && i+1 < code.length) { s += code[i] + code[i+1]; i += 2; continue; }

          if (triple && code.substring(i, i+3) === end) { s += end; i += 3; break; }

          if (!triple && code[i] === q) { s += q; i++; break; }

          s += code[i]; i++;

        }

        result += '<span class="sh-str">' + esc(s) + '</span>';

        continue;

      }

      // Numbers

      if (/\d/.test(code[i]) || (code[i] === '.' && i+1 < code.length && /\d/.test(code[i+1]))) {

        let num = '';

        while (i < code.length && /[\d.eExXoObBa-fA-F_]/.test(code[i])) { num += code[i]; i++; }

        result += '<span class="sh-num">' + esc(num) + '</span>';

        continue;

      }

      // Decorators

      if (code[i] === '@' && (i === 0 || code[i-1] === '\n')) {

        let dec = '';

        while (i < code.length && code[i] !== '\n' && code[i] !== '(') { dec += code[i]; i++; }

        result += '<span class="sh-dec">' + esc(dec) + '</span>';

        continue;

      }

      // Identifiers / keywords

      if (/[a-zA-Z_]/.test(code[i])) {

        let id = '';

        while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) { id += code[i]; i++; }

        // Check if followed by ( → function call

        const isCall = i < code.length && code[i] === '(';

        if (keywords.has(id)) result += '<span class="sh-kw">' + esc(id) + '</span>';

        else if (constants.has(id)) result += '<span class="sh-bool">' + esc(id) + '</span>';

        else if (id === 'self') result += '<span class="sh-self">' + esc(id) + '</span>';

        else if (id === 'math' || id === 'os' || id === 'sys' || id === 'json' || id === 'pandas' || id === 'pd' || id === 'np' || id === 'numpy' || id === 'sklearn' || id === 'torch' || id === 'tf' || id === 'random' || id === 'datetime' || id === 're' || id === 'collections')

          result += '<span class="sh-mod">' + esc(id) + '</span>';

        else if (builtins.has(id) && isCall) result += '<span class="sh-bi">' + esc(id) + '</span>';

        else if (isCall) result += '<span class="sh-fn">' + esc(id) + '</span>';

        else result += esc(id);

        continue;

      }

      // Operators

      if ('+-*/%=<>!&|^~'.includes(code[i])) {

        let op = code[i]; i++;

        // Multi-char ops

        if (i < code.length && '=*/>'.includes(code[i])) { op += code[i]; i++; }

        result += '<span class="sh-op">' + esc(op) + '</span>';

        continue;

      }

      // Everything else (parens, brackets, commas, dots, whitespace)

      result += esc(code[i]);

      i++;

    }



    // Add a trailing newline so the pre matches textarea scrollHeight

    hlEl.innerHTML = result + '\n';

  },



  updateCodeViewer(code, singleNode) {

    const codeEl = document.getElementById('cv-code');

    const labelEl = document.getElementById('cv-node-label');

    if (codeEl) { codeEl.value = code; this.highlightCode(); }

    if (labelEl) {

      labelEl.textContent = singleNode ? (' — ' + singleNode.def.name + ' (' + singleNode.id + ')') : ' — Full Graph';

      labelEl.style.color = singleNode ? singleNode.def.categoryColor : 'var(--text-muted)';

    }

    const pyBtn = document.getElementById('cv-btn-python');

    const csBtn = document.getElementById('cv-btn-csharp');

    if (pyBtn) pyBtn.className = 'cv-lang-btn' + (this.codeLang === 'python' ? ' cv-lang-active' : '');

    if (csBtn) csBtn.className = 'cv-lang-btn' + (this.codeLang === 'csharp' ? ' cv-lang-active' : '');

  },



  // Apply stored chat size based on dock position

  applyChatSize() {

    const p = document.getElementById('ws-chat-panel');

    if (!p) return;

    if (this.chatDock === 'right' || this.chatDock === 'left') {

      p.style.width = this.chatWidth + 'px';

      p.style.height = '';

    } else if (this.chatDock === 'bottom') {

      p.style.height = this.chatHeight + 'px';

      p.style.width = '';

    }

  },

  getNodeLibraryWidth() {

    const root = getComputedStyle(document.documentElement);

    const value = parseFloat(root.getPropertyValue('--lib-width'));

    return Number.isFinite(value) ? value : 260;

  },

  syncWorkspaceLayout() {

    const wp = document.getElementById('workspace-page');

    const lib = document.getElementById('node-library');

    const chatPanel = document.getElementById('ws-chat-panel');

    if (!wp) return;

    const libVisible = !lib || lib.style.display !== 'none';

    const libWidth = libVisible ? this.getNodeLibraryWidth() : 0;

    const chatActive = this.chatVisible && chatPanel && !chatPanel.classList.contains('chat-hidden') && this.chatDock !== 'float';

    let canvasLeft = libWidth;

    let canvasRight = 0;

    let canvasBottom = 0;

    if (chatActive) {

      if (this.chatDock === 'right') {

        canvasRight = this.chatWidth;

      } else if (this.chatDock === 'left') {

        canvasLeft += this.chatWidth;

      } else if (this.chatDock === 'bottom') {

        canvasBottom = this.chatHeight;

      }

    }

    wp.style.setProperty('--workspace-left', libWidth + 'px');

    wp.style.setProperty('--canvas-left', canvasLeft + 'px');

    wp.style.setProperty('--canvas-right', canvasRight + 'px');

    wp.style.setProperty('--canvas-bottom', canvasBottom + 'px');

    this.renderWires();

    if (typeof Viewer3D !== 'undefined' && Viewer3D.isInitialized && Viewer3D._onResize) {

      Viewer3D._onResize();

    }

  },

  queueWorkspaceLayoutSync() {

    requestAnimationFrame(() => {

      this.syncWorkspaceLayout();

      setTimeout(() => this.syncWorkspaceLayout(), 0);

    });

  },



  // Resize AI panel by dragging its handle

  onChatResize(e) {

    const p = document.getElementById('ws-chat-panel');

    const wp = document.getElementById('workspace-page');

    if (!p || !wp) return;

    const wpRect = wp.getBoundingClientRect();



    if (this.chatDock === 'right') {

      const newW = Math.max(250, Math.min(wpRect.width - 300, wpRect.right - e.clientX));

      this.chatWidth = Math.round(newW);

      p.style.width = this.chatWidth + 'px';

    } else if (this.chatDock === 'left') {

      const newW = Math.max(250, Math.min(wpRect.width - 300, e.clientX - wpRect.left - 260));

      this.chatWidth = Math.round(newW);

      p.style.width = this.chatWidth + 'px';

    } else if (this.chatDock === 'bottom') {

      const cvH = this.codeViewerOpen ? this.codeViewerHeight : 0;

      const newH = Math.max(150, Math.min(wpRect.height - 100 - cvH, wpRect.bottom - e.clientY - cvH));

      this.chatHeight = Math.round(newH);

      p.style.height = this.chatHeight + 'px';

    }

    this.syncWorkspaceLayout();

    this.syncCodeViewerLayout();

  },



  // Sync code viewer with AI panel so they don't overlap

  syncCodeViewerLayout() {

    const panel = document.getElementById('code-viewer-panel');

    const chatPanel = document.getElementById('ws-chat-panel');

    if (!panel) return;



    panel.classList.remove('cv-shrink-right', 'cv-shrink-left');

    panel.style.right = '';

    panel.style.left = '';



    const chatActive = this.chatVisible && chatPanel && !chatPanel.classList.contains('chat-hidden');



    if (chatActive) {

      if (this.chatDock === 'right') {

        panel.style.right = this.chatWidth + 'px';

      } else if (this.chatDock === 'left') {

        panel.style.left = (260 + this.chatWidth) + 'px';

      } else if (this.chatDock === 'bottom') {

        chatPanel.style.bottom = this.codeViewerOpen ? this.codeViewerHeight + 'px' : '0';

      }

    }



    if (!panel.style.left) panel.style.left = 'var(--lib-width)';

    if (!panel.style.right) panel.style.right = '0';



    // Reset bottom for non-bottom dock

    if (chatPanel && this.chatDock !== 'bottom') {

      chatPanel.style.bottom = '';

    }

  },



  onCodeViewerResize(e) {

    if (!this.isResizingCV) return;

    const wp = document.getElementById('workspace-page');

    const wpRect = wp.getBoundingClientRect();

    const newH = Math.max(120, Math.min(wpRect.height - 100, wpRect.bottom - e.clientY));

    this.codeViewerHeight = Math.round(newH);

    const panel = document.getElementById('code-viewer-panel');

    if (panel) panel.style.height = this.codeViewerHeight + 'px';

    this.syncCodeViewerLayout();

  },



  setCodeLang(lang) {

    this.codeLang = lang;

    if (this._codeViewerNode) {

      this.updateCodeViewer(this.generateNodeCode(this._codeViewerNode), this._codeViewerNode);

    } else {

      this.updateCodeViewer(this.generateFullScript(), null);

    }

  },



  toggleCodeViewer() {

    const panel = document.getElementById('code-viewer-panel');

    if (panel) {

      this.codeViewerOpen = !this.codeViewerOpen;

      panel.style.display = this.codeViewerOpen ? 'flex' : 'none';

      // Reset AI bottom position when closing

      if (!this.codeViewerOpen) {

        const chatPanel = document.getElementById('ws-chat-panel');

        if (chatPanel) chatPanel.style.bottom = '';

      } else {

        this.syncCodeViewerLayout();

      }

    }

  },



  copyCode() {

    const codeEl = document.getElementById('cv-code');

    if (codeEl) {

      const text = codeEl.value;

      if (navigator.clipboard) {

        navigator.clipboard.writeText(text);

      } else {

        codeEl.select();

        document.execCommand('copy');

      }

      this.addAIMessage('workspace', '📋 Code copied to clipboard!');

    }

  },



  // ══════════════════════════════════════

  // CODE → CANVAS (AST-based parser)

  // Reads Python code semantically, builds nodes from the logic

  // ══════════════════════════════════════

  runEditedCode() {

    const codeEl = document.getElementById('cv-code');

    if (!codeEl) return;

    const code = codeEl.value;



    try {

      const graph = CodeParser.parseToGraph(code);



      if (graph.nodes.length === 0) {

        this.addAIMessage('workspace', '⚠️ Could not parse any operations from the code.\n\nWrite Python like:\n• `result = a + b`\n• `x = 10`\n• `point = (1, 2, 3)`\n• `print(result)`');

        return;

      }



      // Clear current canvas

      this.nodes.forEach(nd => {

        const el = document.getElementById(nd.id);

        if (el) el.remove();

      });

      this.nodes = [];

      this.wires = [];

      this.selectedNodes = [];

      this.nextNodeId = graph.nextId;

      document.getElementById('wire-svg').innerHTML = '';



      // Create nodes from parsed graph

      const created = [];

      graph.nodes.forEach(gn => {

        const def = NODE_TYPE_MAP[gn.type];

        if (!def) return;



        this.nodeZCounter++;

        const nd = {

          id: gn.id, type: gn.type,

          x: gn.x, y: gn.y,

          def: { ...def },

          controlValues: {},

          dataPanelOpen: false,

          zIndex: this.nodeZCounter

        };

        // Set default controls, then override with parsed values

        def.controls.forEach(c => { nd.controlValues[c.id] = c.default; });

        Object.keys(gn.controls).forEach(k => { nd.controlValues[k] = gn.controls[k]; });



        // For Python nodes, store rawCode so Canvas→Code can reproduce it exactly

        if ((gn.type === 'custom-python' || gn.type === 'Custom.Python') && gn.rawCode) {

          nd.controlValues.code = gn.rawCode;

        }

        // Phase 6: carry dynamic port info from the parser to the node so
        // enhancePythonNode renders ports matching the variables the block
        // actually exposes. Without this, multi-line Python blocks fall
        // back to a generic `output0` port and downstream wires drawn by
        // the parser point at a non-existent port — the result is a
        // dangling input on the next node (e.g. Solid.ByLoft "Profiles"
        // shows a warning badge because nothing flows in).

        if (gn.type === 'custom-python' || gn.type === 'Custom.Python') {

          if (Array.isArray(gn.controls && gn.controls._dynInputs) && gn.controls._dynInputs.length > 0) {

            nd._dynInputs = gn.controls._dynInputs.slice();

          }

          if (Array.isArray(gn.outputVars) && gn.outputVars.length > 0) {

            nd._dynOutputs = gn.outputVars.slice();

          }

        }



        this.nodes.push(nd);

        this.renderNode(nd);

        created.push(nd.def.name);

      });



      // Create wires

      graph.wires.forEach(w => {

        this.wires.push(w);

      });

      // Re-render nodes that have property controls to show/hide wired green border
      if (this._refreshRenderedNode) {
        var refreshTargets = {};
        graph.wires.forEach(function(w) {
          var nd = this.nodes.find(function(n) { return n.id === w.toNode; });
          if (nd && this._inputHasPropertyControl && this._inputHasPropertyControl(nd.id, w.toPort)) {
            refreshTargets[nd.id] = true;
          }
        }.bind(this));
        Object.keys(refreshTargets).forEach(function(id) { this._refreshRenderedNode(id); }.bind(this));
      }

      this.updatePortDots();

      setTimeout(() => this.renderWires(), 50);

      this.updateMenuState();



      // Build summary

      const typeCount = {};

      created.forEach(n => { typeCount[n] = (typeCount[n] || 0) + 1; });

      const summary = Object.keys(typeCount).map(k => `**${k}** ×${typeCount[k]}`).join(', ');



      this.addAIMessage('workspace', `✅ **Code → Canvas synced!**\n\nParsed ${graph.nodes.length} nodes from your code:\n• ${summary}\n• ${graph.wires.length} connections auto-wired\n\nThe AI understood your code structure and built the visual graph.`);



    } catch (err) {

      this.addAIMessage('workspace', `❌ Parse error: ${err.message}\n\nMake sure the code is valid Python with simple assignments like:\n\`x = 10\`\n\`result = a + b\`\n\`d = math.dist(p1, p2)\``);

    }

  }

};



// ══════════════════════════════════════

// 3D VIEWPORT TOGGLE

// ══════════════════════════════════════

// The actual app.setView, app.toggleSplit, and app._applyViewState are
// installed by core/engine.js installEngine() — defining duplicates here
// would only fight that ownership. We keep the divider drag and the
// split-mode live rebuild watcher below; those don't conflict.

app.currentView = 'nodes';

// The viewport divider is gone — split view now stacks 2D and 3D on the
// same rectangle (layered, not side-by-side), so there's nothing to drag.

// ── Live 3D rebuild for split view ──

// A requestAnimationFrame watcher that observes the engine's version
// counter (ExecutionEngine v2 bumps `_version` on every invalidate) or
// falls back to `app._graphDirty`. When the value changes while split
// view is active, rebuild the 3D scene. Cheap when idle (one compare
// per frame), avoids the ordering hassle of patching invalidateCompute
// after ExecutionEngine v2 has already wrapped it.

app._runSplitWatcher = function() {

  if (this._splitWatcherRunning) return;

  this._splitWatcherRunning = true;

  let lastSeenVersion = -1;

  const tick = () => {

    try {

      if (this.splitMode && typeof Viewer3D !== 'undefined' && Viewer3D.isInitialized) {

        const ee = typeof window !== 'undefined' ? window.__executionEngineV2 : null;

        const v = ee && typeof ee._version === 'number' ? ee._version : (this._graphDirty ? 1 : 0);

        if (v !== lastSeenVersion) {

          lastSeenVersion = v;

          try {

            Viewer3D.buildFromGraph(this.nodes, this.wires, (nd) => this.computeNodeValue(nd));

          } catch (e) { /* skip rebuild errors */ }

          Viewer3D._needsRebuild = false;

        }

      }

    } catch (e) { /* never let the watcher die */ }

    requestAnimationFrame(tick);

  };

  requestAnimationFrame(tick);

};

if (typeof document !== 'undefined') {

  document.addEventListener('DOMContentLoaded', () => {

    if (app._runSplitWatcher) app._runSplitWatcher();

  });

}



if (typeof window !== 'undefined') {
  window.app = app;
}

export function initializeApp() {
  if (app.initialized) {
    return app;
  }

  app.init();
  return app;
}

export { app };
export default app;

