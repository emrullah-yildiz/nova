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
    document.body.innerHTML = '<div id="recent-list"></div>';
  });

  it('shows browser-local recents first and signed-in account projects second', async () => {
    localStorage.setItem('nodeflow_recent_projects', JSON.stringify([{ name: 'Browser Draft', date: Date.now() - 1000 }]));
    const app = makeApp({
      listProjects: async () => ({ projects: [{ id: 'cloud-1', name: 'Cloud Project', updatedAt: Date.now() }] }),
      listSharedProjects: async () => ({ projects: [{ id: 'shared-1', name: 'Shared Project', updatedAt: Date.now() }] })
    });

    app.renderRecentProjects();
    expect(document.getElementById('recent-list').textContent).toContain('Browser Draft');
    expect(document.getElementById('recent-list').textContent).toContain('Loading your projects');

    await new Promise(resolve => setTimeout(resolve, 0));

    const text = document.getElementById('recent-list').textContent;
    expect(text).toContain('Recent in this browser');
    expect(text).toContain('Browser Draft');
    expect(text).toContain('My projects');
    expect(text).toContain('Cloud Project');
    expect(text).toContain('Shared with you');
    expect(text).toContain('Shared Project');
    expect(text.indexOf('Browser Draft')).toBeLessThan(text.indexOf('Cloud Project'));
  });
});
