// Private local analysis. Outputs MUST be outside the repository / dev-server root.
// No private input, plan, screenshot or generated image is committed by this script.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [input, destination, regionArgument, paletteArgument='24', focusArgument='off'] = process.argv.slice(2);
const paletteCount=Number(paletteArgument), focus=focusArgument==='focus', quality=focusArgument==='quality';
if(![24,96].includes(paletteCount))throw new Error('Only fixed diagnostic palette counts 24/96 are allowed.');
if (!input || !destination) throw new Error('Usage: node scripts/local-painting-diagnosis.mjs INPUT OUTSIDE_REPO_DIRECTORY [x,y,width,height in original pixels]');
const repo=realpathSync(fileURLToPath(new URL('../',import.meta.url))),output=resolve(destination);
const outside=path=>{const rel=relative(repo,path);return !!rel&&(rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel));};
if (!outside(output)) throw new Error('Private output must be outside the repository.');
mkdirSync(output,{recursive:true});
if(!outside(realpathSync(output)))throw new Error('Private output resolves into the repository.');
const bytes=readFileSync(input), inputHash=createHash('sha256').update(bytes).digest('hex');
assert.equal(bytes.subarray(1,4).toString(),'PNG','Private diagnostic input must be PNG');
const originalSize={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
copyFileSync(input,`${output}/source.png`);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const external=[];
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.startsWith('http://127.0.0.1:5174/')){
      if(paletteCount!==24 && new URL(url).pathname==='/src/experiment/materials.ts'){
        const response=await route.fetch(), body=await response.text();
        assert.equal(body.split('export const MAX_DISHES = 24;').length,2,'Expected current source before local-only ablation');
        return route.fulfill({response,body:body.replace('export const MAX_DISHES = 24;',`export const MAX_DISHES = ${paletteCount};`)});
      }
      return route.continue();
    }
    if(/^(blob:|data:)/.test(url))return route.continue();external.push(url);return route.abort();
  });
  await page.goto('http://127.0.0.1:5174/?test=1');await page.waitForFunction(()=>!!window.__studio);
  await page.getByRole('button',{name:'图片自动绘制 · 实验',exact:true}).click();
  await page.getByLabel('选择本地图片',{exact:true}).setInputFiles(input);
  await page.getByRole('button',{name:'确认构图，准备笔与颜色',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.experiment-reference img')?.getAttribute('src')?.startsWith('data:'));
  const preview=await page.locator('.experiment-reference img').getAttribute('src');
  writeFileSync(`${output}/analysis-512.png`,Buffer.from(preview.split(',')[1],'base64'));
  const region=regionArgument?.split(',').map(Number);
  if(focus && (!region || region.length!==4 || !region.every(Number.isFinite)))throw new Error('Focus diagnostic requires a manually marked source-pixel rectangle');
  const summaries=[];
  for(const approach of quality ? ['quality'] : ['original','structure']) {
    const result=await page.evaluate(async ({approach,inputHash,region,originalSize,paletteCount,focus,originalData})=>{
      const {createPlan,executeStroke}=await import('/src/experiment/plan.ts');
      const {Painting}=await import('/src/painting/engine.ts');
      const {StudioRenderer}=await import('/src/rendering/renderer.ts');
      const {prepareDishes,dishMatcher}=await import('/src/experiment/materials.ts');
      const {structureImportance}=await import('/src/experiment/structure.ts');
      const {qualityDishes,qualityDistance}=await import('/src/experiment/quality.ts');
      const image=document.querySelector('.experiment-reference img');await image.decode();
      const analysis=document.createElement('canvas');analysis.width=analysis.height=512;
      const ctx=analysis.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,512,512).data;
      const dishes=approach==='quality'?qualityDishes(pixels):prepareDishes(pixels,approach==='structure'?structureImportance(pixels,512):undefined);
      const match=approach==='quality' ? color=>dishes.reduce((best,d)=>qualityDistance([1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),[1,3,5].map(i=>parseInt(d.color.slice(i,i+2),16)))<qualityDistance([1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),[1,3,5].map(i=>parseInt(best.color.slice(i,i+2),16)))?d:best) : dishMatcher(dishes);
      const palette=ctx.createImageData(512,512);
      for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<=8)continue;const color=match('#'+[pixels[i],pixels[i+1],pixels[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('')).color;palette.data.set([1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),i);palette.data[i+3]=pixels[i+3];}
      ctx.putImageData(palette,0,0);const palettePng=analysis.toDataURL();
      const {createQualityPlan}=await import('/src/experiment/quality.ts');
      const {detailReference}=await import('/src/experiment/image.ts');
      let detail;
      if(approach==='quality'){
        const bitmap=await createImageBitmap(await (await fetch(originalData)).blob(),{imageOrientation:'from-image'});
        detail=detailReference(bitmap,'contain');bitmap.close();
      }
      const started=performance.now(), plan=approach==='quality'?createQualityPlan(pixels,detail,'contain',inputHash):createPlan(pixels,'contain',inputHash,()=>{},true,approach), planningMs=performance.now()-started;
      const painting=new Painting(false), canvas=document.createElement('canvas'),fallback=document.createElement('canvas');
      const renderer=new StudioRenderer(canvas,fallback,painting,()=>{});
      const png=async blob=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
      const stages=[];
      for(let stage=0;stage<plan.stages.length;stage++){
        for(let i=stage?plan.stages[stage-1].end:0;i<plan.stages[stage].end;i++){executeStroke(painting,plan.strokes[i]);if(i%32===0)await new Promise(r=>setTimeout(r,0));}
        stages.push(await png(await renderer.exportPng()));
      }
      const focusStats={manualRegion:!!focus,extraStrokes:0,sourcePixels:region,analysisPixels:null};
      if(focus){
        const scale=512/Math.max(originalSize.width,originalSize.height), dx=(512-originalSize.width*scale)/2,dy=(512-originalSize.height*scale)/2;
        const x0=Math.max(1,Math.round(dx+region[0]*scale)),y0=Math.max(1,Math.round(dy+region[1]*scale));
        const x1=Math.min(510,Math.round(dx+(region[0]+region[2])*scale)),y1=Math.min(510,Math.round(dy+(region[1]+region[3])*scale));
        focusStats.analysisPixels=[x0,y0,x1-x0,y1-y0];
        if((x1-x0)*(y1-y0)>4000)throw new Error('Diagnostic focus exceeds the fixed 4000-cell bound');
        for(let pass=0;pass<2;pass++)for(let y=y0;y<y1;y++)for(let column=0;column<x1-x0;column++){
          const x=y%2?x1-1-column:x0+column,i=(y*512+x)*4;if(pixels[i+3]<=8)continue;
          const j=((y*2)*1024+x*2)*4;
          if(Math.hypot(...[0,1,2].map(c=>pixels[i+c]-painting.color[j+c]))<8)continue;
          const color=match('#'+[pixels[i],pixels[i+1],pixels[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('')).color;
          const lum=(x,y)=>{const i=(y*512+x)*4;return .299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];};
          const angle=Math.atan2(lum(x,y+1)-lum(x,y-1),lum(x+1,y)-lum(x-1,y))+Math.PI/2;
          const stroke={order:plan.strokes.length,stage:5,path:[{x:x*2,y:y*2,pressure:.5},{x:x*2+Math.cos(angle),y:y*2+Math.sin(angle),pressure:.5}],sampleStep:1,brush:{color,size:4,load:1,thickness:.035,mode:'cover',seed:1906+focusStats.extraStrokes}};
          executeStroke(painting,stroke);plan.strokes.push(stroke);focusStats.extraStrokes++;
          if(focusStats.extraStrokes%64===0)await new Promise(r=>setTimeout(r,0));
        }
        plan.stages.push({name:'诊断：手动标记区域补笔（非自动识别）',end:plan.strokes.length});
        // Rebuild actual material/batch identities for the supplementary strokes.
        const {attachMaterials}=await import('/src/experiment/materials.ts');const {prepareProcess}=await import('/src/experiment/process-plan.ts');
        Object.assign(plan,prepareProcess(attachMaterials(plan,dishes)));
        stages.push(await png(await renderer.exportPng()));
      }
      if(paletteCount!==24||focus)plan.plannerVersion=`diagnostic-only/${approach}/palette-${paletteCount}/focus-${focus}`;
      const flat=document.createElement('canvas');flat.width=flat.height=1024;const fc=flat.getContext('2d');
      fc.fillStyle='#f2eee2';fc.fillRect(0,0,1024,1024);const ink=document.createElement('canvas');ink.width=ink.height=1024;ink.getContext('2d').putImageData(new ImageData(painting.color.slice(),1024,1024),0,0);fc.drawImage(ink,0,0);
      const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a.buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
      const state={color:await digest(painting.color),height:await digest(painting.height)};
      renderer.dispose();renderer.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return {plan,planningMs,palettePng,flatPng:flat.toDataURL(),stages,state,region,focusStats,paletteCount,note:approach==='quality'?'Offline execution of versioned application quality planner, native reference from original source, no manual region. Real-time video and independent performance measured separately.':'Offline diagnostic execution of real Painting/StudioRenderer. Palette override only in this isolated browser; focus is manually marked, not automatic face detection.'};
    },{approach,inputHash,region,originalSize,paletteCount,focus,originalData:quality?'data:image/png;base64,'+bytes.toString('base64'):''});
    for(const [name,data] of [['palette',result.palettePng],['flat',result.flatPng],...result.stages.map((data,i)=>[`stage-${i+1}`,data])])writeFileSync(`${output}/${approach}-${name}.png`,Buffer.from(data.split(',')[1],'base64'));
    writeFileSync(`${output}/${approach}-plan.json`,JSON.stringify(result.plan));
    const {palettePng,flatPng,stages,plan,...summary}=result;
    summaries.push({approach,...summary,stages:stages.length,strokes:plan.strokes.length,pickups:plan.pickups.length});
  }
  assert.deepEqual(external,[]);
  writeFileSync(`${output}/diagnosis.json`,JSON.stringify({inputHash,summaries,externalRequests:external,private:true},null,2));
  const figure=(file,label)=>`<figure><img src="${file}"><figcaption>${label}</figcaption></figure>`;
  writeFileSync(`${output}/index.html`,`<!doctype html><meta charset="utf-8"><title>慢光 · 私人照片本地诊断</title><style>body{background:#eee9de;color:#514c41;font:15px/1.8 sans-serif;padding:24px}section{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}img{width:100%;object-fit:contain;max-height:90vh}figure{margin:0;background:#fff9ee;padding:12px}h2{font-weight:400}</style><h1>私人照片 · 仅本地诊断</h1><p>真实笔触的离线分阶段检查，不是实时播放录像。结果没有上传或写入项目目录。</p><section>${figure('source.png','本次原图')}${figure('analysis-512.png','实际 512 分析图')}${figure(quality?'quality-palette.png':'original-palette.png','24 色映射 · 仅诊断')}</section>${summaries.map(s=>`<h2>${s.approach==='quality'?'自动成品质量':s.approach==='original'?'原版':'结构优先'}：${s.strokes} 笔 / ${s.pickups} 次取色</h2><section>${figure(s.approach+'-palette.png','色盘映射（非画作）')}${figure(s.approach+'-flat.png','实际颜色结果（无材质）')}${figure(s.approach+'-stage-'+s.stages+'.png','实际最终材质结果')}</section>`).join('')}`);
  console.log(JSON.stringify({output,externalRequests:external,summaries:summaries.map(s=>({approach:s.approach,strokes:s.strokes,pickups:s.pickups,planningMs:s.planningMs}))},null,2));
} finally {await browser.close();}
