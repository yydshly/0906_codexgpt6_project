import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const url = process.env.STUDIO_URL || 'http://127.0.0.1:5176/0906_codexgpt6_project/';
const out = process.env.NAV_EVIDENCE || 'artifacts/m2/navigation/preflight';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage(); await page.goto(url);
  await expect(page.getByTestId('save-state')).not.toHaveAttribute('data-phase', 'loading');
  const box = await page.getByTestId('painting-surface').boundingBox();
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .4); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .4, { steps: 32 }); await page.mouse.up();
  const exported = async name => { const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 PNG', exact: true }).click(); const path = `${out}/${name}.png`; await (await event).saveAs(path); return readFileSync(path); };
  const before = await exported('before-review');
  await page.screenshot({ path: `${out}/studio.png` });
  const opened = page.waitForEvent('popup'); await page.getByRole('link', { name: '体验与验收 ↗', exact: true }).click();
  const review = await opened;
  await expect(review.getByRole('heading', { name: '同一个画室，从落笔到完成。' })).toBeVisible();
  await review.screenshot({ path: `${out}/overview.png` });
  await review.getByRole('link', { name: '查看 M1 实际验收 →', exact: true }).click();
  await expect(review.getByRole('navigation', { name: '体验与验收导航' })).toBeVisible();
  await expect(review.getByText('当前画室已包含 M2 完整体验。', { exact: false })).toBeVisible();
  await review.screenshot({ path: `${out}/m1-linked.png` });
  await review.getByRole('navigation').getByRole('link', { name: 'M2 完整体验', exact: true }).click();
  await expect(review.getByRole('heading', { name: '一场日落，从第一笔到带回家。' })).toBeVisible();
  await review.locator('img').evaluateAll(async images => { await Promise.all(images.map(img => img.decode())); });
  const video = await review.locator('video').evaluate(async v => {
    if (v.readyState < 1) await new Promise((resolve, reject) => { v.onloadedmetadata = resolve; v.onerror = reject; });
    if (!Number.isFinite(v.duration)) await new Promise(resolve => { v.onseeked = resolve; v.currentTime = 1e6; });
    await new Promise(resolve => { v.onseeked = resolve; v.currentTime = v.duration / 2; });
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, readyState: v.readyState };
  });
  expect(video.width).toBe(1440); expect(video.duration).toBeGreaterThan(10);
  await review.screenshot({ path: `${out}/m2-linked.png` });
  await review.getByRole('link', { name: '体验与验收总览', exact: true }).click();
  const studioOpened = review.waitForEvent('popup'); await review.getByRole('link', { name: '进入完整画室 ↗', exact: true }).click();
  const secondStudio = await studioOpened;
  await expect(secondStudio.getByRole('button', { name: '恢复草稿', exact: true })).toBeVisible();
  await secondStudio.close(); await review.close(); await page.bringToFront();
  expect((await exported('after-review')).equals(before)).toBe(true);
  const manifestResponse = await context.request.get(`${url}review/evidence-manifest.json`); expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  const queue = [...manifest], checked = [];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) { const asset = queue.shift(); const response = await context.request.get(`${url}${asset.path}`); expect(response.status()).toBe(200);
      const data = await response.body(); expect(data.length).toBe(asset.bytes); expect(createHash('sha256').update(data).digest('hex')).toBe(asset.sha256); checked.push(asset.path); await response.dispose();
    }
  }));
  const paths = ['review/', 'artifacts/m1/index.html', 'artifacts/m2/index.html'];
  const localLinks = new Set();
  for (const path of paths) {
    const response = await context.request.get(`${url}${path}`); expect(response.status()).toBe(200); const html = await response.text();
    for (const match of html.matchAll(/href="([^"#]+)"/g)) { const link = new URL(match[1], `${url}${path}`).href; if (link.startsWith(url)) localLinks.add(link); }
  }
  for (const link of localLinks) expect((await context.request.get(link)).status(), link).toBe(200);
  if (process.env.CHECK_DEV) {
    const html = await (await context.request.get('http://127.0.0.1:5174/artifacts/m1/index.html')).text();
    expect(html).toContain('体验与验收导航'); expect(html).toContain('当前画室已包含 M2 完整体验。');
  }
  expect(errors).toEqual([]);
  writeFileSync(`${out}/results.json`, JSON.stringify({ status: '通过', checkedAt: new Date().toISOString(), url, artworkBeforeAfterIdentical: true, oldStudioPreservedInOriginalTab: true, newStudioOffersExistingDraft: true, overviewM1M2Navigation: true, evidenceFiles: checked.length, evidenceBytes: manifest.reduce((sum, asset) => sum + asset.bytes, 0), evidenceSha256AllMatch: true, sameSiteLinks: localLinks.size, video, localLegacyM1EntryChecked: !!process.env.CHECK_DEV, errors }, null, 2));
  console.log(`PASS: ${url} navigation, artwork preserved, ${checked.length} original assets verified.`);
} catch (error) { writeFileSync(`${out}/failure.json`, JSON.stringify({ status: '未通过', url, error: String(error), errors }, null, 2)); throw error; }
finally { await browser.close(); }
