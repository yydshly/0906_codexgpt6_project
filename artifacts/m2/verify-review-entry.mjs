import { chromium, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const out = 'artifacts/m2/delivery';
const report = readFileSync('M2_REPORT.md', 'utf8');
const reportFiles = [...report.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]).filter(path => !/^https?:/.test(path));
for (const file of reportFiles) expect(existsSync(resolve(file)), file).toBe(true);
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/artifacts/m2/index.html');
  await page.locator('summary').click();
  const links = await page.locator('a').evaluateAll(items => [...new Set(items.map(a => a.href))]);
  for (const link of links) expect((await context.request.get(link)).status(), link).toBe(200);
  const imageSizes = await page.locator('img').evaluateAll(async images => {
    await Promise.all(images.map(image => image.decode()));
    return images.map(image => ({ url: image.src, width: image.naturalWidth, height: image.naturalHeight }));
  });
  expect(imageSizes.every(image => image.width > 0 && image.height > 0)).toBe(true);
  const videos = [];
  for (const name of ['journey', 'workflow']) {
    const url = `http://127.0.0.1:5174/artifacts/m2/delivery/${name}.webm`;
    const metadata = await page.evaluate(async url => {
      const video = document.querySelector('video'); video.src = url; video.muted = true;
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('Video decode failed')); video.load(); });
      // Matroska recordings may report Infinity until an end seek discovers duration.
      if (!Number.isFinite(video.duration)) { await new Promise(resolve => { video.onseeked = resolve; video.currentTime = 1e6; }); }
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    }, url);
    expect(metadata.duration).toBeGreaterThan(10); expect(metadata.width).toBe(1440); expect(metadata.height).toBe(900);
    const hashes = [];
    for (const fraction of [.1, .5, .9]) {
      const data = await page.evaluate(async fraction => {
        const video = document.querySelector('video');
        await new Promise(resolve => { video.onseeked = resolve; video.currentTime = video.duration * fraction; });
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
      }, fraction);
      const bytes = Buffer.from(data, 'base64'); hashes.push(createHash('sha256').update(bytes).digest('hex'));
      if (fraction === .5) writeFileSync(`${out}/${name}-frame.png`, bytes);
    }
    expect(new Set(hashes).size).toBe(3);
    videos.push({ status: '通过', path: `${name}.webm`, ...metadata, decodedFrameFractions: [.1, .5, .9], differentDecodedFrameHashes: hashes });
  }
  await page.goto('http://127.0.0.1:5174/artifacts/m2/index.html');
  await page.screenshot({ path: `${out}/review-entry.png` });
  await page.goto(pathToFileURL(resolve('artifacts/m2/index.html')).href);
  await page.waitForFunction(() => Array.from(document.images).every(img => img.complete && img.naturalWidth > 0));
  writeFileSync(`${out}/video-check.json`, JSON.stringify({ status: '通过', videos, scope: 'Browser decodes original recordings at three positions; not a human UX verdict.' }, null, 2));
  writeFileSync(`${out}/review-entry-check.json`, JSON.stringify({ status: '通过', httpLinks: links.map(url => ({ url, status: 200 })), reportFilesChecked: reportFiles.length, imageSizes, localFileEntryImagesDecoded: true }, null, 2));
  console.log(JSON.stringify({ status: '通过', links: links.length, images: imageSizes.length, reportFiles: reportFiles.length, videos }, null, 2));
} finally { await browser.close(); }
