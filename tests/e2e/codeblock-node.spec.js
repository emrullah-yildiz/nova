const { test, expect } = require('@playwright/test');

// Verifies the Custom.CodeBlock inline auto-grow editor in the REAL DOM (jsdom
// can't see layout/scrollbars or live re-render): drop a CodeBlock, type a
// multi-input/multi-assignment block in its on-node textarea, and confirm the
// dynamic ports appear on commit and the editor never shows a scrollbar.

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
}

test.describe('Custom.CodeBlock on-node editor', () => {
  test('type in the CodeBlock → ports appear, no scrollbars', async ({ page }) => {
    await waitForApp(page);

    // Enter the workspace and drop a fresh CodeBlock (v2).
    const nodeId = await page.evaluate(() => {
      window.app.newProject();
      const nd = window.app.addNodeToCanvas('Custom.CodeBlock', 200, 200);
      return nd && nd.id;
    });
    expect(nodeId).toBeTruthy();

    const editor = page.locator('#' + nodeId + ' textarea.cb-editor');
    await expect(editor).toBeVisible();

    // Type a 3-output / 2-input block and commit (blur).
    await editor.click();
    await editor.fill('a = w\nb = a + z\ntotal = a + b');
    await editor.blur();

    // Ports re-derive on commit: inputs w,z ; outputs a,b,total.
    await expect.poll(async () => page.evaluate((id) => {
      const nd = window.app.nodes.find(n => n.id === id);
      return nd ? nd._dynInputs : null;
    }, nodeId)).toEqual(['w', 'z']);

    await expect.poll(async () => page.evaluate((id) => {
      const nd = window.app.nodes.find(n => n.id === id);
      return nd ? nd._dynOutputs : null;
    }, nodeId)).toEqual(['a', 'b', 'total']);

    // The rendered port dots match.
    await expect(page.locator('#' + nodeId + ' .port-dot[data-dir="input"]')).toHaveCount(2);
    await expect(page.locator('#' + nodeId + ' .port-dot[data-dir="output"]')).toHaveCount(3);

    // No scrollbars in any state: computed overflow is hidden and the textarea is
    // not scrollable (scrollHeight == clientHeight, scrollWidth == clientWidth).
    const sizing = await editor.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        vScroll: el.scrollHeight - el.clientHeight,
        hScroll: el.scrollWidth - el.clientWidth
      };
    });
    expect(sizing.overflowX).toBe('hidden');
    expect(sizing.overflowY).toBe('hidden');
    // Auto-grow means content fits — no hidden overflow either direction.
    expect(sizing.vScroll).toBeLessThanOrEqual(1);
    expect(sizing.hScroll).toBeLessThanOrEqual(1);

    await page.screenshot({ path: 'tests/e2e/__artifacts__/codeblock-node.png', fullPage: false });
  });

  test('Series preset drops a CodeBlock pre-filled with 0..10', async ({ page }) => {
    await waitForApp(page);
    const code = await page.evaluate(() => {
      window.app.newProject();
      const nd = window.app.addSeriesCodeBlock(200, 200);
      return nd && nd.controlValues.code;
    });
    expect(code).toBe('nums = 0..10');
  });
});
