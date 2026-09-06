import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const root=process.argv[2] || 'artifacts/e1/prepared-studio/review',base='http://127.0.0.1:5174'; mkdirSync(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(`${base}/artifacts/e1/prepared-studio/index.html`); if(response.status()!==200)throw new Error('Gallery HTTP status');
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>{img.loading='eager';return img.decode();})));
  await page.screenshot({path:`${root}/gallery.png`,fullPage:true});
  const links=await page.locator('a').evaluateAll(items=>[...new Set(items.map(a=>a.href))]);
  const linkChecks=[];
  for(const url of links){const result=await page.request.head(url);linkChecks.push({url,status:result.status()});if(!result.ok())throw new Error(`Broken link ${url}`);}
  const videos=[];
  for(const video of await page.locator('video').all()){
    await video.evaluate(v=>{v.closest('details').open=true;v.load();});
    const metadata=await video.evaluate(v=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Video metadata timeout')),20000);
      const ready=()=>{clearTimeout(timer);resolve({src:v.currentSrc,duration:v.duration,width:v.videoWidth,height:v.videoHeight});};
      if(v.readyState>=1)ready();else{v.onloadedmetadata=ready;v.onerror=()=>reject(new Error('Video decode failed'));}
    }));
    if(!Number.isFinite(metadata.duration)||metadata.width!==1440||metadata.height!==900)throw new Error('Invalid video metadata');
    const frames=[];
    for(const time of [Math.min(1,metadata.duration/4),metadata.duration/2,Math.max(0,metadata.duration-1)]){
      frames.push(await video.evaluate((v,time)=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Video seek timeout')),20000);
        v.onseeked=()=>{clearTimeout(timer);const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);resolve({time:v.currentTime,bytes:c.toDataURL('image/png').length});};v.currentTime=time;
      }),time));
    }
    videos.push({...metadata,frames});
  }
  const layouts=[];
  for(const width of [1440,700,360]){await page.setViewportSize({width,height:900});layouts.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})));}
  if(layouts.some(s=>s.scrollWidth>s.width)||errors.length)throw new Error('Gallery layout or runtime failed');
  writeFileSync(`${root}/checks.json`,JSON.stringify({status:'通过',url:page.url(),linkChecks,videos,layouts,errors,note:'Video metadata and first/middle/end frames decoded; not every-frame visual inspection. Viewports are simulations, not physical devices.'},null,2));
  console.log(JSON.stringify({status:'通过',links:links.length,videos:videos.length,layouts}));
} finally {await browser.close();}
