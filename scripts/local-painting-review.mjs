// Review and independently replay private diagnostic outputs, always outside the repo.
import { chromium } from '@playwright/test';
import { readFileSync,writeFileSync,realpathSync } from 'node:fs';
import { resolve,relative,isAbsolute,dirname } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const dirs=process.argv.slice(2).map(p=>realpathSync(p));
assert.equal(dirs.length,3,'Pass baseline, palette-only, and focus output directories');
const repo=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const outside=p=>{const r=relative(repo,p);return !!r&&(r==='..'||r.startsWith('..\\')||r.startsWith('../')||isAbsolute(r));};
dirs.forEach(p=>assert.ok(outside(p)));const parent=dirname(dirs[0]);assert.ok(outside(parent));
const studies=dirs.map(p=>JSON.parse(readFileSync(`${p}/diagnosis.json`,'utf8')));
assert.ok(studies.every(s=>s.inputHash===studies[0].inputHash));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}});
  await page.route('**/*',r=>/^(http:\/\/127\.0\.0\.1:5174\/|file:|blob:|data:)/.test(r.request().url())?r.continue():r.abort());
  await page.goto('http://127.0.0.1:5174/?test=1');await page.waitForFunction(()=>!!window.__studio);
  const checks=[];
  for(const approach of ['original','structure']){
    const plan=JSON.parse(readFileSync(`${dirs[2]}/${approach}-plan.json`,'utf8'));
    const actual=await page.evaluate(async plan=>{
      const {Painting}=await import('/src/painting/engine.ts');const {executeStroke}=await import('/src/experiment/plan.ts');const p=new Painting(false);
      for(let i=0;i<plan.strokes.length;i++){executeStroke(p,plan.strokes[i]);if(i%64===0)await new Promise(r=>setTimeout(r,0));}
      const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a.buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
      return {color:await hash(p.color),height:await hash(p.height)};
    },plan);
    assert.deepEqual(actual,studies[2].summaries.find(s=>s.approach===approach).state);checks.push({approach,independentReplay:'通过'});
  }
  const summary=studies[2].summaries.find(s=>s.approach==='structure'), [x,y,w,h]=summary.focusStats.analysisPixels;
  const rect=summary.region,bytes=readFileSync(`${dirs[0]}/source.png`),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  const local=(dir,file)=>relative(parent,resolve(dir,file)).replaceAll('\\','/');
  const crop=(src,box,width,height,label)=>`<figure><svg viewBox="${box.join(' ')}"><image href="${src}" width="${width}" height="${height}"/></svg><figcaption>${label}</figcaption></figure>`;
  const crops=[crop(local(dirs[0],'source.png'),rect,width,height,'原图局部'),crop(local(dirs[0],'structure-stage-5.png'),[x*2,y*2,w*2,h*2],1024,1024,'当前结构优先：24 色'),crop(local(dirs[1],'structure-stage-5.png'),[x*2,y*2,w*2,h*2],1024,1024,'仅扩大为 96 色'),crop(local(dirs[2],'structure-stage-6.png'),[x*2,y*2,w*2,h*2],1024,1024,'96 色 + 手动区域补笔（诊断）')].join('');
  const html=`<!doctype html><meta charset="utf-8"><title>私人照片 · 局部保真诊断</title><style>body{margin:24px;background:#f1ebdf;color:#514a3d;font:15px/1.8 sans-serif}h1{font:32px KaiTi,serif}section{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0;background:#fff9ed;padding:12px}svg{width:100%;height:360px}figcaption{font-size:13px}img{max-height:800px;max-width:100%}a{color:#586947}</style><h1>重点区域 · 原图与真实笔触对照。</h1><p>仅本地诊断，照片和结果均未提交公开仓库。四格使用相同手动标记范围，没有用原图贴入画作。</p><section>${crops}</section><p>最后一格是手动指定区域后，使用原有 Painting/StudioRenderer 增加 ${summary.focusStats.extraStrokes} 条真实细笔触的试验；没有自动识别人脸，也不是可上线的最终方案。它超过现有整幅笔数预算，且需要更多取色，尚未通过过程和性能验收。</p><p>请对照原图判断关键结构、颜色和材质；本诊断不自动判定画质通过。</p><h2>完整实际试验结果</h2><img src="${local(dirs[2],'structure-stage-6.png')}"><p>${dirs.map((dir,i)=>`<a href="${local(dir,'index.html')}">查看试验 ${i+1} 的完整链路</a>`).join(' · ')}</p>`;
  const htmlPath=`${parent}/portrait-comparison.html`;writeFileSync(htmlPath,html);
  await page.goto(pathToFileURL(htmlPath).href);
  await page.locator('image').evaluateAll(async nodes=>{for(const n of nodes){const img=new Image();img.src=n.href.baseVal;await img.decode();}});
  await page.screenshot({path:`${parent}/portrait-comparison.png`});
  writeFileSync(`${parent}/replay-check.json`,JSON.stringify({status:'通过',checks,note:'Actual serialized diagnostic plans, with no reference image during independent replay. Quality is not asserted.'},null,2));
  console.log(JSON.stringify({status:'通过',checks,review:htmlPath}));
}finally{await browser.close();}
