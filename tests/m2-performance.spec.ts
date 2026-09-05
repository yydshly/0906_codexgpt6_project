import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, settings, settle } from './helpers';
const artifact = process.env.M1_ARTIFACT_DIR || 'artifacts/m2/performance';

test('60 seconds of real pointer drawing and autosave pauses with bounded snapshots', async ({ page }) => {
  mkdirSync(artifact, { recursive: true }); await ready(page);
  await page.evaluate(() => {
    const s = window.__studio!;
    for (let n = 0; n < 20; n++) { s.painting.begin({ x: 180, y: 200 + n * 25 }, { color: n % 2 ? '#3155A6' : '#EBC43C', size: 96, load: .5, mode: 'mix', seed: 906 }); s.painting.move({ x: 840, y: 200 + n * 25 }); s.painting.end(); }
    s.refresh();
  });
  await settings(page, { color: '#3155A6', size: 96, load: .5, mode: 'mix', seed: 906 });
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 }); await settle(page);
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.collectGarbage');
  const beforeHeap = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')?.value;
  const before = await page.evaluate(() => ({ ...window.__studio!.draft.metrics }));
  const box = (await page.getByTestId('painting-surface').boundingBox())!;
  await page.evaluate(() => {
    const data = { frames: [] as number[], last: 0, running: true, events: 0 }; (window as any).__m2Perf = data;
    const frame = (now: number) => { if (data.last) data.frames.push(now - data.last); data.last = now; if (data.running) requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    document.querySelector('[data-testid=painting-surface]')!.addEventListener('pointermove', () => data.events++);
  });
  const started = Date.now(); let sent = 0;
  const moveFor = async (duration: number) => {
    const start = Date.now();
    while (Date.now() - start < duration) { const t = (Date.now() - started) / 1000; await page.mouse.move(box.x + box.width * (.5 + .32 * Math.sin(t * 1.2)), box.y + box.height * (.5 + .22 * Math.sin(t * .83))); sent++; await new Promise(r => setTimeout(r, 8)); }
  };
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await page.mouse.down();
  await moveFor(30000);
  const held = await page.evaluate(() => ({ ...window.__studio!.draft.metrics }));
  expect(held.snapshots).toBe(before.snapshots); expect(held.writes).toBe(before.writes);
  await page.mouse.up(); await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
  // Five further strokes with real idle windows for automatic persistence.
  for (let n = 0; n < 5; n++) { await page.mouse.down(); await moveFor(4600); await page.mouse.up(); await page.waitForTimeout(1250); }
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
  const durationMs = Date.now() - started;
  const result = await page.evaluate(() => {
    const data = (window as any).__m2Perf; data.running = false;
    const frames = (data.frames as number[]).slice().sort((a, b) => a - b), s = window.__studio!;
    return { averageFps: frames.length / (frames.reduce((a, b) => a + b, 0) / 1000), p95FrameMs: frames[Math.ceil(frames.length * .95) - 1], maxFrameMs: frames.at(-1), framesOver50ms: frames.filter(v => v > 50).length, receivedMoveEvents: data.events, draft: { ...s.draft.metrics }, painting: s.painting.memory(), active: s.painting.active, environment: s.renderer.info() };
  });
  await cdp.send('HeapProfiler.collectGarbage'); const afterHeap = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')?.value;
  const snapshots = result.draft.snapshots - before.snapshots, writes = result.draft.writes - before.writes;
  const evidence = { status: result.averageFps >= 30 && result.p95FrameMs <= 50 && snapshots <= 6 && writes >= 6 ? '通过' : '未通过', durationMs, sent, ...result, snapshotsDuringMeasurement: snapshots, writesDuringMeasurement: writes, snapshotsDuringFirst30sHeldStroke: held.snapshots - before.snapshots, beforeHeap, afterHeap, method: 'headed Chrome, no video; Playwright mouse -> Pointer Events -> original engine/WebGL; 20-entry initial history; 30s held stroke + five 4.6s strokes with 1.25s saving pauses. rAF timing is not hardware input latency; heap excludes driver and external buffers.' };
  writeFileSync(`${artifact}/autosave-performance.json`, JSON.stringify(evidence, null, 2));
  expect.soft(result.averageFps).toBeGreaterThanOrEqual(30); expect.soft(result.p95FrameMs).toBeLessThanOrEqual(50);
  expect(result.draft.capturesDuringStroke).toBe(0); expect(snapshots).toBe(6); expect(writes).toBe(6);
  expect(result.painting.historyCount).toBe(20); expect(result.painting.historyBytes).toBe(120 * 1024 * 1024); expect(result.active).toBe(false);
});
