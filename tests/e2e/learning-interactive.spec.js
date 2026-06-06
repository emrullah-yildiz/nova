import { test, expect } from '@playwright/test';

// Playwright E2E spec for interactive learning exercises (T07c / AC-10).
//
// ch01 exercise — "Introduction: Add two numbers"
//   Pre-drawn wires: n1(value) → n3(a), n3(result) → n4(value)
//   Missing wire   : n2(value) → n3(b)   ← user must draw this
//   Expected output: n3 result = 7

async function openLearning(page) {
  await page.goto('/');
  // Wait for the app to be fully initialised before calling showLearning().
  await page.waitForFunction(() => window.app && window.app.initialized);
  await page.evaluate(() => window.app.showLearning());
  // The overlay is lazily created and inserted — wait for it to appear.
  await expect(page.locator('#learning-overlay')).toBeVisible();
  // The exercise section is below the fold in the scrollable learn-body.
  // Scroll it into view so Playwright can interact with it.
  const exerciseSection = page.locator('#learn-exercise-0, #learn-exercise-canvas-0').first();
  await exerciseSection.scrollIntoViewIfNeeded();
}

// Answer all quiz questions for chapter 0 (Introduction) programmatically so
// the "Next Chapter" button can be enabled after the exercise is solved.
// Correct answers for ch01: Q0 → option 1, Q1 → option 1.
async function answerCh01Quiz(page) {
  await page.evaluate(() => {
    if (window.__learnAnswer) {
      window.__learnAnswer(0, 0, 1);
      window.__learnAnswer(0, 1, 1);
    }
  });
}

test.describe('Learning interactive exercises', () => {
  test('AC-10: chapter 1 — draw wire → submit → green success + Next enabled', async ({ page }) => {
    test.slow(); // learning overlay animation may add latency

    await openLearning(page);

    // Chapter 1 (Introduction) is the default view — assert mini-canvas is present.
    // The exercise section is below the fold; scroll it into view.
    const exerciseSection = page.locator('#learn-exercise-0');
    await exerciseSection.scrollIntoViewIfNeeded();

    const miniCanvas = page.locator('.mini-canvas').first();
    await expect(miniCanvas).toBeVisible();

    // ── Assert Input.Number nodes display their numeric value ─────────────────
    // ch01: n1=Input.Number(val=3), n2=Input.Number(val=4).
    // The mini-canvas renders a num-spin-wrap with <input type="number"> for
    // each Input.Number node — verify the displayed value matches controlValues.
    const n1ValueInput = page.locator('[data-node-id="n1"] input[type="number"][data-mini-canvas-value="true"]');
    const n2ValueInput = page.locator('[data-node-id="n2"] input[type="number"][data-mini-canvas-value="true"]');
    await expect(n1ValueInput).toHaveValue('3');
    await expect(n2ValueInput).toHaveValue('4');

    // ── Draw the missing wire: n2 output "value" → n3 input "b" ──────────────
    // ch01: n2 is Input.Number(b=4), n3 is Math.Add.
    const outputPort = page.locator(
      '[data-node-id="n2"][data-port-role="output"][data-port-name="value"]'
    );
    // Input port "b" on node n3 (Math.Add).
    const inputPort = page.locator(
      '[data-node-id="n3"][data-port-role="input"][data-port-name="b"]'
    );

    await expect(outputPort).toBeVisible();
    await expect(inputPort).toBeVisible();

    // Click the output port to start the pending wire.
    await outputPort.click();
    // Click the input port to complete the wire.
    await inputPort.click();

    // ── Assert the user wire is present in the SVG layer ─────────────────────
    // The user wire group gets a <path> appended when a wire is drawn.
    const userWireGroup = page.locator('.mini-canvas-userwires path');
    await expect(userWireGroup).toHaveCount(1);

    // ── Submit BEFORE answering quiz ──────────────────────────────────────────
    // We must submit first, because answering a quiz question triggers a full
    // re-render that replaces innerHTML, which would destroy the drawn wire.
    const submitBtn = page.locator('.mini-canvas-submit');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // ── Assert green success banner (visible before quiz answers re-render) ───
    const successBanner = page.locator('.mini-canvas-success');
    await expect(successBanner).toBeVisible();
    await expect(successBanner).toContainText(/correct/i);

    // ── Complete the quiz so _isChapterDone() returns true ───────────────────
    // Each correct answer triggers _render(), which re-renders content.innerHTML.
    // After both quiz answers, _isChapterDone(0) is true and Next is enabled.
    await answerCh01Quiz(page);

    // ── Assert "Next Chapter" button is enabled ───────────────────────────────
    // After the last quiz answer, buildChapterHtml renders Next WITHOUT disabled.
    const nextBtn = page.locator('.learn-nav-btn--next');
    await expect(nextBtn).toBeEnabled();
  });

  test('AC-5 proxy: submit with no wire drawn → red error banner + Next disabled', async ({ page }) => {
    await openLearning(page);

    // Mini-canvas must be visible first.
    await expect(page.locator('.mini-canvas').first()).toBeVisible();

    // Submit immediately — no wire drawn.
    const submitBtn = page.locator('.mini-canvas-submit');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // ── Assert red error banner ───────────────────────────────────────────────
    const errorBanner = page.locator('.mini-canvas-error');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/not quite|incorrect|check/i);

    // ── "Next Chapter" button must remain disabled ────────────────────────────
    const nextBtn = page.locator('.learn-nav-btn--next');
    await expect(nextBtn).toBeDisabled();
  });
});
