import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ready, draw, digest } from './helpers';
import { loadedPlan, completed, experimentDigest, experimentPng, storedDraft } from './e1-helpers';

test('visible pen pauses inside a stroke; export and context loss preserve continuation', async ({ page }) => {
  const dir = `${process.env.M1_ARTIFACT_DIR || 'artifacts/e1/refinement/local'}/pen`; mkdirSync(dir, { recursive: true });
  await ready(page); await draw(page, [{ x: 100, y: 300 }, { x: 400, y: 400 }]);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
  const manual = await digest(page), saved = await storedDraft(page);
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles('artifacts/e1/fixtures/landscape.jpg');
  await page.getByLabel('播放速度', { exact: true }).selectOption('0.5');
  await page.getByRole('button', { name: '确认构图并绘制', exact: true }).click(); await loadedPlan(page);
  await page.waitForFunction(() => {
    const e = window.__experiment!, p = e.player!;
    if (e.painting.active && p.sampleIndex >= 3 && p.tip.down) { p.pause(); return true; }
    return false;
  });
  const first = await experimentDigest(page), tip = await page.evaluate(() => ({ ...window.__experiment!.player!.tip }));
  const sampleIndex = await page.evaluate(() => window.__experiment!.player!.sampleIndex);
  expect(await page.evaluate(() => window.__experiment!.painting.active)).toBe(true);
  await expect(page.getByTestId('experiment-pen')).toHaveAttribute('data-down', 'true');
  await page.waitForTimeout(350); expect(await experimentDigest(page)).toEqual(first);
  expect(await page.evaluate(() => window.__experiment!.player!.tip)).toEqual(tip);
  await page.screenshot({ path: `${dir}/paused-inside-stroke.png` });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出实验 PNG', exact: true }).click();
  await (await download).saveAs(`${dir}/partial.png`);
  expect(await experimentDigest(page)).toEqual(first);
  expect(await page.evaluate(() => window.__experiment!.painting.active)).toBe(true);
  expect(await page.evaluate(() => window.__experiment!.player!.sampleIndex)).toBe(sampleIndex);
  await page.getByTestId('experiment-pen').evaluate(element => { (element as SVGElement).style.visibility = 'hidden'; });
  expect((await experimentPng(page, `${dir}/without-pen.png`)).equals(readFileSync(`${dir}/partial.png`))).toBe(true);
  await page.getByTestId('experiment-pen').evaluate(element => { (element as SVGElement).style.visibility = ''; });
  // Replacing even a partially drawn first stroke must offer the preservation choice.
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles('artifacts/e1/fixtures/complex.jpg');
  await page.getByRole('button', { name: '取消，保留实验画作', exact: true }).click(); expect(await experimentDigest(page)).toEqual(first);
  await page.evaluate(() => window.__experiment!.renderer.gl!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByText('正在使用简化画布显示，局部材质光照暂不可用。')).toBeVisible();
  expect(await experimentDigest(page)).toEqual(first); expect(await page.evaluate(() => window.__experiment!.painting.active)).toBe(true);
  await experimentPng(page, `${dir}/fallback-partial.png`); expect(await experimentDigest(page)).toEqual(first);
  await page.getByRole('button', { name: '继续绘制', exact: true }).click();
  await page.waitForFunction(prior => { const p = window.__experiment!.player!; if (p.tip.down && p.sampleIndex > prior) { p.pause(); return true; } return false; }, sampleIndex);
  const moved = await page.evaluate(() => ({ ...window.__experiment!.player!.tip })); expect(moved).not.toEqual(tip); expect(await experimentDigest(page)).not.toEqual(first);
  await page.screenshot({ path: `${dir}/pen-moved.png` });
  await page.getByLabel('播放速度', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: '继续绘制', exact: true }).click(); await completed(page);
  const final = await experimentDigest(page), expected = JSON.parse(readFileSync('artifacts/e1/refinement/r1-verified/landscape/results.json', 'utf8')).final;
  expect(final).toEqual(expected); await expect(page.getByTestId('experiment-pen')).toHaveCount(0);
  await experimentPng(page, `${dir}/fallback-final.png`);
  await page.getByRole('button', { name: '返回画室', exact: true }).click(); await page.getByRole('button', { name: '确认退出实验', exact: true }).click();
  expect(await digest(page)).toEqual(manual); expect(await storedDraft(page)).toEqual(saved);
  writeFileSync(`${dir}/results.json`, JSON.stringify({ status: '通过', first, sampleIndex, tip, moved, final, expected, checks: ['pen follows actual samples', 'pause freezes partial stroke', 'partial export keeps active stroke', 'pen excluded from PNG', 'replacement cancellation preserves partial painting', 'context loss and fallback export preserve active stroke', 'continued result equals independent complete execution', 'M2 unchanged'], humanProcess: '待用户确认' }, null, 2));
  const video = page.video(); await page.close(); if (video) await video.saveAs(`${dir}/process.webm`);
});
