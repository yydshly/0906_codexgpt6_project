// Run against a local Pages-path build, then the actual GitHub Pages site.
// Every check uses an isolated browser context; no existing user draft is read.
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const url = process.env.STUDIO_URL || 'https://yydshly.github.io/0906_codexgpt6_project/';
const out = process.env.PUBLISH_EVIDENCE || 'artifacts/m2/publish/online';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const errors = [], workers = [], failedResponses = [];
const stored = page => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('slowlight-current-draft', 1);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result, tx = db.transaction('drafts', 'readonly'), get = tx.objectStore('drafts').get('current');
    tx.oncomplete = async () => { db.close(); const r = get.result;
      const hash = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data.buffer))).map(v => v.toString(16).padStart(2, '0')).join('');
      resolve({ color: await hash(r.color), height: await hash(r.height), signature: r.signature, guide: r.guide, brush: r.brush });
    }; tx.onabort = () => reject(tx.error);
  };
}));
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('worker', worker => workers.push(worker.url()));
  page.on('response', response => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() }); });
  const response = await page.goto(url); expect(response.status()).toBe(200);
  const expectedBundle = readFileSync('dist/index.html', 'utf8').match(/src="([^"]+\.js)"/)[1];
  expect(await page.locator('script[type="module"]').getAttribute('src')).toBe(expectedBundle);
  await expect(page.getByTestId('save-state')).not.toHaveAttribute('data-phase', 'loading');
  expect(await page.evaluate(() => typeof window.__studio)).toBe('undefined');
  await page.screenshot({ path: `${out}/first-screen.png` });
  await page.getByRole('button', { name: '画一幅旅行日落', exact: true }).click();
  await page.getByRole('button', { name: '采用本步建议', exact: true }).click();
  const draw = async y => { const box = await page.getByTestId('painting-surface').boundingBox(); await page.mouse.move(box.x + box.width * .2, box.y + box.height * y); await page.mouse.down(); await page.mouse.move(box.x + box.width * .8, box.y + box.height * y, { steps: 32 }); await page.mouse.up(); };
  await draw(.3); await page.getByRole('button', { name: '选择日落黄', exact: true }).click(); await draw(.37);
  await page.getByRole('button', { name: '关闭引导', exact: true }).click();
  await page.getByRole('button', { name: '签名与完成', exact: true }).click();
  await page.getByLabel('给这幅画签名').fill('慢光 · M2');
  const exportButton = page.getByRole('button', { name: '保存这幅画 · PNG', exact: true });
  await expect(exportButton).toBeEnabled({ timeout: 15000 });
  await page.getByTestId('work-preview').evaluate(img => img.decode());
  const preview = Buffer.from(await page.getByTestId('work-preview').evaluate(async img => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer()))));
  const event = page.waitForEvent('download'); await exportButton.click(); await (await event).saveAs(`${out}/signed-export.png`);
  expect(readFileSync(`${out}/signed-export.png`).equals(preview)).toBe(true);
  const pixels = PNG.sync.read(preview); expect([pixels.width, pixels.height]).toEqual([1024, 1024]);
  await page.screenshot({ path: `${out}/signed-preview.png` });
  await page.getByRole('button', { name: '返回修改', exact: true }).click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
  const before = await stored(page);
  await page.reload(); await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await draw(.6); await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
  const after = await stored(page); expect(after).toEqual(before);
  await page.getByRole('button', { name: '签名与完成', exact: true }).click();
  await expect(page.getByLabel('给这幅画签名')).toHaveValue('慢光 · M2');
  await expect(exportButton).toBeEnabled({ timeout: 15000 });
  const restoredPreview = Buffer.from(await page.getByTestId('work-preview').evaluate(async img => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer()))));
  expect(restoredPreview.equals(preview)).toBe(true);
  expect(workers.length).toBeGreaterThan(0); expect(workers.every(worker => worker.startsWith(`${url}assets/png.worker-`))).toBe(true);
  expect(errors).toEqual([]); expect(failedResponses).toEqual([]);
  writeFileSync(`${out}/results.json`, JSON.stringify({ status: '通过', checkedAt: new Date().toISOString(), url, expectedBundle, workers, errors, failedResponses, pngSize: [pixels.width, pixels.height], previewDownloadIdentical: true, restoredPreviewIdentical: true, savedStateBefore: before, savedStateAfterRestoreDrawUndo: after, oldUndoHistoryAbsent: true, browser: await page.evaluate(() => navigator.userAgent), scope: 'Real mouse inputs in isolated Chrome; local storage, restore, new-stroke undo, signed PNG and subpath Worker. Does not replace V4 or prior full M2 regression.' }, null, 2));
  console.log(`PASS ${url}: real painting, subpath Worker, committed draft restore/new undo, signed 1024 PNG.`);
} catch (error) { writeFileSync(`${out}/failure.json`, JSON.stringify({ status: '未通过', url, error: String(error), errors, workers, failedResponses }, null, 2)); throw error; }
finally { await browser.close(); }
