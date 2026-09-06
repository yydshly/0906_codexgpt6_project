import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'artifacts/e1/refinement', samples = ['landscape', 'still-life', 'complex'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const comparisons = samples.map(sample => {
  const current = JSON.parse(readFileSync(`${root}/c/${sample}/results.json`)), first = JSON.parse(readFileSync(`${root}/r1-verified/${sample}/results.json`));
  const old = JSON.parse(readFileSync(`artifacts/e1/c/${sample}/results.json`));
  assert.deepEqual(current.final, first.final);
  assert.deepEqual(current.independent, current.final);
  const plan = readFileSync(`${root}/c/${sample}/plan.json`), png = readFileSync(`${root}/c/${sample}/final.png`);
  assert.equal(hash(plan), hash(readFileSync(`${root}/r1-verified/${sample}/plan.json`)));
  assert.equal(hash(png), hash(readFileSync(`${root}/r1-verified/${sample}/final.png`)));
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
  return { sample, inputHash: hash(readFileSync(`artifacts/e1/fixtures/${sample}.jpg`)), planHash: hash(plan), pngHash: hash(png), oldState: old.final, newState: current.final, oldStrokes: old.strokeCount, newStrokes: current.strokeCount, visiblePenMatchesEarlierFullStroke: true };
});
assert.equal(new Set(comparisons.map(r => r.inputHash)).size, 3);
assert.equal(new Set(comparisons.map(r => r.newState.color)).size, 3);
writeFileSync(`${root}/comparison.json`, JSON.stringify({ status: '通过', comparisons, note: 'Exact arrays and PNG correspondence only. Image quality and process acceptance remain pending.' }, null, 2));
// Generate the index only after every evidence file exists.
await import('./e1-refinement-index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5174/artifacts/e1/refinement/index.html');
  await page.locator('details').evaluateAll(nodes => nodes.forEach(node => node.open = true));
  await page.locator('img').evaluateAll(nodes => nodes.forEach(node => node.loading = 'eager'));
  await page.waitForFunction(() => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0));
  const images = await page.locator('img').count(), links = await page.locator('a[href]').evaluateAll(nodes => [...new Set(nodes.map(node => node.href))]);
  for (const link of links) assert.equal((await page.request.get(link)).ok(), true, link);
  const videos = await page.locator('video').evaluateAll(async nodes => {
    const result = [];
    for (const video of nodes) {
      if (video.readyState < 1) await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
      const frames = [], canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
      for (const time of [.3, video.duration / 2, video.duration - .5]) {
        const decoded = new Promise((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error('Video seek timed out')), 20000);
          video.addEventListener('seeked', () => { clearTimeout(deadline); resolve(); }, { once: true });
        });
        video.currentTime = Math.max(0, time); await decoded;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, 160, 100);
        const paintedChannels = ctx.getImageData(0, 0, 160, 100).data.reduce((sum, value, i) => sum + (i % 4 !== 3 && value > 0 ? 1 : 0), 0);
        if (!paintedChannels) throw new Error('Decoded video frame is blank');
        frames.push({ mediaTime: video.currentTime, readyState: video.readyState, paintedChannels });
      }
      result.push({ src: video.getAttribute('src'), width: video.videoWidth, height: video.videoHeight, duration: video.duration, decodedFrames: frames });
    }
    return result;
  });
  assert.equal(videos.length, 4); for (const video of videos) { assert.equal(video.width, 1440); assert.equal(video.height, 900); assert.ok(video.duration > 30); }
  await page.locator('details').evaluateAll(nodes => nodes.forEach(node => node.open = false));
  await page.screenshot({ path: `${root}/review-page.png` });
  const popup = page.waitForEvent('popup'); await page.getByRole('link', { name: '进入慢光画室 ↗', exact: true }).click();
  const app = await popup; await app.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).waitFor({ state: 'visible' });
  await app.screenshot({ path: `${root}/studio-entry.png` });
  await app.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await app.getByRole('dialog', { name: '图片自动绘制实验', exact: true }).waitFor({ state: 'visible' });
  await app.screenshot({ path: `${root}/experiment-entry.png` });
  const reviewPopup = app.waitForEvent('popup'); await app.getByRole('link', { name: '查看新旧样本与绘制过程 ↗', exact: true }).click();
  const review = await reviewPopup; await review.waitForLoadState('domcontentloaded'); assert.ok(review.url().endsWith('/artifacts/e1/refinement/index.html'));
  assert.ok(await app.getByRole('dialog', { name: '图片自动绘制实验', exact: true }).isVisible()); await review.close();
  await app.getByLabel('选择本地图片', { exact: true }).setInputFiles('artifacts/e1/fixtures/complex.jpg');
  await app.getByLabel('播放速度', { exact: true }).selectOption('4');
  await app.getByRole('button', { name: '确认构图并绘制', exact: true }).click();
  await app.waitForFunction(() => {
    const label = document.querySelector('.experiment-pair figure:last-child > p')?.textContent || '';
    return Number(label.match(/已完成 (\d+)/)?.[1] || 0) > 1000;
  }, undefined, { timeout: 120000 });
  await app.getByRole('button', { name: '暂停绘制', exact: true }).click();
  await app.screenshot({ path: `${root}/playback-page.png` });
  const header = await app.locator('.experiment-heading').evaluate(el => ({ text: el.innerText, visible: getComputedStyle(el).visibility, opacity: getComputedStyle(el).opacity }));
  assert.ok(header.text.includes('让照片，慢慢成为笔触。')); assert.equal(header.visible, 'visible'); assert.equal(header.opacity, '1');
  const download = app.waitForEvent('download'); await app.getByRole('button', { name: '导出实验 PNG', exact: true }).click(); await (await download).saveAs(`${root}/navigation-partial.png`);
  const partial = readFileSync(`${root}/navigation-partial.png`); assert.equal(partial.readUInt32BE(16), 1024); assert.equal(partial.readUInt32BE(20), 1024);
  assert.deepEqual(errors, []);
  writeFileSync(`${root}/review-check.json`, JSON.stringify({ status: '通过', images, links: links.length, videos, errors, header, actualStudioAndExperimentEntry: true, experimentOpensReviewWithoutLeaving: true, selectionDrawingPauseExportAfterOverlayChange: true, note: 'Chrome decoded start/middle/end frames; this is media integrity, not human visual acceptance.' }, null, 2));
  console.log(JSON.stringify({ images, links: links.length, videos: videos.map(v => ({ src: v.src, duration: v.duration })), actualEntry: true }));
} finally { await browser.close(); }
