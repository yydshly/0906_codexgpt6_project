import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ready } from './helpers';
import type { StrokePlan } from '../src/experiment/plan';

test('quality mode discloses failed fidelity gate and preserves usable review layout',async({page})=>{
  const dir=`${process.env.M1_ARTIFACT_DIR}/final-ui`;mkdirSync(dir,{recursive:true});
  await ready(page);await page.getByRole('button',{name:'图片自动绘制 · 实验',exact:true}).click();
  await page.getByRole('button',{name:'成品细节 · 实验',exact:true}).click();
  await expect(page.getByText('尝试保留更多可见细节；本轮人物成品验证未通过，仍可能丢失结构。',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'查看自动成品质量实测 ↗',exact:true})).toHaveAttribute('href','/artifacts/e1/finished-quality/index.html');
  await page.getByLabel('选择本地图片',{exact:true}).setInputFiles('artifacts/e1/finished-quality/fixtures/portrait-holdout.jpg');
  await page.getByRole('button',{name:'确认构图，准备笔与颜色',exact:true}).click();
  await expect(page.getByRole('button',{name:'确认准备，开始绘制',exact:true})).toBeEnabled({timeout:130000});
  const widths=[];
  for(const width of [1440,700,360]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
    const layout=await page.locator('.image-experiment').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));expect(layout.scroll).toBeLessThanOrEqual(layout.width+1);widths.push({viewport:width,...layout});
    await page.screenshot({path:`${dir}/page-${width}.png`,fullPage:true});
  }
  writeFileSync(`${dir}/checks.json`,JSON.stringify({status:'通过',widths,scope:'Text/layout and actual preparation after explicit failed-quality disclosure. Viewports are simulations, not devices.'},null,2));
});

// Fixed before tuning; do not use holdout outputs for another adjustment round.
for (const sample of ['portrait-holdout', 'landscape', 'still-life', 'complex']) test(`frozen quality ${sample}: native reference, baseline and actual stages`, async ({ page }) => {
  const dir = `${process.env.M1_ARTIFACT_DIR}/${sample}`; mkdirSync(dir, { recursive: true });
  const file = sample === 'portrait-holdout' ? 'artifacts/e1/finished-quality/fixtures/portrait-holdout.jpg' : `artifacts/e1/fixtures/${sample}.jpg`;
  const bytes = readFileSync(file), inputHash = createHash('sha256').update(bytes).digest('hex');
  const external: string[] = [], errors: string[] = [];
  await page.route('**/*', route => { const u = route.request().url(); if (/^(http:\/\/127\.0\.0\.1:5174\/|blob:|data:)/.test(u)) return route.continue(); external.push(u); return route.abort(); });
  page.on('pageerror', e => errors.push(e.message));
  await ready(page); await page.getByRole('button', { name: '图片自动绘制 · 实验', exact: true }).click();
  await page.getByRole('button', { name: '成品细节 · 实验', exact: true }).click();
  await page.getByLabel('选择本地图片', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '确认构图，准备笔与颜色', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认准备，开始绘制', exact: true })).toBeEnabled({ timeout: 130000 });
  const plan: StrokePlan = await page.evaluate(() => window.__experiment!.plan!);
  expect(plan.plannerVersion).toBe('e1-finished-quality-1'); expect(plan.detailSize).toBe(1024);
  expect(plan.inputHash).toBe(inputHash); expect(plan.strokes.length).toBeLessThanOrEqual(8020);
  expect(plan.materials!.dishes.length).toBeLessThanOrEqual(24); expect(plan.materials!.brushes.length).toBeLessThanOrEqual(8);
  expect(await page.evaluate(() => window.__experiment!.painting.color.every(v => v === 0))).toBe(true);
  await page.screenshot({ path: `${dir}/prepared.png`, fullPage: true });
  const results = await page.evaluate(async ({ encoded, plan }) => {
    const { decodeLocalImage, analyzeImage, detailReference } = await import('../src/experiment/image');
    const { createPlan, executeStroke } = await import('../src/experiment/plan');
    const { Painting } = await import('../src/painting/engine');
    const { StudioRenderer } = await import('../src/rendering/renderer');
    const file = new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], 'sample.jpg');
    const decoded = await decodeLocalImage(file), global = analyzeImage(decoded.bitmap, 'contain'), detail = detailReference(decoded.bitmap, 'contain'); decoded.bitmap.close();
    const referenceCanvas = document.createElement('canvas'); referenceCanvas.width = referenceCanvas.height = 1024;
    referenceCanvas.getContext('2d')!.putImageData(new ImageData(detail,1024,1024),0,0);
    const sourcePng = referenceCanvas.toDataURL();
    const start = performance.now(), baseline = createPlan(global.pixels,'contain',plan.inputHash,()=>{},true,'structure'), baselinePlanningMs = performance.now()-start;
    const hash = async (a: Uint8ClampedArray | Uint16Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a.buffer as ArrayBuffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const output = [];
    for (const current of [baseline, plan]) {
      const p = new Painting(false), c = document.createElement('canvas'), f = document.createElement('canvas');
      const renderer = new StudioRenderer(c,f,p,()=>{}), stages = [];
      let computeMs = 0, exportMs = 0;
      for(let stage=0; stage<current.stages.length; stage++) {
        for(let i=stage?current.stages[stage-1].end:0;i<current.stages[stage].end;i++) { const t=performance.now();executeStroke(p,current.strokes[i]);computeMs+=performance.now()-t; if(i%64===0)await new Promise(r=>setTimeout(r,0)); }
        const t=performance.now(), blob=await renderer.exportPng(); exportMs+=performance.now()-t;
        const png=await new Promise<string>(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.readAsDataURL(blob);});
        stages.push({png,color:await hash(p.color),height:await hash(p.height)});
      }
      const flat=document.createElement('canvas');flat.width=flat.height=1024;flat.getContext('2d')!.putImageData(new ImageData(p.color.slice(),1024,1024),0,0);
      let squared=0,count=0;for(let i=0;i<detail.length;i+=4){if(detail[i+3]<240)continue;const a=p.color[i+3]/255;for(let k=0;k<3;k++)squared+=(detail[i+k]-(p.color[i+k]*a+[242,238,226][k]*(1-a)))**2;count+=3;}
      output.push({plan:current,stages,flat:flat.toDataURL(),computeMs,exportMs,rmse:Math.sqrt(squared/count),memory:p.memory(),renderer:renderer.info()});
      renderer.dispose();renderer.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    return {sourcePng,output,baselinePlanningMs,qualityPlanningMs:window.__experiment!.planningMs};
  }, { encoded: bytes.toString('base64'), plan });
  const save = (name: string, png: string) => writeFileSync(`${dir}/${name}.png`, Buffer.from(png.split(',')[1],'base64'));
  save('source-composed',results.sourcePng);
  const summaries = [];
  for(const [index,result] of results.output.entries()) {
    const prefix=index?'quality':'baseline';writeFileSync(`${dir}/${prefix}-plan.json`,JSON.stringify(result.plan));save(`${prefix}-flat`,result.flat);
    result.stages.forEach((s,i)=>save(`${prefix}-stage-${i+1}`,s.png));
    summaries.push({prefix,strokes:result.plan.strokes.length,materials:result.plan.materials!.dishes.length,pickups:result.plan.pickups!.length,computeMs:result.computeMs,exportMs:result.exportMs,rmseDiagnosticOnly:result.rmse,memory:result.memory,renderer:result.renderer,stages:result.stages.map(({png,...state})=>state)});
  }
  expect(external).toEqual([]); expect(errors).toEqual([]);
  writeFileSync(`${dir}/results.json`,JSON.stringify({status:'通过',sample,inputHash,composition:'contain',seed:1906,qualityPlanningMs:results.qualityPlanningMs,baselinePlanningMs:results.baselinePlanningMs,summaries,external,errors,note:'Actual offline stage execution, not an animated-process recording. Numerical residual is diagnostic only; human quality pending.'},null,2));
});
