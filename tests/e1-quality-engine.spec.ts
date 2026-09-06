import { test, expect } from '@playwright/test';
import { Painting } from '../src/painting/engine';
import { executeStroke, type PlannedStroke } from '../src/experiment/plan';
import { FootprintTrial, qualityDishes } from '../src/experiment/quality';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { PlanPlayer } from '../src/experiment/player';
import type { StrokePlan } from '../src/experiment/plan';

const stroke = (color: string): PlannedStroke => ({ order: 0, stage: 0, sampleStep: 1, path: [{ x: 400, y: 400 }, { x: 430, y: 410 }], brush: { size: 16, color, seed: 1906, mode: 'cover', load: 1, thickness: .04 } });
test('quality trials reject destructive coverage and restore independent color and height exactly', () => {
  const p = new Painting(false); executeStroke(p, stroke('#bc8a76'));
  const reference = p.color.slice(), savedColor = p.color.slice(), savedHeight = p.height.slice(), revision = p.revision;
  const trial = new FootprintTrial(p, reference), result = trial.attempt(stroke('#126413'), true);
  expect(result.accepted).toBe(false); expect(result.improvement).toBeLessThan(0);
  expect(p.color).toEqual(savedColor); expect(p.height).toEqual(savedHeight); expect(p.revision).toBe(revision);
  expect(trial.bytes).toBe(393216); expect(p.history).toHaveLength(0);
});
test('accepted trial is exactly the existing engine stroke, with no image pasted into its state', () => {
  const reference = new Uint8ClampedArray(1024 * 1024 * 4);
  for (let i = 0; i < reference.length; i += 4) reference.set([188,138,118,255], i);
  const p = new Painting(false), expected = new Painting(false), s = stroke('#bc8a76');
  expect(new FootprintTrial(p, reference).attempt(s, true).accepted).toBe(true); executeStroke(expected, s);
  expect(p.color).toEqual(expected.color); expect(p.height).toEqual(expected.height);
  expect(p.color[0]).toBe(0); expect(p.height[0]).toBe(0);
});
test('quality palette stays within the visible 24 materials and is deterministic', () => {
  const pixels = new Uint8ClampedArray(512 * 512 * 4);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) pixels.set([x % 256,y % 256,(x + y) % 256,255], (y * 512 + x) * 4);
  const dishes = qualityDishes(pixels);
  expect(dishes).toEqual(qualityDishes(pixels)); expect(dishes.length).toBeLessThanOrEqual(24);
  expect(new Set(dishes.map(d => d.id)).size).toBe(dishes.length);
});

for(const sample of ['portrait-holdout','landscape','still-life','complex']) for(const speed of [.5,1,4]) test(`full quality ${sample} at ${speed}x preserves exact color and height`,()=>{
  const plan:StrokePlan=JSON.parse(readFileSync(`artifacts/e1/finished-quality/frozen/${sample}/quality-plan.json`,'utf8'));
  const recorded=JSON.parse(readFileSync(`artifacts/e1/finished-quality/frozen/${sample}/results.json`,'utf8')).summaries.find((s:{prefix:string})=>s.prefix==='quality').stages.at(-1);
  const hash=(p:Painting)=>({color:createHash('sha256').update(p.color).digest('hex'),height:createHash('sha256').update(new Uint8Array(p.height.buffer)).digest('hex')});
  const raf=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame;
  let frames=0;
  try {
    let pending:FrameRequestCallback|null=null;
    globalThis.requestAnimationFrame=fn=>{pending=fn;return 1;};globalThis.cancelAnimationFrame=()=>{pending=null;};
    const painting=new Painting(false),player=new PlanPlayer(painting,plan,()=>{});player.speed=speed;player.play();
    let paused=false;
    while(player.state!=='complete'&&frames<1000000){const callback=pending;pending=null;(callback as FrameRequestCallback|null)?.(++frames*16.7);if(!paused&&player.index>20){player.pause();const frozen=hash(painting);expect(pending).toBeNull();expect(hash(painting)).toEqual(frozen);player.play();paused=true;}}
    expect(player.state).toBe('complete');expect(hash(painting)).toEqual(recorded);expect(painting.history).toHaveLength(0);player.dispose();
  } finally {globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel;}
  const dir=`${process.env.M1_ARTIFACT_DIR}/quality-speeds`;mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${sample}-${speed}.json`,JSON.stringify({status:'通过',sample,speed,frames,expected:recorded,note:'Synthetic frame clock; real actual engine strokes, no image loaded. Not a real-time video or performance result.'},null,2));
});
