import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const [base, out] = process.argv.slice(2);
assert.ok(base && out); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.on('pageerror', e => errors.push(e.message));
  assert.equal((await page.goto(base)).status(), 200);
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.__studio), 'undefined');
  await page.screenshot({ path: `${out}/studio.png` });
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.getByRole('button', { name: '成品细节 · 实验', exact: true }).click();
  await page.getByText('尝试保留更多可见细节；本轮人物成品验证未通过，仍可能丢失结构。').waitFor();
  const link = page.getByRole('link', { name: '查看自动成品质量实测 ↗', exact: true });
  assert.equal(await link.getAttribute('href'), new URL('artifacts/e1/finished-quality/index.html', base).pathname);
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles('artifacts/e1/fixtures/landscape.jpg');
  await page.getByLabel('播放速度', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: '确认构图，准备笔与颜色', exact: true }).click();
  const start = page.getByRole('button', { name: '确认准备，开始绘制', exact: true });
  await start.waitFor({ timeout: 130000 });
  await page.screenshot({ path: `${out}/prepared.png` });
  await start.click();
  await page.waitForTimeout(12000);
  await page.getByRole('button', { name: '暂停绘制', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出实验 PNG', exact: true }).click();
  await (await download).saveAs(`${out}/partial.png`);
  const png = readFileSync(`${out}/partial.png`);
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
  await page.screenshot({ path: `${out}/paused.png` });
  checks.push('Production entry, failure disclosure, original input Worker planning, prepared materials, playback, pause and actual 1024 PNG download');
  for (const file of ['review/', 'artifacts/m1/index.html', 'artifacts/m2/index.html', 'artifacts/e1/prepared-studio/index.html', 'artifacts/e1/structure-mode/index.html', 'artifacts/e1/finished-quality/index.html']) {
    const url = new URL(file, base).href;
    assert.equal((await page.goto(url)).status(), 200);
    const urls = await page.locator('a[href],img[src],video[src],source[src],image[href]').evaluateAll(nodes => nodes.map(n => new URL(n.getAttribute('href') || n.getAttribute('src'), document.baseURI).href));
    for (const u of new Set(urls)) {
      if (!u.startsWith(base)) continue;
      const response = await page.request.head(u);
      assert.equal(response.status(), 200, u);
      if (/\.(png|jpg|jpeg|json|webm|log)$/.test(new URL(u).pathname)) assert.ok(!response.headers()['content-type']?.includes('text/html'), `Asset returned HTML: ${u}`);
    }
    checks.push(`${file}: local links/media HTTP 200`);
  }
  await page.screenshot({ path: `${out}/quality-gallery.png` });
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/verification.json`, JSON.stringify({ status: '通过', base, at: new Date().toISOString(), checks, errors, note: 'Publication smoke check, partial painting only. Full final-state and quality results refer to the frozen quality report; human acceptance pending.' }, null, 2));
  console.log(JSON.stringify({ status: '通过', checks }));
} finally { await browser.close(); }
