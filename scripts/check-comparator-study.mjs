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
  results.styleMedia=[];
  for(const series of ['oilbrush','becasso']){
    await page.locator(`[data-series="${series}"]`).click();
    await page.waitForFunction(()=>!document.getElementById('series-status').textContent.includes('正在'));
    const images=await page.locator('#style-cards img').evaluateAll(a=>a.map(img=>({url:img.src,width:img.naturalWidth,height:img.naturalHeight,filter:getComputedStyle(img).filter})));
    assert.equal(images.length,4);assert.ok(images.every(i=>i.width===452&&i.height===867&&i.filter==='none'));
    results.styleMedia.push({series,status:'通过',images});
    await page.locator('#effect-a').selectOption('1');await page.locator('#effect-b').selectOption('3');await page.locator('#compare-effects').click();
    assert.deepEqual(await page.locator('#lightbox-images img').evaluateAll(a=>a.map(i=>i.src)),[images[1].url,images[3].url]);
    assert.match(await page.locator('#lightbox-title').innerText(),/非预设名/);await page.keyboard.press('Escape');
    if(screens){await page.locator('#style-lab').scrollIntoViewIfNeeded();await page.screenshot({path:`${screens}/four-effects-${series}.png`});}
  }
  await page.locator('[data-series="oilbrush"]').click();
  results.checks.push('两组同场景共八效果加载、无 CSS 滤镜、A/B 原媒体对应、外观描述与预设名区分');
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
  results.checks.push('六款工具的全部可选官方样例切换；图片真实解码与来源标签逐项记录');
  await page.locator('[data-product="oilbrush"]').click();
  await page.waitForFunction(()=>document.getElementById('image-area').getAttribute('aria-busy')==='false');
  results.detailViews=[];
  for(const id of ['oilbrush','becasso']){
    await page.locator(`[data-product="${id}"]`).click();
    const count=await page.locator('#detail-buttons button').count();assert.ok(count>=2);
    for(let i=0;i<count;i++){
      await page.locator('#detail-buttons button').nth(i).click();
      const views=await page.locator('#detail-images img').evaluateAll(a=>a.map(e=>({src:e.src,width:e.style.width,height:e.style.height,left:e.style.left,top:e.style.top,filter:getComputedStyle(e).filter})));
      assert.equal(views.length,2);assert.notEqual(views[0].src,views[1].src);
      for(const key of ['width','height','left','top'])assert.equal(views[0][key],views[1][key]);assert.ok(views.every(v=>v.filter==='none'));
      results.detailViews.push({id,view:i,status:'通过',views});
    }
  }
  await page.locator('[data-tour="portrait"]').click();assert.equal(await page.locator('#name').innerText(),'Oilbrush');assert.ok(await page.locator('#detail-study').isVisible());
  if(screens){await page.locator('#detail-study').scrollIntoViewIfNeeded();await page.screenshot({path:`${screens}/portrait-detail.png`});}
  await page.locator('[data-tour="texture"]').click();assert.equal(await page.locator('#sample').inputValue(),'3');assert.ok(await page.locator('#detail-study').isHidden());
  results.checks.push('五个同位置局部保持 A/B 相同显示裁切、来源不同且无滤镜；人物 / 材料快捷入口与不适用状态正确');
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
  await page.waitForFunction(()=>!document.getElementById('series-status').textContent.includes('正在'));assert.match(await page.locator('#series-status').innerText(),/无法载入/);
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
