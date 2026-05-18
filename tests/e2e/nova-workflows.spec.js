const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
}

async function addNodeFromLibrary(page, searchText, buttonName) {
  await page.locator('#node-search-input').fill(searchText);
  const item = page.locator('#node-categories .node-lib-item', { hasText: buttonName }).first();
  await expect(item).toBeVisible();
  await item.click();
}

test.describe('Nova browser workflows', () => {
  test('loads the landing page and opens a workspace', async ({ page }) => {
    await waitForApp(page);

    await expect(page.locator('#landing-page')).toBeVisible();
    await expect(page.getByRole('button', { name: /New Project/i })).toBeVisible();

    await page.getByRole('button', { name: /New Project/i }).click();

    await expect(page.locator('#workspace-page')).toBeVisible();
    await expect(page.locator('#node-canvas')).toBeVisible();
    await page.waitForFunction(
      () =>
        window.app.currentPage === 'workspace' &&
        document.querySelectorAll('#node-categories .node-category').length > 0
    );
  });

  test('opens the Nova Connect panel from the top menu', async ({ page }) => {
    await waitForApp(page);

    await expect(page.locator('#menu-connect')).toBeVisible();
    await page.locator('#menu-connect').click();

    await expect(page.locator('#nova-connect-panel')).toHaveClass(/visible/);
    await expect(page.locator('#nova-connect-url')).toHaveValue('ws://127.0.0.1:8765');
    await expect(page.getByRole('button', { name: 'Query Walls' })).toBeVisible();
  });

  test('opens Nova Connect prefilled from Revit launcher parameters', async ({ page }) => {
    await page.goto('/?novaConnectOpen=1&novaConnectUrl=ws%3A%2F%2F127.0.0.1%3A8765&novaConnectToken=e2e-token&novaConnectProject=RevitModel');
    await page.waitForFunction(() => window.app && window.app.initialized);

    await expect(page.locator('#nova-connect-panel')).toHaveClass(/visible/);
    await expect(page.locator('#nova-connect-token')).toHaveValue('e2e-token');
    await expect(page.locator('#nova-connect-project')).toHaveValue('RevitModel');
    await expect(page.locator('#nova-connect-panel')).toContainText('Opened from Revit');
  });

  test('creates, runs, saves, and reloads a basic graph', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      localStorage.clear();
      app.newProject();

      const a = app.addNodeToCanvas('number-input', 80, 80);
      const b = app.addNodeToCanvas('number-input', 80, 220);
      const sum = app.addNodeToCanvas('math-add', 340, 140);
      const watch = app.addNodeToCanvas('output-watch', 600, 160);

      a.controlValues.val = 17;
      b.controlValues.val = 25;

      app.addWire(a.id, 'value', sum.id, 'a');
      app.addWire(b.id, 'value', sum.id, 'b');
      app.addWire(sum.id, 'result', watch.id, 'value');
      app.saveToLocal('E2E Workflow');

      const computed = app.computeNodeValue(watch);
      const saved = JSON.parse(localStorage.getItem('nodeflow_project_E2E Workflow'));

      app.newProject();
      app.openFromLocal('E2E Workflow');

      const reloadedWatch = app.nodes.find((node) => node.type === 'output-watch');

      return {
        computed,
        savedNodeCount: saved.nodes.length,
        savedWireCount: saved.wires.length,
        reloadedNodeCount: app.nodes.length,
        reloadedWireCount: app.wires.length,
        reloadedValue: app.computeNodeValue(reloadedWatch)
      };
    });

    expect(result).toEqual({
      computed: 42,
      savedNodeCount: 4,
      savedWireCount: 3,
      reloadedNodeCount: 4,
      reloadedWireCount: 3,
      reloadedValue: 42
    });

    await expect(page.locator('#node-canvas .node')).toHaveCount(4);
  });

  test('adds nodes from the library search and executes a connected graph', async ({ page }) => {
    await waitForApp(page);

    await page.getByRole('button', { name: /New Project/i }).click();
    await expect(page.locator('#workspace-page')).toBeVisible();

    await addNodeFromLibrary(page, 'number', 'Number');
    await addNodeFromLibrary(page, 'number', 'Number');
    await addNodeFromLibrary(page, 'math.add', 'Math.Add');
    await addNodeFromLibrary(page, 'watch', 'Watch');

    await expect(page.locator('#node-canvas .node')).toHaveCount(4);

    const result = await page.evaluate(() => {
      const numbers = app.nodes.filter(node => node.type === 'number-input');
      const sum = app.nodes.find(node => node.type === 'math-add');
      const watch = app.nodes.find(node => node.type === 'output-watch');

      numbers[0].controlValues.val = 11;
      numbers[1].controlValues.val = 31;

      app.addWire(numbers[0].id, 'value', sum.id, 'a');
      app.addWire(numbers[1].id, 'value', sum.id, 'b');
      app.addWire(sum.id, 'result', watch.id, 'value');

      app.renderWires();

      return {
        nodeTypes: app.nodes.map(node => node.type),
        wireCount: app.wires.length,
        computed: app.computeNodeValue(watch)
      };
    });

    expect(result.nodeTypes).toEqual(['number-input', 'number-input', 'math-add', 'output-watch']);
    expect(result.wireCount).toBe(3);
    expect(result.computed).toBe(42);
    await expect(page.locator('#wire-svg path')).not.toHaveCount(0);
  });

  test('renders computed geometry through the viewer bridge without WebGL', async ({ page }) => {
    await waitForApp(page);

    await page.getByRole('button', { name: /New Project/i }).click();
    await expect(page.locator('#workspace-page')).toBeVisible();

    const result = await page.evaluate(() => {
      app.newProject();

      const point = app.addNodeToCanvas('point-bycoordinates', 140, 120);
      point.controlValues.x = 2;
      point.controlValues.y = -3;
      point.controlValues.z = 4;

      const originalInitialized = Viewer3D.isInitialized;
      const originalGroup = Viewer3D.geometryGroup;
      const originalClear = Viewer3D.clearGeometry;
      const originalFitAll = Viewer3D.fitAll;
      const originalAddToScene = Geo.addToScene;

      const rendered = [];
      let fitAllCalls = 0;
      Viewer3D.isInitialized = true;
      Viewer3D.geometryGroup = { children: [] };
      Viewer3D.clearGeometry = () => {
        Viewer3D.geometryGroup.children = [];
      };
      Viewer3D.fitAll = () => {
        fitAllCalls += 1;
      };
      Geo.addToScene = (group, geoObj) => {
        rendered.push({ type: geoObj._type, x: geoObj.x, y: geoObj.y, z: geoObj.z });
        group.children.push({ geoObj });
      };

      try {
        app._renderFromCompute();
        return {
          rendered,
          sceneItems: app._sceneItems,
          fitAllCalls,
          childCount: Viewer3D.geometryGroup.children.length
        };
      } finally {
        Viewer3D.isInitialized = originalInitialized;
        Viewer3D.geometryGroup = originalGroup;
        Viewer3D.clearGeometry = originalClear;
        Viewer3D.fitAll = originalFitAll;
        Geo.addToScene = originalAddToScene;
      }
    });

    expect(result.rendered).toEqual([{ type: 'Point3', x: 2, y: -3, z: 4 }]);
    expect(result.sceneItems).toEqual([
      expect.objectContaining({
        nodeId: expect.any(String),
        type: 'Point3',
        visible: true
      })
    ]);
    expect(result.fitAllCalls).toBe(1);
    expect(result.childCount).toBe(1);
  });

  test('reports missing API key before attempting an AI provider call', async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(() => {
      localStorage.removeItem('nodeflow_key_openrouter');
      localStorage.removeItem('nodeflow_key_openai');
      localStorage.removeItem('nodeflow_key_groq');
      localStorage.removeItem('nodeflow_openai_key');
      localStorage.setItem('nodeflow_provider', 'openrouter');
    });

    await page.locator('#menu-settings').hover();
    await page.getByRole('button', { name: /Preferences/i }).click();
    await expect(page.locator('#settings-api-key')).toBeVisible();

    await page.locator('#settings-api-key').fill('');
    await page.getByRole('button', { name: /Test Connection/i }).click();

    await expect(page.locator('#settings-status')).toContainText('Enter an API key first');
  });
});
