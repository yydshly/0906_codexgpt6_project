import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, draw, digest, settle } from './helpers';
import { single } from './fixtures/strokes';
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
