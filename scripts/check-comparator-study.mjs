import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:5174/';
const out=process.argv[3]||'artifacts/effect-study/comparators/dev';
const screens=process.argv[4];
mkdirSync(out,{recursive:true});if(screens)mkdirSync(screens,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results={base,checks:[],media:[],video:[],errors:[],localFailures:[],externalFailures:[],softwareGeneration:'未测试：没有安装或调用产品',humanQuality:'待用户确认'};
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>results.errors.push(e.message));
  page.on('requestfailed',r=>{const item={url:r.url(),error:r.failure()?.errorText};(r.url().startsWith(base)?results.localFailures:results.externalFailures).push(item);});
  assert.equal((await page.goto(new URL('effect-study/comparators/',base).href)).status(),200);
  for(const id of ['oilbrush','dap','painter','becasso','brushstroke','waterlogue']){
    await page.locator(`[data-product="${id}"]`).click();
    const count=await page.locator('#sample option').count();
    for(let i=0;i<count;i++){
      await page.locator('#sample').selectOption(String(i));
      await page.waitForFunction(()=>document.getElementById('image-area').getAttribute('aria-busy')==='false');
      const media=await page.locator('#image-area figure:not([hidden]) img').evaluateAll(els=>els.map(img=>({url:img.src,width:img.naturalWidth,height:img.naturalHeight,loaded:img.complete&&img.naturalWidth>0})));
      results.media.push({id,sample:i,status:media.every(x=>x.loaded)?'通过':'未通过',media});
      assert.match(await page.locator('.local-status').innerText(),/未测试/);
      if(screens)await page.screenshot({path:`${screens}/${id}-${i}.png`,fullPage:true});
    }
    if(['oilbrush','becasso','brushstroke'].includes(id)){
      await page.locator('#load-video').click();
      try{
        const v=page.locator('video');
        await v.evaluate(async el=>{el.muted=true;await el.play();});
        await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0.7,{},{timeout:20000});
        results.video.push({id,status:'通过',...await v.evaluate(el=>({duration:el.duration,playedTo:el.currentTime,width:el.videoWidth,height:el.videoHeight}))});
        await v.evaluate(el=>el.pause());
      }catch(e){results.video.push({id,status:'未通过',reason:String(e).slice(0,250)});}
    }else if(id==='painter'||id==='waterlogue'){
      await page.locator('#load-video').click();assert.equal(await page.locator('#video-container iframe').count(),1);
      results.video.push({id,status:'未测试',note:'外部播放器入口已建立；跨站播放器播放未自动判断，不当作播放通过',url:await page.locator('iframe').getAttribute('src')});
    }
  }
  results.checks.push('六款工具、十份官方样例切换；图片真实解码与来源标签逐项记录');
  await page.locator('[data-product="oilbrush"]').click();
  await page.waitForFunction(()=>document.getElementById('image-area').getAttribute('aria-busy')==='false');
  await page.locator('#enlarge').click();await page.locator('#lightbox').waitFor({state:'visible'});
  assert.equal(await page.locator('#lightbox-images img').count(),2);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#lightbox').isVisible(),false);
  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(screens)await page.screenshot({path:`${screens}/layout-${width}.png`,fullPage:true});
  }
  results.checks.push('放大原图与结果、Escape 关闭；1440/768/390 模拟视口无横向溢出');
  // Check actual external-media failure: retain source and honest message rather than substitute an image.
  await page.route('https://digitalmasterpieces.com/wp-content/uploads/**',r=>r.abort());
  await page.reload();await page.waitForFunction(()=>document.getElementById('image-area').getAttribute('aria-busy')==='false');
  assert.match(await page.locator('#load-status').innerText(),/无法载入/);
  assert.equal(await page.locator('#sample-source').getAttribute('href'),'https://digitalmasterpieces.com/oilbrush/');
  await page.unroute('https://digitalmasterpieces.com/wp-content/uploads/**');
  results.checks.push('故意阻断官方媒体后显示失败与官方出处，不替换样本；对应网络失败为预期');
  for(const path of ['effect-study/comparators/compare.css','effect-study/comparators/compare.js'])assert.equal((await page.request.get(new URL(path,base).href)).status(),200);
  await page.goto(new URL('effect-study/',base).href);await page.getByRole('link',{name:'同类工具效果对照 ↗'}).click();assert.ok(page.url().endsWith('/effect-study/comparators/'));
  await page.goto(base);await page.getByRole('button',{name:'图片自动绘制 · 实验',exact:true}).waitFor();
  results.checks.push('父页新入口、构建资源、原画室图片实验入口可用');
  assert.deepEqual(results.errors,[]);assert.deepEqual(results.localFailures,[]);
  results.status=results.media.every(x=>x.status==='通过')&&results.video.filter(x=>x.status!=='未测试').every(x=>x.status==='通过')?'通过（外部嵌入播放器播放未测试）':'未通过';
  if(results.status==='未通过')process.exitCode=1;
}catch(e){results.status='未通过';results.failure=String(e);process.exitCode=1;}
finally{writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();}
