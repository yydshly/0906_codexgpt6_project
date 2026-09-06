// Review and independently replay private diagnostic outputs, always outside the repo.
import { chromium } from '@playwright/test';
import { readFileSync,writeFileSync,realpathSync } from 'node:fs';
import { resolve,relative,isAbsolute,dirname } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const quality=process.argv.includes('--quality');
const dirs=process.argv.slice(2).filter(p=>p!=='--quality').map(p=>realpathSync(p));
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
  for(const [directory,approach] of quality?[[1,'quality'],[2,'quality']]:[[2,'original'],[2,'structure']]){
    const plan=JSON.parse(readFileSync(`${dirs[directory]}/${approach}-plan.json`,'utf8'));
    const actual=await page.evaluate(async plan=>{
      const {Painting}=await import('/src/painting/engine.ts');const {executeStroke}=await import('/src/experiment/plan.ts');const p=new Painting(false);
      for(let i=0;i<plan.strokes.length;i++){executeStroke(p,plan.strokes[i]);if(i%64===0)await new Promise(r=>setTimeout(r,0));}
      const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a.buffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
      return {color:await hash(p.color),height:await hash(p.height)};
    },plan);
    assert.deepEqual(actual,studies[directory].summaries.find(s=>s.approach===approach).state);checks.push({directory,approach,independentReplay:'通过'});
  }
  if(quality){
    const baseline=studies[0].summaries.find(s=>s.approach==='structure');
    const bytes=readFileSync(`${dirs[0]}/source.png`),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),scale=1024/Math.max(width,height),dx=(1024-width*scale)/2,dy=(1024-height*scale)/2;
    const rect=baseline.region;assert.ok(rect?.length===4,'Use the existing diagnostic review region, never planner input');
    const box=[dx+rect[0]*scale,dy+rect[1]*scale,rect[2]*scale,rect[3]*scale];
    const local=(d,file)=>relative(parent,resolve(d,file)).replaceAll('\\','/');
    const refs=[{file:local(dirs[0],'source.png'),label:'原图',source:true},{file:local(dirs[0],'structure-stage-5.png'),label:'当前结构优先基线'},{file:local(dirs[1],'quality-stage-5.png'),label:'第一轮：采用的实验策略'},{file:local(dirs[2],'quality-stage-5.png'),label:'第二轮：质量退步，未采用'}];
    const panels=zoom=>refs.map(r=>`<figure><svg viewBox="${zoom?box.join(' '):'0 0 1024 1024'}"><rect x="0" y="0" width="1024" height="1024" fill="#f2eee2"/><image href="${r.file}" x="${r.source?dx:0}" y="${r.source?dy:0}" width="${r.source?width*scale:1024}" height="${r.source?height*scale:1024}"/></svg><figcaption>${r.label}</figcaption></figure>`).join('');
    const html=`<!doctype html><meta charset="utf-8"><title>慢光 · 自动成品私人对照</title><style>body{background:#f1ebdf;color:#514b3f;font:15px/1.8 sans-serif;margin:24px}h1{font:32px KaiTi,serif}section{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{background:#fff9ee;margin:0;padding:10px}svg{display:block;width:100%}.zoom svg{height:320px}a{color:#52644c}video{width:min(100%,1000px)}</style><h1>同一原图 · 自动成品质量两轮对照</h1><p>仅本地。两轮均自动处理整图，未用手动圈区参与规划；局部裁框只用于这里的同尺度验收。没有照片贴入画作。</p><p>第一轮肤色及部分面部线索有改善，第二轮动作减少但结构退步，未采用。独立人物验证未通过：当前质量仍不足以宣称通用人物成品可用。</p><section>${panels(false)}</section><h2>同一关键局部</h2><section class="zoom">${panels(true)}</section><h2>实际操作与文件</h2><p><a href="finished-quality-ui-final/final.png">应用实际导出的 PNG</a> · <a href="finished-quality-ui-final/plan.json">可重放计划</a> · <a href="finished-quality-ui-final/results.json">操作与状态验证</a></p><video controls preload="metadata" src="finished-quality-ui-final/process.webm"></video><p>录像为真实页面 4× 播放，含暂停、取消、切换、对照和导出检查。不是生成视频，也不是专业画师步骤。私人原图、结果和计划均未提交公开仓库。</p>`;
    const htmlPath=`${parent}/finished-quality-comparison.html`;writeFileSync(htmlPath,html);
    await page.goto(pathToFileURL(htmlPath).href);await page.locator('image').evaluateAll(async nodes=>{for(const n of nodes){const img=new Image();img.src=n.href.baseVal;await img.decode();}});
    const video=page.locator('video');
    const metadata=await video.evaluate(v=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Private video metadata timeout')),20000);
      const ready=()=>{clearTimeout(timer);resolve({duration:v.duration,width:v.videoWidth,height:v.videoHeight});};
      if(v.readyState>=1)ready();else{v.onloadedmetadata=ready;v.onerror=()=>reject(new Error('Private video cannot decode'));v.load();}
    }));
    assert.ok(Number.isFinite(metadata.duration));assert.equal(metadata.width,1440);assert.equal(metadata.height,900);
    const frames=[];
    for(const [index,time] of [1,metadata.duration/2,metadata.duration-1].entries()){
      frames.push(await video.evaluate((v,time)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Private video seek timeout')),20000);v.onseeked=()=>{clearTimeout(timer);resolve(v.currentTime);};v.currentTime=time;}),time));
      // file: canvas readback is correctly blocked by the browser's origin rules.
      // Decode the existing recording locally; never disable browser protections.
      execFileSync('ffmpeg',['-y','-ss',String(time),'-i',resolve(parent,'finished-quality-ui-final/process.webm'),'-frames:v','1',resolve(parent,`finished-quality-video-${index+1}.png`)],{stdio:'pipe'});
    }
    const exported=await page.evaluate(async()=>{const img=new Image();img.src='finished-quality-ui-final/final.png';await img.decode();return {width:img.naturalWidth,height:img.naturalHeight};});
    assert.deepEqual(exported,{width:1024,height:1024});
    await page.screenshot({path:`${parent}/finished-quality-comparison.png`,fullPage:true});
    writeFileSync(`${parent}/finished-quality-replay-check.json`,JSON.stringify({status:'通过',checks,metadata,frames,exported,note:'Only serialized plans used for independent execution. Actual video beginning/middle/end decoded, not every frame visually inspected. Visual quality pending / independent portrait objective failed.'},null,2));
    console.log(JSON.stringify({status:'通过',checks,review:htmlPath}));
  }else{
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
  }
}finally{await browser.close();}
