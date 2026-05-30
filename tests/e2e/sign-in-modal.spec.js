const { test, expect } = require('@playwright/test');

// Verifies the sign-in modal actually renders on screen: the Google option,
// the email/password form, and the sign-in/create-account toggle. Runs against
// the vite dev server, which now mounts the auth API — so /api/auth/config
// returns the configured googleClientId and the Google button is shown.
//
// Requires GOOGLE_CLIENT_ID in the server env (the run-e2e harness inherits it)
// for the Google assertions; without it only the email/password half renders.

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized);
}

test.describe('sign-in modal', () => {
  test('opens from the Sign in button and shows Google + email/password', async ({ page }) => {
    await waitForApp(page);

    // Fresh context → no session → the account area shows a "Sign in" button.
    const signInBtn = page.locator('#account-area .account-signin');
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();

    const overlay = page.locator('#signin-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.signin-title')).toHaveText(/Welcome to Nova/i);

    // Email + password form is present.
    await expect(page.locator('#signin-email')).toBeVisible();
    await expect(page.locator('#signin-password')).toBeVisible();
    await expect(page.locator('#signin-submit')).toBeVisible();

    // Google option is rendered ONLY when a client id is configured (the server
    // env has GOOGLE_CLIENT_ID). CI doesn't set it, so gate the assertion on the
    // live config to keep the test green in both cases.
    const cfg = await page.evaluate(() => fetch('/api/auth/config').then(r => r.json()).catch(() => ({})));
    if (cfg.googleClientId) {
      await expect(page.locator('#signin-google')).toBeVisible();
      await expect(page.locator('#signin-overlay .signin-divider')).toBeVisible();
    }

    await page.screenshot({ path: 'tests/e2e/__artifacts__/signin-login.png', fullPage: false });

    // Toggle to "Create account" → the Name field appears and the button label
    // changes.
    await page.getByRole('button', { name: /Create an account/i }).click();
    await expect(page.locator('#signin-name-field')).toBeVisible();
    await expect(page.locator('#signin-name')).toBeVisible();
    await expect(page.locator('#signin-submit')).toHaveText(/Create account/i);

    await page.screenshot({ path: 'tests/e2e/__artifacts__/signin-create.png', fullPage: false });
  });
});
