import { describe, it, expect, beforeEach } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

// Phase 2 orchestration: saving projects to the signed-in account. The DOM-heavy
// bits (dialogs, My Projects rendering, deserialize) need a browser and are
// covered by manual/verify; here we exercise the auth gating + create-vs-update
// flow with light global stubs and a fake cloud client (no jsdom dependency).

function stubGlobals() {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, insertAdjacentElement() {} }),
    body: { appendChild() {}, removeChild() {} }
  };
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: () => null,
    get length() { return 0; }
  };
  globalThis.window = globalThis;
}

function fakeClient() {
  const calls = { create: [], save: [] };
  return {
    calls,
    useCookie: true,
    isAuthenticated: () => true,
    async createProject(payload) { calls.create.push(payload); return { id: 'prj_1', name: payload.name }; },
    async saveProjectGraph(id, payload) { calls.save.push({ id, ...payload }); return { id, name: payload.name || 'Untitled' }; }
  };
}

function makeApp(client) {
  const app = {
    _projectName: 'Untitled',
    zoom: 1, panX: 0, panY: 0, nextNodeId: 1,
    nodes: [], wires: [],
    currentPage: 'workspace',
    currentUser: null,
    messages: [],
    addAIMessage(_ch, msg) { this.messages.push(msg); },
    renderRecentProjects() {},
    newProject() {}
  };
  globalThis.window.NodeFlow = { createNovaCloudClient: () => client };
  installSaveLoad(app);
  return app;
}

describe('cloud project save (account)', () => {
  beforeEach(stubGlobals);

  it('refuses to save when not signed in (NOT_SIGNED_IN)', async () => {
    const app = makeApp(fakeClient());
    app.currentUser = null;
    await expect(app.ensureNovaCloudSession()).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
  });

  it('saveCloudFromDialog prompts sign-in when signed out', async () => {
    const app = makeApp(fakeClient());
    app.currentUser = null;
    let signInCalled = false;
    app.signIn = () => { signInCalled = true; };
    await expect(app.saveCloudFromDialog('My Graph')).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    expect(signInCalled).toBe(true);
  });

  it('first save creates a project; subsequent save updates the same project', async () => {
    const client = fakeClient();
    const app = makeApp(client);
    app.currentUser = { id: 'usr_1', email: 'a@b.com' };

    const created = await app.saveToCloud('My Graph');
    expect(client.calls.create).toHaveLength(1);
    expect(created.id).toBe('prj_1');
    expect(app._cloudProjectId).toBe('prj_1');
    expect(app._projectName).toBe('My Graph');
    expect(typeof app._lastCloudSaveSerialized).toBe('string'); // tracked for autosave dirty-check

    app.nodes.push({ id: 'n1', type: 'number-input', x: 0, y: 0, controlValues: {} });
    await app.saveToCloud('My Graph');
    expect(client.calls.create).toHaveLength(1);       // not created again
    expect(client.calls.save).toHaveLength(1);          // updated instead
    expect(client.calls.save[0].id).toBe('prj_1');
  });
});
