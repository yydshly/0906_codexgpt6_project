import { defineConfig } from '@playwright/test';
const e1Run = (process.env.npm_lifecycle_event || '').startsWith('test:e1') || process.argv.some(arg => arg.startsWith('--project=e1'));
const reportDirectory = process.env.M1_ARTIFACT_DIR || (e1Run ? 'artifacts/e1/refinement/local' : 'artifacts/m2/regression');
export default defineConfig({
  // Independent verification runs must never clean another run's active video.
  outputDir: `${reportDirectory}/.runtime`,
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 120000,
  reporter: [['list'], ['json', { outputFile: `${reportDirectory}/${(process.env.npm_lifecycle_event || 'tests').replace(':','-')}-results.json` }]],
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 900 }, channel: 'chrome', headless: false, launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] } },
  projects: [
    { name: 'e1-quality', testMatch: 'e1-quality.spec.ts', timeout: 240000, use: { video: 'off' } },
    { name: 'e1-quality-ui', testMatch: 'e1-quality-ui.spec.ts', timeout: 1500000, use: { video: { mode: 'on', size: { width: 1440, height: 900 } } } },
    { name: 'e1-engine', testMatch: ['e1-engine.spec.ts', 'e1-materials-engine.spec.ts', 'e1-structure-engine.spec.ts', 'e1-quality-engine.spec.ts'] },
    { name: 'e1-performance', testMatch: 'e1-performance.spec.ts', timeout: 1500000, use: { video: 'off', screenshot: 'off' } },
    { name: 'e1', testMatch: ['e1.spec.ts', 'e1-evidence.spec.ts', 'e1-refinement.spec.ts', 'e1-brush-process.spec.ts', 'e1-prepared.spec.ts', 'e1-structure.spec.ts'], timeout: 1800000, use: { video: { mode: 'on', size: { width: 1440, height: 900 } }, screenshot: 'only-on-failure' } },
    { name: 'engine', testMatch: 'engine.spec.ts' },
    { name: 'studio', testMatch: 'studio.spec.ts', use: { video: { mode: 'on', size: { width: 1440, height: 900 } }, screenshot: 'only-on-failure' } },
    { name: 'm2', testMatch: 'm2.spec.ts', use: { video: { mode: 'on', size: { width: 1440, height: 900 } }, screenshot: 'only-on-failure' } },
    { name: 'm2-performance', testMatch: 'm2-performance.spec.ts', use: { video: 'off', screenshot: 'off' }, timeout: 180000 },
    { name: 'performance', testMatch: 'performance.spec.ts', use: { video: 'off', screenshot: 'off' }, timeout: 360000 },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: true, timeout: 30000 },
});
