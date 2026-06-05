import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Nova E2E tests.
 *
 * The dev server is started automatically via `webServer` so the tests can
 * run with a single `npm run test:e2e` command (no separate terminal needed).
 * In CI the dev server is also started this way before the test runner begins.
 *
 * Local legacy runner: scripts/run-e2e.cjs (uses playwright.config.cjs on
 * port 19191) is still available but is not the canonical entry point.
 */
export default defineConfig({
  testDir: './tests/e2e',

  /** Maximum time per test (30 seconds). */
  timeout: 30000,

  /** Assertion timeout inside a test. */
  expect: {
    timeout: 5000,
  },

  /** Re-run flaky tests once before failing. */
  retries: process.env.CI ? 1 : 0,

  /** Fail fast in CI; run all locally to surface all failures. */
  forbidOnly: !!process.env.CI,

  use: {
    /** Base URL used by page.goto('/'). */
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * Start the Vite dev server before the test run and stop it when done.
   * Skipped when a server is already listening on the port (e.g. manual dev).
   */
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
