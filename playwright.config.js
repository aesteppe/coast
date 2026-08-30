/**
 * Browser tests run against the static app served by the same command the
 * README documents. Every external service is mocked inside the tests, so
 * the suite is deterministic and sends no traffic to the public APIs.
 *
 * CHROMIUM_PATH overrides the browser binary for environments that ship
 * their own Chromium instead of downloading Playwright's.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    ...(process.env.CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
      : {})
  },
  webServer: {
    command: 'python3 -m http.server 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
