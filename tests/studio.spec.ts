import { test,expect } from '@playwright/test';
import { mkdirSync,writeFileSync,readFileSync,existsSync,copyFileSync } from 'node:fs';
import { artifact,ready,settle,settings,draw,clear,exportSample,digest } from './helpers';
import { blue,yellow,single,crossYellow,crossBlue,shortArc,quickArc,line } from './fixtures/strokes';

test('designed studio, fixed brush samples and real UI workflow PNG download',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);mkdirSync(artifact,{recursive:true});
  await page.mouse.move(30,120);await page.screenshot({path:`${artifact}/page.png`});
  if(!process.env.M1_ARTIFACT_DIR && !existsSync(`${artifact}/initial/page.png`)){mkdirSync(`${artifact}/initial`,{recursive:true});copyFileSync(`${artifact}/page.png`,`${artifact}/initial/page.png`);}
  const environment=await page.evaluate(()=>({userAgent:navigator.userAgent,platform:navigator.platform,viewport:[innerWidth,innerHeight],...window.__studio!.renderer.info()}));
  writeFileSync(`${artifact}/environment.json`,JSON.stringify(environment,null,2));
  expect(environment.mode).toBe('webgl2');
  await settings(page,{color:blue,size:32,load:.6,mode:'cover',seed:906});await draw(page,single);await exportSample(page,'single-stroke');
  await clear(page);await settings(page,{color:yellow,size:64,load:.75,mode:'cover'});await draw(page,crossYellow);
  const first=await digest(page);await settings(page,{color:blue,load:.5,mode:'mix'});await draw(page,crossBlue);await exportSample(page,'two-color-overlap');
  const contact=await page.evaluate(()=>{const p=window.__studio!.painting;const at=(x:number,y:number)=>Array.from(p.color.slice((y*1024+x)*4,(y*1024+x)*4+4));return {contact:at(512,512),yellowOnly:at(256,512),blueOnly:at(512,256)};});
  expect(contact.contact[1]).toBeGreaterThan(contact.contact[2]);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await settle(page);expect(await digest(page)).toEqual(first);
  await settings(page,{mode:'cover'});await draw(page,crossBlue);await exportSample(page,'two-color-cover');
  await clear(page);await settings(page,{size:48,load:.5,mode:'mix'});
  for(let i=0;i<10;i++){await settings(page,{color:i%2?blue:yellow});await draw(page,shortArc);if([0,4,9].includes(i))await exportSample(page,`layer-${i+1}`);}
  await exportSample(page,'repeated-layering');
  for(const name of ['single-stroke','two-color-overlap','repeated-layering'])if(!process.env.M1_ARTIFACT_DIR && !existsSync(`${artifact}/initial/${name}.png`))copyFileSync(`${artifact}/${name}.png`,`${artifact}/initial/${name}.png`);
  await page.evaluate(()=>{window.__studio!.renderer.lighting=0;});await exportSample(page,'height-lighting-off');
  await page.evaluate(()=>{window.__studio!.renderer.lighting=1;});await settle(page);
  await clear(page);
  // This sequence uses the visible color, mode, sliders, undo and export controls.
  await page.getByRole('button',{name:'选择日落黄',exact:true}).click();await page.getByRole('button',{name:'覆盖',exact:true}).click();
  await page.getByLabel('笔刷大小',{exact:true}).focus();await page.keyboard.press('Home');for(let i=0;i<48;i++)await page.keyboard.press('ArrowRight');
  await page.getByLabel('上色量',{exact:true}).focus();await page.keyboard.press('End');
  await draw(page,line(210,390,810,470,45));await page.getByRole('button',{name:'选择群青',exact:true}).click();await page.getByRole('button',{name:'混色',exact:true}).click();
  await page.getByLabel('上色量',{exact:true}).focus();await page.keyboard.press('Home');for(let i=0;i<35;i++)await page.keyboard.press('ArrowRight');
  await draw(page,line(310,290,700,650,45));const beforeUndo=await digest(page);
  await page.getByRole('button',{name:'选择朱红',exact:true}).click();await draw(page,line(270,610,720,590,45));
  await page.getByRole('button',{name:'撤销',exact:true}).click();await settle(page);expect(await digest(page)).toEqual(beforeUndo);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出 PNG',exact:true}).click();const download=await downloadEvent;await download.saveAs(`${artifact}/actual-painting.png`);
  await page.screenshot({path:`${artifact}/painted-page.png`});
  const b64=readFileSync(`${artifact}/actual-painting.png`).toString('base64');
  const decoded=await page.evaluate(async(data)=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);const px=ctx.getImageData(0,0,c.width,c.height).data;let colored=0;for(let i=0;i<px.length;i+=4)if(Math.max(px[i],px[i+1],px[i+2])-Math.min(px[i],px[i+1],px[i+2])>60)colored++;return {width:img.width,height:img.height,colored};},b64);
  expect(decoded.width).toBe(1024);expect(decoded.height).toBe(1024);expect(decoded.colored).toBeGreaterThan(10000);
  await exportSample(page,'export-comparison');expect(readFileSync(`${artifact}/actual-painting.png`).equals(readFileSync(`${artifact}/export-comparison.png`))).toBe(true);
  expect(errors).toEqual([]);writeFileSync(`${artifact}/workflow-results.json`,JSON.stringify({status:'通过',contact,decoded,errors,video:testInfo.outputPath('video.webm')},null,2));
  const video=page.video()!;await page.close();await video.saveAs(`${artifact}/workflow.webm`);
});

test('input cancellation, outside release, fast turns, clear confirmation and resize',async({page})=>{
  await ready(page);await draw(page,quickArc);await draw(page,[{x:120,y:750},{x:850,y:750},{x:500,y:450},{x:500,y:850}]);
  await exportSample(page,'input-paths');
  const before=await digest(page);await page.getByRole('button',{name:'清空画布',exact:true}).click();await page.getByRole('button',{name:'继续画',exact:true}).click();expect(await digest(page)).toEqual(before);
  await clear(page);await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await digest(page)).toEqual(before);
  await page.setViewportSize({width:1100,height:760});await settle(page);expect(await digest(page)).toEqual(before);await draw(page,line(512,200,512,300,12));
  await page.screenshot({path:`${artifact}/resize.png`});await page.setViewportSize({width:1440,height:900});await settle(page);
  const box=(await page.getByTestId('painting-surface').boundingBox())!;
  await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();await page.mouse.move(box.x-30,box.y+100);await page.mouse.up();
  expect(await page.evaluate(()=>window.__studio!.painting.active)).toBe(false);
  for(const event of ['pointercancel','blur','lostpointercapture']){
    await page.mouse.move(box.x+100,box.y+100);await page.mouse.down();await page.mouse.move(box.x+150,box.y+130);
    await page.evaluate(event=>{if(event==='blur')window.dispatchEvent(new Event('blur'));else document.querySelector('[data-testid="painting-surface"]')!.dispatchEvent(new PointerEvent(event,{pointerId:1,bubbles:true}));},event);
    expect(await page.evaluate(()=>window.__studio!.painting.active)).toBe(false);const state=await digest(page);await page.mouse.move(box.x+250,box.y+230);expect(await digest(page)).toEqual(state);await page.mouse.up();
  }
  await page.mouse.move(box.x+60,box.y+160);await page.mouse.down();await page.mouse.move(box.x+100,box.y+160);await page.setViewportSize({width:1100,height:760});await settle(page);expect(await page.evaluate(()=>window.__studio!.painting.active)).toBe(false);await page.mouse.up();
  const beforeZoom=await digest(page);await page.evaluate(()=>{document.body.style.zoom='1.25';});await settle(page);expect(await digest(page)).toEqual(beforeZoom);await draw(page,line(300,600,500,600,12));
  writeFileSync(`${artifact}/input-results.json`,JSON.stringify({status:'通过',checks:['slow/fast/turns','outside-up','synthetic pointercancel','synthetic blur','lostpointercapture','clear cancel/confirm/undo','resize idle/active','CSS zoom 125%'],limitations:['CSS zoom is not browser chrome zoom','blur injected, not human alt-tab']},null,2));
});

test('WebGL unavailable fallback retains editable color, undo and PNG',async({page})=>{
  await ready(page,'&fallback=1');await expect(page.getByRole('alert')).toContainText('简化显示');
  await settings(page,{color:yellow,size:64,load:.75});await draw(page,crossYellow);const before=await digest(page);
  await settings(page,{color:blue,load:.5,mode:'mix'});await draw(page,crossBlue);await exportSample(page,'fallback-painting');await page.screenshot({path:`${artifact}/fallback.png`});
  await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await digest(page)).toEqual(before);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出 PNG',exact:true}).click();await(await download).saveAs(`${artifact}/fallback-export.png`);
  await page.getByRole('button',{name:'重试材质显示'}).click();await settle(page);expect(await digest(page)).toEqual(before);expect(await page.evaluate(()=>window.__studio!.renderer.mode)).toBe('webgl2');
});

test('context loss and restore keep complete color and height state including edits made in fallback',async({page})=>{
  await ready(page);await draw(page,single);const before=await digest(page);
  const supported=await page.evaluate(()=>{const ext=window.__studio!.renderer.gl!.getExtension('WEBGL_lose_context');if(!ext)return false;(window as any).__lossExtension=ext;ext.loseContext();return true;});
  expect(supported).toBe(true);await expect(page.getByRole('alert')).toBeVisible();expect(await digest(page)).toEqual(before);
  await draw(page,crossBlue);const changed=await digest(page);await page.evaluate(()=>(window as any).__lossExtension.restoreContext());
  await expect.poll(()=>page.evaluate(()=>window.__studio!.renderer.mode)).toBe('webgl2');await settle(page);expect(await digest(page)).toEqual(changed);
  await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await digest(page)).toEqual(before);await exportSample(page,'context-restored');
  writeFileSync(`${artifact}/fallback-results.json`,JSON.stringify({status:'通过',unavailable:'forced init refusal, Canvas 2D drawing/mix/undo/export/retry',loss:'WEBGL_lose_context, exact state preserved through fallback edits and restoration'},null,2));
});
