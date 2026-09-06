import { test, expect } from '@playwright/test';
import { Painting, type Brush } from '../src/painting/engine';
import { ANALYSIS_SIZE, MAX_STROKES, createPlan, executeStroke } from '../src/experiment/plan';
import { imageDimensions } from '../src/experiment/image';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { StrokePlan } from '../src/experiment/plan';
import { StrokeRunner } from '../src/experiment/stroke-runner';
import { PlanPlayer } from '../src/experiment/player';

test('brush display reads actual contact width, direction and load without mutating artwork', () => {
  for (const size of [4, 16, 72]) {
    const p = new Painting(false);
    p.begin({ x: 250, y: 250, pressure: .8 }, { color: '#3155a6', size, load: .6, mode: 'cover', seed: 1906 });
    p.move({ x: 280, y: 290, pressure: .8 });
    const before = [Buffer.from(p.color), Buffer.from(new Uint8Array(p.height.buffer))];
    const contact = p.contact!;
    expect(contact.width).toBeCloseTo(size * 1.12);
    expect(contact.angle).toBeCloseTo(Math.atan2(40, 30));
    expect(contact.color).toBe('#3155a6'); expect(contact.load).toBe(.6);
    contact.width = 999; contact.color = '#ffffff';
    expect(p.contact!.width).toBeCloseTo(size * 1.12);
    expect(Buffer.from(p.color)).toEqual(before[0]); expect(Buffer.from(p.height.buffer)).toEqual(before[1]);
    p.end(); expect(p.contact).toBeNull();
  }
});

test('batch shares the manual brush, including stroke-before mixing; no undo snapshots', () => {
  const manual = new Painting(), batch = new Painting(false);
  for (let i = 0; i < 24; i++) {
    const brush: Brush = { color: i % 2 ? '#3155a6' : '#ebc43c', size: 8 + i * 3, load: .6, mode: i % 3 ? 'mix' : 'cover', seed: 906 + i };
    const stroke = { order: i, stage: 0, brush, path: [{ x: 400, y: 400 + i }, { x: 440, y: 450 }, { x: 485, y: 415, pressure: .8 }] };
    executeStroke(manual, stroke); executeStroke(batch, stroke);
    expect(Buffer.from(batch.color).equals(Buffer.from(manual.color))).toBe(true);
    expect(Buffer.from(batch.height.buffer).equals(Buffer.from(manual.height.buffer))).toBe(true);
  }
  expect(manual.history).toHaveLength(20); expect(batch.history).toHaveLength(0);
  expect(batch.memory().batchBufferBytes).toBe(4 * 1024 * 1024);
  batch.clear(); expect(batch.color.some(Boolean)).toBe(false); expect(batch.height.some(Boolean)).toBe(false);
  expect(batch.memory().historyBytes).toBe(0);
});
test('valid image headers and malformed/truncated data', () => {
  for (const name of ['landscape', 'still-life', 'complex']) expect(imageDimensions(readFileSync(`artifacts/e1/fixtures/${name}.jpg`)).type).toBe('image/jpeg');
  for (const bytes of [new Uint8Array(), new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 8]), new Uint8Array([60, 115, 118, 103])]) expect(() => imageDimensions(bytes)).toThrow();
});

test('refined planner accepts its analysis dimensions and obeys stroke bounds', () => {
  const source = new Uint8ClampedArray(ANALYSIS_SIZE ** 2 * 4);
  for (let i = 0; i < source.length; i += 4) source.set([130, 80, 40, 255], i);
  const plan = createPlan(source, 'contain', 'synthetic-test');
  expect(plan.analysisSize).toBe(ANALYSIS_SIZE);
  expect(plan.strokes.length).toBeGreaterThan(0);
  expect(plan.strokes.length).toBeLessThanOrEqual(MAX_STROKES);
});

test('thin experimental paint changes height only; manual thickness and legacy plans stay exact', () => {
  const regular = new Painting(false), thin = new Painting(false), manual = new Painting(), manualThin = new Painting();
  const stroke = { order: 0, stage: 0, path: [{ x: 200, y: 200 }, { x: 290, y: 240 }], brush: { color: '#3155a6', size: 24, load: .7, seed: 1906, mode: 'cover' as const } };
  executeStroke(regular, stroke); executeStroke(manual, stroke);
  const variant = { ...stroke, brush: { ...stroke.brush, thickness: .1 } };
  executeStroke(thin, variant); executeStroke(manualThin, variant);
  expect(Buffer.from(thin.color).equals(Buffer.from(regular.color))).toBe(true);
  expect(thin.height.reduce((a, b) => a + b, 0)).toBeLessThan(regular.height.reduce((a, b) => a + b, 0) * .11);
  expect(Buffer.from(manualThin.height.buffer).equals(Buffer.from(manual.height.buffer))).toBe(true);
  for (const sample of ['landscape', 'still-life', 'complex']) {
    const plan: StrokePlan = JSON.parse(readFileSync(`artifacts/e1/c/${sample}/plan.json`, 'utf8'));
    const prior = JSON.parse(readFileSync(`artifacts/e1/c/${sample}/results.json`, 'utf8'));
    const painting = new Painting(false); for (const s of plan.strokes) executeStroke(painting, s);
    const hash = (bytes: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(bytes).digest('hex');
    expect({ color: hash(painting.color), height: hash(new Uint8Array(painting.height.buffer)) }).toEqual(prior.final);
  }
});

test('fixed point execution and all speeds preserve every stroke, including mixing and pauses', () => {
  const strokes = Array.from({ length: 12 }, (_, i) => ({ order: i, stage: 0, sampleStep: 2, path: [{ x: 180, y: 250 + i }, { x: 260, y: 280, pressure: .8 }, { x: 340, y: 240, pressure: .3 }], brush: { color: i % 2 ? '#3155a6' : '#ebc43c', size: 8 + i * 2, load: .7, thickness: .12, mode: i % 3 ? 'mix' as const : 'cover' as const, seed: 1906 + i } }));
  const hash = (p: Painting) => [p.color, new Uint8Array(p.height.buffer)].map(bytes => createHash('sha256').update(bytes).digest('hex'));
  const full = new Painting(false), stepped = new Painting(false);
  for (const s of strokes) {
    executeStroke(full, s); const runner = new StrokeRunner(stepped, s);
    while (!runner.done) runner.advance(); expect(hash(stepped)).toEqual(hash(full));
  }
  const plan: StrokePlan = { plannerVersion: 'test', brushVersion: 2, seed: 1906, size: 1024, analysisSize: 512, composition: 'contain', inputHash: 'synthetic', stages: [{ name: 'test', end: strokes.length }], strokes };
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  try {
    for (const speed of [.5, 1, 4]) {
      let pending: FrameRequestCallback | null = null;
      globalThis.requestAnimationFrame = callback => { pending = callback; return 1; };
      globalThis.cancelAnimationFrame = () => { pending = null; };
      const p = new Painting(false), player = new PlanPlayer(p, plan, () => {}); player.speed = speed; player.play();
      let frame = 0, time = 0, paused = false;
      while (player.state !== 'complete' && frame < 20000) {
        const callback = pending; pending = null; frame++; time += frame % 3 ? 16.7 : 33.4; (callback as FrameRequestCallback | null)?.(time);
        if (!paused && p.active && player.sampleIndex > 3) {
          player.pause(); const frozen = hash(p), tip = { ...player.tip };
          expect(pending).toBeNull(); expect(hash(p)).toEqual(frozen); expect(player.tip).toEqual(tip);
          paused = true; player.play();
        }
      }
      expect(paused).toBe(true); expect(player.state).toBe('complete'); expect(hash(p)).toEqual(hash(full)); expect(p.history).toHaveLength(0);
      player.replay(); player.pause(); expect(p.color.some(Boolean)).toBe(false); expect(p.height.some(Boolean)).toBe(false);
      player.dispose(); expect(pending).toBeNull();
    }
  } finally { globalThis.requestAnimationFrame = oldRaf; globalThis.cancelAnimationFrame = oldCancel; }
});
