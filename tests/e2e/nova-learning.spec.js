const { test, expect } = require('@playwright/test');

// Verifies the Nova Learning Primer renders in the real DOM: sidebar nav with
// all 10 chapters, chapter content with sections and quiz questions, correct-
// answer feedback, chapter navigation, and the Data Privacy / close actions.

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
}

const CHAPTER_TITLES = [
  'Introduction',
  'Interface',
  'Node Anatomy',
  'Data Types',
  'Math Operations',
  'Geometry Operations',
  'List Operations',
  'Python Node',
  'Code Terminal',
  'Code Block',
];

test.describe('Nova Learning Primer', () => {
  test('opens and renders sidebar nav with all 10 chapters', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());

    const overlay = page.locator('#learning-overlay');
    await expect(overlay).toBeVisible();

    // Sidebar nav is present
    const nav = overlay.locator('#learn-nav');
    await expect(nav).toBeVisible();

    // All chapter titles appear in the nav
    for (const title of CHAPTER_TITLES) {
      await expect(nav.getByText(title, { exact: false })).toBeVisible();
    }

    await page.screenshot({ path: 'tests/e2e/__artifacts__/nova-learning.png', fullPage: false });
  });

  test('first chapter content renders sections and quiz', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());

    const content = page.locator('#learn-chapter-content');
    await expect(content).toBeVisible();

    // Chapter 1 heading
    await expect(content.getByRole('heading', { level: 1 })).toContainText('Introduction');

    // At least one concept section heading
    const sectionHeadings = content.locator('.learn-section-title');
    expect(await sectionHeadings.count()).toBeGreaterThan(0);

    // Quiz section with options
    const quizOpts = content.locator('.learn-quiz-opt');
    expect(await quizOpts.count()).toBeGreaterThan(0);

    // "Next Chapter" button disabled until quiz is answered
    const nextBtn = content.locator('.learn-nav-btn--next');
    await expect(nextBtn).toBeDisabled();
  });

  test('answering quiz correctly enables Next Chapter button', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());

    // Answer all quiz questions for chapter 0 correctly via JS
    await page.evaluate(() => {
      if (window.__learnAnswer) {
        // Q1 answer: 1, Q2 answer: 1 (known correct indices for intro chapter)
        window.__learnAnswer(0, 0, 1);
        window.__learnAnswer(0, 1, 1);
      }
    });

    const nextBtn = page.locator('#learn-chapter-content .learn-nav-btn--next');
    await expect(nextBtn).not.toBeDisabled();
  });

  test('chapter navigation moves between chapters', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());

    // Navigate to chapter 2 (Interface) via sidebar
    await page.evaluate(() => window.__learnGo(1));
    const content = page.locator('#learn-chapter-content');
    await expect(content.getByRole('heading', { level: 1 })).toContainText('Interface');

    // Nav shows chapter 2 as active
    const activeChBtn = page.locator('#learn-nav .learn-nav-ch.active');
    await expect(activeChBtn).toContainText('Interface');
  });

  test('Data Privacy link opens the legal overlay', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());

    const privacyLink = page.locator('#learning-overlay .learn-privacy-link');
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await expect(page.locator('#legal-overlay')).toBeVisible();
    await page.evaluate(() => window.app.closeLegal());
  });

  test('URL hash is #learning while open and cleared on close', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());
    await expect(page).toHaveURL(/#learning/);

    await page.evaluate(() => window.app.closeLearning());
    await expect(page.locator('#learning-overlay')).toHaveCount(0);
    // Hash should be gone
    const url = page.url();
    expect(url).not.toContain('#learning');
  });

  test('page refreshes while learning is open and re-opens the overlay', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());
    await expect(page.locator('#learning-overlay')).toBeVisible();

    // Reload — the #learning hash persists
    await page.reload();
    await page.waitForFunction(() => window.app && window.app.initialized);
    await expect(page.locator('#learning-overlay')).toBeVisible();
  });

  test('closing the learning page removes the overlay', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => window.app.showLearning());
    await expect(page.locator('#learning-overlay')).toBeVisible();

    await page.evaluate(() => window.app.closeLearning());
    await expect(page.locator('#learning-overlay')).toHaveCount(0);
  });
});
