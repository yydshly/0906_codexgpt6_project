import { expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Brush } from '../src/painting/engine';

export const artifact = process.env.M1_ARTIFACT_DIR || 'artifacts/m1';
export async function ready(page:Page, query='') {
  await page.goto('/?test=1'+query); await page.waitForFunction(()=>!!window.__studio);
  await settle(page);
}
export async function settle(page:Page) { await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))); }
export async function settings(page:Page, brush:Partial<Brush>) { await page.evaluate(b=>window.__studio!.setBrush(b),brush); await settle(page); }
export async function draw(page:Page, points:{x:number;y:number}[]) {
  const box=await page.getByTestId('painting-surface').boundingBox(); expect(box).not.toBeNull();
  const pos=(p:{x:number;y:number})=>({x:box!.x+p.x/1024*box!.width,y:box!.y+p.y/1024*box!.height});
  let p=pos(points[0]); await page.mouse.move(p.x,p.y);await page.mouse.down();
  for(const point of points.slice(1)){p=pos(point);await page.mouse.move(p.x,p.y);}
  await page.mouse.up(); await page.mouse.move(30,120); await settle(page);
}
export async function clear(page:Page) {
  if(await page.getByRole('button',{name:'清空画布',exact:true}).isEnabled()) {
    await page.getByRole('button',{name:'清空画布',exact:true}).click();await page.getByRole('button',{name:'确认清空',exact:true}).click();await settle(page);
  }
}
export async function exportSample(page:Page,name:string) {
  const data=await page.evaluate(async()=>{const blob=await window.__studio!.renderer.exportPng();return new Promise<string>(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.readAsDataURL(blob);});});
  mkdirSync(artifact,{recursive:true});writeFileSync(`${artifact}/${name}.png`,Buffer.from(data.split(',')[1],'base64'));
}
export async function digest(page:Page) { return page.evaluate(async()=>{ const p=window.__studio!.painting; const hash=async(a:Uint8ClampedArray|Uint16Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a.buffer as ArrayBuffer))).map(x=>x.toString(16).padStart(2,'0')).join('');return {color:await hash(p.color),height:await hash(p.height)}; }); }
