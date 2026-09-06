import { test, expect } from '@playwright/test';
import { Painting, type Brush } from '../src/painting/engine';
import { executeStroke } from '../src/experiment/plan';
import { imageDimensions } from '../src/experiment/image';
import { readFileSync } from 'node:fs';

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
