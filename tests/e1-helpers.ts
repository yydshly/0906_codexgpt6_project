import { expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
export const experimentDigest = (page: Page) => page.evaluate(async () => {
  const p = window.__experiment!.painting;
  const hash = async (a: Uint8ClampedArray | Uint16Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', a.buffer as ArrayBuffer))).map(x => x.toString(16).padStart(2, '0')).join('');
  return { color: await hash(p.color), height: await hash(p.height) };
});
// Visible travel and drawing intentionally take longer; CPU batch gates stay unchanged.
export const completed = (page: Page) => page.waitForFunction(() => window.__experiment?.player?.state === 'complete', undefined, { timeout: 1200000 });
export async function loadedPlan(page: Page) {
  await page.waitForFunction(() => !!window.__experiment?.player || /失败|未能完成|超过 120 秒/.test(document.querySelector('.experiment-message[role="status"]')?.textContent || ''), undefined, { timeout: 130000 });
  expect(await page.evaluate(() => !!window.__experiment?.player), await page.locator('.experiment-message[role="status"]').innerText()).toBe(true);
  // These legacy workflow setups expect a preservable artwork, after the first pickup.
  await page.waitForFunction(() => window.__experiment?.player?.hasPaint);
}
export async function experimentPng(page: Page, path: string) {
  const encoded = await page.evaluate(async () => {
    const blob = await window.__experiment!.renderer.exportPng();
    return new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(blob); });
  });
  const bytes = Buffer.from(encoded.split(',')[1], 'base64');
  expect(bytes.subarray(1, 4).toString()).toBe('PNG'); expect(bytes.readUInt32BE(16)).toBe(1024); expect(bytes.readUInt32BE(20)).toBe(1024);
  mkdirSync(path.substring(0, path.lastIndexOf('/')), { recursive: true }); writeFileSync(path, bytes); return bytes;
}
export const storedDraft = (page: Page) => page.evaluate(() => new Promise<unknown>((resolve, reject) => {
  const req = indexedDB.open('slowlight-current-draft', 1);
  req.onsuccess = () => { const db = req.result, tx = db.transaction('drafts', 'readonly'), get = tx.objectStore('drafts').get('current'); tx.oncomplete = () => { const r = get.result; resolve(r ? { id: r.id, checksums: r.checksums, signature: r.signature, guide: r.guide, brush: r.brush } : null); db.close(); }; tx.onabort = () => reject(tx.error); }; req.onerror = () => reject(req.error);
}));
