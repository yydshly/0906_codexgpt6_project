import { test, expect } from '@playwright/test';
import { Painting, MAX_HEIGHT, type Brush } from '../src/painting/engine';
import { fromHex, mixRyb, rgbToRyb, rybToRgb, type RGB } from '../src/painting/mix';
import { logicalPoint } from '../src/painting/input';
import { blue, yellow, seed, crossYellow, crossBlue, single, shortArc } from './fixtures/strokes';
import { mkdirSync, writeFileSync } from 'node:fs';

const brush: Brush = { color: blue, size: 32, load: .6, mode: 'cover', seed };
const draw = (p: Painting, points = single, b: Partial<Brush> = {}) => { p.begin(points[0], { ...brush, ...b }); for (const point of points.slice(1)) p.move(point); p.end(); };
const pixel = (p: Painting, x: number, y: number) => Array.from(p.color.slice((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4));
const artifact = process.env.M1_ARTIFACT_DIR || 'artifacts/m2/regression';
type ExpectedState = { color: Buffer; height: Buffer };
const captureExpected = (p: Painting): ExpectedState => ({
  color: Buffer.from(p.color),
  // Buffer.from(ArrayBuffer) aliases the live array. Copy its byte view instead,
  // preserving both bytes of every Uint16 value (including an offset, if any).
  height: Buffer.from(new Uint8Array(p.height.buffer, p.height.byteOffset, p.height.byteLength)),
});
const assertRestored = (p: Painting, expected: ExpectedState, label: string) => {
  expect(Buffer.from(p.color).equals(expected.color), `${label}: color bytes`).toBe(true);
  const actualHeight = new Uint8Array(p.height.buffer, p.height.byteOffset, p.height.byteLength);
  expect(Buffer.from(actualHeight).equals(expected.height), `${label}: height bytes`).toBe(true);
};
// Negative control only: replace undo on this test instance, never the prototype
// or production code. Color restores normally; height intentionally stays stale.
const omitHeightRestoration = (p: Painting) => {
  const correctUndo = p.undo.bind(p);
  p.undo = () => {
    const staleHeight = p.height.slice();
    const restored = correctUndo();
    if (restored) p.height.set(staleHeight);
    return restored;
  };
};

test('expected snapshots own their bytes when live height and color change', () => {
  const p = new Painting();
  p.height[0] = 0x1234; p.height[p.height.length - 1] = 12000; p.color[0] = 72;
  const expected = captureExpected(p);
  const savedColor = Buffer.from(expected.color), savedHeight = Buffer.from(expected.height);
  const oldAliasedHeight = Buffer.from(p.height.buffer);
  p.height.fill(99); p.color.fill(201);
  expect(oldAliasedHeight.readUInt16LE(0)).toBe(99); // Reproduce the old blind spot.
  expect(expected.height.buffer).not.toBe(p.height.buffer);
  expect(expected.height.byteLength).toBe(p.height.byteLength);
  expect(expected.height.readUInt16LE(0)).toBe(0x1234);
  expect(expected.height.readUInt16LE(expected.height.length - 2)).toBe(12000);
  expect(expected.height.equals(savedHeight)).toBe(true);
  expect(expected.color.equals(savedColor)).toBe(true);
  expect(expected.color[0]).toBe(72);
  mkdirSync(artifact, { recursive: true });
  writeFileSync(`${artifact}/snapshot-independence.json`, JSON.stringify({ status: '通过', currentHeight: p.height[0], oldAliasedExpected: oldAliasedHeight.readUInt16LE(0), independentExpected: expected.height.readUInt16LE(0), byteLength: expected.height.length }, null, 2));
});

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
  mkdirSync(artifact, { recursive: true }); writeFileSync(`${artifact}/mix-matrix.json`, JSON.stringify(results,null,2));
});

for (const strokeCount of [20, 21]) test(`${strokeCount} strokes restore independent color and height expectations one undo at a time`, () => {
  const p = new Painting();
  const snapshots: ExpectedState[] = [];
  for (let n=0;n<strokeCount;n++) {
    snapshots.push(captureExpected(p));
    draw(p, single.map(q => ({ x:q.x,y:q.y+n*7 })), { color: n%2 ? yellow:blue, mode: n%2 ? 'mix':'cover' });
  }
  expect(p.history.length).toBe(20);
  const memory = p.memory(); expect(memory.historyBytes).toBe(120*1024*1024);
  // Opt-in, test-only mutation: the normal suite must fail on height comparison.
  if (process.env.M1_TEST_BAD_HEIGHT_RESTORE === '1') omitHeightRestoration(p);
  const undoSteps = [];
  for(let i=strokeCount-1;i>=strokeCount-20;i--) {
    expect(p.undo()).toBe(true);
    assertRestored(p, snapshots[i], `undo ${i+1} -> ${i}`);
    undoSteps.push({ remainingStrokes: i, colorBytesEqual: true, heightBytesEqual: true });
  }
  expect(p.undo()).toBe(false);
  expect(p.color.some(v=>v>0)).toBe(strokeCount === 21);
  expect(p.height.some(v=>v>0)).toBe(strokeCount === 21);
  const afterUndo = captureExpected(p);
  draw(p,shortArc); expect(p.undo()).toBe(true); assertRestored(p,afterUndo,'fork undo');
  // Exercise undoable clear on an actual painting, including in the 20-stroke case.
  draw(p,shortArc); const beforeClear = captureExpected(p);
  p.clear(); expect(p.color.every(v=>v===0)).toBe(true); expect(p.height.every(v=>v===0)).toBe(true);
  expect(p.undo()).toBe(true); assertRestored(p,beforeClear,'clear undo');
  const empty = new Painting(); draw(empty); empty.undo(); expect(empty.color.every(v=>v===0)).toBe(true); expect(empty.height.every(v=>v===0)).toBe(true);
  mkdirSync(artifact, { recursive: true });
  writeFileSync(`${artifact}/undo-${strokeCount}-results.json`,JSON.stringify({status:'通过',strokeCount,independentExpectations:true,undoSteps,perStrokeByteComparisons:undoSteps.length*2,additionalStateChecks:['fork color/height','clear color/height','single undo to empty'],history:memory},null,2));
});

test('independent undo assertion rejects deliberately stale height restoration', () => {
  const p = new Painting(); draw(p,single); const expected = captureExpected(p); draw(p,shortArc);
  omitHeightRestoration(p);
  expect(p.undo()).toBe(true);
  expect(Buffer.from(p.color).equals(expected.color)).toBe(true);
  // This is exactly the same assertion used for every normal undo step.
  expect(() => assertRestored(p,expected,'negative control')).toThrow(/negative control: height bytes/);
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
