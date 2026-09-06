import { test, expect } from '@playwright/test';
import { ready, digest } from './helpers';
import { mkdirSync, writeFileSync } from 'node:fs';

const root = process.env.M1_ARTIFACT_DIR || 'artifacts/e1/a';
test('E1-A actual redraw in the existing page with isolated state', async ({ page }, info) => {
  mkdirSync(root, { recursive: true });
  await ready(page); const before = await digest(page);
  await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles('artifacts/e1/fixtures/landscape.jpg');
  await expect(page.getByRole('button', { name: '确认构图并绘制' })).toBeEnabled();
  await page.screenshot({ path: `${root}/first-screen.png` });
  await page.getByRole('button', { name: '确认构图并绘制' }).click();
  await page.waitForFunction(() => !!window.__experiment?.player, { timeout: 180000 });
  await page.waitForFunction(() => window.__experiment?.player?.state === 'complete', { timeout: 180000 });
  await page.screenshot({ path: `${root}/landscape-result.png` });
  const output = await page.evaluate(async () => {
    const e = window.__experiment!, p = e.painting;
    const blob = await e.renderer.exportPng();
    return { png: Array.from(new Uint8Array(await blob.arrayBuffer())), plan: e.plan, planningMs: e.planningMs, metrics: e.player!.metrics, memory: p.memory(), renderer: e.renderer.info(), hasPaint: p.color.some(Boolean), hasHeight: p.height.some(Boolean) };
  });
  expect(output.hasPaint).toBe(true); expect(output.hasHeight).toBe(true); expect(output.memory.historyCount).toBe(0); expect(output.plan!.strokes.length).toBeGreaterThan(100);
  writeFileSync(`${root}/landscape.png`, Buffer.from(output.png));
  writeFileSync(`${root}/plan.json`, JSON.stringify(output.plan));
  const { png: _png, plan: _plan, ...metrics } = output; writeFileSync(`${root}/metrics.json`, JSON.stringify(metrics, null, 2));
  expect(await digest(page)).toEqual(before);
  const video = page.video(); await page.close(); if (video) await video.saveAs(`${root}/actual-process.webm`);
  await info.attach('metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
});
