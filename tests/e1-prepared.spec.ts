import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ready, digest } from './helpers';
import { experimentDigest, experimentPng, storedDraft } from './e1-helpers';

test('prepared studio requires confirmation, dips at actual fixed dishes and preserves the main studio', async ({ page }) => {
  const dir = `${process.env.M1_ARTIFACT_DIR || 'artifacts/e1/prepared-studio/local'}/prepared`; mkdirSync(dir,{recursive:true});
  await ready(page); const main=await digest(page), draft=await storedDraft(page);
  await page.screenshot({path:`${dir}/original-studio.png`});
  await page.getByRole('button',{name:'图片自动绘制 · 实验',exact:true}).click();
  await page.getByLabel('选择本地图片',{exact:true}).setInputFiles('artifacts/e1/fixtures/landscape.jpg');
  const empty=await experimentDigest(page);
  await page.getByRole('button',{name:'确认构图，准备笔与颜色',exact:true}).click();
  await expect(page.getByRole('button',{name:'确认准备，开始绘制',exact:true})).toBeEnabled({timeout:130000});
  await page.waitForTimeout(300); expect(await experimentDigest(page)).toEqual(empty);
  expect(await page.evaluate(()=>window.__experiment!.player!.state)).toBe('ready');
  await expect(page.getByRole('button',{name:'继续绘制',exact:true})).toBeDisabled();
  const inventory=await page.evaluate(()=>window.__experiment!.plan!.materials!);
  await expect(page.locator('[data-dish-id]')).toHaveCount(inventory.dishes.length);
  await expect(page.locator('[data-brush-id]')).toHaveCount(inventory.brushes.length);
  await page.screenshot({path:`${dir}/prepared-screen.png`});
  const stations=await page.locator('[data-dish-id]').evaluateAll(elements=>elements.map(e=>({id:(e as HTMLElement).dataset.dishId,color:(e as HTMLElement).dataset.color})));
  await page.getByLabel('播放速度',{exact:true}).selectOption('0.5');
  await page.getByRole('button',{name:'确认准备，开始绘制',exact:true}).click();
  await page.waitForFunction(()=>{const p=window.__experiment!.player!;if(p.action==='dip'){p.pause();return true;}return false;});
  expect(await experimentDigest(page)).toEqual(empty);
  const contact=await page.evaluate(()=>{
    const p=window.__experiment!.player!, stroke=p.plan.strokes[p.index];
    const rect=document.querySelector('.experiment-surface')!.getBoundingClientRect(), dish=document.querySelector(`[data-dish-id="${stroke.dishId}"] .prepared-well`)!.getBoundingClientRect();
    return { tip:{...p.tip}, brush:stroke.brushId,dish:stroke.dishId,held:p.heldBrushId,screenX:rect.left+p.tip.x*rect.width/1024,screenY:rect.top+p.tip.y*rect.height/1024,dishBounds:{left:dish.left,right:dish.right,top:dish.top,bottom:dish.bottom} };
  });
  expect(contact.held).toBe(contact.brush); expect(contact.screenX).toBeGreaterThan(contact.dishBounds.left); expect(contact.screenX).toBeLessThan(contact.dishBounds.right);
  expect(contact.screenY).toBeGreaterThan(contact.dishBounds.top); expect(contact.screenY).toBeLessThan(contact.dishBounds.bottom);
  await expect(page.locator('[data-brush-id][data-away="true"]')).toHaveCount(1);
  await page.screenshot({path:`${dir}/dip-at-fixed-dish.png`});
  const frozen=await experimentDigest(page); await page.waitForTimeout(250); expect(await experimentDigest(page)).toEqual(frozen);
  for (const width of [1000,700,1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForFunction(()=>{
      const p=window.__experiment!.player!, stroke=p.plan.strokes[p.index];
      const rect=document.querySelector('.experiment-surface')!.getBoundingClientRect(), d=document.querySelector(`[data-dish-id="${stroke.dishId}"] .prepared-well`)!.getBoundingClientRect();
      const x=rect.left+p.tip.x*rect.width/1024,y=rect.top+p.tip.y*rect.height/1024;
      return x>d.left && x<d.right && y>d.top && y<d.bottom;
    });
    expect(await experimentDigest(page)).toEqual(frozen);
    expect(await page.evaluate(()=>window.__experiment!.player!.state)).toBe('paused');
  }
  await page.getByLabel('播放速度',{exact:true}).selectOption('4');
  await page.getByRole('button',{name:'继续绘制',exact:true}).click();
  await page.waitForFunction(()=>{const p=window.__experiment!.player!;if(p.index>=35){p.pause();return true;}return false;});
  expect(await experimentDigest(page)).not.toEqual(empty);
  expect(await page.locator('[data-dish-id]').evaluateAll(elements=>elements.map(e=>({id:(e as HTMLElement).dataset.dishId,color:(e as HTMLElement).dataset.color})))).toEqual(stations);
  const partial=await experimentPng(page,`${dir}/actual-partial.png`);
  await page.getByRole('button',{name:'展开原图',exact:true}).click();
  expect((await experimentPng(page,`${dir}/partial-with-reference.png`)).equals(partial)).toBe(true);
  await page.getByRole('button',{name:'收起原图',exact:true}).click();
  await page.screenshot({path:`${dir}/actual-painting.png`});
  const download=page.waitForEvent('download'); await page.getByRole('button',{name:'导出实验 PNG',exact:true}).click(); await (await download).saveAs(`${dir}/downloaded-partial.png`);
  const before=await experimentDigest(page);
  await page.getByRole('button',{name:'居中方形 · 裁切',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续绘制',exact:true})).toBeDisabled(); expect(await experimentDigest(page)).toEqual(before);
  await page.getByRole('button',{name:'确认构图，准备笔与颜色',exact:true}).click();
  await page.getByRole('button',{name:'取消，保留实验画作',exact:true}).click(); expect(await experimentDigest(page)).toEqual(before);
  await page.getByRole('button',{name:'返回画室',exact:true}).click(); await page.getByRole('button',{name:'确认退出实验',exact:true}).click();
  expect(await digest(page)).toEqual(main); expect(await storedDraft(page)).toEqual(draft);
  writeFileSync(`${dir}/checks.json`,JSON.stringify({status:'通过',inventory,contact,main,draft,partial:before,scope:'real input -> prepared inventory -> explicit start -> actual dip -> partial strokes -> real PNG; complete fixed samples tested separately'},null,2));
  const video=page.video(); await page.close(); if(video) await video.saveAs(`${dir}/actual-preparation-process.webm`);
});
