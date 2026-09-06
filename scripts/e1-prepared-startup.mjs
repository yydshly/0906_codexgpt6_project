import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir=process.argv[2] || 'artifacts/e1/prepared-studio/startup-profile';mkdirSync(dir,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:false});
try{
const page=await b.newPage({viewport:{width:1440,height:900}});await page.goto('http://127.0.0.1:5174/?test=1');await page.waitForFunction(()=>window.__studio?.draft.state.phase!=='loading');
await page.getByRole('button',{name:'图片自动绘制 · 实验',exact:true}).click();await page.getByLabel('选择本地图片',{exact:true}).setInputFiles('artifacts/e1/fixtures/complex.jpg');await page.getByLabel('播放速度',{exact:true}).selectOption('4');
const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
await page.evaluate(()=>{window.__profileLong=[];window.__profileObserver=new PerformanceObserver(l=>window.__profileLong.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));window.__profileObserver.observe({entryTypes:['longtask']});});
await page.getByRole('button',{name:'确认构图，准备笔与颜色',exact:true}).click();await page.waitForFunction(()=>!!window.__experiment?.player);await page.getByRole('button',{name:'确认准备，开始绘制',exact:true}).click();await page.waitForTimeout(1200);await page.evaluate(()=>window.__experiment.player.pause());
const {profile}=await cdp.send('Profiler.stop');const data=await page.evaluate(()=>{window.__profileObserver.disconnect();return{longTasks:window.__profileLong,planningMs:window.__experiment.planningMs};});
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),costs=new Map();profile.samples.forEach((id,i)=>costs.set(id,(costs.get(id)||0)+profile.timeDeltas[i]/1000));
const top=[...costs].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id,ms])=>({ms,...nodes.get(id).callFrame}));
writeFileSync(`${dir}/cpu-profile.json`,JSON.stringify(profile));writeFileSync(`${dir}/summary.json`,JSON.stringify({...data,top,note:'Focused startup diagnostic with CPU profiler, not an independent performance benchmark.'},null,2));console.log(JSON.stringify({data,top:top.slice(0,12)}));
}finally{await b.close();}
