import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const root = 'artifacts/e1/review-check'; mkdirSync(root, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('http://127.0.0.1:5174/artifacts/e1/index.html');
  if (response.status() !== 200) throw new Error('Evidence entry unavailable');
  const images = await page.locator('img').evaluateAll(elements => elements.map(img => ({ src: img.getAttribute('src'), width: img.naturalWidth, height: img.naturalHeight, complete: img.complete })));
  if (images.length !== 18 || images.some(img => !img.complete || !img.width)) throw new Error('Missing sample image');
  const links = [...new Set(await page.locator('a').evaluateAll(elements => elements.map(a => a.href)))];
  const broken = [];
  for (const url of links) { const result = await page.request.head(url); if (!result.ok()) broken.push({ url, status: result.status() }); }
  if (broken.length) throw new Error(JSON.stringify(broken));
  const media = [];
  for (let i = 0; i < 3; i++) {
    const detail = page.locator('details').nth(i); await detail.locator('summary').click();
    const video = detail.locator('video');
    await video.evaluate(async element => { element.muted = true; await element.play(); });
    await page.waitForFunction(index => document.querySelectorAll('video')[index].currentTime > .2, i);
    media.push(await video.evaluate(element => { element.pause(); return { src: element.getAttribute('src'), width: element.videoWidth, height: element.videoHeight, currentTime: element.currentTime, duration: element.duration }; }));
    if (!media.at(-1).width) throw new Error('Video does not decode');
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${root}/evidence-entry.png` });
  await page.goto('http://127.0.0.1:5174/'); await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.screenshot({ path: `${root}/experiment-entry.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${root}/narrow-viewport.png` });
  const dimensions = await page.locator('.image-experiment').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  if (dimensions.scroll > dimensions.client + 1) throw new Error('Experiment horizontal overflow');
  if (errors.length) throw new Error(JSON.stringify(errors));
  writeFileSync(`${root}/results.json`, JSON.stringify({ status: '通过', entry: response.url(), imageCount: images.length, linkCount: links.length, images, media, broken, errors, narrowViewport: dimensions, note: 'Narrow viewport is browser simulation, not a real phone/tablet test.' }, null, 2));
} finally { await browser.close(); }
