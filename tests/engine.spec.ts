import { test, expect } from '@playwright/test';
import { Painting, MAX_HEIGHT, type Brush } from '../src/painting/engine';
import { fromHex, mixRyb, rgbToRyb, rybToRgb, type RGB } from '../src/painting/mix';
import { logicalPoint } from '../src/painting/input';
import { blue, yellow, seed, crossYellow, crossBlue, single, shortArc } from './fixtures/strokes';
import { mkdirSync, writeFileSync } from 'node:fs';

const brush: Brush = { color: blue, size: 32, load: .6, mode: 'cover', seed };
const draw = (p: Painting, points = single, b: Partial<Brush> = {}) => { p.begin(points[0], { ...brush, ...b }); for (const point of points.slice(1)) p.move(point); p.end(); };
const pixel = (p: Painting, x: number, y: number) => Array.from(p.color.slice((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4));

test('RYB has bounded colors, round trips, green contact, identity and white lightening', () => {
  for (const rgb of [[0,0,0],[255,255,255],[49,85,166],[235,196,60],[201,81,57]] as RGB[]) {
    const round = rybToRgb(...rgbToRyb(...rgb)); round.forEach((v,i) => expect(Math.abs(v-rgb[i])).toBeLessThan(.001));
    expect(mixRyb(rgb,rgb,.5)).toEqual(rgb);
  }
  const pairs = [[yellow,blue],[blue,yellow],['#F1ECE0',blue],[yellow,'#C95139'],['#C95139',blue]];
  const results = pairs.map(([a,b]) => ({ a,b,mixed: mixRyb(fromHex(a),fromHex(b),.51) }));
  results.forEach(r => r.mixed.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }));
  const green = results[0].mixed; expect(green[1]).toBeGreaterThan(green[0]); expect(green[1]).toBeGreaterThan(green[2]);
  const white = results[2].mixed; expect(white.reduce((a,b)=>a+b)).toBeGreaterThan(fromHex(blue).reduce((a,b)=>a+b));
  mkdirSync('artifacts/m1', { recursive: true }); writeFileSync('artifacts/m1/mix-matrix.json', JSON.stringify(results,null,2));
});

test('20 exact undo states, 21st eviction, fork and undoable clear restore color and height', () => {
  const p = new Painting();
  const snapshots: { color: Buffer; height: Buffer }[] = [];
  for (let n=0;n<21;n++) {
    snapshots.push({ color: Buffer.from(p.color), height: Buffer.from(p.height.buffer) });
    draw(p, single.map(q => ({ x:q.x,y:q.y+n*7 })), { color: n%2 ? yellow:blue, mode: n%2 ? 'mix':'cover' });
  }
  expect(p.history.length).toBe(20);
  const memory = p.memory(); expect(memory.historyBytes).toBe(120*1024*1024);
  for(let i=20;i>=1;i--) { expect(p.undo()).toBe(true); expect(Buffer.from(p.color).equals(snapshots[i].color)).toBe(true); expect(Buffer.from(p.height.buffer).equals(snapshots[i].height)).toBe(true); }
  expect(p.undo()).toBe(false); expect(p.color.some(v=>v>0)).toBe(true);
  const firstColor=p.color.slice(),firstHeight=p.height.slice(); draw(p,shortArc); p.undo(); expect(Buffer.from(p.color).equals(Buffer.from(firstColor))).toBe(true);
  p.clear(); expect(p.color.every(v=>v===0)).toBe(true); p.undo(); expect(Buffer.from(p.color).equals(Buffer.from(firstColor))).toBe(true); expect(Buffer.from(p.height.buffer).equals(Buffer.from(firstHeight.buffer))).toBe(true);
  const empty = new Painting(); draw(empty); empty.undo(); expect(empty.color.every(v=>v===0)).toBe(true); expect(empty.height.every(v=>v===0)).toBe(true);
  writeFileSync('artifacts/m1/undo-results.json',JSON.stringify({status:'通过',exactByteComparisons:42,history:memory},null,2));
});

test('mix only modifies brush contact and repeated height remains bounded', () => {
  const p=new Painting(); draw(p,crossYellow,{color:yellow,size:64,load:.75});
  const before=pixel(p,256,512); draw(p,crossBlue,{size:64,load:.5,mode:'mix'});
  expect(pixel(p,256,512)).toEqual(before);
  const mixed=pixel(p,512,512); expect(mixed[1]).toBeGreaterThan(mixed[2]); expect(mixed[1]).toBeGreaterThan(mixed[0]);
  for(let i=0;i<24;i++)draw(p,shortArc,{size:48,load:.5,color:i%2?blue:yellow,mode:'mix'});
  expect(p.height.every(v=>v<=MAX_HEIGHT)).toBe(true);
  const once=new Painting();draw(once); const many=new Painting();draw(many,[single[0],single[single.length-1]]);
  expect(Buffer.from(once.color).equals(Buffer.from(many.color))).toBe(true);
});

test('size, load, directional footprint and CSS coordinate invariants', () => {
  const a=new Painting(),b=new Painting(),c=new Painting();draw(a,single,{size:8,load:.15});draw(b,single,{size:96,load:.15});draw(c,single,{size:96,load:1});
  const nonzero=(p:Painting)=>p.height.reduce((n,v)=>n+(v>0?1:0),0);
  expect(nonzero(b)).toBeGreaterThan(nonzero(a)*6); expect(c.height.reduce((n,v)=>n+v,0)).toBeGreaterThan(b.height.reduce((n,v)=>n+v,0)*2);
  expect(logicalPoint(360,280,{left:10,top:30,width:700,height:500})).toEqual({x:512,y:512});
  expect(logicalPoint(185,155,{left:10,top:30,width:350,height:250})).toEqual({x:512,y:512});
});
