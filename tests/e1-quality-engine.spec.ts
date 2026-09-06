import { test, expect } from '@playwright/test';
import { Painting } from '../src/painting/engine';
import { executeStroke, type PlannedStroke } from '../src/experiment/plan';
import { FootprintTrial, qualityDishes } from '../src/experiment/quality';

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
