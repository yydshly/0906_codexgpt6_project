# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e1-evidence.spec.ts >> E1-C fixed still-life: real strokes, every phase, video and exact independent replay
- Location: tests\e1-evidence.spec.ts:12:62

# Error details

```
Error: video.saveAs: ENOENT: no such file or directory, copyfile 'E:\0906_codexgpt6_project\test-results\.playwright-artifacts-0\page@a2c7706cebfe59b702208917447b65f8.webm' -> 'E:\0906_codexgpt6_project\artifacts\e1\brush-process\c\still-life\process.webm'
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
  3   | import { createHash } from 'node:crypto';
  4   | import { ready, digest, draw } from './helpers';
  5   | import { loadedPlan, experimentDigest, experimentPng, storedDraft } from './e1-helpers';
  6   | import { Painting } from '../src/painting/engine';
  7   | import { executeStroke, MAX_STROKES, STAGES } from '../src/experiment/plan';
  8   | import type { StrokePlan } from '../src/experiment/plan';
  9   | import { relative } from 'node:path';
  10  | 
  11  | const root = process.env.M1_ARTIFACT_DIR || 'artifacts/e1/refinement/local';
  12  | for (const sample of ['landscape', 'still-life', 'complex']) test(`E1-C fixed ${sample}: real strokes, every phase, video and exact independent replay`, async ({ page }, info) => {
  13  |   const dir = `${root}/${sample}`; mkdirSync(dir, { recursive: true }); await ready(page);
  14  |   const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  15  |   const requests: string[] = []; page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5174') && !/^(blob:|data:)/.test(request.url())) requests.push(request.url()); });
  16  |   const before = await digest(page);
  17  |   await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  18  |   await page.getByLabel('选择本地图片', { exact: true }).setInputFiles(`artifacts/e1/fixtures/${sample}.jpg`);
  19  |   const speed = process.env.E1_EVIDENCE_SPEED || '1';
  20  |   await page.getByLabel('播放速度', { exact: true }).selectOption(speed);
  21  |   await expect(page.getByRole('button', { name: '确认构图并绘制' })).toBeEnabled();
  22  |   await page.screenshot({ path: `${dir}/composition.png` });
  23  |   const heap = await page.context().newCDPSession(page); await heap.send('HeapProfiler.collectGarbage');
  24  |   const heapBefore = await heap.send('Runtime.getHeapUsage');
  25  |   await page.evaluate(() => {
  26  |     const w = window as any; w.__e1Stage = -1; w.__e1LongTasks = []; w.__e1StageTimes = []; w.__e1Start = performance.now();
  27  |     w.__e1Observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) w.__e1LongTasks.push({ start: entry.startTime, duration: entry.duration }); }); w.__e1Observer.observe({ entryTypes: ['longtask'] });
  28  |   });
  29  |   await page.getByRole('button', { name: '确认构图并绘制' }).click(); await loadedPlan(page);
  30  |   await page.evaluate(() => { window.__experiment!.player!.onStage = stage => { window.__experiment!.player!.pause(); (window as any).__e1Stage = stage; (window as any).__e1StageTimes.push({ stage, elapsed: performance.now() - (window as any).__e1Start }); }; });
  31  |   const stageStates = [];
  32  |   for (let stage = 0; stage < STAGES.length; stage++) {
  33  |     await page.waitForFunction(n => (window as any).__e1Stage === n, stage, { timeout: 600000 });
  34  |     stageStates.push(await experimentDigest(page));
  35  |     await experimentPng(page, `${dir}/stage-${stage + 1}.png`);
  36  |     await page.screenshot({ path: `${dir}/stage-${stage + 1}-page.png` });
  37  |     if (stage < STAGES.length - 1) await page.getByRole('button', { name: '继续绘制', exact: true }).click();
  38  |   }
  39  |   const final = await experimentDigest(page);
  40  |   const plan: StrokePlan = await page.evaluate(() => window.__experiment!.plan!);
  41  |   const inputHash = createHash('sha256').update(readFileSync(`artifacts/e1/fixtures/${sample}.jpg`)).digest('hex');
  42  |   expect(plan.inputHash).toBe(inputHash); expect(plan.strokes.length).toBeLessThanOrEqual(MAX_STROKES);
  43  |   for (const [i, stroke] of plan.strokes.entries()) { expect(stroke.order).toBe(i); expect(stroke.path.length).toBeLessThanOrEqual(7); expect(stroke.brush.mode).toBe('cover'); }
  44  |   writeFileSync(`${dir}/plan.json`, JSON.stringify(plan));
  45  |   writeFileSync(`${dir}/input.json`, JSON.stringify({ file: relative(dir, `artifacts/e1/fixtures/${sample}.jpg`).replaceAll('\\', '/'), inputHash, composition: plan.composition, plannerVersion: plan.plannerVersion, seed: plan.seed, canvasSeed: 906, brushVersion: plan.brushVersion, analysisSize: plan.analysisSize }, null, 2));
  46  |   const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出实验 PNG', exact: true }).click();
  47  |   await (await download).saveAs(`${dir}/final.png`);
  48  |   expect(readFileSync(`${dir}/final.png`).equals(readFileSync(`${dir}/stage-${STAGES.length}.png`))).toBe(true);
  49  |   await page.locator('.experiment-reference').evaluate(element => (element as HTMLElement).style.visibility = 'hidden');
  50  |   const noReference = await experimentPng(page, `${dir}/without-reference.png`);
  51  |   expect(noReference.equals(readFileSync(`${dir}/final.png`))).toBe(true);
  52  |   await page.screenshot({ path: `${dir}/reference-hidden.png` });
  53  |   // Independent CPU replay consumes ONLY the serialized plan, with no input image.
  54  |   const cpu = new Painting(false), start = performance.now();
  55  |   for (const stroke of plan.strokes) executeStroke(cpu, stroke);
  56  |   const independent = { color: createHash('sha256').update(cpu.color).digest('hex'), height: createHash('sha256').update(new Uint8Array(cpu.height.buffer)).digest('hex') };
  57  |   const replayMs = performance.now() - start; expect(independent).toEqual(final);
  58  |   const prior = JSON.parse(readFileSync(`artifacts/e1/refinement/c/${sample}/results.json`, 'utf8')).final;
  59  |   expect(final).toEqual(prior);
  60  |   expect(await digest(page)).toEqual(before); expect(errors).toEqual([]); expect(requests).toEqual([]);
  61  |   const diagnostics = await page.evaluate(() => {
  62  |     const e = window.__experiment!, w = window as any; w.__e1Observer.disconnect();
  63  |     return { planningMs: e.planningMs, metrics: e.player!.metrics, memory: e.painting.memory(), renderer: e.renderer.info(), stages: w.__e1StageTimes, longTasks: w.__e1LongTasks, userAgent: navigator.userAgent };
  64  |   });
  65  |   const heapAfter = await heap.send('Runtime.getHeapUsage');
  66  |   const batches = [...diagnostics.metrics.batches].sort((a, b) => a - b), p95 = batches[Math.floor(batches.length * .95)];
  67  |   expect(p95).toBeLessThanOrEqual(50);
  68  |   let continuous = 0, maxContinuous = 0;
  69  |   for (const value of diagnostics.metrics.batches) { continuous = value > 100 ? continuous + 1 : 0; maxContinuous = Math.max(continuous, maxContinuous); }
  70  |   expect(maxContinuous).toBeLessThan(3); expect(diagnostics.metrics.maxConsecutiveOver100).toBeLessThan(3); expect(cpu.memory().historyCount).toBe(0);
  71  |   const report = { status: '通过', sample, speed: +speed, processMetrics: plan.processMetrics, previousFinal: prior, strokeCount: plan.strokes.length, final, independent, stageStates, replayMs, p95BatchMs: p95, maxContinuousOver100ms: maxContinuous, heapBefore, heapAfter, errors, externalRequests: requests, ...diagnostics, humanQuality: '待用户确认', heapNote: 'CDP page isolate heap excludes planner worker, GPU and some native image buffers; not a whole-process memory claim' };
  72  |   writeFileSync(`${dir}/results.json`, JSON.stringify(report, null, 2));
  73  |   await info.attach('summary', { body: JSON.stringify({ sample, strokeCount: plan.strokes.length, final, p95BatchMs: p95 }), contentType: 'application/json' });
> 74  |   const video = page.video(); await page.close(); if (video) await video.saveAs(`${dir}/process.webm`);
      |                                                                          ^ Error: video.saveAs: ENOENT: no such file or directory, copyfile 'E:\0906_codexgpt6_project\test-results\.playwright-artifacts-0\page@a2c7706cebfe59b702208917447b65f8.webm' -> 'E:\0906_codexgpt6_project\artifacts\e1\brush-process\c\still-life\process.webm'
  75  | });
  76  | 
  77  | test('E1-C runtime failures, PNG input, reproducible planner and released experimental state', async ({ page }) => {
  78  |   const dir = `${root}/lifecycle`; mkdirSync(dir, { recursive: true }); await ready(page);
  79  |   const cdp = await page.context().newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage');
  80  |   const baseline = await cdp.send('Runtime.getHeapUsage');
  81  |   await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  82  |   const upload = page.getByLabel('选择本地图片', { exact: true });
  83  |   await upload.setInputFiles('artifacts/e1/fixtures/landscape.jpg');
  84  |   await expect(page.getByRole('button', { name: '确认构图并绘制' })).toBeEnabled();
  85  |   await page.evaluate(() => { const w = window as any; w.__Worker = Worker; w.Worker = class extends Worker { constructor(url: string | URL, options?: WorkerOptions) { if (String(url).includes('planner.worker')) throw new Error('Injected worker construction failure'); super(url, options); } }; });
  86  |   await page.getByRole('button', { name: '确认构图并绘制' }).click();
  87  |   await expect(page.getByText('后台规划不可用，请使用支持 Worker 的浏览器或重试。')).toBeVisible();
  88  |   await page.evaluate(() => { const w = window as any; w.Worker = w.__Worker; delete w.__Worker; });
  89  |   await page.evaluate(() => { const w = window as any; w.__setTimeout = window.setTimeout; w.setTimeout = (handler: TimerHandler, timeout: number, ...args: unknown[]) => w.__setTimeout(handler, timeout === 120000 ? 50 : timeout, ...args); });
  90  |   await page.getByRole('button', { name: '确认构图并绘制' }).click();
  91  |   await expect(page.getByText('规划超过 120 秒，已停止。请缩小或简化图片后重试。')).toBeVisible();
  92  |   await page.evaluate(() => { const w = window as any; w.setTimeout = w.__setTimeout; delete w.__setTimeout; });
  93  |   await page.getByRole('button', { name: '确认构图并绘制' }).click(); await loadedPlan(page);
  94  |   await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  95  |   const firstPlan = await page.evaluate(() => JSON.stringify(window.__experiment!.plan));
  96  |   await page.getByRole('button', { name: '确认构图并绘制' }).click();
  97  |   await page.getByRole('button', { name: '确认替换实验画作', exact: true }).click(); await loadedPlan(page);
  98  |   await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  99  |   expect(await page.evaluate(() => JSON.stringify(window.__experiment!.plan))).toBe(firstPlan);
  100 |   const prior = await experimentDigest(page);
  101 |   // Browser WebGL loss switches only the material display; CPU artwork remains exact.
  102 |   await page.evaluate(() => window.__experiment!.renderer.gl!.getExtension('WEBGL_lose_context')!.loseContext());
  103 |   await expect(page.getByText('正在使用简化画布显示，局部材质光照暂不可用。')).toBeVisible();
  104 |   expect(await experimentDigest(page)).toEqual(prior);
  105 |   await experimentPng(page, `${dir}/fallback.png`);
  106 |   await page.getByRole('button', { name: '继续绘制', exact: true }).click();
  107 |   await page.getByRole('button', { name: '返回画室', exact: true }).click();
  108 |   await page.evaluate(() => { (window as any).__oldPlayer = window.__experiment!.player; });
  109 |   const stoppedIndex = await page.evaluate(() => (window as any).__oldPlayer.index);
  110 |   await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
  111 |   await page.waitForTimeout(500); expect(await page.evaluate(() => (window as any).__oldPlayer.index)).toBe(stoppedIndex);
  112 |   await page.evaluate(() => { delete (window as any).__oldPlayer; });
  113 |   // This tiny synthetic PNG is format/race coverage only, never a quality sample.
  114 |   const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 16; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#c95139'; ctx.fillRect(0, 0, 16, 16); ctx.fillStyle = '#3155a6'; ctx.fillRect(16, 0, 16, 16); return canvas.toDataURL('image/png').split(',')[1]; });
  115 |   for (let i = 0; i < 5; i++) {
  116 |     await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  117 |     await upload.setInputFiles({ name: 'format-only.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  118 |     await expect(page.getByRole('button', { name: '确认构图并绘制' })).toBeEnabled();
  119 |     if (i === 0) {
  120 |       await page.getByRole('button', { name: '确认构图并绘制' }).click(); await loadedPlan(page);
  121 |       await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  122 |       expect(await page.evaluate(() => window.__experiment!.plan!.inputHash)).toBe(createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex'));
  123 |     }
  124 |     await page.evaluate(() => { (window as any).__oldGL = window.__experiment!.renderer.gl; });
  125 |     await page.getByRole('button', { name: '返回画室', exact: true }).click(); await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
  126 |     await page.waitForFunction(() => (window as any).__oldGL.isContextLost());
  127 |     expect(await page.evaluate(() => window.__studio!.renderer.mode)).toBe('webgl2');
  128 |     await page.evaluate(() => { delete (window as any).__oldGL; });
  129 |   }
  130 |   await cdp.send('HeapProfiler.collectGarbage'); const after = await cdp.send('Runtime.getHeapUsage');
  131 |   expect(after.usedSize - baseline.usedSize).toBeLessThan(24 * 1024 * 1024);
  132 |   expect(await page.evaluate(() => window.__experiment)).toBeUndefined();
  133 |   writeFileSync(`${dir}/results.json`, JSON.stringify({ status: '通过', baseline, after, stoppedIndex, planHash: createHash('sha256').update(firstPlan).digest('hex'), checks: ['Worker unavailable actionable', 'planning timeout via injected 50ms clock for configured 120s deadline', 'same input yields identical full plan', 'context loss preserves exact CPU arrays and PNG available', 'exit during playback stops old player', 'valid PNG decode and planning', 'five source load/exit cycles release state', 'page heap growth <24MiB; excludes GPU/native/worker'] }, null, 2));
  134 |   const video = page.video(); await page.close(); if (video) await video.saveAs(`${dir}/process.webm`);
  135 | });
  136 | 
  137 | test('E1-C late image decode cannot overwrite a newer selection', async ({ page }) => {
  138 |   const dir = `${root}/decode-race`; mkdirSync(dir, { recursive: true }); await ready(page);
  139 |   await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  140 |   await page.evaluate(() => {
  141 |     const w = window as any, original = window.createImageBitmap.bind(window); w.__decodeOriginal = original;
  142 |     let delayed = false;
  143 |     w.createImageBitmap = async (input: ImageBitmapSource, options?: ImageBitmapOptions) => {
  144 |       if (input instanceof Blob && !delayed) { delayed = true; w.__decodeWaiting = true; await new Promise(resolve => setTimeout(resolve, 800)); }
  145 |       return original(input, options);
  146 |     };
  147 |   });
  148 |   const upload = page.getByLabel('选择本地图片', { exact: true });
  149 |   await upload.setInputFiles('artifacts/e1/fixtures/landscape.jpg'); await page.waitForFunction(() => (window as any).__decodeWaiting);
  150 |   await upload.setInputFiles('artifacts/e1/fixtures/complex.jpg');
  151 |   await expect(page.getByRole('button', { name: '确认构图并绘制' })).toBeEnabled();
  152 |   await page.waitForTimeout(1000); await expect(page.getByText('complex.jpg', { exact: true })).toBeVisible();
  153 |   await page.getByRole('button', { name: '确认构图并绘制' }).click(); await loadedPlan(page);
  154 |   await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  155 |   const inputHash = await page.evaluate(() => window.__experiment!.plan!.inputHash);
  156 |   expect(inputHash).toBe(createHash('sha256').update(readFileSync('artifacts/e1/fixtures/complex.jpg')).digest('hex'));
  157 |   await page.evaluate(() => { const w = window as any; w.createImageBitmap = w.__decodeOriginal; delete w.__decodeOriginal; delete w.__decodeWaiting; });
  158 |   await page.getByRole('button', { name: '返回画室', exact: true }).click(); await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
  159 |   writeFileSync(`${dir}/results.json`, JSON.stringify({ status: '通过', inputHash, delayedFirstImageMs: 800, newestSelection: 'complex.jpg' }, null, 2));
  160 | });
  161 | 
  162 | test('E1-C invalid, oversized, cancellation, replacement and exit never change M2', async ({ page }) => {
  163 |   mkdirSync(`${root}/errors`, { recursive: true }); await ready(page);
  164 |   await draw(page, [{ x: 100, y: 450 }, { x: 800, y: 480 }]);
  165 |   await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
  166 |   const original = await digest(page), record = await storedDraft(page);
  167 |   await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  168 |   const upload = page.getByLabel('选择本地图片', { exact: true });
  169 |   await upload.setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  170 |   await expect(page.getByRole('status').filter({ hasText: '无法读取图片' })).toBeVisible();
  171 |   await upload.setInputFiles({ name: 'large.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(12 * 1024 * 1024 + 1) });
  172 |   await expect(page.getByText('图片超过 12 MB，请先缩小文件。')).toBeVisible();
  173 |   const huge = Buffer.alloc(24); huge.writeUInt32BE(0x89504e47); huge.writeUInt32BE(0x0d0a1a0a, 4); huge.writeUInt32BE(0x49484452, 12); huge.writeUInt32BE(100000, 16); huge.writeUInt32BE(100000, 20);
  174 |   await upload.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: huge });
```