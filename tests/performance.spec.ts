import { test,expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { artifact,ready,settings,settle,digest } from './helpers';

test('60 second drawing hot-path baselines, history memory plateau and uninterrupted long stroke',async({page})=>{
  await ready(page); const metrics:unknown[]=[];
  // Warm shader compilation and JIT before any reported timings.
  await page.evaluate(async()=>{const s=window.__studio!;for(let k=0;k<10;k++){s.painting.begin({x:100,y:100+k*30},{color:'#3155A6',size:96,load:.6,mode:'mix',seed:906});s.painting.move({x:900,y:150+k*30});s.painting.end();}s.renderer.draw();});await settle(page);
  for(const size of [32,96])for(const fullHistory of [false,true]){
    await page.evaluate(full=>{const s=window.__studio!;s.painting.clear();s.painting.history=[];if(full)for(let k=0;k<20;k++){s.painting.begin({x:160,y:180+k*30},{color:k%2?'#3155A6':'#EBC43C',size:96,load:.6,mode:'cover',seed:906});s.painting.move({x:860,y:180+k*30});s.painting.end();}s.refresh();},fullHistory);
    await settings(page,{color:'#3155A6',size,load:.5,mode:'mix',seed:906});
    const result=await page.evaluate(async({size,fullHistory})=>{
      const s=window.__studio!;
      const frames:number[]=[],handlerMs:number[]=[];let started=0,last=0,stroke=0,frameCount=0;
      // Synthetic events cannot establish browser pointer capture. Use the same
      // engine for benchmarking, and explicitly report this input limitation.
      const brush={color:'#3155A6',size,load:.5,mode:'mix' as const,seed:906};
      const stats=await new Promise<{elapsedMs:number}>(resolve=>{
        const frame=(now:number)=>{if(!started){started=now;last=now;s.painting.begin({x:180,y:480},brush);}else frames.push(now-last);last=now;
          const elapsed=now-started,t=elapsed/1000;const x=512+330*Math.sin(t*1.2),y=512+230*Math.sin(t*.83);
          const before=performance.now();s.painting.move({x,y});s.renderer.draw();handlerMs.push(performance.now()-before);frameCount++;
          if(fullHistory&&Math.floor(t/2)>stroke){s.painting.end();brush.color=stroke%2?'#3155A6':'#EBC43C';s.painting.begin({x,y},brush);stroke=Math.floor(t/2);}
          if(elapsed>=60000){s.painting.end();resolve({elapsedMs:elapsed});}else requestAnimationFrame(frame);
        };requestAnimationFrame(frame);
      });
      const sorted=frames.slice().sort((a,b)=>a-b),work=handlerMs.slice().sort((a,b)=>a-b);
      return {size,fullHistory,durationMs:stats.elapsedMs,frameCount,averageFps:frames.length/(frames.reduce((a,b)=>a+b,0)/1000),p95FrameMs:sorted[Math.ceil(sorted.length*.95)-1],maxFrameMs:sorted.at(-1),p95CpuDrawMs:work[Math.ceil(work.length*.95)-1],framesOver50ms:frames.filter(v=>v>50).length,inputQueue:0,memory:s.painting.memory(),environment:s.renderer.info(),method:'headed Chrome, no video, rAF drives exact Painting.move + renderer.draw hot path; engine input, not hardware input latency'};
    },{size,fullHistory});
    metrics.push(result);writeFileSync(`${artifact}/perf.json`,JSON.stringify(metrics,null,2));
    expect.soft(result.averageFps).toBeGreaterThanOrEqual(30);expect.soft(result.p95FrameMs).toBeLessThanOrEqual(50);
    expect.soft(result.memory.historyBytes).toBeLessThanOrEqual(120*1024*1024);
  }
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const memory:unknown[]=[];
  for(let cycle=0;cycle<5;cycle++){
    const explicit=await page.evaluate(()=>{const s=window.__studio!;for(let phase=0;phase<2;phase++){
      for(let n=0;n<20;n++){s.painting.begin({x:180,y:200+n*20},{color:n%2?'#3155A6':'#EBC43C',size:96,load:.5,mode:'mix',seed:906});for(let x=180;x<=840;x+=20)s.painting.move({x,y:200+n*20});s.painting.end();}
      if(!phase){for(let n=0;n<20;n++)s.painting.undo();s.painting.clear();}
    }s.renderer.draw();const p=s.painting.memory(),r=s.renderer.info();return { ...p,rendererCpuBytes:r.cpuBufferBytes,explicitCpuBytes:p.currentBytes+p.historyBytes+p.pendingBytes+p.brushBytes+r.cpuBufferBytes,gpuTextureBytes:r.gpuTextureBytes,exportAdditionalPeakBytes:8*1024*1024 };});
    await cdp.send('HeapProfiler.collectGarbage');const {metrics:raw}=await cdp.send('Performance.getMetrics');
    memory.push({cycle:cycle+1,...explicit,jsHeapUsedBytes:raw.find(m=>m.name==='JSHeapUsedSize')?.value,jsHeapTotalBytes:raw.find(m=>m.name==='JSHeapTotalSize')?.value});
    expect.soft(explicit.explicitCpuBytes+explicit.exportAdditionalPeakBytes).toBeLessThan(160*1024*1024);
  }
  writeFileSync(`${artifact}/memory.json`,JSON.stringify({cycles:memory,method:'explicit TypedArray accounting plus CDP JS heap after forced GC outside timed benchmark; JS heap is not whole browser/driver memory; bounded mix cache transient <=4096 entries, no input queue',status:'see test assertions'},null,2));
});

test('actual pointer pipeline for 60 seconds, 20 UI undos and evidence video decoding',async({page})=>{
  await ready(page);
  const blank=await digest(page);
  const box=(await page.getByTestId('painting-surface').boundingBox())!;
  for(let n=0;n<20;n++){
    await page.mouse.move(box.x+box.width*.18,box.y+box.height*(.15+n*.03));await page.mouse.down();
    await page.mouse.move(box.x+box.width*.82,box.y+box.height*(.15+n*.03),{steps:5});await page.mouse.up();
  }
  expect(await page.evaluate(()=>window.__studio!.painting.history.length)).toBe(20);
  for(let n=0;n<20;n++)await page.getByRole('button',{name:'撤销',exact:true}).click();await settle(page);
  expect(await digest(page)).toEqual(blank);
  await settings(page,{color:'#3155A6',size:96,load:.5,mode:'mix',seed:906});
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.evaluate(()=>{
    const state={running:true,last:0,frames:[] as number[],events:0};(window as any).__uiPerf=state;
    const tick=(now:number)=>{if(state.last)state.frames.push(now-state.last);state.last=now;if(state.running)requestAnimationFrame(tick);};requestAnimationFrame(tick);
    document.querySelector('[data-testid="painting-surface"]')!.addEventListener('pointermove',()=>state.events++);
  });
  await page.mouse.down();const started=Date.now();let sent=0;
  while(Date.now()-started<60000){const t=(Date.now()-started)/1000;await page.mouse.move(box.x+box.width*(.5+.32*Math.sin(t*1.2)),box.y+box.height*(.5+.22*Math.sin(t*.83)));sent++;await new Promise(resolve=>setTimeout(resolve,8));}
  await page.mouse.up();
  const stats=await page.evaluate(()=>{const s=(window as any).__uiPerf;s.running=false;const sorted=(s.frames as number[]).slice().sort((a,b)=>a-b);return {averageFps:sorted.length/(sorted.reduce((a,b)=>a+b,0)/1000),p95FrameMs:sorted[Math.ceil(sorted.length*.95)-1],maxFrameMs:sorted.at(-1),framesOver50ms:sorted.filter(v=>v>50).length,receivedMoveEvents:s.events,history:window.__studio!.painting.memory(),active:window.__studio!.painting.active};});
  writeFileSync(`${artifact}/ui-perf.json`,JSON.stringify({durationMs:Date.now()-started,sent,...stats,exact20UiUndos:'通过：RGBA/height SHA-256 equal to blank',method:'Playwright mouse -> browser Pointer Events -> production input handler -> Painting -> scheduled WebGL; no video; actual hardware hand feel and end-to-end input latency unmeasured'},null,2));
  expect.soft(stats.averageFps).toBeGreaterThanOrEqual(30);expect.soft(stats.p95FrameMs).toBeLessThanOrEqual(50);expect(stats.active).toBe(false);
  const video=await page.evaluate(async()=>{const v=document.createElement('video');v.src='/artifacts/m1/workflow.webm';v.muted=true;await new Promise<void>((resolve,reject)=>{v.onloadedmetadata=()=>resolve();v.onerror=()=>reject(new Error('Video decode failed'));});v.currentTime=Math.min(v.duration-1,27);await new Promise<void>(resolve=>{v.onseeked=()=>resolve();});const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d')!.drawImage(v,0,0);return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,frame:c.toDataURL('image/png')};});
  expect(video.width).toBe(1440);expect(video.height).toBe(900);expect(video.duration).toBeGreaterThan(10);
  writeFileSync(`${artifact}/workflow-frame-27s.png`,Buffer.from(video.frame.split(',')[1],'base64'));writeFileSync(`${artifact}/video-check.json`,JSON.stringify({status:'通过',durationSeconds:video.duration,width:video.width,height:video.height,method:'Chrome metadata + decoded frame at 27s'},null,2));
});
