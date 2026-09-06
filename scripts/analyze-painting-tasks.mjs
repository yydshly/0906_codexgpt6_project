// Read-only analysis of the three previously recorded, licensed input plans.
// Does not plan, reorder, render, upload, or access private images.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const output='artifacts/e1/analysis-task-quality';
const quantile=(values,q)=>{const s=[...values].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*q))]??0;};
const signature=s=>`${s.brush.color}/${s.brush.size}/${s.brush.load}`;
const region=s=>{const p=s.path[Math.floor(s.path.length/2)];return `${Math.floor(p.x/128)},${Math.floor(p.y/128)}`;};
function summarize(strokes){
  const causes={},runs=[];let length=0,previous;
  for(const s of strokes){
    if(!previous || signature(previous)!==signature(s)){
      if(length)runs.push(length);length=0;
      const reason=!previous?'initial':['color','size','load'].filter(k=>previous.brush[k]!==s.brush[k]).join('+');
      causes[reason]=(causes[reason]||0)+1;
    }length++;previous=s;
  }if(length)runs.push(length);
  const paths=strokes.map(s=>s.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-s.path[i].x,p.y-s.path[i].y),0));
  const seen=new Set();let visits=0,returns=0,last;
  for(const s of strokes){const key=`${s.stage}/${region(s)}`;if(key!==last){visits++;if(seen.has(key))returns++;seen.add(key);last=key;}}
  return {strokes:strokes.length,pickups:runs.length,causes,strokesPerPickup:strokes.length/runs.length,
    singleStrokePickups:runs.filter(n=>n===1).length,singleStrokePickupFraction:runs.filter(n=>n===1).length/runs.length,
    runMedian:quantile(runs,.5),runP90:quantile(runs,.9),runMax:Math.max(...runs),
    singlePointStrokes:strokes.filter(s=>s.path.length===1).length,
    pathLengthMedian:quantile(paths,.5),pathLengthP90:quantile(paths,.9),
    colors:new Set(strokes.map(s=>s.brush.color)).size,widths:[...new Set(strokes.map(s=>s.brush.size))].sort((a,b)=>b-a),
    regionVisits:visits,regionReturns:returns,
    uniqueStageRegionMaterialKeys:new Set(strokes.map(s=>`${s.stage}/${region(s)}/${signature(s)}`)).size};
}
const samples=[];
for(const sample of ['landscape','still-life','complex']){
  const path=`artifacts/e1/prepared-studio/c/${sample}/plan.json`,bytes=readFileSync(path),plan=JSON.parse(bytes);
  const totals=summarize(plan.strokes);assert.equal(totals.pickups,plan.pickups.length);assert.equal(totals.strokes,plan.stages.at(-1).end);
  const stages=plan.stages.map((s,i)=>({name:s.name,...summarize(plan.strokes.filter(s=>s.stage===i))}));
  assert.equal(stages.reduce((n,s)=>n+s.strokes,0),totals.strokes);
  assert.equal(Object.values(totals.causes).reduce((n,v)=>n+v,0),totals.pickups);
  const sourceHash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(sourceHash,createHash('sha256').update(readFileSync(path)).digest('hex'));
  samples.push({sample,path,sourceHash,plannerVersion:plan.plannerVersion,seed:plan.seed,totals,stages});
}
mkdirSync(output,{recursive:true});
writeFileSync(`${output}/plan-statistics.json`,JSON.stringify({status:'通过',scope:'Read-only counts of existing fixed plans; no new painting or quality/performance benchmark.',notes:['Cause combinations are exclusive; initial pickup counted once per summary.','A run ends on exact color, width, or load change; no pigment depletion is modeled.','128px cells are geometric bins, not semantic objects.','Region-material key count ignores overlap dependencies and is NOT an achievable pickup bound or proposed reorder.','Path lengths use existing 1024px logical coordinates, not physical travel or elapsed time.','Private portrait source/plan unavailable; not included or uploaded.'],samples},null,2));
console.log(JSON.stringify(samples.map(s=>({sample:s.sample,...s.totals,lateStageFraction:(s.stages[3].strokes+s.stages[4].strokes)/s.totals.strokes})),null,2));
