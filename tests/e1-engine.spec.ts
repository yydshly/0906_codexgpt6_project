import { test, expect } from '@playwright/test';
import { Painting, type Brush } from '../src/painting/engine';
import { ANALYSIS_SIZE, MAX_STROKES, createPlan, executeStroke } from '../src/experiment/plan';
import { imageDimensions } from '../src/experiment/image';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { StrokePlan } from '../src/experiment/plan';

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
