// Nova — Select.Faces on a Mesh3 ARRAY (e.g. Surface.Panelize panels) E2E spec
//
// Bug fixed: face selection only registered a single Mesh3 per scene item, so a
// node whose geometry is an ARRAY of Mesh3 (Surface.Panelize → `panels`) was
// skipped and its panels were not selectable. The fix merges the array into one
// _mesh3 and precomputes _faceGroups with one group PER SOURCE panel (never
// coplanar-merged) so each panel is an independently hoverable + selectable unit
// even on a FLAT surface.
//
// Headless Chromium has no WebGL raycaster, so — like the sibling selection specs
// and run-shows-all-geometry.spec.js — we stub the geometryGroup and drive the
// selection through the same JS module APIs the UI uses (addTaggedGeo,
// activateSelectionMode swap, selectionMeshClick, getSelectedFaces).

const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(
    () => window.app && window.app.initialized && window.Geo && window.Viewer3D && window.THREE,
    { timeout: 15000 }
  );
}

// Build Circle → Surface.ByPatch → Surface.Panelize, compute the panels array,
// register it as a scene item via the REAL addTaggedGeo path, and return the
// item's selection metadata.
async function buildPanelItem(page) {
  return page.evaluate(() => {
    const app = window.app, V = window.Viewer3D;
    app.newProject();

    const origin = app.addNodeToCanvas('Point.Origin', 0, 0);
    const circle = app.addNodeToCanvas('Circle.ByCenterRadius', 200, 0);
    if (circle) circle.controlValues.radius = '5';
    const patch = app.addNodeToCanvas('Surface.ByPatch', 400, 0);
    const pan = app.addNodeToCanvas('Surface.Panelize', 600, 0);
    if (!origin || !circle || !patch || !pan) return { err: 'node create failed' };
    if (pan.controlValues) { pan.controlValues.u = '3'; pan.controlValues.v = '3'; pan.controlValues.scale = '0.9'; }

    app.addWire(origin.id, 'point', circle.id, 'center');
    app.addWire(circle.id, 'circle', patch.id, 'boundary');
    app.addWire(patch.id, 'surface', pan.id, 'surface');

    // Stub the WebGL-dependent surface so the real addTaggedGeo path runs.
    if (!V.geometryGroup) V.geometryGroup = new window.THREE.Group();
    V.isInitialized = true;
    V._sceneItems = [];
    const realList = V._renderGeoList;
    V._renderGeoList = function () {};

    // Compute Surface.Panelize, then read its `panels` PORT value. Panelize is a
    // multi-output node (panels/corners/center), so computeNodeValue returns the
    // combined value; the per-port array lives on _portValues (as buildFromGraph reads).
    app.computeNodeValue(pan);
    const portVals = pan._portValues || pan._lastRunPortValues || {};
    const panels = portVals.panels;
    V._renderGeoList = realList;

    const isArr = Array.isArray(panels);
    const allMesh3 = isArr && panels.length > 0 && panels.every((m) => m && m._type === 'Mesh3');
    if (!allMesh3) return { err: 'panels not a Mesh3[]', isArr, len: isArr ? panels.length : -1 };

    // Register via the REAL addTaggedGeo (the code path under test).
    const item = V.addTaggedGeo(panels, pan.id, 'panels', 'Surface.Panelize.panels');
    if (!item) return { err: 'addTaggedGeo returned null' };

    return {
      err: null,
      panelCount: panels.length,
      hasMesh3: !!item._mesh3,
      mesh3Type: item._mesh3 && item._mesh3._type,
      faceGroupCount: Array.isArray(item._faceGroups) ? item._faceGroups.length : -1,
      itemId: item.id,
    };
  });
}

test.describe('Select.Faces on a Mesh3 array (Surface.Panelize panels)', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // (a) A panel ARRAY registers ONE merged _mesh3 with one faceGroup PER PANEL.
  // ───────────────────────────────────────────────────────────────────────────
  test('panel array registers a merged _mesh3 with one selectable group per panel', async ({ page }) => {
    await waitForApp(page);
    const r = await buildPanelItem(page);

    expect(r.err, JSON.stringify(r)).toBeNull();
    // Surface.Panelize with U=3,V=3 yields multiple panels.
    expect(r.panelCount).toBeGreaterThan(1);
    // The fix: a Mesh3[] now produces a merged _mesh3 (so selection mode finds it)
    expect(r.hasMesh3).toBe(true);
    expect(r.mesh3Type).toBe('Mesh3');
    // One independently-selectable group per panel (NOT coplanar-collapsed to 1).
    expect(r.faceGroupCount).toBe(r.panelCount);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (a2) Entering face-selection mode swaps in ONE selection mesh whose geometry
  //      has >1 group (one per panel), and clicking different panels selects
  //      DIFFERENT panels (distinct selectionKeys) — proving per-panel selection.
  // ───────────────────────────────────────────────────────────────────────────
  test('face-selection mode makes each panel an independently selectable unit', async ({ page }) => {
    await waitForApp(page);
    const r = await buildPanelItem(page);
    expect(r.err, JSON.stringify(r)).toBeNull();

    const sel = await page.evaluate(() => {
      const V = window.Viewer3D;
      const selMod = window.__selectionModeModule;
      const item = V._sceneItems.find((it) => it._mesh3 && it._faceGroups);
      if (!item) return { err: 'no panel item' };

      // Activate faces mode — triggers the body-mesh → selection-mesh swap.
      window.activateSelectionMode('panel-node', 'faces', function () {}, function () {});

      const swapped = item._selectionSwappedMesh;
      const groups = swapped && swapped.geometry && swapped.geometry.groups
        ? swapped.geometry.groups.length : -1;
      const triToGroupLen = item._selectionMeshResult && item._selectionMeshResult.triangleToGroup
        ? item._selectionMeshResult.triangleToGroup.length : -1;

      // Click two DIFFERENT panels by pointing faceIndex at triangles owned by
      // different groups. Group g's first triangle index = sum of prior groups'
      // triangle counts. Use group 0's first tri and group 1's first tri.
      const fg = item._selectionFaceGroups;
      const tri0 = fg[0].triangleIndices[0];
      const tri1 = fg[1].triangleIndices[0];

      selMod.selectionMeshClick({ faceIndex: tri0, object: swapped }, item);
      selMod.selectionMeshClick({ faceIndex: tri1, object: swapped }, item);

      const faces = selMod.getSelectedFaces();
      const groupIdxs = faces.map((f) => f.groupIndex).sort((a, b) => a - b);

      window.__selectionModeModule.deactivateSelectionMode();

      return {
        err: null,
        swapGroups: groups,
        triToGroupLen,
        selectedCount: faces.length,
        groupIdxs,
        bodyRestored: !item._selectionSwappedMesh,
      };
    });

    expect(sel.err, JSON.stringify(sel)).toBeNull();
    // The swapped selection mesh has one BufferGeometry group per panel.
    expect(sel.swapGroups).toBeGreaterThan(1);
    // Two distinct panels were selected (distinct group indices) — per-panel pick.
    expect(sel.selectedCount).toBe(2);
    expect(sel.groupIdxs[0]).not.toBe(sel.groupIdxs[1]);
    // Deactivation restored the original body meshes.
    expect(sel.bodyRestored).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (a3) Approve emits real Mesh3 geometry per selected panel (not [object Object]).
  // ───────────────────────────────────────────────────────────────────────────
  test('approving a panel selection yields real Mesh3 geometry per panel', async ({ page }) => {
    await waitForApp(page);
    const r = await buildPanelItem(page);
    expect(r.err, JSON.stringify(r)).toBeNull();

    const out = await page.evaluate(() => {
      const V = window.Viewer3D;
      const selMod = window.__selectionModeModule;
      const item = V._sceneItems.find((it) => it._mesh3 && it._faceGroups);
      if (!item) return { err: 'no panel item' };

      window.activateSelectionMode('panel-node', 'faces', function () {}, function () {});
      const swapped = item._selectionSwappedMesh;
      const tri0 = item._selectionFaceGroups[0].triangleIndices[0];
      selMod.selectionMeshClick({ faceIndex: tri0, object: swapped }, item);

      // Build the Approve output the way node-renderer.js does.
      const facesRaw = selMod.getSelectedFaces();
      const meshArray = facesRaw.map((f) => {
        const verts = f.mesh3.getFaceVertices(f.groupIndex, f.faceGroups);
        if (!Array.isArray(verts) || verts.length < 3) return null;
        const meshFaces = [];
        for (let vi = 1; vi < verts.length - 1; vi++) meshFaces.push([0, vi, vi + 1]);
        return {
          _type: 'Mesh3',
          vertices: verts.map((v) => ({ x: v[0], y: v[1], z: v[2], _type: 'Point3' })),
          faces: meshFaces,
        };
      }).filter(Boolean);

      window.__selectionModeModule.deactivateSelectionMode();
      return { err: null, json: JSON.stringify(meshArray), len: meshArray.length };
    });

    expect(out.err, JSON.stringify(out)).toBeNull();
    expect(out.len).toBe(1);
    expect(out.json).toContain('Mesh3');
    expect(out.json).toContain('vertices');
    expect(out.json).not.toContain('[object Object]');
    expect(out.json).not.toContain('null');
    expect(out.json).not.toContain('NaN');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // (b) REGRESSION: a single Mesh3 (Surface.ByPatch alone) still selects as
  //     before — _mesh3 set, NO precomputed _faceGroups (falls back to
  //     coplanar groupFaces()), and the swap produces a selectable mesh.
  // ───────────────────────────────────────────────────────────────────────────
  test('single Mesh3 still selects as before (no regression, no precomputed groups)', async ({ page }) => {
    await waitForApp(page);

    const r = await page.evaluate(() => {
      const app = window.app, V = window.Viewer3D;
      app.newProject();
      const origin = app.addNodeToCanvas('Point.Origin', 0, 0);
      const circle = app.addNodeToCanvas('Circle.ByCenterRadius', 200, 0);
      if (circle) circle.controlValues.radius = '5';
      const patch = app.addNodeToCanvas('Surface.ByPatch', 400, 0);
      if (!origin || !circle || !patch) return { err: 'node create failed' };
      app.addWire(origin.id, 'point', circle.id, 'center');
      app.addWire(circle.id, 'circle', patch.id, 'boundary');

      if (!V.geometryGroup) V.geometryGroup = new window.THREE.Group();
      V.isInitialized = true;
      V._sceneItems = [];
      const realList = V._renderGeoList;
      V._renderGeoList = function () {};

      const surface = app.computeNodeValue(patch);
      const isSingleMesh = surface && surface._type === 'Mesh3';
      const item = V.addTaggedGeo(surface, patch.id, '', 'Surface.ByPatch');
      V._renderGeoList = realList;
      if (!item) return { err: 'addTaggedGeo returned null' };

      // Single-mesh path: _mesh3 set, NO precomputed _faceGroups.
      const hasMesh3 = !!item._mesh3;
      const hasPrecomputedGroups = item._faceGroups !== undefined;

      // Activate faces mode → swap should still produce a selectable mesh whose
      // groups come from coplanar groupFaces().
      window.activateSelectionMode('patch-node', 'faces', function () {}, function () {});
      const swapped = item._selectionSwappedMesh;
      const swapGroups = swapped && swapped.geometry && swapped.geometry.groups
        ? swapped.geometry.groups.length : -1;
      const usedGroups = Array.isArray(item._selectionFaceGroups) ? item._selectionFaceGroups.length : -1;
      window.__selectionModeModule.deactivateSelectionMode();
      const restored = !item._selectionSwappedMesh;

      return { err: null, isSingleMesh, hasMesh3, hasPrecomputedGroups, swapGroups, usedGroups, restored };
    });

    expect(r.err, JSON.stringify(r)).toBeNull();
    expect(r.isSingleMesh).toBe(true);
    expect(r.hasMesh3).toBe(true);
    // No regression: a single Mesh3 does NOT get precomputed per-source groups.
    expect(r.hasPrecomputedGroups).toBe(false);
    // The swap still produces a selectable mesh (coplanar groupFaces path).
    expect(r.swapGroups).toBeGreaterThanOrEqual(1);
    expect(r.usedGroups).toBeGreaterThanOrEqual(1);
    expect(r.restored).toBe(true);
  });
});
