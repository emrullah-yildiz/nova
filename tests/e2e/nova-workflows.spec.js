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
