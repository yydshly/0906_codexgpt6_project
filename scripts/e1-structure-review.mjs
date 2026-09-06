import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root='artifacts/e1/structure-mode';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5174/${root}/index.html`);
  await page.locator('img').evaluateAll(nodes=>nodes.forEach(n=>n.loading='eager'));
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  const links=await page.locator('a[href]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.href))]);
  for(const link of links) assert.equal((await page.request.get(link)).ok(),true,link);
  const media=await page.locator('video').evaluateAll(async nodes=>{
    const results=[];
    for(const video of nodes){
      if(video.readyState<1)await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;video.load();});
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const frames=[];
      for(const time of [.3,video.duration/2,Math.max(.3,video.duration-.5)]){
        await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Video seek timeout')),15000);video.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});video.currentTime=time;});
        ctx.drawImage(video,0,0,160,100);const data=ctx.getImageData(0,0,160,100).data;
        if(!data.some((v,i)=>i%4!==3&&v>0))throw new Error('Blank decoded frame');frames.push(video.currentTime);
      }
      results.push({src:video.getAttribute('src'),duration:video.duration,width:video.videoWidth,height:video.videoHeight,decodedFrames:frames});
    }
    return results;
  });
  assert.equal(media.length,4);
  await page.screenshot({path:`${root}/review-page.png`});
  await page.goto('http://127.0.0.1:5174/?test=1');await page.waitForFunction(()=>!!window.__studio);
  await page.getByRole('button',{name:'图片自动绘制 · 实验',exact:true}).click();
  const layout=[];
  for(const width of [1440,700,360]){
    await page.setViewportSize({width,height:1000});
    await page.getByRole('button',{name:'结构优先 · 实验',exact:true}).scrollIntoViewIfNeeded();
    const dimensions=await page.locator('.image-experiment').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
    assert.ok(dimensions.scroll<=dimensions.client+1,`${width}px horizontal overflow`);
    if(width<=700){const hint=await page.locator('.experiment-tools>span').boundingBox();assert.ok(hint.width>=200&&hint.height<60,'File hint must wrap into readable lines, not a vertical column');}
    await page.screenshot({path:`${root}/mode-${width}.png`});layout.push({width,...dimensions});
  }
  assert.deepEqual(errors,[]);
  writeFileSync(`${root}/review-check.json`,JSON.stringify({status:'通过',links:links.length,media,layout,errors,note:'Headless Chrome, image/link/video decoding and simulated viewports; not physical device or human quality acceptance.'},null,2));
  console.log(JSON.stringify({links:links.length,media:media.map(v=>({src:v.src,duration:v.duration})),layout},null,2));
} finally {await browser.close();}
