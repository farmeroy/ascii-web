import { defineConfig, devices } from '@playwright/test';

const ci = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: ci,
  // a retried test still shows as "flaky" in the report, so flakiness isn't hidden
  retries: ci ? 1 : 0,
  // on CI: failures annotated on the run, plus a report to upload
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm exec vite',
    url: 'http://localhost:4173/tests/fixtures/index.html',
    reuseExistingServer: !ci,
  },
});
