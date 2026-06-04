const { test, expect } = require('@playwright/test');

// Verifies the Nova Learning page renders to the real DOM (canvas/SVG visuals
// can't be checked in jsdom): Help → "Nova Learning" opens a scrollable page
// with the hero, all step sections, inline-SVG illustrations (no broken <img>),
// the Data Privacy link, and the "Start a new project" action.

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
}

const STEP_HEADINGS = [
  'What is Nova',
  'The canvas & node library',
  'Wiring nodes together',
  'Live geometry & the 3D viewer',
  'The AI assistant',
  'Save & projects',
  'Connect to Revit & Forma'
];

test.describe('Nova Learning page', () => {
  test('opens from Help → Nova Learning and renders hero + all steps', async ({ page }) => {
    await waitForApp(page);

    // Open via the app method (the menu hover/click is covered by the menu wiring).
    await page.evaluate(() => window.app.showLearning());

    const overlay = page.locator('#learning-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.learn-hero-title')).toHaveText(/Build parametric design/i);

    // All 7 designed step sections render with their headings.
    for (const h of STEP_HEADINGS) {
      await expect(overlay.getByRole('heading', { name: h })).toBeVisible();
    }
    // The footer is the 8th section.
    await expect(overlay.locator('.learn-footer-title')).toHaveText(/Ready to design/i);

    // Inline SVG illustrations are present and visible — no external image dep.
    const svgs = overlay.locator('svg');
    expect(await svgs.count()).toBeGreaterThanOrEqual(STEP_HEADINGS.length);

    // No broken/visible screenshot <img> (the optional shots aren't shipped).
    const visibleShots = await overlay.locator('img.learn-shot:visible').count();
    expect(visibleShots).toBe(0);

    await page.screenshot({ path: 'tests/e2e/__artifacts__/nova-learning.png', fullPage: false });

    // The Data Privacy link is wired to the legal viewer.
    const privacy = overlay.locator('.learn-privacy-link');
    await expect(privacy).toBeVisible();
    await privacy.click();
    await expect(page.locator('#legal-overlay')).toBeVisible();
    await page.evaluate(() => window.app.closeLegal());

    // "Start a new project" closes the page and enters the workspace.
    await overlay.locator('.learn-btn--primary').click();
    await expect(page.locator('#learning-overlay')).toHaveCount(0);
  });
});
