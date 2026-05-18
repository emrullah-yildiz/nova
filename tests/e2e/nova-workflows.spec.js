const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
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

  test('exports a project file with stable graph payload shape', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      localStorage.clear();
      app.newProject();

      const number = app.addNodeToCanvas('number-input', 90, 120);
      const watch = app.addNodeToCanvas('output-watch', 360, 120);

      number.controlValues.val = 64;
      app.addWire(number.id, 'value', watch.id, 'value');
      app._projectName = 'Export Contract';

      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;
      const originalClick = HTMLAnchorElement.prototype.click;

      let exportedBlob;
      let downloadName;
      let revokedUrl;

      URL.createObjectURL = blob => {
        exportedBlob = blob;
        return 'blob:nova-export-test';
      };
      URL.revokeObjectURL = url => {
        revokedUrl = url;
      };
      HTMLAnchorElement.prototype.click = function() {
        downloadName = this.download;
      };

      try {
        app.saveToFile();
        const payload = JSON.parse(await exportedBlob.text());

        return {
          downloadName,
          revokedUrl,
          version: payload.version,
          name: payload.name,
          nodeTypes: payload.nodes.map(node => node.type),
          wireCount: payload.wires.length,
          runtimeResultsPersisted: payload.nodes.some(node => node._pyResults !== null)
        };
      } finally {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        HTMLAnchorElement.prototype.click = originalClick;
      }
    });

    expect(result).toEqual({
      downloadName: 'Export Contract.nodeflow',
      revokedUrl: 'blob:nova-export-test',
      version: 2,
      name: 'Export Contract',
      nodeTypes: ['number-input', 'output-watch'],
      wireCount: 1,
      runtimeResultsPersisted: false
    });
  });

  test('handles missing and malformed local projects without corrupting the current graph', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      localStorage.clear();
      app.newProject();

      const originalAddAIMessage = app.addAIMessage.bind(app);
      const messages = [];
      app.addAIMessage = function(scope, message) {
        messages.push({ scope, message });
        return originalAddAIMessage(scope, message);
      };

      const stableNode = app.addNodeToCanvas('number-input', 80, 80);
      stableNode.controlValues.val = 7;

      app.openFromLocal('Missing Project');

      const afterMissing = {
        nodeCount: app.nodes.length,
        value: app.computeNodeValue(app.nodes[0])
      };

      localStorage.setItem('nodeflow_project_Broken Project', '{not valid json');
      app.openFromLocal('Broken Project');

      return {
        afterMissing,
        finalNodeCount: app.nodes.length,
        finalValue: app.computeNodeValue(app.nodes[0]),
        messages: messages.map(entry => entry.message)
      };
    });

    expect(result.afterMissing).toEqual({ nodeCount: 1, value: 7 });
    expect(result.finalNodeCount).toBe(1);
    expect(result.finalValue).toBe(7);
    expect(result.messages.some(message => message.includes('not found in browser storage'))).toBe(true);
    expect(result.messages.some(message => message.includes('Load failed'))).toBe(true);
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
