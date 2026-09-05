import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 120000,
  reporter: [['list'], ['json', { outputFile: `${process.env.M1_ARTIFACT_DIR || 'artifacts/m1'}/${(process.env.npm_lifecycle_event || 'tests').replace(':','-')}-results.json` }]],
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 900 }, channel: 'chrome', headless: false, launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] } },
  projects: [
    { name: 'engine', testMatch: 'engine.spec.ts' },
    { name: 'studio', testMatch: 'studio.spec.ts', use: { video: { mode: 'on', size: { width: 1440, height: 900 } }, screenshot: 'only-on-failure' } },
    { name: 'performance', testMatch: 'performance.spec.ts', use: { video: 'off', screenshot: 'off' }, timeout: 360000 },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: true, timeout: 30000 },
});
