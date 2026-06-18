// Nova — "Run shows all geometry" E2E spec
//
// Regression for the report: after Run, surfaces/elements that feed a downstream
// node were invisible until the user toggled that node's preview off/on. Cause:
// _renderFromCompute auto-hid any node whose output fed a non-Output node
// ("intermediate"). Per the product decision, the 3D view now shows ALL geometry
// by default — only an EXPLICIT user hide (per-node preview toggle off) hides an
// item. This spec drives the real run-render path (app._renderFromCompute) and
// asserts an upstream surface that feeds Surface.Panelize is visible.

const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(
    () => window.app && window.app.initialized && window.Geo && window.Viewer3D,
    { timeout: 15000 }
  );
}

// Build Circle → Surface.ByPatch → Surface.Panelize → Output.Watch, run the
// compute-render path headlessly (stubbing the WebGL-dependent calls), and
// return each scene item's visibility keyed by node.
async function renderAndCollect(page, opts) {
  return page.evaluate((o) => {
    const app = window.app, V = window.Viewer3D;
    app.newProject();

    const origin = app.addNodeToCanvas('Point.Origin', 0, 0);
    const circle = app.addNodeToCanvas('Circle.ByCenterRadius', 200, 0);
    if (circle) circle.controlValues.radius = '5';
    const patch = app.addNodeToCanvas('Surface.ByPatch', 400, 0);
    const pan = app.addNodeToCanvas('Surface.Panelize', 600, 0);
    const watch = app.addNodeToCanvas('Output.Watch', 800, 0);
    if (!origin || !circle || !patch || !pan || !watch) return { err: 'node create failed' };

    app.addWire(origin.id, 'point', circle.id, 'center');
    app.addWire(circle.id, 'circle', patch.id, 'boundary');
    app.addWire(patch.id, 'surface', pan.id, 'surface');
    app.addWire(pan.id, 'panels', watch.id, 'value');

    // Optionally hide the patch node explicitly (per-node preview toggle off).
    if (o.hidePatch) patch._preview3d = false;

    // The viewer's WebGL context is not initialized headless — give it a
    // throwaway group + stub the camera/DOM calls so the real
    // _renderFromCompute visibility logic runs.
    if (!V.geometryGroup) V.geometryGroup = new window.THREE.Group();
    V.isInitialized = true;
    V._sceneItems = [];
    const realFit = V.fitAll, realList = V._renderGeoList;
    V.fitAll = function () {}; V._renderGeoList = function () {};

    app._isRunningGraph = true;
    let err = null;
    try { app._renderFromCompute(); } catch (e) { err = 'render threw: ' + e.message; }
    app._isRunningGraph = false;
    V.fitAll = realFit; V._renderGeoList = realList;
    if (err) return { err };

    const items = (V._sceneItems || []).map((it) => ({ nodeId: it.nodeId, visible: it.visible }));
    return {
      err: null,
      patchId: patch.id,
      patchVisible: items.filter((it) => it.nodeId === patch.id).every((it) => it.visible) &&
                    items.some((it) => it.nodeId === patch.id),
      anyVisible: items.some((it) => it.visible),
      count: items.length
    };
  }, opts);
}

test.describe('Run shows all geometry (no intermediate auto-hide)', () => {

  test('a surface that feeds a downstream node is visible after Run', async ({ page }) => {
    await waitForApp(page);
    const r = await renderAndCollect(page, { hidePatch: false });
    expect(r.err).toBeNull();
    expect(r.count, 'render must produce scene items').toBeGreaterThan(0);
    // Surface.ByPatch feeds Surface.Panelize (a non-Output node) — under the old
    // behavior it was auto-hidden. It must now be VISIBLE by default.
    expect(r.patchVisible, 'upstream surface feeding Panelize must be visible by default').toBe(true);
  });

  test('an explicitly hidden node (preview toggled off) stays hidden after Run', async ({ page }) => {
    await waitForApp(page);
    const r = await renderAndCollect(page, { hidePatch: true });
    expect(r.err).toBeNull();
    // The patch node was set _preview3d = false → its item(s) must be hidden,
    // proving explicit user hides are still honoured.
    expect(r.patchVisible, 'explicitly hidden surface must stay hidden').toBe(false);
  });

  test('Surface.Panelize renders ALL outputs — panels, corners, AND center', async ({ page }) => {
    await waitForApp(page);
    const labels = await page.evaluate(() => {
      const app = window.app, V = window.Viewer3D;
      app.newProject();
      const origin = app.addNodeToCanvas('Point.Origin', 0, 0);
      const circle = app.addNodeToCanvas('Circle.ByCenterRadius', 200, 0);
      if (circle) circle.controlValues.radius = '5';
      const patch = app.addNodeToCanvas('Surface.ByPatch', 400, 0);
      const pan = app.addNodeToCanvas('Surface.Panelize', 600, 0);
      const watch = app.addNodeToCanvas('Output.Watch', 800, 0);
      app.addWire(origin.id, 'point', circle.id, 'center');
      app.addWire(circle.id, 'circle', patch.id, 'boundary');
      app.addWire(patch.id, 'surface', pan.id, 'surface');
      app.addWire(pan.id, 'panels', watch.id, 'value');
      if (!V.geometryGroup) V.geometryGroup = new window.THREE.Group();
      V.isInitialized = true; V._sceneItems = [];
      V.fitAll = function () {}; V._renderGeoList = function () {};
      app._isRunningGraph = true;
      app._renderFromCompute();
      app._isRunningGraph = false;
      return (V._sceneItems || []).map((it) => it.label).filter((l) => l && l.indexOf('Panelize') >= 0);
    });
    // The corners output is a NESTED Point3[][] (per-panel groups) — it used to be
    // silently dropped by the render loop. All three outputs must now render.
    expect(labels.some((l) => /panels/i.test(l)), 'panels output must render').toBe(true);
    expect(labels.some((l) => /corners/i.test(l)), 'corners (nested point grid) output must render').toBe(true);
    expect(labels.some((l) => /center/i.test(l)), 'center output must render').toBe(true);
  });

});
