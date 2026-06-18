// Nova — Surface paneling E2E spec (TICK-014)
//
// Covers the UI-gated acceptance criteria for the Surface.Panelize +
// Input.PanelShapes feature built by T14a (geometry kernel) and verified here
// by T14b (UI / viewport):
//
//   AC-4  Wiring Surface.ByPatch + Input.PanelShapes (Square) -> Surface.Panelize
//         -> Output.Watch produces MORE THAN ONE panel mesh, all visible in the
//         3D viewport for a multi-cell surface.
//   AC-6  Changing the Scale value re-scales each panel: a smaller Scale yields
//         smaller panels (smaller corner-point spread / gaps); a larger Scale
//         yields larger panels. Observable as a change in the rendered panel
//         size and in the Corners output spread.
//   AC-7  Each node's help.example is a complete workflow that, when run, shows
//         panels in Output.Watch (never [object Object], undefined, or NaN).
//
// ── Rendering contract (why this spec touches NO new render path) ─────────────
// Surface.Panelize's `Panels` output is an array of mesh objects identical in
// shape to Surface.ByPatch's output (a Mesh3 with .toMesh()). The existing
// viewer path `Geo.addToScene(group, value, color)` already recurses arrays and
// renders each Mesh3 via its own .toMesh() — so multiple panels render as
// multiple distinct meshes with no new viewer code. This spec asserts that
// behaviour directly through the real addToScene path (the same one the polyline
// flat-render spec drives), rather than relying on a live WebGL raycast in
// headless Chromium.
//
// ── Sequencing note ──────────────────────────────────────────────────────────
// The two node defs (Input.PanelShapes, Surface.Panelize) are delivered by T14a
// on the shared branch feat/tick-014-surface-paneling. If they are not yet
// registered in window.NODE_TYPE_MAP, the AC tests below `test.skip` with an
// explicit reason instead of asserting against guessed port ids — they must NOT
// report a false green. Once T14a lands, the same spec runs the real workflow.

const { test, expect } = require('@playwright/test');

const PANELIZE_TYPE = 'Surface.Panelize';
const SHAPES_TYPE   = 'Input.PanelShapes';

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized && window.Geo);
}

// Are T14a's nodes registered in this build? Used to skip (not fail) when the
// geometry agent has not yet committed the node defs to the shared branch.
function nodesRegistered(page) {
  return page.evaluate(({ panelize, shapes }) => {
    const map = window.NODE_TYPE_MAP || {};
    return !!map[panelize] && !!map[shapes];
  }, { panelize: PANELIZE_TYPE, shapes: SHAPES_TYPE });
}

// Find a port id on a node definition by matching id/name case-insensitively
// against a list of candidate labels. Returns the first matching port id, or
// null. This keeps the spec robust to T14a's exact port-id casing.
function findPortHelper() {
  return function findPort(ports, candidates) {
    if (!Array.isArray(ports)) return null;
    for (const cand of candidates) {
      const lc = String(cand).toLowerCase();
      const hit = ports.find(p =>
        String(p.id || '').toLowerCase() === lc ||
        String(p.name || '').toLowerCase() === lc);
      if (hit) return hit.id;
    }
    // Fall back to a substring match (e.g. "panels" inside "panel surfaces").
    for (const cand of candidates) {
      const lc = String(cand).toLowerCase();
      const hit = ports.find(p =>
        String(p.id || '').toLowerCase().includes(lc) ||
        String(p.name || '').toLowerCase().includes(lc));
      if (hit) return hit.id;
    }
    return null;
  };
}

// Count solid meshes (excludes lines / fat lines) in a THREE container.
function countMeshesHelper() {
  return function countMeshes(obj) {
    let meshes = 0;
    const visit = (o) => {
      if (!o) return;
      if (o.isLine2 || o.isLine || o.isLineLoop || o.isLineSegments) {
        // line, not a solid panel surface — skip
      } else if (o.isMesh) {
        meshes++;
      }
      if (o.children) o.children.forEach(visit);
    };
    visit(obj);
    return meshes;
  };
}

test.describe('Surface paneling — Surface.Panelize panels render in the viewport', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // AC-4: multiple panel meshes tile a multi-cell surface and all render.
  // ───────────────────────────────────────────────────────────────────────────
  test('AC-4: Panelize produces >1 panel mesh, each rendered as a distinct surface', async ({ page }) => {
    await waitForApp(page);

    if (!(await nodesRegistered(page))) {
      test.skip(true, `${PANELIZE_TYPE} / ${SHAPES_TYPE} not yet registered (T14a pending) — port-id assertions deferred`);
      return;
    }

    const result = await page.evaluate(({ panelize, shapes, findPortSrc, countSrc }) => {
      /* eslint-disable no-eval */
      const findPort = eval('(' + findPortSrc + ')');
      const countMeshes = eval('(' + countSrc + ')');
      /* eslint-enable no-eval */
      const Geo = window.Geo;
      window.app.newProject();

      // Build a multi-cell surface: a wide rectangle patched into a mesh.
      const rect  = window.app.addNodeToCanvas('Rectangle.ByCenterWidthDepth', 0, 0);
      // Rectangle exposes width/depth controls — make it several panel cells wide.
      if (rect.controlValues) { rect.controlValues.width = 20; rect.controlValues.depth = 20; }
      const rectOut = findPort(rect.def.outputs, ['rectangle', 'curve', 'polyline', 'shape']);

      const patch = window.app.addNodeToCanvas('Surface.ByPatch', 240, 0);
      const patchIn  = findPort(patch.def.inputs,  ['boundary', 'curve']);
      const patchOut = findPort(patch.def.outputs, ['surface', 'mesh']);
      window.app.addWire(rect.id, rectOut, patch.id, patchIn);

      const shapesNode = window.app.addNodeToCanvas(shapes, 240, 160);
      // Choose the Square option on whatever control drives the dropdown.
      const dd = (shapesNode.def.controls || []).find(c => c.type === 'dropdown');
      if (dd) shapesNode.controlValues[dd.id] = 'Square';
      const shapeOut = findPort(shapesNode.def.outputs, ['shape', 'curve', 'polygon']);

      const pan = window.app.addNodeToCanvas(panelize, 480, 0);
      const surfIn  = findPort(pan.def.inputs, ['surface']);
      const shapeIn = findPort(pan.def.inputs, ['shape']);
      const uIn     = findPort(pan.def.inputs, ['u']);
      const vIn     = findPort(pan.def.inputs, ['v']);
      const panelsOut = findPort(pan.def.outputs, ['panels', 'panel']);
      window.app.addWire(patch.id, patchOut, pan.id, surfIn);
      window.app.addWire(shapesNode.id, shapeOut, pan.id, shapeIn);
      // Drive a multi-cell grid so we get more than one panel.
      if (uIn && pan.controlValues) pan.controlValues[uIn] = 4;
      if (vIn && pan.controlValues) pan.controlValues[vIn] = 4;
      if (pan.def.controls) {
        (pan.def.controls || []).forEach(c => {
          if (/^u$/i.test(c.id) || /^u$/i.test(c.label || '')) pan.controlValues[c.id] = 4;
          if (/^v$/i.test(c.id) || /^v$/i.test(c.label || '')) pan.controlValues[c.id] = 4;
        });
      }

      const watch = window.app.addNodeToCanvas('Output.Watch', 720, 0);
      window.app.addWire(pan.id, panelsOut, watch.id, 'value');

      // Read the Panels output the way the engine resolves a wired multi-output
      // port: computeNodeValue() populates nd._portValues keyed by output id
      // (see src/core/engine.js getInput → srcNd._portValues[wire.fromPort]).
      const direct = window.app.computeNodeValue(pan);
      const panelList = (pan._portValues && pan._portValues[panelsOut] !== undefined)
        ? pan._portValues[panelsOut]
        : direct;

      // Render the panels through the REAL viewer path into a throwaway group.
      const group = new window.THREE.Group();
      Geo.addToScene(group, panelList, 0xa6e3a1);

      return {
        ports: { rectOut, patchIn, patchOut, shapeOut, surfIn, shapeIn, panelsOut },
        panelCount: Array.isArray(panelList) ? panelList.length : (panelList ? 1 : 0),
        meshCount: countMeshes(group),
        firstType: Array.isArray(panelList) && panelList[0] ? (panelList[0]._type || panelList[0].type) : null
      };
    }, {
      panelize: PANELIZE_TYPE,
      shapes: SHAPES_TYPE,
      findPortSrc: `(${findPortHelper.toString()})()`,
      countSrc: `(${countMeshesHelper.toString()})()`
    });

    // Wiring must have resolved the critical ports.
    expect(result.ports.surfIn, 'Surface.Panelize must expose a Surface input').toBeTruthy();
    expect(result.ports.shapeIn, 'Surface.Panelize must expose a Shape input').toBeTruthy();
    expect(result.ports.panelsOut, 'Surface.Panelize must expose a Panels output').toBeTruthy();

    // AC-4: more than one panel, and each renders as a distinct mesh.
    expect(result.panelCount, 'multi-cell surface must yield >1 panel').toBeGreaterThan(1);
    expect(result.meshCount, 'each panel must render as its own mesh').toBeGreaterThan(1);
    // Panels are meshes, not bare objects/strings.
    expect(result.firstType).not.toBe(null);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-6: changing Scale re-scales panels (smaller scale -> smaller corner spread).
  // ───────────────────────────────────────────────────────────────────────────
  test('AC-6: smaller Scale shrinks panels (corner spread) and larger Scale grows them', async ({ page }) => {
    await waitForApp(page);

    if (!(await nodesRegistered(page))) {
      test.skip(true, `${PANELIZE_TYPE} / ${SHAPES_TYPE} not yet registered (T14a pending) — Scale assertion deferred`);
      return;
    }

    const result = await page.evaluate(({ panelize, shapes, findPortSrc }) => {
      /* eslint-disable no-eval */
      const findPort = eval('(' + findPortSrc + ')');
      /* eslint-enable no-eval */

      // Measure the total spread (bounding-box diagonal) of all corner points
      // returned by Surface.Panelize at a given Scale value.
      function cornerSpread(corners) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let count = 0;
        const visit = (p) => {
          if (Array.isArray(p)) { p.forEach(visit); return; }
          if (p && (p.x !== undefined || p._type === 'Point3')) {
            const x = Number(p.x), y = Number(p.y), z = Number(p.z);
            if (isFinite(x) && isFinite(y) && isFinite(z)) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x);
              minY = Math.min(minY, y); maxY = Math.max(maxY, y);
              minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
              count++;
            }
          }
        };
        visit(corners);
        if (count === 0) return { diag: NaN, count: 0 };
        const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
        return { diag: Math.sqrt(dx * dx + dy * dy + dz * dz), count };
      }

      function buildAndMeasure(scaleVal) {
        window.app.newProject();
        const rect = window.app.addNodeToCanvas('Rectangle.ByCenterWidthDepth', 0, 0);
        if (rect.controlValues) { rect.controlValues.width = 20; rect.controlValues.depth = 20; }
        const rectOut = findPort(rect.def.outputs, ['rectangle', 'curve', 'polyline', 'shape']);

        const patch = window.app.addNodeToCanvas('Surface.ByPatch', 240, 0);
        const patchIn  = findPort(patch.def.inputs,  ['boundary', 'curve']);
        const patchOut = findPort(patch.def.outputs, ['surface', 'mesh']);
        window.app.addWire(rect.id, rectOut, patch.id, patchIn);

        const shapesNode = window.app.addNodeToCanvas(shapes, 240, 160);
        const dd = (shapesNode.def.controls || []).find(c => c.type === 'dropdown');
        if (dd) shapesNode.controlValues[dd.id] = 'Square';
        const shapeOut = findPort(shapesNode.def.outputs, ['shape', 'curve', 'polygon']);

        const pan = window.app.addNodeToCanvas(panelize, 480, 0);
        const surfIn   = findPort(pan.def.inputs, ['surface']);
        const shapeIn  = findPort(pan.def.inputs, ['shape']);
        const cornersOut = findPort(pan.def.outputs, ['corners', 'corner']);
        window.app.addWire(patch.id, patchOut, pan.id, surfIn);
        window.app.addWire(shapesNode.id, shapeOut, pan.id, shapeIn);

        // Set Scale on whichever control/input is named "scale".
        (pan.def.controls || []).forEach(c => {
          if (/scale/i.test(c.id) || /scale/i.test(c.label || '')) pan.controlValues[c.id] = scaleVal;
        });
        const scaleInId = findPort(pan.def.inputs, ['scale']);
        if (scaleInId && pan.controlValues) pan.controlValues[scaleInId] = scaleVal;
        // Keep a multi-cell grid.
        (pan.def.controls || []).forEach(c => {
          if (/^u$/i.test(c.id) || /^u$/i.test(c.label || '')) pan.controlValues[c.id] = 4;
          if (/^v$/i.test(c.id) || /^v$/i.test(c.label || '')) pan.controlValues[c.id] = 4;
        });

        // Read the Corners output via the engine's multi-output store (_portValues),
        // the same path a wired port resolves through.
        const directCorners = window.app.computeNodeValue(pan);
        const cornerVal = (pan._portValues && pan._portValues[cornersOut] !== undefined)
          ? pan._portValues[cornersOut]
          : directCorners;
        return cornerSpread(cornerVal);
      }

      const small = buildAndMeasure(0.3);
      const large = buildAndMeasure(0.9);
      return { small, large };
    }, {
      panelize: PANELIZE_TYPE,
      shapes: SHAPES_TYPE,
      findPortSrc: `(${findPortHelper.toString()})()`
    });

    // Both runs must yield corner points.
    expect(result.small.count, 'small-scale run must produce corner points').toBeGreaterThan(0);
    expect(result.large.count, 'large-scale run must produce corner points').toBeGreaterThan(0);
    expect(Number.isFinite(result.small.diag)).toBe(true);
    expect(Number.isFinite(result.large.diag)).toBe(true);

    // AC-6: a smaller Scale must give a strictly smaller corner spread (panels
    // shrink toward their centres, leaving gaps). Allow a tiny epsilon so a
    // floating-point tie still counts as "observably different".
    expect(result.large.diag).toBeGreaterThan(result.small.diag + 1e-6);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AC-7: each node's help example runs and shows panels in Output.Watch.
  // ───────────────────────────────────────────────────────────────────────────
  for (const nodeType of [PANELIZE_TYPE, SHAPES_TYPE]) {
    test(`AC-7: ${nodeType} help example runs and Watch shows panels (not [object Object]/undefined/NaN)`, async ({ page }) => {
      await waitForApp(page);

      if (!(await nodesRegistered(page))) {
        test.skip(true, `${nodeType} not yet registered (T14a pending) — help-example assertion deferred`);
        return;
      }

      const out = await page.evaluate((type) => {
        window.app.newProject();
        // Drive the same code path the help panel's "Add example" button uses.
        if (typeof window.app._addHelpExample !== 'function') return { err: 'NO_HELP_API' };
        window.app._addHelpExample(type);

        // The example must include an Output.Watch (per the node-sample-graph
        // standard: producer -> focal node -> consumer).
        const watch = window.app.nodes.find(n => n.type === 'Output.Watch');
        if (!watch) return { err: 'NO_WATCH_IN_EXAMPLE' };

        // Run the whole graph, then read the Watch value.
        if (window.app.runGraph) window.app.runGraph();
        let val = window.app.computeNodeValue(watch);
        let serialized;
        try { serialized = JSON.stringify(val); } catch (_) { serialized = String(val); }
        return {
          err: null,
          nodeCount: window.app.nodes.length,
          empty: (val === null || val === undefined),
          serialized: serialized === undefined ? String(val) : serialized
        };
      }, nodeType);

      expect(out.err, `help example wiring for ${nodeType}`).toBeNull();
      expect(out.nodeCount, 'example must place a full producer->focal->consumer graph').toBeGreaterThan(2);
      // Watch must hold a real value.
      expect(out.empty, 'Output.Watch must not be empty').toBe(false);
      // And it must be readable geometry, never the failure markers.
      expect(out.serialized).toBeTruthy();
      expect(out.serialized).not.toContain('[object Object]');
      expect(out.serialized).not.toContain('undefined');
      expect(out.serialized).not.toContain('NaN');
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Smoke: a Surface.ByPatch mesh renders through the existing addToScene path
  // as a solid mesh (the same path panels reuse). This proves NO new render
  // path is required and runs even before T14a lands the paneling nodes.
  // ───────────────────────────────────────────────────────────────────────────
  test('Surface.ByPatch mesh renders as a solid mesh via the existing addToScene path', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate((countSrc) => {
      /* eslint-disable no-eval */
      const countMeshes = eval('(' + countSrc + ')');
      /* eslint-enable no-eval */
      const Geo = window.Geo;
      const P = (x, y, z) => new Geo.Point3(x, y, z);
      // A closed square boundary -> patch mesh.
      const poly = new Geo.Polyline3([P(-5, -5, 0), P(5, -5, 0), P(5, 5, 0), P(-5, 5, 0)], true);
      const mesh = Geo.surfaceByPatch(poly, 8);
      const group = new window.THREE.Group();
      Geo.addToScene(group, mesh, 0x94e2d5);
      // Also render an ARRAY of two such meshes — the panels code path.
      const arrGroup = new window.THREE.Group();
      Geo.addToScene(arrGroup, [mesh, Geo.surfaceByPatch(poly, 8)], 0xa6e3a1);
      return {
        single: countMeshes(group),
        arrayOfTwo: countMeshes(arrGroup),
        meshType: mesh && (mesh._type || mesh.type)
      };
    }, `(${countMeshesHelper.toString()})()`);

    // A single Mesh3 renders as (at least) one solid mesh.
    expect(result.single).toBeGreaterThanOrEqual(1);
    // An array of two meshes renders as multiple distinct meshes — proving the
    // panels output needs no new render path.
    expect(result.arrayOfTwo).toBeGreaterThan(result.single);
    expect(result.meshType).toBeTruthy();
  });
});
