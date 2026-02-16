import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx ng serve --host 127.0.0.1 --port 4200',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      testMatch: '**/*.desktop.spec.ts',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'chromium-mobile',
      testMatch: '**/*.mobile.spec.ts',
      use: { ...devices['Pixel 7'] }
    },
  ],
});
