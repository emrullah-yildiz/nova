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

    // Drag from the output port to the input port to draw the wire.
    // 1. Get bounding boxes for both port dots.
    const outputBox = await outputPort.boundingBox();
    const inputBox  = await inputPort.boundingBox();

    // Center coordinates of each port dot.
    const fromX = outputBox.x + outputBox.width  / 2;
    const fromY = outputBox.y + outputBox.height / 2;
    const toX   = inputBox.x  + inputBox.width   / 2;
    const toY   = inputBox.y  + inputBox.height  / 2;

    // 2. mousedown on the output port, move smoothly to the input port, mouseup.
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: 10 });
    await page.mouse.up();

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

  test('drag wire: mousedown on output + drag + mouseup on input draws wire', async ({ page }) => {
    test.slow();

    await openLearning(page);

    const exerciseSection = page.locator('#learn-exercise-0');
    await exerciseSection.scrollIntoViewIfNeeded();

    await expect(page.locator('.mini-canvas').first()).toBeVisible();

    const outputPort = page.locator(
      '[data-node-id="n2"][data-port-role="output"][data-port-name="value"]'
    );
    const inputPort = page.locator(
      '[data-node-id="n3"][data-port-role="input"][data-port-name="b"]'
    );

    await expect(outputPort).toBeVisible();
    await expect(inputPort).toBeVisible();

    // Drag from output port to input port using Playwright drag API.
    // dragTo performs mousedown → move → mouseup, exercising the drag-wire path.
    const outBox = await outputPort.boundingBox();
    const inBox  = await inputPort.boundingBox();

    // Start drag on output port center.
    await page.mouse.move(outBox.x + outBox.width / 2, outBox.y + outBox.height / 2);
    await page.mouse.down();
    // Move slowly towards input port so mousemove events are generated.
    await page.mouse.move(
      inBox.x + inBox.width / 2,
      inBox.y + inBox.height / 2,
      { steps: 10 }
    );
    await page.mouse.up();

    // The drag-release mouseup handler should have completed the wire.
    const userWireGroup = page.locator('.mini-canvas-userwires path');
    await expect(userWireGroup).toHaveCount(1);

    // Submit and assert correct.
    const submitBtn = page.locator('.mini-canvas-submit');
    await submitBtn.click();
    await expect(page.locator('.mini-canvas-success')).toBeVisible();
  });

  test('scroll wheel zoom: wheel event changes viewport transform scale', async ({ page }) => {
    test.slow();

    await openLearning(page);

    const exerciseSection = page.locator('#learn-exercise-0');
    await exerciseSection.scrollIntoViewIfNeeded();

    const miniCanvas = page.locator('.mini-canvas').first();
    await expect(miniCanvas).toBeVisible();

    const canvasArea = page.locator('.mini-canvas-area').first();
    const viewport = page.locator('.mini-canvas-viewport').first();

    // Capture the initial transform (should be translate(0px,0px) scale(1)).
    const initialTransform = await viewport.evaluate((el) => el.style.transform);
    // Initial state: scale 1 (identity or translate(0,0) scale(1)).
    expect(initialTransform).toMatch(/scale\(1\)/);

    // Scroll wheel UP (zoom in) over the canvas area.
    const box = await canvasArea.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    // deltaY < 0 = scroll up = zoom in.
    await page.mouse.wheel(0, -100);

    // After zoom-in, the scale should be > 1.
    const afterZoomIn = await viewport.evaluate((el) => el.style.transform);
    // Extract scale value.
    const scaleMatch = afterZoomIn.match(/scale\(([\d.]+)\)/);
    expect(scaleMatch).not.toBeNull();
    const scaleVal = parseFloat(scaleMatch[1]);
    expect(scaleVal).toBeGreaterThan(1);

    // Scroll wheel DOWN (zoom out) multiple times to go below 1.
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 100);
    }

    const afterZoomOut = await viewport.evaluate((el) => el.style.transform);
    const scaleMatchOut = afterZoomOut.match(/scale\(([\d.]+)\)/);
    expect(scaleMatchOut).not.toBeNull();
    const scaleOut = parseFloat(scaleMatchOut[1]);
    expect(scaleOut).toBeLessThan(1);

    // Ensure zoom does not go below ZOOM_MIN (0.2).
    // Scroll far enough to hit the floor.
    for (let i = 0; i < 50; i++) {
      await page.mouse.wheel(0, 100);
    }
    const floorTransform = await viewport.evaluate((el) => el.style.transform);
    const floorMatch = floorTransform.match(/scale\(([\d.]+)\)/);
    expect(floorMatch).not.toBeNull();
    const floorScale = parseFloat(floorMatch[1]);
    expect(floorScale).toBeGreaterThanOrEqual(0.19); // allow minor float rounding
  });
});
