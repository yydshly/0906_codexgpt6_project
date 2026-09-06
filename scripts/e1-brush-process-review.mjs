import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = 'artifacts/e1/brush-process';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5174/artifacts/e1/brush-process/index.html');
  const images = [];
  for (const element of await page.locator('img').all()) {
    await element.scrollIntoViewIfNeeded();
    await element.evaluate(image => image.decode());
    images.push(await element.evaluate(image => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight })));
  }
  const links = [];
  for (const url of await page.locator('a').evaluateAll(elements => [...new Set(elements.map(a => a.href))])) {
    const response = await page.request.get(url); if (!response.ok()) throw new Error(`Missing ${url}: ${response.status()}`);
    links.push({ url, status: response.status() });
  }
  const videos = [];
  mkdirSync(`${root}/review`, { recursive: true });
  for (const [i, video] of (await page.locator('video').all()).entries()) {
    await video.evaluate(element => element.closest('details').open = true); await video.scrollIntoViewIfNeeded();
    const decoded = await video.evaluate(async video => {
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1) return resolve();
        video.addEventListener('loadedmetadata', resolve, { once: true }); video.addEventListener('error', reject, { once: true }); video.load();
      });
      const frames = [];
      for (const f of [.05, .5, .95]) {
        await new Promise((resolve, reject) => {
          video.addEventListener('seeked', resolve, { once: true }); video.addEventListener('error', reject, { once: true }); video.currentTime = video.duration * f;
        });
        const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 50;
        const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, 80, 50);
        frames.push({ time: video.currentTime, hasPixels: ctx.getImageData(0, 0, 80, 50).data.some((v, i) => i % 4 !== 3 && v > 0) });
      }
      return { src: video.getAttribute('src'), duration: video.duration, width: video.videoWidth, height: video.videoHeight, frames };
    });
    if (!decoded.frames.every(f => f.hasPixels)) throw new Error('Video frame decoding failed');
    await video.screenshot({ path: `${root}/review/video-${i + 1}-frame.png` }); videos.push(decoded);
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${root}/review/gallery.png` });
  const byteChecks = [];
  for (const sample of ['landscape', 'still-life', 'complex']) {
    const samplePath = sample === 'still-life' ? 'c-recording-retry/still-life' : `c/${sample}`;
    const prior = readFileSync(`artifacts/e1/refinement/c/${sample}/final.png`), current = readFileSync(`${root}/${samplePath}/final.png`);
    if (!prior.equals(current)) throw new Error(`${sample}: exported PNG changed`);
    byteChecks.push({ sample, actualPngEqualsPrior: true });
  }
  await page.goto('http://127.0.0.1:5174/?test=1');
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  const link = page.getByRole('link', { name: '查看笔头、沾色与三图过程 ↗', exact: true });
  const popupPromise = page.waitForEvent('popup'); await link.click(); const popup = await popupPromise; await popup.waitForLoadState();
  if (!popup.url().endsWith('/artifacts/e1/brush-process/index.html')) throw new Error('Wrong gallery destination');
  await popup.close(); await page.bringToFront();
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles('artifacts/e1/fixtures/complex.jpg');
  await page.getByRole('button', { name: '确认构图并绘制', exact: true }).click();
  await page.waitForFunction(() => { const p = window.__experiment?.player; if (p?.tip.down && p.sampleIndex > 2) { p.pause(); return true; } return false; }, undefined, { timeout: 130000 });
  await page.screenshot({ path: `${root}/review/studio.png` });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出实验 PNG', exact: true }).click(); await (await download).saveAs(`${root}/review/smoke-export.png`);
  if (errors.length) throw new Error(errors.join('\n'));
  writeFileSync(`${root}/review/check.json`, JSON.stringify({ status: '通过', images, links, videos, byteChecks, errors, smoke: 'real studio entry, new-tab gallery, source selection, actual contact, pause and actual PNG download' }, null, 2));
  await context.close();
} finally { await browser.close(); }
