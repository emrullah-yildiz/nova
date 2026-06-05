// Nova — Pattern on Surface E2E Spec
//
// Covers TICK-004 AC-1, AC-5, and AC-9.
//
// Strategy: call the geometry kernel (window.Geo) directly where possible —
// this is the same function Pattern.FacadePanels.execute() calls internally.
// Only AC-9 tests the full engine pipeline (node graph + runGraph).
//
// Why not use the engine for AC-1 / smoke?
//   List.Create is a dynamic-input node. addNodeToCanvas() does not set
//   _dynInputIds, so the engine only resolves item0/item1 (the two default ports).
//   With only 2 boundary points, Surface.ByPatch returns undefined and the
//   facade node falls back to an empty list. The AC-9 test fixes this by
//   setting _dynInputIds before calling runGraph().

const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
}

test.describe('Pattern on Surface — AC-1, AC-5, AC-9', () => {

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-1: Pattern.FacadePanels with curved surface + 4×4 → 16 panel objects
  // ─────────────────────────────────────────────────────────────────────────────
  test('AC-1: Pattern.FacadePanels with curved surface returns 16 panel objects', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      // Call the geometry kernel directly — same function Pattern.FacadePanels.execute()
      // calls internally. This avoids List.Create/_dynInputIds engine routing issues.
      const surface = window.Geo.surfaceByPatch([
        new window.Geo.Point3(0, 0, 0),
        new window.Geo.Point3(10, 0, 0),
        new window.Geo.Point3(10, 10, 5),
        new window.Geo.Point3(0, 10, 2)
      ]);
      if (!surface) return { isArray: false, count: -1, firstHasPoints: false, firstHasFrame: false, reason: 'no surface' };

      const panels = window.Geo.facadePanelsOnSurface(surface, 4, 4);
      if (!Array.isArray(panels) || panels.length === 0) {
        return { isArray: Array.isArray(panels), count: panels ? panels.length : -1, firstHasPoints: false, firstHasFrame: false };
      }
      const first = panels[0];
      return {
        isArray:        true,
        count:          panels.length,
        firstHasPoints: Array.isArray(first.points),
        firstHasFrame:  first.frame != null
      };
    });

    expect(result.isArray).toBe(true);
    expect(result.count).toBe(16);
    expect(result.firstHasPoints).toBe(true);
    expect(result.firstHasFrame).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-5: Panel.ByPoints node exists in the Patterns category
  // ─────────────────────────────────────────────────────────────────────────────
  test('AC-5: Panel.ByPoints node exists in the Patterns category', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      // NODE_TYPE_MAP is on window.NodeFlow. Category is stored as .categoryId
      // (toLegacyNodeDefinition omits .category; coreNodes.js stamps .categoryId).
      const map = window.NodeFlow && window.NodeFlow.NODE_TYPE_MAP;
      const def = map && map['Panel.ByPoints'];
      if (def) {
        return { exists: true, category: def.categoryId || def.category || null };
      }
      // Fallback: add the node and check the registered definition.
      const nd = window.app.addNodeToCanvas('Panel.ByPoints', 300, 200);
      if (!nd) return { exists: false, category: null };
      const nodeInList = window.app.nodes.find(n => n.id === nd.id);
      if (!nodeInList) return { exists: false, category: null };
      const cat = nodeInList.def
        ? (nodeInList.def.categoryId || nodeInList.def.category || null)
        : null;
      return { exists: true, category: cat };
    });

    expect(result.exists).toBe(true);
    expect(result.category).toBe('patterns');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-5: Panel.ByPoints returns 16 meshes for 16 panel inputs
  // ─────────────────────────────────────────────────────────────────────────────
  test('AC-5: Panel.ByPoints returns 16 quad meshes when fed 16 panel objects', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      // Produce 16 panel objects via kernel (curved 4×4 grid).
      const surface = window.Geo.surfaceByPatch([
        new window.Geo.Point3(0, 0, 0),
        new window.Geo.Point3(10, 0, 0),
        new window.Geo.Point3(10, 10, 5),
        new window.Geo.Point3(0, 10, 2)
      ]);
      const panels = window.Geo.facadePanelsOnSurface(surface, 4, 4);
      if (!panels || panels.length === 0) return { isArray: false, count: -1, firstHasVertices: false, reason: 'no panels' };

      // Feed panels directly to Panel.ByPoints.execute — same as the engine does.
      const map = window.NodeFlow && window.NodeFlow.NODE_TYPE_MAP;
      const def = map && map['Panel.ByPoints'];
      if (!def || typeof def.execute !== 'function') {
        return { isArray: false, count: -1, firstHasVertices: false, reason: 'no def' };
      }
      const out = def.execute({}, { panels }, {});
      if (!out || !Array.isArray(out.meshes)) {
        return { isArray: false, count: -1, firstHasVertices: false, reason: 'no meshes' };
      }
      const first = out.meshes[0];
      return {
        isArray:          true,
        count:            out.meshes.length,
        firstHasVertices: !!(first && Array.isArray(first.vertices) && first.vertices.length >= 3)
      };
    });

    expect(result.isArray).toBe(true);
    expect(result.count).toBe(16);
    expect(result.firstHasVertices).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AC-9: Full pipeline — engine graph + runGraph()
  // List.Create._dynInputIds is set so the engine sees all 4 boundary points.
  // runGraph() is awaited so the snapshot is committed before reading results.
  // ─────────────────────────────────────────────────────────────────────────────
  test('AC-9: full graph Surface.ByPatch → Pattern.FacadePanels → Panel.ByPoints → Output.Watch shows 16 items', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      window.app.newProject();

      const p00 = window.app.addNodeToCanvas('Point.ByCoordinates', 0, 0);
      p00.controlValues.x = 0;  p00.controlValues.y = 0;  p00.controlValues.z = 0;
      const p10 = window.app.addNodeToCanvas('Point.ByCoordinates', 0, 80);
      p10.controlValues.x = 10; p10.controlValues.y = 0;  p10.controlValues.z = 0;
      const p11 = window.app.addNodeToCanvas('Point.ByCoordinates', 0, 160);
      p11.controlValues.x = 10; p11.controlValues.y = 10; p11.controlValues.z = 5;
      const p01 = window.app.addNodeToCanvas('Point.ByCoordinates', 0, 240);
      p01.controlValues.x = 0;  p01.controlValues.y = 10; p01.controlValues.z = 2;

      const list       = window.app.addNodeToCanvas('List.Create',          240, 100);
      const surf       = window.app.addNodeToCanvas('Surface.ByPatch',      480, 100);
      const facade     = window.app.addNodeToCanvas('Pattern.FacadePanels', 720, 100);
      facade.controlValues.uPanels = '4';
      facade.controlValues.vPanels = '4';
      const panelByPts = window.app.addNodeToCanvas('Panel.ByPoints',       960, 100);
      const watch      = window.app.addNodeToCanvas('Output.Watch',         1200, 100);

      // List.Create is a dynamic-input node. addNodeToCanvas() does not set
      // _dynInputIds, so only item0/item1 (the two default ports) would resolve.
      // Set it explicitly so all 4 boundary-point wires are seen by the engine.
      list._dynInputIds = ['item0', 'item1', 'item2', 'item3'];

      window.app.addWire(p00.id, 'point',   list.id,       'item0');
      window.app.addWire(p10.id, 'point',   list.id,       'item1');
      window.app.addWire(p11.id, 'point',   list.id,       'item2');
      window.app.addWire(p01.id, 'point',   list.id,       'item3');
      window.app.addWire(list.id,       'list',    surf.id,       'boundary');
      window.app.addWire(surf.id,       'surface', facade.id,     'mesh');
      window.app.addWire(facade.id,     'panels',  panelByPts.id, 'panels');
      window.app.addWire(panelByPts.id, 'meshes',  watch.id,      'value');

      // runGraph() is async — await it so _hasRun = true and _lastRunValue is set.
      await window.app.runGraph();

      // After runGraph, _isRunningGraph = false and _hasRun = true.
      // computeNodeValue returns getLastRunNodeValue(pbpNode) = _lastRunValue.
      const pbpNode = window.app.nodes.find(n => n.id === panelByPts.id);
      const meshes  = window.app.computeNodeValue(pbpNode);
      return {
        count: Array.isArray(meshes) ? meshes.length : -1
      };
    });

    expect(result.count).toBe(16);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Smoke: Panel objects have points + frame fields (TICK-004 contract)
  // ─────────────────────────────────────────────────────────────────────────────
  test('AC-9 smoke: each panel object has points (array) and frame (object)', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      // Call kernel directly — same path as Pattern.FacadePanels.execute().
      const surface = window.Geo.surfaceByPatch([
        new window.Geo.Point3(0, 0, 0),
        new window.Geo.Point3(10, 0, 0),
        new window.Geo.Point3(10, 10, 5),
        new window.Geo.Point3(0, 10, 2)
      ]);
      const panels = window.Geo.facadePanelsOnSurface(surface, 4, 4);

      if (!Array.isArray(panels) || panels.length === 0) return { ok: false, reason: 'no panels' };

      const first = panels[0];
      return {
        ok:           true,
        hasPoints:    Array.isArray(first.points),
        pointsLength: first.points ? first.points.length : -1,
        hasFrame:     first.frame != null,
        hasNormal:    !!(first.frame && first.frame.normal != null)
      };
    });

    expect(result.ok).toBe(true);
    expect(result.hasPoints).toBe(true);
    expect(result.pointsLength).toBe(4);
    expect(result.hasFrame).toBe(true);
    expect(result.hasNormal).toBe(true);
  });
});
