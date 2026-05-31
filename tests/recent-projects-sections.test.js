// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
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

function makeApp(client) {
  const app = {
    currentUser: { email: 'owner@example.com' },
    currentPage: 'landing',
    addAIMessage: () => {},
    newProject: () => {},
    renderRecentProjects() {
      const el = document.getElementById('recent-list');
      if (el) el.innerHTML = '<button class="recent-item">Fallback</button>';
    }
  };
  installSaveLoad(app);
  app._novaCloudClient = client;
  return app;
}

describe('landing recent projects sections', () => {
  beforeEach(() => {
    globalThis.localStorage = makeStorage();
    // Match the two-section HTML structure: recent-list for browser recents,
    // my-projects-section/my-projects-list for cloud account projects.
    document.body.innerHTML =
      '<div id="recent-list"></div>' +
      '<div id="my-projects-section" style="display:none"><div id="my-projects-list"></div></div>';
  });

  it('shows browser-local recents first and signed-in account projects second', async () => {
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([{ name: 'Browser Draft', date: Date.now() - 1000 }]));
    const app = makeApp({
      listProjects: async () => ({ projects: [{ id: 'cloud-1', name: 'Cloud Project', updatedAt: Date.now() }] }),
      listSharedProjects: async () => ({ projects: [{ id: 'shared-1', name: 'Shared Project', updatedAt: Date.now() }] })
    });

    app.renderRecentProjects();

    // recent-list immediately shows browser recents
    expect(document.getElementById('recent-list').textContent).toContain('Browser Draft');
    // my-projects-list shows loading placeholder while cloud fetch is in flight
    expect(document.getElementById('my-projects-list').textContent).toContain('Loading your projects');

    await new Promise(resolve => setTimeout(resolve, 0));

    // recent-list keeps browser recents and does NOT contain cloud items
    const recentText = document.getElementById('recent-list').textContent;
    expect(recentText).toContain('Browser Draft');
    expect(recentText).not.toContain('Cloud Project');

    // my-projects-list contains cloud-owned and shared projects
    const myText = document.getElementById('my-projects-list').textContent;
    expect(myText).toContain('Cloud Project');
    expect(myText).toContain('Shared with you');
    expect(myText).toContain('Shared Project');
  });
});
