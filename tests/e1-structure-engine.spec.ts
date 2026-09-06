import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { Painting } from '../src/painting/engine';
import { createPlan, executeStroke, MAX_STROKES } from '../src/experiment/plan';
import { structureImportance, regionTasks } from '../src/experiment/structure';
import { PlanPlayer } from '../src/experiment/player';

const hash = (p: Painting) => [p.color, new Uint8Array(p.height.buffer)].map(a => createHash('sha256').update(a).digest('hex'));
test('structure priorities preserve transparent margins and group local materials without dropping candidates', () => {
  const pixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) pixels.set(x < 8 ? [40,40,40,255] : [210,210,210,255], (y * 16 + x) * 4);
  const weights = structureImportance(pixels,16);
  expect(weights[0]).toBe(0); expect(weights[8 * 16 + 7]).toBeGreaterThan(weights[8 * 16 + 4]);
  const input = Array.from({length:100}, (_,i) => ({x:i,y:20,error:10,color:i%2 ? 'a':'b'}));
  const result = regionTasks(input, p => p.color);
  expect(new Set(result).size).toBe(input.length);
  expect(result.slice(0,64).every(p=>p.x<64)).toBe(true);
  expect(result.slice(1).filter((p,i)=>p.color!==result[i].color).length).toBe(3);
});

test('optional structure plan is bounded and deterministic; default remains original', () => {
  const pixels = new Uint8ClampedArray(512 * 512 * 4);
  for (let y=60;y<440;y++) for(let x=0;x<512;x++) pixels.set(x<256?[210,80,40,255]:[40,80,210,255],(y*512+x)*4);
  const old = createPlan(pixels,'contain','two-blocks',()=>{},true);
  expect(old).toEqual(createPlan(pixels,'contain','two-blocks',()=>{},true,'original'));
  const plan = createPlan(pixels,'contain','two-blocks',()=>{},true,'structure');
  expect(plan).toEqual(createPlan(pixels,'contain','two-blocks',()=>{},true,'structure'));
  expect(plan.plannerVersion).toBe('e1-structure-1'); expect(old.plannerVersion).toBe('e1-prepared-studio-2');
  expect(plan.strokes.length).toBeGreaterThan(0); expect(plan.strokes.length).toBeLessThanOrEqual(MAX_STROKES);
  expect(plan.materials!.brushes.length).toBeLessThanOrEqual(8); expect(plan.materials!.dishes.length).toBeLessThanOrEqual(24);
  const expected = new Painting(false); plan.strokes.forEach(s=>executeStroke(expected,s));
  const raf=globalThis.requestAnimationFrame, cancel=globalThis.cancelAnimationFrame;
  try {
    for(const speed of [.5,1,4]) {
      let pending:FrameRequestCallback|null=null;
      globalThis.requestAnimationFrame=fn=>{pending=fn;return 1;}; globalThis.cancelAnimationFrame=()=>{pending=null;};
      const painting=new Painting(false), player=new PlanPlayer(painting,plan,()=>{}); player.speed=speed; player.play();
      let frames=0, paused=false;
      while(player.state!=='complete' && frames<1000000) {
        const callback=pending; pending=null; (callback as FrameRequestCallback|null)?.(++frames*16.7);
        if(!paused && player.index>10) { player.pause(); const frozen=hash(painting); expect(pending).toBeNull(); expect(hash(painting)).toEqual(frozen); player.play(); paused=true; }
      }
      expect(player.state).toBe('complete'); expect(hash(painting)).toEqual(hash(expected)); expect(painting.history).toHaveLength(0); player.dispose();
    }
  } finally { globalThis.requestAnimationFrame=raf; globalThis.cancelAnimationFrame=cancel; }
});
