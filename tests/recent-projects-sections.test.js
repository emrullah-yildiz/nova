// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installSaveLoad } from '../src/app/save-load.js';

function makeStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: (index) => Array.from(data.keys())[index] || null,
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear()
  };
}

function makeApp(overrides = {}, client = null) {
  const app = {
    currentUser: overrides.currentUser !== undefined ? overrides.currentUser : { email: 'owner@example.com' },
    currentPage: 'landing',
    addAIMessage: () => {},
    newProject: () => { app.currentPage = 'workspace'; },
    signIn: vi.fn(),
    renderRecentProjects() {
      const el = document.getElementById('recent-list');
      if (el) el.innerHTML = '<button class="recent-item">Fallback</button>';
    },
    ...overrides
  };
  installSaveLoad(app);
  if (client) app._novaCloudClient = client;
  // Inline onclick="app._openRecentItem(...)" resolves `app` from the global
  // scope, so expose it the same way the real app does (window.app).
  globalThis.app = app;
  return app;
}

describe('landing recent projects sections', () => {
  beforeEach(() => {
    globalThis.localStorage = makeStorage();
    document.body.innerHTML =
      '<div id="recent-list"></div>' +
      '<div id="my-projects-section" style="display:none"><div id="my-projects-list"></div></div>';
  });

  it('shows browser-local recents first and signed-in account projects second', async () => {
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([{ name: 'Browser Draft', date: Date.now() - 1000 }]));
    const app = makeApp({}, {
      listProjects: async () => ({ projects: [{ id: 'cloud-1', name: 'Cloud Project', updatedAt: Date.now() }] }),
      listSharedProjects: async () => ({ projects: [{ id: 'shared-1', name: 'Shared Project', updatedAt: Date.now() }] })
    });

    app.renderRecentProjects();
    expect(document.getElementById('recent-list').textContent).toContain('Browser Draft');
    expect(document.getElementById('my-projects-list').textContent).toContain('Loading your projects');

    await new Promise(resolve => setTimeout(resolve, 0));

    const recentText = document.getElementById('recent-list').textContent;
    expect(recentText).toContain('Browser Draft');
    expect(recentText).not.toContain('Cloud Project');

    const myText = document.getElementById('my-projects-list').textContent;
    expect(myText).toContain('Cloud Project');
    expect(myText).toContain('Shared with you');
    expect(myText).toContain('Shared Project');
  });

  // ── HTML structure of recent-item rows ──────────────────────────────────

  it('local project row has correct structure: icon, name, local badge, date', () => {
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([
      { name: 'My Facade', date: Date.now() - 5000 }
    ]));
    const app = makeApp({ currentUser: null }); // not signed in
    app.renderRecentProjects();

    const list = document.getElementById('recent-list');
    const btn = list.querySelector('button.recent-item');
    expect(btn).not.toBeNull();

    // Must be a <button> so it is keyboard-accessible and has correct semantics
    expect(btn.tagName).toBe('BUTTON');

    // Icon span — local/browser projects use the 🖥️ desktop glyph
    const icon = btn.querySelector('.ri-icon');
    expect(icon).not.toBeNull();
    expect(icon.textContent).toBe('🖥️');

    // Name span contains the project name
    const name = btn.querySelector('.ri-name');
    expect(name).not.toBeNull();
    expect(name.textContent).toBe('My Facade');

    // Badge indicates local storage
    const badge = btn.querySelector('.ri-type');
    expect(badge).not.toBeNull();
    expect(badge.classList.contains('ri-type-local')).toBe(true);
    expect(badge.textContent).toBe('local');

    // Date span is present
    expect(btn.querySelector('.ri-date')).not.toBeNull();

    // onclick calls _openRecentItem with the project name and empty cloudId
    expect(btn.getAttribute('onclick')).toContain('_openRecentItem');
    expect(btn.getAttribute('onclick')).toContain('My Facade');
  });

  it('the Local projects list excludes legacy cloud entries (they belong in Cloud Projects)', () => {
    // A legacy recent entry that carries a cloudId must NOT appear in the
    // browser-only "Local projects" list — only genuine local saves do.
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([
      { name: 'Cloud Proj', cloudId: 'prj_abc123', date: Date.now() - 1000 },
      { name: 'Browser Proj', date: Date.now() - 2000 }
    ]));
    const app = makeApp({ currentUser: null });
    app.renderRecentProjects();

    const buttons = document.querySelectorAll('#recent-list button.recent-item');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].querySelector('.ri-name').textContent).toBe('Browser Proj');
    expect(buttons[0].querySelector('.ri-icon').textContent).toBe('🖥️');
    // No cloud entry leaked into the local list
    expect(document.getElementById('recent-list').textContent).not.toContain('Cloud Proj');
  });

  it('multiple local projects each get their own button', () => {
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([
      { name: 'Alpha', date: Date.now() - 1000 },
      { name: 'Beta',  date: Date.now() - 2000 },
      { name: 'Gamma', date: Date.now() - 3000 }
    ]));
    const app = makeApp({ currentUser: null });
    app.renderRecentProjects();

    const buttons = document.querySelectorAll('#recent-list button.recent-item');
    expect(buttons).toHaveLength(3);
    const names = Array.from(buttons).map(b => b.querySelector('.ri-name').textContent);
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  // ── Click behaviour ─────────────────────────────────────────────────────

  it('local row onclick dispatches openFromLocal with the project name', () => {
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([
      { name: 'LocalProj', date: Date.now() - 500 }
    ]));
    const app = makeApp({ currentUser: null });
    // installSaveLoad installs the real openFromLocal; override it AFTER so we
    // can observe the dispatch without touching localStorage project data.
    const openFromLocal = vi.fn();
    app.openFromLocal = openFromLocal;
    app.renderRecentProjects();

    // The rendered button carries the dispatch call in its onclick…
    const btn = document.querySelector('#recent-list button.recent-item');
    expect(btn.getAttribute('onclick')).toBe("app._openRecentItem('LocalProj','')");

    // …and invoking that dispatcher opens the local project.
    app._openRecentItem('LocalProj', '');
    expect(openFromLocal).toHaveBeenCalledWith('LocalProj');
  });

  it('a cloud row in Cloud Projects renders with the cloud icon + dispatch onclick', async () => {
    const app = makeApp({}, {
      listProjects: async () => ({ projects: [{ id: 'prj_xyz789', name: 'CloudProj', updatedAt: Date.now() }] }),
      listSharedProjects: async () => ({ projects: [] })
    });
    app.renderRecentProjects();
    await new Promise(r => setTimeout(r, 0));

    const btn = document.querySelector('#my-projects-list button.recent-item');
    expect(btn).not.toBeNull();
    expect(btn.querySelector('.ri-icon').textContent).toBe('☁');
    expect(btn.querySelector('.ri-type').classList.contains('ri-type-cloud')).toBe(true);
    expect(btn.getAttribute('onclick')).toBe("app._openRecentItem('','prj_xyz789')");
  });

  it('_openRecentItem with a cloudId dispatches openCloudProject when signed in', async () => {
    const getProject = vi.fn(async () => ({
      id: 'prj_xyz789', name: 'CloudProj', currentVersionId: 'v1',
      versions: [{ id: 'v1', graph: { nodes: [], wires: [] } }]
    }));
    const app = makeApp(
      { currentUser: { email: 'owner@example.com' },
        deserializeGraph: () => true, serializeGraph: () => ({}), _saveCloudProjectId: () => {} },
      { getProject }
    );
    app.ensureNovaCloudSession = async () => app._novaCloudClient;

    app._openRecentItem('', 'prj_xyz789');
    await new Promise(r => setTimeout(r, 0));
    expect(getProject).toHaveBeenCalledWith('prj_xyz789');
  });

  it('cloud row when NOT signed in prompts sign-in instead of failing silently', () => {
    const app = makeApp({ currentUser: null }); // NOT signed in
    app._openRecentItem('', 'prj_xyz789');
    expect(app.signIn).toHaveBeenCalled();
  });

  // ── Save → recent → open round-trip ─────────────────────────────────────

  it('a saved local project round-trips: openFromLocal reads it back and deserializes', () => {
    const saved = { nodes: [], wires: [], name: 'SavedProj', version: 2 };
    // This is exactly what saveToLocal writes: STORAGE_PREFIX + name, plus a recents entry.
    localStorage.setItem('nodeflow_project_SavedProj', JSON.stringify(saved));
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([{ name: 'SavedProj', date: Date.now() }]));

    const app = makeApp({ currentUser: null });
    const deserializeGraph = vi.fn(() => true);
    app.deserializeGraph = deserializeGraph;
    app.renderRecentProjects();

    // Click → dispatch → openFromLocal reads the saved blob and deserializes it.
    app._openRecentItem('SavedProj', '');
    expect(deserializeGraph).toHaveBeenCalled();
    expect(deserializeGraph.mock.calls[0][0]).toMatchObject({ name: 'SavedProj' });
    expect(app._projectName).toBe('SavedProj');
  });

  it('opening a local project missing from storage surfaces a visible not-found message', () => {
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([{ name: 'Ghost', date: Date.now() }]));
    const app = makeApp({ currentUser: null });
    const addAIMessage = vi.fn();
    app.addAIMessage = addAIMessage;

    app._openRecentItem('Ghost', '');
    expect(addAIMessage.mock.calls.some(c => /not found/i.test(String(c[1])))).toBe(true);
  });

  it('empty recent list shows the fallback origRenderRecent content when not signed in', () => {
    // No recent projects in localStorage
    const app = makeApp({ currentUser: null });
    app.renderRecentProjects();

    // The fallback (overridden renderRecentProjects in makeApp) puts a button
    const list = document.getElementById('recent-list');
    expect(list.textContent).toContain('Fallback');
  });

  it('shows "Open a project to see it here" when signed in with no browser recents', () => {
    const app = makeApp({}, {
      listProjects: async () => ({ projects: [] }),
      listSharedProjects: async () => ({ projects: [] })
    });
    app.renderRecentProjects();

    const list = document.getElementById('recent-list');
    expect(list.textContent).toContain('Open a project to see it here');
  });
});
