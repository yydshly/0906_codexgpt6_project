import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ready, digest, draw } from './helpers';
import { loadedPlan, completed, experimentDigest, experimentPng, storedDraft } from './e1-helpers';
import { Painting } from '../src/painting/engine';
import { executeStroke, MAX_STROKES, STAGES } from '../src/experiment/plan';
import type { StrokePlan } from '../src/experiment/plan';
import { relative } from 'node:path';

const root = process.env.M1_ARTIFACT_DIR || 'artifacts/e1/refinement/local';
for (const sample of ['landscape', 'still-life', 'complex']) test(`E1-C fixed ${sample}: real strokes, every phase, video and exact independent replay`, async ({ page }, info) => {
  const dir = `${root}/${sample}`; mkdirSync(dir, { recursive: true }); await ready(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const requests: string[] = []; page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5174') && !/^(blob:|data:)/.test(request.url())) requests.push(request.url()); });
  const before = await digest(page);
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles(`artifacts/e1/fixtures/${sample}.jpg`);
  const speed = process.env.E1_EVIDENCE_SPEED || '1';
  await page.getByLabel('播放速度', { exact: true }).selectOption(speed);
  await expect(page.getByRole('button', { name: '确认构图，准备笔与颜色' })).toBeEnabled();
  await page.screenshot({ path: `${dir}/composition.png` });
  const heap = await page.context().newCDPSession(page); await heap.send('HeapProfiler.collectGarbage');
  const heapBefore = await heap.send('Runtime.getHeapUsage');
  await page.evaluate(() => {
    const w = window as any; w.__e1Stage = -1; w.__e1LongTasks = []; w.__e1StageTimes = []; w.__e1Start = performance.now();
    w.__e1Observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) w.__e1LongTasks.push({ start: entry.startTime, duration: entry.duration }); }); w.__e1Observer.observe({ entryTypes: ['longtask'] });
  });
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click(); await loadedPlan(page);
  await page.evaluate(() => { window.__experiment!.player!.onStage = stage => { window.__experiment!.player!.pause(); (window as any).__e1Stage = stage; (window as any).__e1StageTimes.push({ stage, elapsed: performance.now() - (window as any).__e1Start }); }; });
  const stageStates = [];
  for (let stage = 0; stage < STAGES.length; stage++) {
    await page.waitForFunction(n => (window as any).__e1Stage === n, stage, { timeout: 600000 });
    stageStates.push(await experimentDigest(page));
    await experimentPng(page, `${dir}/stage-${stage + 1}.png`);
    await page.screenshot({ path: `${dir}/stage-${stage + 1}-page.png` });
    if (stage < STAGES.length - 1) await page.getByRole('button', { name: '继续绘制', exact: true }).click();
  }
  const final = await experimentDigest(page);
  // Capture the final clean-up and return to the rack as part of the real process.
  if (await page.evaluate(() => window.__experiment!.player!.state !== 'complete')) {
    await page.getByRole('button', { name: '继续绘制', exact: true }).click(); await completed(page);
    expect(await experimentDigest(page)).toEqual(final);
    expect(await page.evaluate(() => window.__experiment!.player!.heldBrushId)).toBeNull();
  }
  const plan: StrokePlan = await page.evaluate(() => window.__experiment!.plan!);
  const inputHash = createHash('sha256').update(readFileSync(`artifacts/e1/fixtures/${sample}.jpg`)).digest('hex');
  expect(plan.inputHash).toBe(inputHash); expect(plan.strokes.length).toBeLessThanOrEqual(MAX_STROKES);
  for (const [i, stroke] of plan.strokes.entries()) { expect(stroke.order).toBe(i); expect(stroke.path.length).toBeLessThanOrEqual(7); expect(stroke.brush.mode).toBe('cover'); }
  writeFileSync(`${dir}/plan.json`, JSON.stringify(plan));
  writeFileSync(`${dir}/input.json`, JSON.stringify({ file: relative(dir, `artifacts/e1/fixtures/${sample}.jpg`).replaceAll('\\', '/'), inputHash, composition: plan.composition, plannerVersion: plan.plannerVersion, seed: plan.seed, canvasSeed: 906, brushVersion: plan.brushVersion, analysisSize: plan.analysisSize }, null, 2));
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出实验 PNG', exact: true }).click();
  await (await download).saveAs(`${dir}/final.png`);
  expect(readFileSync(`${dir}/final.png`).equals(readFileSync(`${dir}/stage-${STAGES.length}.png`))).toBe(true);
  await page.locator('.experiment-reference').evaluate(element => (element as HTMLElement).style.visibility = 'hidden');
  const noReference = await experimentPng(page, `${dir}/without-reference.png`);
  expect(noReference.equals(readFileSync(`${dir}/final.png`))).toBe(true);
  await page.screenshot({ path: `${dir}/reference-hidden.png` });
  // Independent CPU replay consumes ONLY the serialized plan, with no input image.
  const cpu = new Painting(false), start = performance.now();
  for (const stroke of plan.strokes) executeStroke(cpu, stroke);
  const independent = { color: createHash('sha256').update(cpu.color).digest('hex'), height: createHash('sha256').update(new Uint8Array(cpu.height.buffer)).digest('hex') };
  const replayMs = performance.now() - start; expect(independent).toEqual(final);
  const prior = JSON.parse(readFileSync(`artifacts/e1/refinement/c/${sample}/results.json`, 'utf8')).final;
  // New finite colors intentionally differ; never re-label the old exact-PNG check as passed.
  // The independent serialized-plan color/height oracle above remains mandatory.
  if (!plan.materials) expect(final).toEqual(prior);
  else writeFileSync(`${dir}/prior-comparison.json`, JSON.stringify({ prior, current: final, identical: JSON.stringify(final) === JSON.stringify(prior), reason: 'Prepared palette changes actual colors and planner error feedback; human quality remains pending' }, null, 2));
  expect(await digest(page)).toEqual(before); expect(errors).toEqual([]); expect(requests).toEqual([]);
  const diagnostics = await page.evaluate(() => {
    const e = window.__experiment!, w = window as any; w.__e1Observer.disconnect();
    return { planningMs: e.planningMs, metrics: e.player!.metrics, memory: e.painting.memory(), renderer: e.renderer.info(), stages: w.__e1StageTimes, longTasks: w.__e1LongTasks, userAgent: navigator.userAgent };
  });
  const heapAfter = await heap.send('Runtime.getHeapUsage');
  const batches = [...diagnostics.metrics.batches].sort((a, b) => a - b), p95 = batches[Math.floor(batches.length * .95)];
  expect(p95).toBeLessThanOrEqual(50);
  let continuous = 0, maxContinuous = 0;
  for (const value of diagnostics.metrics.batches) { continuous = value > 100 ? continuous + 1 : 0; maxContinuous = Math.max(continuous, maxContinuous); }
  expect(maxContinuous).toBeLessThan(3); expect(diagnostics.metrics.maxConsecutiveOver100).toBeLessThan(3); expect(cpu.memory().historyCount).toBe(0);
  const report = { status: '通过', sample, speed: +speed, processMetrics: plan.processMetrics, previousFinal: prior, strokeCount: plan.strokes.length, final, independent, stageStates, replayMs, p95BatchMs: p95, maxContinuousOver100ms: maxContinuous, heapBefore, heapAfter, errors, externalRequests: requests, ...diagnostics, humanQuality: '待用户确认', heapNote: 'CDP page isolate heap excludes planner worker, GPU and some native image buffers; not a whole-process memory claim' };
  writeFileSync(`${dir}/results.json`, JSON.stringify(report, null, 2));
  await info.attach('summary', { body: JSON.stringify({ sample, strokeCount: plan.strokes.length, final, p95BatchMs: p95 }), contentType: 'application/json' });
  const video = page.video(); await page.close(); if (video) await video.saveAs(`${dir}/process.webm`);
});

test('E1-C runtime failures, PNG input, reproducible planner and released experimental state', async ({ page }) => {
  const dir = `${root}/lifecycle`; mkdirSync(dir, { recursive: true }); await ready(page);
  const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage');
  const baseline = await cdp.send('Runtime.getHeapUsage');
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  const upload = page.getByLabel('选择本地图片', { exact: true });
  await upload.setInputFiles('artifacts/e1/fixtures/landscape.jpg');
  await expect(page.getByRole('button', { name: '确认构图，准备笔与颜色' })).toBeEnabled();
  await page.evaluate(() => { const w = window as any; w.__Worker = Worker; w.Worker = class extends Worker { constructor(url: string | URL, options?: WorkerOptions) { if (String(url).includes('planner.worker')) throw new Error('Injected worker construction failure'); super(url, options); } }; });
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click();
  await expect(page.getByText('后台规划不可用，请使用支持 Worker 的浏览器或重试。')).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.Worker = w.__Worker; delete w.__Worker; });
  await page.evaluate(() => { const w = window as any; w.__setTimeout = window.setTimeout; w.setTimeout = (handler: TimerHandler, timeout: number, ...args: unknown[]) => w.__setTimeout(handler, timeout === 120000 ? 50 : timeout, ...args); });
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click();
  await expect(page.getByText('规划超过 120 秒，已停止。请缩小或简化图片后重试。')).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.setTimeout = w.__setTimeout; delete w.__setTimeout; });
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click(); await loadedPlan(page);
  await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  const firstPlan = await page.evaluate(() => JSON.stringify(window.__experiment!.plan));
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click();
  await page.getByRole('button', { name: '确认替换实验画作', exact: true }).click(); await loadedPlan(page);
  await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify(window.__experiment!.plan))).toBe(firstPlan);
  const prior = await experimentDigest(page);
  // Browser WebGL loss switches only the material display; CPU artwork remains exact.
  await page.evaluate(() => window.__experiment!.renderer.gl!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByText('正在使用简化画布显示，局部材质光照暂不可用。')).toBeVisible();
  expect(await experimentDigest(page)).toEqual(prior);
  await experimentPng(page, `${dir}/fallback.png`);
  await page.getByRole('button', { name: '继续绘制', exact: true }).click();
  await page.getByRole('button', { name: '返回画室', exact: true }).click();
  await page.evaluate(() => { (window as any).__oldPlayer = window.__experiment!.player; });
  const stoppedIndex = await page.evaluate(() => (window as any).__oldPlayer.index);
  await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
  await page.waitForTimeout(500); expect(await page.evaluate(() => (window as any).__oldPlayer.index)).toBe(stoppedIndex);
  await page.evaluate(() => { delete (window as any).__oldPlayer; });
  // This tiny synthetic PNG is format/race coverage only, never a quality sample.
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 16; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#c95139'; ctx.fillRect(0, 0, 16, 16); ctx.fillStyle = '#3155a6'; ctx.fillRect(16, 0, 16, 16); return canvas.toDataURL('image/png').split(',')[1]; });
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
    await upload.setInputFiles({ name: 'format-only.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.getByRole('button', { name: '确认构图，准备笔与颜色' })).toBeEnabled();
    if (i === 0) {
      await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click(); await loadedPlan(page);
      await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
      expect(await page.evaluate(() => window.__experiment!.plan!.inputHash)).toBe(createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex'));
    }
    await page.evaluate(() => { (window as any).__oldGL = window.__experiment!.renderer.gl; });
    await page.getByRole('button', { name: '返回画室', exact: true }).click(); await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
    await page.waitForFunction(() => (window as any).__oldGL.isContextLost());
    expect(await page.evaluate(() => window.__studio!.renderer.mode)).toBe('webgl2');
    await page.evaluate(() => { delete (window as any).__oldGL; });
  }
  await cdp.send('HeapProfiler.collectGarbage'); const after = await cdp.send('Runtime.getHeapUsage');
  expect(after.usedSize - baseline.usedSize).toBeLessThan(24 * 1024 * 1024);
  expect(await page.evaluate(() => window.__experiment)).toBeUndefined();
  writeFileSync(`${dir}/results.json`, JSON.stringify({ status: '通过', baseline, after, stoppedIndex, planHash: createHash('sha256').update(firstPlan).digest('hex'), checks: ['Worker unavailable actionable', 'planning timeout via injected 50ms clock for configured 120s deadline', 'same input yields identical full plan', 'context loss preserves exact CPU arrays and PNG available', 'exit during playback stops old player', 'valid PNG decode and planning', 'five source load/exit cycles release state', 'page heap growth <24MiB; excludes GPU/native/worker'] }, null, 2));
  const video = page.video(); await page.close(); if (video) await video.saveAs(`${dir}/process.webm`);
});

test('E1-C late image decode cannot overwrite a newer selection', async ({ page }) => {
  const dir = `${root}/decode-race`; mkdirSync(dir, { recursive: true }); await ready(page);
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.evaluate(() => {
    const w = window as any, original = window.createImageBitmap.bind(window); w.__decodeOriginal = original;
    let delayed = false;
    w.createImageBitmap = async (input: ImageBitmapSource, options?: ImageBitmapOptions) => {
      if (input instanceof Blob && !delayed) { delayed = true; w.__decodeWaiting = true; await new Promise(resolve => setTimeout(resolve, 800)); }
      return original(input, options);
    };
  });
  const upload = page.getByLabel('选择本地图片', { exact: true });
  await upload.setInputFiles('artifacts/e1/fixtures/landscape.jpg'); await page.waitForFunction(() => (window as any).__decodeWaiting);
  await upload.setInputFiles('artifacts/e1/fixtures/complex.jpg');
  await expect(page.getByRole('button', { name: '确认构图，准备笔与颜色' })).toBeEnabled();
  await page.waitForTimeout(1000); await expect(page.getByText('complex.jpg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click(); await loadedPlan(page);
  await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  const inputHash = await page.evaluate(() => window.__experiment!.plan!.inputHash);
  expect(inputHash).toBe(createHash('sha256').update(readFileSync('artifacts/e1/fixtures/complex.jpg')).digest('hex'));
  await page.evaluate(() => { const w = window as any; w.createImageBitmap = w.__decodeOriginal; delete w.__decodeOriginal; delete w.__decodeWaiting; });
  await page.getByRole('button', { name: '返回画室', exact: true }).click(); await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
  writeFileSync(`${dir}/results.json`, JSON.stringify({ status: '通过', inputHash, delayedFirstImageMs: 800, newestSelection: 'complex.jpg' }, null, 2));
});

test('E1-C invalid, oversized, cancellation, replacement and exit never change M2', async ({ page }) => {
  mkdirSync(`${root}/errors`, { recursive: true }); await ready(page);
  await draw(page, [{ x: 100, y: 450 }, { x: 800, y: 480 }]);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
  const original = await digest(page), record = await storedDraft(page);
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  const upload = page.getByLabel('选择本地图片', { exact: true });
  await upload.setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('status').filter({ hasText: '无法读取图片' })).toBeVisible();
  await upload.setInputFiles({ name: 'large.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(12 * 1024 * 1024 + 1) });
  await expect(page.getByText('图片超过 12 MB，请先缩小文件。')).toBeVisible();
  const huge = Buffer.alloc(24); huge.writeUInt32BE(0x89504e47); huge.writeUInt32BE(0x0d0a1a0a, 4); huge.writeUInt32BE(0x49484452, 12); huge.writeUInt32BE(100000, 16); huge.writeUInt32BE(100000, 20);
  await upload.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: huge });
  await expect(page.getByText('图片尺寸过大：最多 1200 万像素，单边不超过 8192。')).toBeVisible();
  huge.writeUInt32BE(100, 16); huge.writeUInt32BE(100, 20);
  await upload.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: huge });
  await expect(page.getByText('图片解码失败。当前实验画作已保留，请选择另一张 PNG 或 JPEG。')).toBeVisible();
  await upload.setInputFiles('artifacts/e1/fixtures/landscape.jpg'); await expect(page.getByRole('button', { name: '确认构图，准备笔与颜色' })).toBeEnabled();
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click();
  await page.getByRole('button', { name: '取消处理', exact: true }).click();
  const cancelState = await experimentDigest(page); await page.waitForTimeout(7000); expect(await experimentDigest(page)).toEqual(cancelState);
  expect(await page.evaluate(() => window.__experiment!.player)).toBeNull();
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click(); await loadedPlan(page);
  await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  const partial = await experimentDigest(page);
  await upload.setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('bad') });
  await page.getByRole('button', { name: '确认替换实验画作', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '无法读取图片' })).toBeVisible(); expect(await experimentDigest(page)).toEqual(partial);
  await upload.setInputFiles('artifacts/e1/fixtures/complex.jpg'); await page.getByRole('button', { name: '确认替换实验画作', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认构图，准备笔与颜色' })).toBeEnabled();
  const replaced = await experimentDigest(page); await page.waitForTimeout(500); expect(await experimentDigest(page)).toEqual(replaced);
  expect(await page.evaluate(() => window.__experiment!.painting.color.some(Boolean))).toBe(false);
  await page.getByRole('button', { name: '确认构图，准备笔与颜色' }).click();
  await page.getByRole('button', { name: '返回画室', exact: true }).click(); await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
  await page.waitForTimeout(7000); expect(await digest(page)).toEqual(original); expect(await storedDraft(page)).toEqual(record);
  await page.screenshot({ path: `${root}/errors/m2-preserved.png` });
  writeFileSync(`${root}/errors/results.json`, JSON.stringify({ status: '通过', original, record, cancelState, partial, replaced, checks: ['invalid magic', 'file size limit', 'predecode dimensions', 'decode rejection', 'worker cancellation late response', 'invalid replacement preserves partial result', 'valid replacement cancels old player', 'exit during planning preserves M2'] }, null, 2));
  const video = page.video(); await page.close(); if (video) await video.saveAs(`${root}/errors/process.webm`);
});
