import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5175',
    // The locally installed Google Chrome; no browser download needed.
    channel: 'chrome',
    viewport: { width: 375, height: 812 }
  },
  webServer: {
    command: 'npm run dev -- --port 5175',
    port: 5175,
    reuseExistingServer: true
  }
});
