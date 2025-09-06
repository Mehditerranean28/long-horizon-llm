import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  webServer: {
    command: 'npm run dev',
    port: 9002,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:9002',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
