const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
}

test.describe('graph run modes (Automatic | Manual)', () => {
  test('Manual: edits do not recompute, Run recomputes; toggle UI reflects mode', async ({ page }) => {
    await waitForApp(page);

    // Build a tiny graph and switch to Manual.
    const after = await page.evaluate(async () => {
      app.newProject();
      const a = app.addNodeToCanvas('number-input', 80, 80);
      const watch = app.addNodeToCanvas('output-watch', 360, 100);
      a.controlValues.val = 10;
      app.addWire(a.id, 'value', watch.id, 'value');

      // Default is Automatic.
      const defaultMode = app.runMode;

      app.setRunMode('manual');
      await app.runGraph();              // baseline snapshot = 10
      const baseline = app.computeNodeValue(watch);

      // Edit in Manual — must NOT recompute; graph becomes dirty/stale.
      a.controlValues.val = 99;
      app.invalidateCompute();
      const staleValue = app.computeNodeValue(watch);
      const dirtyAfterEdit = !!app._graphDirty;

      // Run on demand — recomputes and clears the stale flag.
      await app.runGraph();
      const ranValue = app.computeNodeValue(watch);
      const dirtyAfterRun = !!app._graphDirty;

      return { defaultMode, baseline, staleValue, dirtyAfterEdit, ranValue, dirtyAfterRun };
    });

    expect(after.defaultMode).toBe('auto');
    expect(after.baseline).toBe(10);
    // The key assertion: editing in Manual did NOT recompute.
    expect(after.staleValue).toBe(10);
    expect(after.dirtyAfterEdit).toBe(true);
    // Run recomputed and cleared the stale flag.
    expect(after.ranValue).toBe(99);
    expect(after.dirtyAfterRun).toBe(false);

    // The toolbar toggle is present and reads "Manual".
    const toggle = page.locator('#toolbar-runmode');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText('Manual');

    // Clicking the toggle switches to Automatic and catches up (live recompute).
    await toggle.click();
    await expect(toggle).toHaveText('Auto');
    const autoValue = await page.evaluate(() => {
      const watch = app.nodes.find((n) => n.type === 'output-watch');
      return app.computeNodeValue(watch);
    });
    expect(autoValue).toBe(99);
  });
});
