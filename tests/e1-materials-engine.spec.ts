import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Painting } from '../src/painting/engine';
import { attachMaterials, prepareDishes, MAX_DISHES } from '../src/experiment/materials';
import { createPlan, executeStroke, type StrokePlan } from '../src/experiment/plan';
import { prepareProcess } from '../src/experiment/process-plan';
import { PlanPlayer } from '../src/experiment/player';

const hash = (p: Painting) => [p.color, new Uint8Array(p.height.buffer)].map(a => createHash('sha256').update(a).digest('hex'));
for (const sample of ['landscape', 'still-life', 'complex']) test(`prepared local actions preserve every ${sample} stage exactly`, () => {
  const dir = `${process.env.M1_ARTIFACT_DIR || 'artifacts/e1/prepared-studio/local'}/ordering/${sample}`; mkdirSync(dir, { recursive: true });
  const baseline: StrokePlan = JSON.parse(readFileSync(`artifacts/e1/prepared-studio/b-quality/${sample}/plan.json`, 'utf8'));
  const source = structuredClone(baseline); source.strokes.sort((a,b) => a.sourceOrder! - b.sourceOrder!); source.strokes.forEach((s,i) => { s.order=i; });
  source.plannerVersion = 'e1-prepared-studio-2';
  const plan = prepareProcess(source); expect(plan).toEqual(prepareProcess(source));
  const metrics = plan.processMetrics!;
  expect(metrics.pickups).toBeLessThanOrEqual(metrics.previousPickups!); expect(metrics.brushChanges).toBeLessThanOrEqual(metrics.previousBrushChanges!);
  const painting = new Painting(false), states = [];
  for (let stage=0; stage<plan.stages.length; stage++) {
    for (const stroke of plan.strokes.filter(s=>s.stage===stage)) executeStroke(painting,stroke);
    const state = hash(painting), expected = JSON.parse(readFileSync(`artifacts/e1/prepared-studio/b-quality/${sample}/stage-${stage+1}-state.json`, 'utf8'));
    expect(state).toEqual([expected.color,expected.height]); states.push({color:state[0],height:state[1]});
  }
  writeFileSync(`${dir}/plan.json`,JSON.stringify(plan));
  writeFileSync(`${dir}/results.json`,JSON.stringify({status:'通过',baselinePickups:baseline.pickups!.length,...metrics,states},null,2));
});
test('prepared palette is bounded, deterministic, image-dependent and ignores transparent margins', () => {
  const pixels = new Uint8ClampedArray(512 ** 2 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([i % 251, (i / 4) % 241, (i / 1024) % 233, 255], i);
  const first = prepareDishes(pixels);
  expect(first).toEqual(prepareDishes(pixels)); expect(first.length).toBeLessThanOrEqual(MAX_DISHES);
  pixels.fill(0); pixels.set([210, 80, 40, 255]);
  expect(prepareDishes(pixels)).toEqual([{ id: 'P01', color: '#d25028' }]);
  pixels.set([40, 80, 210, 255]); expect(prepareDishes(pixels)).not.toEqual(first);
  pixels.fill(0); expect(() => prepareDishes(pixels)).toThrow('没有可绘制');
});

test('planner feeds actual prepared colors back into shared Painting and names every tool', () => {
  const pixels = new Uint8ClampedArray(512 ** 2 * 4);
  for (let y = 60; y < 440; y++) for (let x = 0; x < 512; x++) pixels.set(x < 256 ? [210, 80, 40, 255] : [40, 80, 210, 255], (y * 512 + x) * 4);
  const plan = createPlan(pixels, 'contain', 'fixed-two-blocks', () => {}, true);
  expect(plan.materials!.dishes).toHaveLength(2); expect(plan.materials!.brushes.length).toBeLessThanOrEqual(8);
  expect(plan.strokes.length).toBeGreaterThan(100);
  expect(plan.strokes.every(s => plan.materials!.dishes.some(d => d.id === s.dishId && d.color === s.brush.color) && plan.materials!.brushes.some(b => b.id === s.brushId && b.size === s.brush.size))).toBe(true);
  expect(() => new PlanPlayer(new Painting(false), plan, () => {})).not.toThrow();
  const corrupt = structuredClone(plan); corrupt.strokes[0].dishId = 'P99';
  expect(() => new PlanPlayer(new Painting(false), corrupt, () => {})).toThrow('色盘');
});

test('fixed tools and dishes execute the same colors/heights at all speeds, pause during every action and return clean', () => {
  const base: StrokePlan = { plannerVersion:'test', brushVersion:2, seed:1906, size:1024, analysisSize:512, composition:'contain', inputHash:'fixed', stages:[{name:'fixed',end:8}], strokes:Array.from({length:8},(_,i)=>({ order:i, stage:0, sampleStep:2, path:[{x:400,y:400+i*3},{x:460,y:420},{x:480,y:400}], brush:{size:i<4?16:8, color:i%3===0?'#d25028':'#2850d2', load:.7, seed:1906+i, thickness:.1, mode:i%2?'mix':'cover'} })) };
  const plan = prepareProcess(attachMaterials(base,[{id:'P01',color:'#d25028'},{id:'P02',color:'#2850d2'}]));
  const expected = new Painting(false); plan.strokes.forEach(s => executeStroke(expected,s));
  const raf=globalThis.requestAnimationFrame, cancel=globalThis.cancelAnimationFrame;
  try {
    for (const speed of [.5,1,4]) {
      let pending:FrameRequestCallback|null=null;
      globalThis.requestAnimationFrame=fn=>{pending=fn;return 1;}; globalThis.cancelAnimationFrame=()=>{pending=null;};
      const painting=new Painting(false), player=new PlanPlayer(painting,plan,()=>{}), seen=new Set<string>();
      player.setStations({ brushes:{B01:{x:1200,y:800},B02:{x:1280,y:800}}, dishes:{P01:{x:1200,y:300},P02:{x:1280,y:300}},wipe:{x:1200,y:1000} });
      player.speed=speed; player.play(); let frames=0;
      while(player.state!=='complete' && frames<10000) {
        const beforeAction=player.action, before= !['draw','travel'].includes(beforeAction) ? hash(painting):null;
        const callback=pending; pending=null; (callback as FrameRequestCallback|null)?.(++frames*16.7);
        // One frame may progress into drawing; inspect frozen non-painting actions separately.
        if(before && player.action===beforeAction && !['draw','travel'].includes(player.action)) expect(hash(painting)).toEqual(before);
        if(!seen.has(player.action) && player.state==='playing') {
          seen.add(player.action); player.pause(); const frozen=hash(painting), tip={...player.tip};
          expect(pending).toBeNull(); expect(hash(painting)).toEqual(frozen); expect(player.tip).toEqual(tip); player.play();
        }
        if(player.action==='dip') { const s=plan.strokes[player.index]; expect(player.heldBrushId).toBe(s.brushId); expect(player.tip.x).toBe(s.dishId==='P01'?1200:1280); expect(player.tip.y).toBeGreaterThanOrEqual(300); expect(player.tip.y).toBeLessThanOrEqual(309); }
      }
      expect(player.state).toBe('complete'); expect(hash(painting)).toEqual(hash(expected)); expect(painting.history).toHaveLength(0);
      expect(player.heldBrushId).toBeNull(); expect(player.loadedPaint).toBeNull(); expect(player.tip.visible).toBe(false);
      if(speed===.5) for(const phase of ['take-brush','dip','draw','wipe','return-brush','release-brush']) expect(seen.has(phase),phase).toBe(true);
      player.replay(); player.pause(); expect(painting.color.some(Boolean)).toBe(false); expect(painting.height.some(Boolean)).toBe(false); player.dispose();
    }
  } finally { globalThis.requestAnimationFrame=raf; globalThis.cancelAnimationFrame=cancel; }
});
