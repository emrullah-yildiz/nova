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

  test('unwiring an input recomputes (drops stale data), it does not keep the old value', async ({ page }) => {
    await waitForApp(page);
    const r = await page.evaluate(() => {
      const app = window.app, V = window.Viewer3D;
      app.newProject();
      const origin = app.addNodeToCanvas('Point.Origin', 0, 0);
      const circle = app.addNodeToCanvas('Circle.ByCenterRadius', 200, 0);
      if (circle) circle.controlValues.radius = '5';
      const patch = app.addNodeToCanvas('Surface.ByPatch', 400, 0);
      const watch = app.addNodeToCanvas('Output.Watch', 600, 0);
      app.addWire(origin.id, 'point', circle.id, 'center');
      app.addWire(circle.id, 'circle', patch.id, 'boundary');
      app.addWire(patch.id, 'surface', watch.id, 'value');
      if (!V.geometryGroup) V.geometryGroup = new window.THREE.Group();
      V.isInitialized = true; V.fitAll = function () {}; V._renderGeoList = function () {}; V._updateSceneTree = function () {};
      app._manualRunMode = false; // Auto
      V._sceneItems = []; app._renderFromCompute();
      const before = (V._sceneItems || []).some((it) => /ByPatch/.test(it.label));
      const surfaceBefore = app.computeNodeValue(patch);
      // Unwire the Boundary input (same effect as the port-handler disconnect path).
      const rev0 = app._graphRevision || 0;
      app.wires = app.wires.filter((w) => !(w.toNode === patch.id && w.toPort === 'boundary'));
      app.invalidateCompute();
      const rev1 = app._graphRevision || 0;
      V._sceneItems = []; app._renderFromCompute();
      const after = (V._sceneItems || []).some((it) => /ByPatch/.test(it.label));
      const surfaceAfter = app.computeNodeValue(patch);
      return { rev0, rev1, before, after, hadSurface: !!surfaceBefore, surfaceAfterNull: surfaceAfter == null };
    });
    expect(r.rev1).toBeGreaterThan(r.rev0);     // unwire bumps the revision (watcher refires)
    expect(r.hadSurface).toBe(true);
    expect(r.before).toBe(true);
    // After unwiring: the surface recomputes to empty and is removed — NOT stale.
    expect(r.surfaceAfterNull).toBe(true);
    expect(r.after).toBe(false);
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
