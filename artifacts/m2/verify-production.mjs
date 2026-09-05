// Delivery-only smoke check of the built app; no development diagnostics used.
import { chromium, expect } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const out = 'artifacts/m2/delivery';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const checks = [];
try {
  for (const fallback of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (fallback) await context.addInitScript(() => { Object.defineProperty(window, 'Worker', { value: undefined, configurable: true }); });
    const page = await context.newPage(), errors = [], workers = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('worker', worker => workers.push(worker.url()));
    await page.goto('http://127.0.0.1:5176/?test=1');
    await expect(page.getByTestId('save-state')).not.toHaveAttribute('data-phase', 'loading');
    expect(await page.evaluate(() => typeof window.__studio)).toBe('undefined');
    await page.getByRole('button', { name: '画一幅旅行日落', exact: true }).click();
    await page.getByRole('button', { name: '采用本步建议', exact: true }).click();
    const box = await page.getByTestId('painting-surface').boundingBox();
    await page.mouse.move(box.x + box.width * .15, box.y + box.height * .25);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * .8, box.y + box.height * .35, { steps: 40 }); await page.mouse.up();
    await page.getByRole('button', { name: '签名与完成', exact: true }).click();
    await page.getByLabel('给这幅画签名').fill(fallback ? 'Native fallback' : 'Production · 2026');
    const exportButton = page.getByRole('button', { name: '保存这幅画 · PNG', exact: true });
    await expect(exportButton).toBeEnabled({ timeout: fallback ? 30000 : 5000 });
    const preview = Buffer.from(await page.getByTestId('work-preview').evaluate(async img => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer()))));
    const event = page.waitForEvent('download'); await exportButton.click();
    const path = `${out}/production${fallback ? '-fallback' : ''}.png`; await (await event).saveAs(path);
    const bytes = readFileSync(path), decoded = PNG.sync.read(bytes);
    expect(bytes.equals(preview)).toBe(true); expect([decoded.width, decoded.height]).toEqual([1024, 1024]);
    if (!fallback) {
      await page.screenshot({ path: `${out}/production-completion.png` });
      await page.getByRole('button', { name: '返回修改', exact: true }).click();
      await expect(page.getByTestId('save-state')).toHaveAttribute('data-phase', 'saved', { timeout: 15000 });
      await page.reload(); await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
      await page.getByRole('button', { name: '签名与完成', exact: true }).click();
      await expect(page.getByLabel('给这幅画签名')).toHaveValue('Production · 2026');
      await expect(exportButton).toBeEnabled();
      const restored = Buffer.from(await page.getByTestId('work-preview').evaluate(async img => Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer()))));
      expect(restored.equals(bytes)).toBe(true);
      expect(workers.some(url => /assets\/png\.worker-.*\.js$/.test(url))).toBe(true);
    } else expect(workers).toHaveLength(0);
    expect(errors).toEqual([]);
    checks.push({ status: '通过', mode: fallback ? 'Worker unavailable injected; native toBlob compatibility' : 'production bundled Worker; refresh and identical signed PNG', developmentHookAbsent: true, size: [decoded.width, decoded.height], previewDownloadIdentical: true, workers, errors });
    await context.close();
  }
  writeFileSync(`${out}/production-results.json`, JSON.stringify({ status: '通过', checks, scope: 'Local vite preview of current dist. No deployment. Fallback API absence is injected in Chrome, not an old-browser test.' }, null, 2));
  console.log(JSON.stringify(checks, null, 2));
} finally { await browser.close(); }
