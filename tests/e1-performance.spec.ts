import { test, expect } from '@playwright/test';
import { ready } from './helpers';
import { loadedPlan, completed } from './e1-helpers';
import { mkdirSync, writeFileSync } from 'node:fs';

test('continuous fixed complex scene without screenshot or encoding interference', async ({ page }) => {
  const root = process.env.M1_ARTIFACT_DIR || 'artifacts/e1/refinement/local'; mkdirSync(root, { recursive: true });
  await ready(page); await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles('artifacts/e1/fixtures/complex.jpg');
  const speed = +(process.env.E1_EVIDENCE_SPEED || 1);
  await page.getByLabel('播放速度', { exact: true }).selectOption(String(speed));
  await expect(page.getByRole('button', { name: '确认构图，准备笔与颜色' })).toBeEnabled();
  await page.evaluate(() => {
    const w = window as any; w.__frames = []; w.__longTasks = []; w.__previous = 0; w.__start = performance.now(); w.__measuring = true;
    const frame = (time: number) => { if (!w.__measuring) return; if (w.__previous) w.__frames.push({ gap: time - w.__previous, phase: window.__experiment!.player ? 'playback' : 'planning', visible: document.visibilityState, focused: document.hasFocus() }); w.__previous = time; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    w.__observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) w.__longTasks.push({ start: entry.startTime, duration: entry.duration }); }); w.__observer.observe({ entryTypes: ['longtask'] });
  });
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click(); await loadedPlan(page); await completed(page);
  const data = await page.evaluate(() => { const w = window as any, e = window.__experiment!; w.__measuring = false; w.__observer.disconnect(); return { frames: w.__frames as { gap: number; phase: string }[], longTasks: w.__longTasks, wallMs: performance.now() - w.__start, planningMs: e.planningMs, strokes: e.plan!.strokes.length, metrics: e.player!.metrics, renderer: e.renderer.info() }; });
  const summary = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return { count: sorted.length, p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1), over100ms: values.filter(v => v > 100).length }; };
  const batches = summary(data.metrics.batches), planningFrames = summary(data.frames.filter(f => f.phase === 'planning').map(f => f.gap)), playbackFrames = summary(data.frames.filter(f => f.phase === 'playback').map(f => f.gap));
  expect(batches.p95).toBeLessThanOrEqual(50);
  expect(data.metrics.maxConsecutiveOver100).toBeLessThan(3);
  writeFileSync(`${root}/continuous.json`, JSON.stringify({ status: '通过', fixture: 'complex.jpg', composition: 'contain', speed, recording: false, screenshots: false, exportDuringMeasurement: false, batches, planningFrames, playbackFrames, ...data, note: 'rAF intervals are scheduling observations, not input latency or human hand-feel. Batch p95 uses at most the first 20000 batches; total/max/consecutive aggregates cover the entire run.' }, null, 2));
});
