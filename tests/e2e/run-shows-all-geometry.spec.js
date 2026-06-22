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

  test('split-mode watcher (buildFromGraph) also renders multi-output Panelize outputs', async ({ page }) => {
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
      // Simulate a Run: fresh compute populates _portValues + last-run snapshot.
      app._isRunningGraph = true;
      if (app.beginCompute) app.beginCompute();
      app.nodes.forEach(function (nd) {
        nd._lastComputedValue = app.computeNodeValue(nd);
        if (nd._portValues) nd._lastRunPortValues = Object.assign({}, nd._portValues);
        nd._lastRunValue = nd._lastComputedValue;
      });
      if (app.endCompute) app.endCompute();
      app._isRunningGraph = false;
      // The split-mode watcher rebuilds via buildFromGraph — it must NOT wipe the
      // multi-output geometry the Run path drew.
      V._sceneItems = [];
      V.buildFromGraph(app.nodes, app.wires, function (nd) { return app.computeNodeValue(nd); });
      return (V._sceneItems || []).map((it) => it.label).filter((l) => l && l.indexOf('Panelize') >= 0);
    });
    expect(labels.some((l) => /panels/i.test(l)), 'watcher must render panels').toBe(true);
    expect(labels.some((l) => /corners/i.test(l)), 'watcher must render corners').toBe(true);
    expect(labels.some((l) => /center/i.test(l)), 'watcher must render center').toBe(true);
  });

  test('camera auto-fits once, not on every re-render (preview toggle holds the view)', async ({ page }) => {
    await waitForApp(page);
    const r = await page.evaluate(() => {
      const app = window.app, V = window.Viewer3D;
      const buildSurface = () => {
        const o = app.addNodeToCanvas('Point.Origin', 0, 0);
        const c = app.addNodeToCanvas('Circle.ByCenterRadius', 200, 0);
        if (c) c.controlValues.radius = '5';
        const p = app.addNodeToCanvas('Surface.ByPatch', 400, 0);
        app.addWire(o.id, 'point', c.id, 'center');
        app.addWire(c.id, 'circle', p.id, 'boundary');
      };
      const setupViewer = () => {
        if (!V.geometryGroup) V.geometryGroup = new window.THREE.Group();
        V.isInitialized = true; V._sceneItems = []; V._renderGeoList = function () {};
      };
      let fitCalls = 0;
      V.fitAll = function () { fitCalls++; };

      app.newProject(); setupViewer(); buildSurface();
      app._isRunningGraph = true; app._renderFromCompute();
      const afterFirst = fitCalls;          // first geometry → fit
      app._renderFromCompute();             // re-render (toggle/re-run) → must NOT fit
      const afterSecond = fitCalls;
      app._isRunningGraph = false;

      app.newProject(); setupViewer(); buildSurface();
      app._isRunningGraph = true; app._renderFromCompute();
      const afterNewProject = fitCalls;     // fresh project → fit again
      app._isRunningGraph = false;
      return { afterFirst, afterSecond, afterNewProject };
    });
    expect(r.afterFirst, 'first render frames the model').toBe(1);
    expect(r.afterSecond, 're-render must NOT move the camera').toBe(1);
    expect(r.afterNewProject, 'a new project re-frames its geometry').toBe(2);
  });

  test('the auto-mode rebuild keeps the SAME geometry-panel items as Run (no drop)', async ({ page }) => {
    await waitForApp(page);
    const r = await page.evaluate(() => {
      const app = window.app, V = window.Viewer3D;
      app.newProject();
      // Two geometry chains: a surface and a point-on-surface.
      const rect = app.addNodeToCanvas('Rectangle.ByCenterWidthDepth', 0, 0);
      const patchA = app.addNodeToCanvas('Surface.ByPatch', 200, 0);
      const origin = app.addNodeToCanvas('Point.Origin', 0, 200);
      const circle = app.addNodeToCanvas('Circle.ByCenterRadius', 200, 200);
      if (circle) circle.controlValues.radius = '5';
      const patchB = app.addNodeToCanvas('Surface.ByPatch', 400, 200);
      const pap = app.addNodeToCanvas('Surface.PointAtParameter', 600, 200);
      const watch = app.addNodeToCanvas('Output.Watch', 800, 200);
      app.addWire(rect.id, (rect.def.outputs[0] || {}).id, patchA.id, 'boundary');
      app.addWire(origin.id, 'point', circle.id, 'center');
      app.addWire(circle.id, 'circle', patchB.id, 'boundary');
      app.addWire(patchB.id, 'surface', pap.id, 'surface');
      app.addWire(pap.id, 'point', watch.id, 'value');
      if (!V.geometryGroup) V.geometryGroup = new window.THREE.Group();
      V.isInitialized = true; V.fitAll = function () {}; V._renderGeoList = function () {}; V._updateSceneTree = function () {};
      // MANUAL mode is where the old buildFromGraph watcher rendered 0 → wiped panel.
      app._manualRunMode = true;
      // Simulate a Run.
      V._sceneItems = [];
      app._isRunningGraph = true; app._renderFromCompute();
      app.nodes.forEach(function (nd) { nd._lastComputedValue = app.computeNodeValue(nd); if (nd._portValues) nd._lastRunPortValues = Object.assign({}, nd._portValues); });
      if (app._commitRunSnapshot) app._commitRunSnapshot();
      app._isRunningGraph = false;
      const afterRun = (V._sceneItems || []).length;
      // The auto-mode watcher now uses the SAME path (_renderFromCompute).
      V._sceneItems = [];
      app._renderFromCompute();
      const afterWatcher = (V._sceneItems || []).length;
      return { afterRun, afterWatcher };
    });
    expect(r.afterRun, 'Run lists multiple geometry items').toBeGreaterThan(2);
    // The watcher must NOT shrink the panel — it lists the same items as Run.
    expect(r.afterWatcher).toBe(r.afterRun);
  });

});
