// @vitest-environment jsdom
//
// Regression test for opening a project invitation link (?join=<token>): after
// the join chooser's "Continue", the invitee must land IN the shared project
// (workspace) on success, and see a VISIBLE, actionable error on the landing
// page on failure (403 unverified / 410 expired / 404 invalid) — instead of
// silently sitting on the landing page (errors used to go only to the hidden
// workspace chat).
//
// Drives the REAL installed handlers: app._joinContinue() → app.redeemShareToken()
// → app.openCloudProject(), with a fake cloud client + a minimal fake app.

import { describe, it, expect, beforeEach } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

// A manually-resolvable promise so we can assert state mid-flight (e.g. that
// _joinContinue AWAITS — the loading overlay is still up before we resolve).
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Mimic how the cloud client throws: Error with .status (and sometimes .code).
function httpError(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

<<<<<<< Updated upstream
=======
// A truthy graph version (so openCloudProject's `!version.graph` guard passes)
// that the REAL deserializeGraph (installed by installSaveLoad) short-circuits on
// — it returns early when there are no `nodes`, so we don't have to stub the full
// canvas/render surface (applyTransform, renderWires, …). openCloudProject still
// sets _cloudProjectId = project.id afterwards, which is what we assert.
const stubGraph = () => ({ schema: 'nova', empty: true });

>>>>>>> Stashed changes
// Build a minimal fake app wired enough to run the real join flow. installSaveLoad
// installs its own getNovaCloudClient that returns app._novaCloudClient, so we
// seed that with our stub. newProject is faked to do the page switch the real one
// does (switchPage('workspace')).
function makeApp(client) {
  const app = {
    currentPage: 'landing',
    _aiMessages: [],
    _cloudProjectId: null,
    _projectName: null,
    currentUser: { email: 'invitee@example.com', displayName: 'Invitee' },
    _pendingJoinToken: '',
    signIn: () => {},
    renderRecentProjects: () => {},
    deserializeGraph: () => {},
    serializeGraph: () => ({ nodes: [], connections: [] }),
    escapeHtml: (s) => String(s ?? ''),
  };
  app.addAIMessage = (...a) => { app._aiMessages.push(a); };
  // Fake the page switch the real newProject performs.
  app.newProject = () => { app.switchPage('workspace'); };
  app.switchPage = (p) => {
    app.currentPage = p;
    document.querySelectorAll('#landing-page, #workspace-page').forEach(el => el.classList.remove('active'));
    const t = document.getElementById(p + '-page');
    if (t) t.classList.add('active');
  };
  // The redeem/open code lives in save-load; install it onto our fake.
  installSaveLoad(app);
  app._novaCloudClient = client;
  return app;
}

// Pull in _joinContinue (defined in app.js on the shared `app` singleton). We
// don't want to boot the whole app singleton, so re-declare the same logic by
// copying the real method onto our fake — kept byte-identical to app.js so the
// test exercises the real control flow (await + clear pending + redeem).
function attachJoinContinue(app) {
  app._joinContinue = async function () {
    const token = this._pendingJoinToken;
    this._pendingJoinToken = '';
    const o = document.getElementById('join-chooser-overlay'); if (o) o.remove();
    if (token && this.redeemShareToken) await this.redeemShareToken(token);
  };
}

const flush = () => Promise.resolve();
const visibleText = () => (document.body.textContent || '').toLowerCase();
const statusOverlay = () => document.getElementById('join-status-overlay');

beforeEach(() => {
  // ensureNovaCloudSession (used by openCloudProject) requires cloud to be
  // enabled in the runtime config — otherwise it throws CLOUD_DISABLED.
  window.__NOVA_RUNTIME__ = { cloud: true };
  document.body.innerHTML =
    '<div id="landing-page" class="active"></div><div id="workspace-page"></div>';
});

describe('invite redeem: land in the shared project or show a visible error', () => {
  it('1. SUCCESS: awaits redeem+open, switches to the workspace, clears overlays', async () => {
    const d = deferred();
    const client = {
      redeemShareLink: () => d.promise,
      getProject: async () => ({
        id: 'prj1',
        name: 'Shared Project',
        currentVersionId: 'v1',
<<<<<<< Updated upstream
        versions: [{ id: 'v1', graph: { nodes: [], connections: [] } }],
=======
        versions: [{ id: 'v1', graph: stubGraph() }],
>>>>>>> Stashed changes
      }),
    };
    const app = makeApp(client);
    attachJoinContinue(app);
    app._pendingJoinToken = 'tok-success';

    // Fire Continue but do NOT await yet — assert it is still in-flight.
    const p = app._joinContinue();

    // The pending token is cleared synchronously (so refreshSession won't reprocess).
    expect(app._pendingJoinToken).toBe('');
    // A visible "Opening shared project…" loading overlay is up while awaiting,
    // and we have NOT switched to the workspace (the redeem hasn't resolved).
    expect(statusOverlay()).not.toBeNull();
    expect(visibleText()).toContain('opening shared project');
    expect(app.currentPage).toBe('landing');

    // Resolve the redeem; openCloudProject runs and switches to the workspace.
    d.resolve({ project: { id: 'prj1' } });
    await p;
    await flush();

    expect(app.currentPage).toBe('workspace');
    expect(document.getElementById('workspace-page').classList.contains('active')).toBe(true);
    expect(app._cloudProjectId).toBe('prj1');
    // Both the chooser (if any) and the loading overlay are gone.
    expect(document.getElementById('join-chooser-overlay')).toBeNull();
    expect(statusOverlay()).toBeNull();
  });

  it('2. EMAIL-NOT-VERIFIED (403): visible "verify your email" message, no page switch', async () => {
    const client = {
      redeemShareLink: async () => { throw httpError(403, 'Verify your email before joining.', 'EMAIL_NOT_VERIFIED'); },
      getProject: async () => { throw new Error('should not be called'); },
    };
    const app = makeApp(client);
    attachJoinContinue(app);
    app._pendingJoinToken = 'tok-403';

    await app._joinContinue();
    await flush();

    expect(app.currentPage).toBe('landing');
    expect(document.getElementById('workspace-page').classList.contains('active')).toBe(false);
    expect(statusOverlay()).not.toBeNull();
    expect(visibleText()).toContain('verify your email');
  });

  it('3. EXPIRED/REVOKED (410): visible "expired"/"revoked" message, no page switch', async () => {
    const client = {
      redeemShareLink: async () => { throw httpError(410, 'Link revoked.'); },
      getProject: async () => { throw new Error('should not be called'); },
    };
    const app = makeApp(client);
    attachJoinContinue(app);
    app._pendingJoinToken = 'tok-410';

    await app._joinContinue();
    await flush();

    expect(app.currentPage).toBe('landing');
    const t = visibleText();
    expect(t.includes('expired') || t.includes('revoked')).toBe(true);
    expect(statusOverlay()).not.toBeNull();
  });

  it('4. INVALID (404): visible "invalid" message, no page switch', async () => {
    const client = {
      redeemShareLink: async () => { throw httpError(404, 'Not found.'); },
      getProject: async () => { throw new Error('should not be called'); },
    };
    const app = makeApp(client);
    attachJoinContinue(app);
    app._pendingJoinToken = 'tok-404';

    await app._joinContinue();
    await flush();

    expect(app.currentPage).toBe('landing');
    expect(visibleText()).toContain('invalid');
    expect(statusOverlay()).not.toBeNull();
  });
});
