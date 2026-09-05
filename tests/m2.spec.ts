import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, draw, digest, settle } from './helpers';
import { single } from './fixtures/strokes';
const artifact = process.env.M1_ARTIFACT_DIR || 'artifacts/m2';

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
