import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://127.0.0.1:5174/';
const out = process.argv[3] || 'artifacts/effect-study/browser';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [], errors = [], failed = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', req => failed.push(req.url()));
  assert.equal((await page.goto(new URL('effect-study/', base).href)).status(), 200);
  await page.locator('#result-image').evaluate(img => img.decode());
  assert.match(await page.locator('#result-status').innerText(), /非慢光笔触输出/);
  assert.equal(await page.locator('#result-image').evaluate(img => img.naturalWidth), 1254);
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  await page.getByRole('button', { name: '叠合对照', exact: true }).click();
  await page.locator('#wipe-range').fill('30');
  assert.equal(await page.locator('#gallery').evaluate(el => el.style.getPropertyValue('--wipe')), '30%');
  await page.getByRole('button', { name: '局部 2×', exact: true }).click();
  await page.locator('#pan-x').fill('32'); await page.locator('#pan-y').fill('38');
  assert.equal(await page.locator('#gallery').getAttribute('data-zoom'), '2');
  assert.equal(await page.locator('#gallery').evaluate(el => el.style.getPropertyValue('--pan-y')), '38%');
  await page.screenshot({ path: `${out}/detail.png`, fullPage: true });
  await page.getByRole('button', { name: '完整画面', exact: true }).click();
  const download = page.waitForEvent('download'); await page.locator('#download-link').click();
  await (await download).saveAs(`${out}/downloaded-target.png`);
  assert.ok(readFileSync(`${out}/downloaded-target.png`).equals(readFileSync('effect-study/assets/landscape-target.png')));
  checks.push('Candidate label, exact target download, split control and synchronized zoom/pan');
  for (const mode of ['baseline', 'quality']) {
    await page.locator('#result-select').selectOption(mode);
    await page.locator('#result-image').evaluate(img => img.decode());
    assert.match(await page.locator('#result-image').getAttribute('src'), new RegExp(`${mode}-stage-5.png$`));
    assert.match(await page.locator('#result-status').innerText(), /真实笔触输出/);
  }
  await page.getByRole('button', { name: /人物实测/ }).click();
  await page.locator('#result-image').evaluate(img => img.decode());
  assert.deepEqual(await page.locator('#result-select option').evaluateAll(opts => opts.map(o => o.value)), ['quality', 'baseline']);
  assert.match(await page.locator('#note-title').innerText(), /未通过/);
  assert.match(await page.locator('#result-image').getAttribute('src'), /portrait-holdout/);
  await page.getByRole('button', { name: '并排看', exact: true }).click();
  await page.screenshot({ path: `${out}/portrait.png`, fullPage: true });
  checks.push('Both real historical modes; portrait failure preserved with no invented target');
  await page.getByRole('button', { name: /黄石冬景/ }).click();
  const dimensions = [];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const sizes = await page.locator('.source-frame,.result-frame').evaluateAll(els => els.map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
    assert.ok(Math.abs(sizes[0].width - sizes[1].width) < 1);
    assert.ok(Math.abs(sizes[0].height - sizes[1].height) < 1);
    dimensions.push({ width, sizes });
    await page.screenshot({ path: `${out}/page-${width}.png`, fullPage: true });
  }
  for (const file of ['effect-study/study.css', 'effect-study/study.js', 'effect-study/assets/landscape-target.png', 'artifacts/e1/finished-quality/index.html']) assert.equal((await page.request.get(new URL(file, base).href)).status(), 200);
  await page.goto(base); await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).waitFor();
  checks.push('Equal-size full image frames, 1440/768/390 simulated viewports, assets and original studio entry');
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  const result = { status: '通过', base, checks, dimensions, errors, failed, note: 'Page interactions and media only; visual target is AI-generated, no new painting capability or human acceptance is claimed.' };
  writeFileSync(`${out}/results.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
