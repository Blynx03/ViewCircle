import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './layout', testMatch: '**/*.spec.ts', fullyParallel: true, workers: 2,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:5178' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } }, { name: 'webkit', use: { browserName: 'webkit' } }, { name: 'firefox', testMatch: /(?:chat|stabilization)\.spec\.ts$/, use: { browserName: 'firefox' } }],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5178', url: 'http://127.0.0.1:5178', reuseExistingServer: false }
});
