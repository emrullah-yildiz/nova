# T07c — Learning exercises: Playwright E2E spec

**Parent ticket:** [TICK-007](../tickets/TICK-007.md)
**Lane:** ui (agent: switch)
**Branch:** `feat/learning-exercises`
**Status:** queued
**Dependency:** T07a AND T07b must be merged to `feat/learning-exercises` before this task starts. Do not dispatch T07c until both are merged.

---

## Goal

Write the Playwright E2E spec `tests/e2e/learning-interactive.spec.js` covering the full interactive exercise flow: open the learning overlay, navigate to chapter 1, draw the required wire, submit, and assert green success and the "Next chapter" button being enabled.

---

## Owned paths

```
tests/e2e/learning-interactive.spec.js     (CREATE)
```

**Do NOT touch:**
- `src/ui/**` — owned by T07a and T07b
- `tests/e2e/**` other than the one file above
- `playwright.config.js`, `package.json`
- Any existing E2E spec file

---

## Spec requirements

File: `tests/e2e/learning-interactive.spec.js`

The spec must cover the following scenario end-to-end (this is AC-10):

```
1. Navigate to http://localhost:5173
2. Open the learning overlay (click the "Learning" button or navigate to the learning page)
3. Click through to Chapter 1 (if not already on ch01)
4. Assert the mini-canvas exercise section is visible
5. Identify the unwired output port on the source node (use data attributes or aria labels)
6. Click the output port to start a wire
7. Click the compatible input port on the target node to complete the wire
8. Assert the wire connector element is present in the DOM
9. Click the "Submit" button
10. Assert: green success banner is visible (text "Correct" or role="status" with success class)
11. Assert: "Next chapter" button is enabled (not disabled)
```

### Port identification strategy

The mini-canvas component (T07b) must expose `data-port-id`, `data-node-id`, and `data-port-type` attributes on port elements. If T07b does not do this, flag it as a blocker — do not hard-code pixel coordinates.

Recommended selectors (adjust to match T07b's actual DOM):

```js
const outputPort = page.locator('[data-node-id="n1"][data-port-role="output"][data-port-name="result"]');
const inputPort  = page.locator('[data-node-id="n3"][data-port-role="input"][data-port-name="value"]');
const submitBtn  = page.locator('.mini-canvas-submit, button:has-text("Submit")');
const successBanner = page.locator('.mini-canvas-success, [role="status"].success');
const nextBtn    = page.locator('button:has-text("Next"), .chapter-next-btn');
```

Consult the T07b brief and the actual rendered DOM (`page.content()` in a debug run) to confirm selectors before finalising.

---

## Full spec structure

```js
import { test, expect } from '@playwright/test';

test.describe('Learning interactive exercises', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    // Open learning overlay — adjust selector to match learning-page.js
    await page.click('[data-action="open-learning"], button:has-text("Learning")');
    // Navigate to Chapter 1 if needed
    // (learning page may open on ch01 by default)
  });

  test('AC-10: chapter 1 — draw wire → submit → green success + Next enabled', async ({ page }) => {
    // 1. Exercise section visible
    await expect(page.locator('.mini-canvas')).toBeVisible();

    // 2. Draw the wire
    const outputPort = page.locator('[data-node-id="n1"][data-port-role="output"]').first();
    const inputPort  = page.locator('[data-node-id="n3"][data-port-role="input"]').first();
    await outputPort.click();
    await inputPort.click();

    // 3. Wire connector present in DOM
    await expect(page.locator('.mini-canvas-wire, line.wire')).toHaveCount({ minimum: 1 });
    // (pre-drawn wires may already exist; confirm count increased by 1 from baseline if needed)

    // 4. Submit
    await page.click('button:has-text("Submit")');

    // 5. Success banner visible
    await expect(page.locator('.mini-canvas-success')).toBeVisible();
    await expect(page.locator('.mini-canvas-success')).toContainText(/correct/i);

    // 6. Next chapter button enabled
    const nextBtn = page.locator('button:has-text("Next"), .chapter-next-btn');
    await expect(nextBtn).toBeEnabled();
  });

  test('AC-5 proxy: incorrect submission shows red feedback', async ({ page }) => {
    // Do NOT draw any wire — submit immediately
    await page.click('button:has-text("Submit")');
    await expect(page.locator('.mini-canvas-error, .mini-canvas-feedback')).toBeVisible();
    await expect(page.locator('.mini-canvas-error, .mini-canvas-feedback')).toContainText(/not quite|incorrect|check/i);
    // Next button should remain disabled
    const nextBtn = page.locator('button:has-text("Next"), .chapter-next-btn');
    await expect(nextBtn).toBeDisabled();
  });
});
```

---

## AC coverage (this task)

| AC | What this task does |
|---|---|
| AC-10 | Playwright spec covers open overlay → ch01 → draw wire → Submit → green success + Next enabled |

AC-5 is additionally verified in the second test case as a proxy check for the red-feedback path.

---

## Testing gate

- E2E (Playwright): `npm run test:e2e` must pass with `tests/e2e/learning-interactive.spec.js` included.
- No new Vitest unit tests from this task.

```bash
npm run lint:all
npm run test:e2e
```

Both must pass with 0 failures.

---

## Merge checklist

- [ ] AC-10 verified: `npm run test:e2e` passes; `learning-interactive.spec.js` green
- [ ] Both test cases pass: correct-wire success path AND no-wire failure path
- [ ] Selectors are stable (data attributes, not pixel coordinates)
- [ ] No hardcoded pixel clicks (`page.mouse.click(x, y)`) — use locator-based clicks only
- [ ] `npm run lint:all` — 0 errors
- [ ] Workboard row released on merge

---

## Notes

- T07b must expose `data-node-id`, `data-port-role`, and `data-port-name` attributes on port elements. If it does not, flag T07b as incomplete and block this task.
- The chapter 1 exercise details (which node is "n1", which port is unwired) come from `exercises[0]` in `src/ui/learning-exercises.js`. Read that file to confirm node IDs and port names before writing the selectors.
- Do not use `page.waitForTimeout()` — use `expect(...).toBeVisible()` and Playwright's auto-waiting instead.
- The spec is allowed to have `test.slow()` if the learning overlay animation takes time to open.
