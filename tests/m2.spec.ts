import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { ready, draw, digest, settle } from './helpers';
import { single, line } from './fixtures/strokes';
import type { Page } from '@playwright/test';
const artifact = process.env.M1_ARTIFACT_DIR || 'artifacts/m2';
const saved = (page: Page) => expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
const storedId = (page: Page) => page.evaluate(() => new Promise<string | null>((resolve, reject) => {
  const req = indexedDB.open('slowlight-current-draft', 1);
  req.onsuccess = () => { const db = req.result, tx = db.transaction('drafts', 'readonly'), get = tx.objectStore('drafts').get('current'); tx.oncomplete = () => { resolve(get.result?.id ?? null); db.close(); }; tx.onabort = () => reject(tx.error); }; req.onerror = () => reject(req.error);
}));

test('A guide choices and overlays preserve independent artwork and user choices', async ({ page }) => {
  await ready(page); mkdirSync(artifact, { recursive: true });
  await page.screenshot({ path: `${artifact}/page.png` });
  await draw(page, single); const before = await digest(page);
  await page.getByRole('button', { name: '画一幅旅行日落', exact: true }).click();
  await page.getByRole('button', { name: '取消，保留画作' }).click(); expect(await digest(page)).toEqual(before);
  await page.getByRole('button', { name: '画一幅旅行日落', exact: true }).click();
  await page.getByRole('button', { name: '在当前画作上继续' }).click(); expect(await digest(page)).toEqual(before);
  await expect(page.getByTestId('guide-overlay')).toBeVisible();
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: '继续下一步' }).click(); expect(await digest(page)).toEqual(before); }
  await page.getByRole('button', { name: '返回上步' }).click();
  await page.getByRole('button', { name: '跳过本步' }).click(); expect(await digest(page)).toEqual(before);
  await page.getByRole('button', { name: '采用本步建议' }).click(); expect(await digest(page)).toEqual(before);
  await expect(page.getByLabel('笔刷大小', { exact: true })).toHaveValue('24');
  await page.getByRole('button', { name: '选择朱红', exact: true }).click();
  await draw(page, [{ x: 200, y: 760 }, { x: 800, y: 760 }]); const after = await digest(page); expect(after.color).not.toBe(before.color); expect(after.height).not.toBe(before.height);
  const red = await page.evaluate(() => Array.from(window.__studio!.painting.color.slice((760 * 1024 + 500) * 4, (760 * 1024 + 500) * 4 + 3)));
  expect(red[0]).toBeGreaterThan(red[2]);
  await page.screenshot({ path: `${artifact}/guide.png` });
  await page.getByLabel('显示辅助轮廓').uncheck(); expect(await digest(page)).toEqual(after);
  await expect(page.getByTestId('guide-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭引导' }).click(); await settle(page); expect(await digest(page)).toEqual(after);
  await page.screenshot({ path: `${artifact}/guide-closed.png` });
  writeFileSync(`${artifact}/guide-results.json`, JSON.stringify({ status: '通过', before, after, red, checks: ['existing work cancel/continue', 'four steps and skip/back preserve arrays', 'recommendation does not draw', 'custom red changes artwork', 'overlay/guide close preserves arrays'] }, null, 2));
});

test('A explicitly choosing a fresh themed canvas remains undoable', async ({ page }) => {
  await ready(page); await draw(page, single); const before = await digest(page);
  await page.getByRole('button', { name: '画一幅旅行日落', exact: true }).click();
  await page.getByRole('button', { name: '新画一张旅行日落', exact: true }).click();
  expect(await page.evaluate(() => window.__studio!.painting.color.some(v => v > 0))).toBe(false);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await digest(page)).toEqual(before);
});

test('B committed draft restores exact color/height, brush and step; new undo returns to restored state', async ({ page }) => {
  await ready(page); mkdirSync(artifact, { recursive: true });
  await page.getByRole('button', { name: '画一幅旅行日落', exact: true }).click();
  await page.getByRole('button', { name: '继续下一步' }).click();
  await page.getByRole('button', { name: '采用本步建议' }).click();
  await draw(page, single); const expected = await digest(page); await saved(page); const id = await storedId(page);
  // Delay verification of the stored bytes to exercise the initial loading gate.
  await page.addInitScript(() => { const original = crypto.subtle.digest.bind(crypto.subtle); crypto.subtle.digest = async (algorithm, data) => { await new Promise(r => setTimeout(r, 500)); return original(algorithm, data); }; });
  await page.reload(); await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'loading');
  await expect(page.locator('main.workspace')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: '恢复草稿', exact: true })).toBeVisible();
  expect(await storedId(page)).toBe(id); // Blank startup has not overwritten the saved record.
  await page.screenshot({ path: `${artifact}/restore-prompt.png` });
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  expect(await digest(page)).toEqual(expected); await expect(page.getByLabel('笔刷大小', { exact: true })).toHaveValue('48');
  await expect(page.getByRole('button', { name: '02远山', exact: true })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await draw(page, [{ x: 400, y: 650 }, { x: 800, y: 650 }]); expect(await digest(page)).not.toEqual(expected);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); expect(await digest(page)).toEqual(expected);
  await saved(page); await page.screenshot({ path: `${artifact}/restored.png` });
  writeFileSync(`${artifact}/restore-results.json`, JSON.stringify({ status: '通过', expected, restored: await digest(page), initialRecordPreserved: true, restoredHistory: 0, newStrokeUndoExact: true }, null, 2));
});

test('B deferred recovery preserves the old record and asks before replacing current work', async ({ page }) => {
  await ready(page); await draw(page, single); await saved(page); const original = await digest(page), id = await storedId(page);
  await page.reload(); await page.getByRole('button', { name: '暂不恢复，保留草稿' }).click();
  await draw(page, [{ x: 300, y: 700 }, { x: 600, y: 700 }]); const temporary = await digest(page);
  await page.waitForTimeout(1200); expect(await storedId(page)).toBe(id);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'paused');
  await page.getByRole('button', { name: '恢复已有草稿' }).click();
  await expect(page.getByText('恢复会替换当前未保存画面；请先导出当前画作。')).toBeVisible();
  await page.getByRole('button', { name: '暂不恢复，保留草稿' }).click(); expect(await digest(page)).toEqual(temporary);
  await page.getByRole('button', { name: '恢复已有草稿' }).click();
  await page.getByRole('button', { name: '确认恢复并替换当前画面' }).click(); expect(await digest(page)).toEqual(original);
});

test('B write failure cannot claim saved, retains both current painting and previous committed draft', async ({ page }) => {
  await ready(page); await draw(page, single); await saved(page); const id = await storedId(page);
  await page.evaluate(() => { (window as any).__originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('Injected quota failure', 'QuotaExceededError'); }; });
  await draw(page, [{ x: 300, y: 650 }, { x: 800, y: 650 }]); const current = await digest(page);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'failed', { timeout: 15000 });
  expect(await digest(page)).toEqual(current); expect(await storedId(page)).toBe(id);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 PNG', exact: true }).click();
  await (await download).saveAs(`${artifact}/save-failure-export.png`);
  await page.screenshot({ path: `${artifact}/save-failure.png` });
  writeFileSync(`${artifact}/save-failure-results.json`, JSON.stringify({ status: '通过', fault: 'test-only IDBObjectStore.put throws QuotaExceededError', visibleState: '保存失败', currentPreserved: (await digest(page)).color === current.color, oldStoredIdPreserved: (await storedId(page)) === id, export: 'save-failure-export.png' }, null, 2));
  await page.evaluate(() => { IDBObjectStore.prototype.put = (window as any).__originalPut; });
  await page.getByRole('button', { name: '重试保存', exact: true }).click(); await saved(page);
  expect(await digest(page)).toEqual(current); expect(await storedId(page)).not.toBe(id);
});

test('B corrupted bytes are rejected without replacing stored data; drawing and export remain available', async ({ page }) => {
  await ready(page); await draw(page, single); await saved(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const req = indexedDB.open('slowlight-current-draft', 1); req.onsuccess = () => { const db = req.result, tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts'), get = store.get('current'); get.onsuccess = () => { const record = get.result; record.height[0] ^= 1; store.put(record, 'current'); }; tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; }));
  const corruptedId = await storedId(page); await page.reload();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'failed');
  await expect(page.getByTestId('save-state')).toContainText('校验未通过');
  await draw(page, single); const current = await digest(page); await page.waitForTimeout(1000);
  expect(await storedId(page)).toBe(corruptedId); expect(await digest(page)).toEqual(current);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 PNG', exact: true }).click(); await (await download).saveAs(`${artifact}/corrupt-draft-export.png`);
  writeFileSync(`${artifact}/corruption-results.json`, JSON.stringify({ status: '通过', fault: 'test-only single height bit changed without updating checksum', rejected: true, storedRecordPreserved: true, inMemoryDrawingAndExport: true }, null, 2));
});

test('C real travel sunset journey, signed preview/download, return to edit and signature recovery', async ({ page }) => {
  test.setTimeout(180000); mkdirSync(artifact, { recursive: true });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const began = Date.now(); await ready(page);
  // Test-only stage timings diagnose asynchronous browser export stalls.
  await page.evaluate(() => {
    const events: unknown[] = []; (window as any).__exportTimings = events;
    const mark = (stage: string) => events.push({ stage, at: performance.now() });
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) { mark('toBlob start'); return toBlob.call(this, blob => { mark('toBlob done'); callback(blob); }, ...args); };
    const bitmap = window.createImageBitmap;
    (window as any).createImageBitmap = async (...args: any[]) => { mark('bitmap start'); const result = await (bitmap as any)(...args); mark('bitmap done'); return result; };
    document.fonts.ready.then(() => mark('fonts ready'));
    const convert = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = async function (...args) { mark('convertToBlob start'); const result = await convert.apply(this, args); mark('convertToBlob done'); return result; };
  });
  await page.screenshot({ path: `${artifact}/first-screen.png` });
  await page.getByRole('button', { name: '画一幅旅行日落', exact: true }).click();
  await page.getByRole('button', { name: '采用本步建议' }).click();
  await draw(page, line(80, 105, 945, 105, 30)); const firstStrokeMs = Date.now() - began;
  for (const y of [160, 215, 270]) await draw(page, line(80, y, 945, y, 30));
  await page.getByRole('button', { name: '选择日落黄', exact: true }).click();
  for (const y of [325, 380, 435, 490]) await draw(page, line(80, y, 945, y, 30));
  await page.getByRole('button', { name: '选择暖白', exact: true }).click();
  await page.getByLabel('笔刷大小', { exact: true }).fill('64');
  const sun = Array.from({ length: 25 }, (_, i) => ({ x: 565 + 14 * Math.cos(i * Math.PI / 12), y: 428 + 14 * Math.sin(i * Math.PI / 12) })); await draw(page, sun);
  await page.getByRole('button', { name: '继续下一步' }).click(); await page.getByRole('button', { name: '采用本步建议' }).click();
  await draw(page, [{ x: 65, y: 545 }, { x: 205, y: 470 }, { x: 325, y: 515 }, { x: 415, y: 450 }, { x: 555, y: 540 }, { x: 745, y: 480 }, { x: 955, y: 555 }]);
  await draw(page, line(70, 560, 950, 560, 30));
  await page.getByRole('button', { name: '继续下一步' }).click(); await page.getByRole('button', { name: '采用本步建议' }).click();
  for (const y of [605, 650, 695, 740, 785, 830, 875, 920]) await draw(page, line(75, y, 950, y, 30));
  await page.getByRole('button', { name: '继续下一步' }).click(); await page.getByRole('button', { name: '采用本步建议' }).click();
  for (let i = 0; i < 7; i++) await draw(page, line(555 - 18 - i * 10, 625 + i * 42, 570 + 18 + i * 10, 625 + i * 42, 12));
  await page.getByRole('button', { name: '选择深褐', exact: true }).click();
  await draw(page, [{ x: 760, y: 780 }, { x: 790, y: 790 }, { x: 825, y: 780 }]);
  await draw(page, [{ x: 792, y: 782 }, { x: 792, y: 735 }]);
  const art = await digest(page); await page.screenshot({ path: `${artifact}/sunset-guided.png` });
  const rootExport = async (name: string) => { const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 PNG', exact: true }).click(); await (await event).saveAs(`${artifact}/${name}.png`); };
  await rootExport('guided-export');
  await page.getByRole('button', { name: '关闭引导' }).click(); expect(await digest(page)).toEqual(art);
  await page.screenshot({ path: `${artifact}/sunset-guide-closed.png` }); await rootExport('unsigned-sunset');
  expect(readFileSync(`${artifact}/guided-export.png`).equals(readFileSync(`${artifact}/unsigned-sunset.png`))).toBe(true);
  await page.getByRole('button', { name: '继续旅行日落引导' }).click();
  await page.getByRole('button', { name: '完成引导', exact: true }).click();
  await page.getByLabel('给这幅画签名', { exact: false }).fill('Lina · 2026');
  try { await expect(page.getByTestId('work-preview')).toHaveAttribute('data-signature', 'Lina · 2026'); }
  catch (error) {
    const atFailure = await page.evaluate(() => ({ events: (window as any).__exportTimings, fonts: document.fonts.status, renderer: window.__studio!.renderer.info() }));
    await page.waitForTimeout(10000); // Diagnostic only: the original failed assertion is rethrown.
    const afterWait = await page.evaluate(() => ({ events: (window as any).__exportTimings, fonts: document.fonts.status, preview: !!document.querySelector('[data-testid=work-preview]') }));
    writeFileSync(`${artifact}/preview-stall.json`, JSON.stringify({ atFailure, afterWait }, null, 2)); throw error;
  }
  await expect(page.getByRole('button', { name: '保存这幅画 · PNG', exact: true })).toBeEnabled();
  await page.getByTestId('work-preview').evaluate((img: HTMLImageElement) => img.decode());
  const preview = await page.getByTestId('work-preview').evaluate(async (img: HTMLImageElement) => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));
  writeFileSync(`${artifact}/preview.png`, Buffer.from(preview)); await page.screenshot({ path: `${artifact}/completion.png` });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '保存这幅画 · PNG', exact: true }).click(); await (await download).saveAs(`${artifact}/travel-sunset.png`);
  expect(readFileSync(`${artifact}/travel-sunset.png`).equals(Buffer.from(preview))).toBe(true); expect(await digest(page)).toEqual(art);
  const pixels = await page.evaluate(async ({ unsigned, signed }) => {
    const decode = async (base64: string) => { const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode(); const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0); return { width: c.width, height: c.height, bytes: ctx.getImageData(0, 0, c.width, c.height).data }; };
    const a = await decode(unsigned), b = await decode(signed); let signaturePixels = 0, outsideSignatureChanges = 0;
    for (let i = 0; i < a.bytes.length; i += 4) if (a.bytes.slice(i, i + 4).some((v, j) => v !== b.bytes[i + j])) { const x = i / 4 % 1024, y = Math.floor(i / 4 / 1024); if (x >= 320 && y >= 910 && y <= 990) signaturePixels++; else outsideSignatureChanges++; }
    return { width: b.width, height: b.height, signaturePixels, outsideSignatureChanges };
  }, { unsigned: readFileSync(`${artifact}/unsigned-sunset.png`).toString('base64'), signed: readFileSync(`${artifact}/travel-sunset.png`).toString('base64') });
  expect(pixels.width).toBe(1024); expect(pixels.height).toBe(1024); expect(pixels.signaturePixels).toBeGreaterThan(50); expect(pixels.outsideSignatureChanges).toBe(0);
  await page.getByRole('button', { name: '返回修改', exact: true }).click(); expect(await digest(page)).toEqual(art);
  await page.getByRole('button', { name: '清空画布', exact: true }).click(); await page.getByRole('button', { name: '继续画', exact: true }).click(); expect(await digest(page)).toEqual(art);
  const exportTimings = await page.evaluate(() => (window as any).__exportTimings ?? []);
  await saved(page); await page.reload(); await page.getByRole('button', { name: '恢复草稿', exact: true }).click(); expect(await digest(page)).toEqual(art);
  await page.getByRole('button', { name: '签名与完成', exact: true }).click(); await expect(page.getByLabel('给这幅画签名')).toHaveValue('Lina · 2026');
  await expect(page.getByRole('button', { name: '保存这幅画 · PNG', exact: true })).toBeEnabled();
  expect(errors).toEqual([]); expect(firstStrokeMs).toBeLessThan(60000);
  writeFileSync(`${artifact}/journey-results.json`, JSON.stringify({ status: '通过', firstStrokeMs, timingScope: 'automated Playwright flow, not a first-time human test', pixels, guideExportIdentical: true, previewDownloadIdentical: true, restoredSignature: 'Lina · 2026', art, errors, environment: await page.evaluate(() => ({ userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], ...window.__studio!.renderer.info() })) }, null, 2));
  writeFileSync(`${artifact}/export-timings.json`, JSON.stringify(exportTimings, null, 2));
  const video = page.video()!; await page.close(); await video.saveAs(`${artifact}/journey.webm`);
});

test('C newer draft in another tab cannot be silently overwritten by an older session', async ({ page, context }) => {
  await ready(page); await draw(page, single); await saved(page);
  const second = await context.newPage(); await ready(second); await second.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await draw(second, [{ x: 200, y: 650 }, { x: 800, y: 650 }]); await saved(second); const latestId = await storedId(second);
  await draw(page, [{ x: 200, y: 800 }, { x: 800, y: 800 }]); const current = await digest(page);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'failed', { timeout: 15000 });
  await expect(page.getByTestId('save-state')).toContainText('另一个页面已更新');
  expect(await storedId(page)).toBe(latestId); expect(await digest(page)).toEqual(current); await second.close();
});
