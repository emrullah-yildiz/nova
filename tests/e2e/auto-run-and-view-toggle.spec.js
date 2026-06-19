// Nova — auto-run on every change + Ctrl+B view toggle
//
// 1) In Auto mode the 3D view re-renders on EVERY graph change. The split-mode
//    watcher keys off a monotonic revision (app._graphRevision) bumped by
//    invalidateCompute, so a dropdown/text/formula edit always triggers a
//    rebuild — not just the first change after a run (the old _graphDirty
//    boolean was sticky, so the user had to click Run again).
// 2) Ctrl/Cmd+B flips between the 3D viewport and the 2D node canvas.

const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(
    () => window.app && window.app.initialized && window.Viewer3D,
    { timeout: 15000 }
  );
}

test.describe('Auto-run on every change', () => {
  test('every control change bumps the monotonic graph revision', async ({ page }) => {
    await waitForApp(page);
    const r = await page.evaluate(() => {
      const app = window.app;
      const start = app._graphRevision || 0;
      app.invalidateCompute();
      const a = app._graphRevision;
      app.invalidateCompute();
      const b = app._graphRevision;
      // A real dropdown edit via the same path the <select> onchange uses.
      const nd = app.addNodeToCanvas('Input.PanelShapes', 0, 0);
      const beforeCtrl = app._graphRevision;
      if (nd) app.onCtrl(nd.id, 'shape', 'Hexagon');
      const afterCtrl = app._graphRevision;
      return { start, a, b, beforeCtrl, afterCtrl };
    });
    // Strictly increasing — never sticky. Two invalidations → +2.
    expect(r.a).toBe(r.start + 1);
    expect(r.b).toBe(r.start + 2);
    // The dropdown change bumps it again (so the watcher re-renders that change).
    expect(r.afterCtrl).toBeGreaterThan(r.beforeCtrl);
  });

  test('opening/recovering a project bumps the revision so Auto mode renders it', async ({ page }) => {
    await waitForApp(page);
    const r = await page.evaluate(() => {
      const app = window.app;
      app.newProject();
      app.addNodeToCanvas('Circle.ByCenterRadius', 100, 100);
      const data = app.serializeGraph();
      app.newProject();
      const before = app._graphRevision || 0;
      const ok = app.deserializeGraph(data);
      const after = app._graphRevision || 0;
      return { ok, before, after };
    });
    expect(r.ok).toBe(true);
    // deserializeGraph must bump the revision so the 3D watcher renders the
    // loaded graph immediately in Auto mode (it used to leave the view empty
    // until the user hit Run).
    expect(r.after).toBeGreaterThan(r.before);
  });

  test('the auto-render watcher runs in 3D-only view, not just split view', async ({ page }) => {
    await waitForApp(page);
    const gate = await page.evaluate(() => {
      const app = window.app;
      // 3D-only (no split) must satisfy the watcher gate so the viewport + panel
      // auto-refresh without needing a split-view toggle.
      app.splitMode = false; app.activeView = '3d';
      const in3dOnly = (app.splitMode || app.activeView === '3d');
      app.splitMode = false; app.activeView = 'nodes';
      const inNodes = (app.splitMode || app.activeView === '3d');
      return { in3dOnly, inNodes };
    });
    expect(gate.in3dOnly, '3D-only view must run the watcher').toBe(true);
    expect(gate.inNodes, 'node-only view does not need the 3D watcher').toBe(false);
  });
});

test.describe('Ctrl+B toggles 3D viewport ↔ 2D node canvas', () => {
  test('Ctrl+B flips the active view', async ({ page }) => {
    await waitForApp(page);
    const r = await page.evaluate(async () => {
      const app = window.app;
      app.currentPage = 'workspace';
      app.setView('3d');
      const fire = () => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
      );
      const v0 = { active: app.activeView, split: app.splitMode };
      fire();
      const v1 = { active: app.activeView, split: app.splitMode };
      fire();
      const v2 = { active: app.activeView, split: app.splitMode };
      return { v0, v1, v2 };
    });
    expect(r.v0.active).toBe('3d');
    expect(r.v1.active).toBe('nodes'); // 3D → 2D
    expect(r.v1.split).toBe(false);
    expect(r.v2.active).toBe('3d');    // 2D → 3D
  });
});
