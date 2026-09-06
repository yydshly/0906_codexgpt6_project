import { Painting, type Point } from '../painting/engine';
import { executeStroke, PLAN_SEED, STAGES, type Composition, type PlannedStroke, type StrokePlan } from './plan';
import { attachMaterials, prepareDishes, type PaintDish } from './materials';
import { prepareProcess } from './process-plan';

export const QUALITY_VERSION = 'e1-finished-quality-1';
const N = 1024, linen = [242, 238, 226];
const clamp = (v: number) => Math.max(0, Math.min(N - 1, Math.round(v)));
const at = (x: number, y: number) => (clamp(y) * N + clamp(x)) * 4;
const hex = (c: number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
// Opponent differences penalize red/green substitutions as well as brightness.
export const qualityDistance = (a: number[], b: number[]) => {
  const r = a[0] - b[0], g = a[1] - b[1], z = a[2] - b[2];
  return (r * r + g * g + z * z + 2 * (r - g) ** 2 + .5 * (z - (r + g) / 2) ** 2) / 3;
};

/** Same 24 visible dishes. Refine representatives without quantizing the reference. */
export function qualityDishes(source: Uint8ClampedArray): PaintDish[] {
  const colors = prepareDishes(source).map(d => rgb(d.color));
  const bins = new Map<number, { sum: number[]; n: number }>();
  for (let i = 0; i < source.length; i += 16) {
    if (source[i + 3] <= 8) continue;
    const key = (source[i] >> 3) * 1024 + (source[i + 1] >> 3) * 32 + (source[i + 2] >> 3);
    const b = bins.get(key) ?? { sum: [0, 0, 0], n: 0 };
    b.n++; for (let c = 0; c < 3; c++) b.sum[c] += source[i + c]; bins.set(key, b);
  }
  const points = [...bins.values()].map(b => ({ color: b.sum.map(v => v / b.n), weight: Math.sqrt(b.n) }));
  for (let pass = 0; pass < 6; pass++) {
    const sums = colors.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let best = Infinity, index = 0;
      colors.forEach((color, i) => { const d = qualityDistance(color, p.color); if (d < best) { best = d; index = i; } });
      for (let c = 0; c < 3; c++) sums[index][c] += p.color[c] * p.weight;
      sums[index][3] += p.weight;
    }
    sums.forEach((sum, i) => { if (sum[3]) colors[i] = sum.slice(0, 3).map(v => v / sum[3]); });
  }
  return [...new Set(colors.map(hex))].sort().map((color, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, color }));
}

/** Private planning trial using the actual engine. Rollback copies only one
 * conservative footprint, including both color and height, never full history. */
export class FootprintTrial {
  private colors = new Uint8ClampedArray(256 * 256 * 4);
  private heights = new Uint16Array(256 * 256);
  readonly bytes = this.colors.byteLength + this.heights.byteLength;
  constructor(readonly painting: Painting, readonly reference: Uint8ClampedArray) {}
  attempt(stroke: PlannedStroke, protect: boolean) {
    const p = this.painting, radius = Math.ceil(stroke.brush.size * .9 + 3);
    const x0 = Math.max(0, Math.floor(Math.min(...stroke.path.map(q => q.x)) - radius));
    const y0 = Math.max(0, Math.floor(Math.min(...stroke.path.map(q => q.y)) - radius));
    const x1 = Math.min(N, Math.ceil(Math.max(...stroke.path.map(q => q.x)) + radius));
    const y1 = Math.min(N, Math.ceil(Math.max(...stroke.path.map(q => q.y)) + radius));
    const w = x1 - x0, h = y1 - y0;
    if (w * h > this.heights.length) throw new Error('候选笔触覆盖超过固定缓冲');
    for (let row = 0; row < h; row++) {
      const i = (y0 + row) * N + x0;
      this.colors.set(p.color.subarray(i * 4, (i + w) * 4), row * w * 4);
      this.heights.set(p.height.subarray(i, i + w), row * w);
    }
    const revision = p.revision; executeStroke(p, stroke);
    let improvement = 0, damage = 0, changed = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * N + x) * 4, b = ((y - y0) * w + x - x0) * 4;
      if (this.colors[b] === p.color[i] && this.colors[b + 1] === p.color[i + 1] && this.colors[b + 2] === p.color[i + 2] && this.colors[b + 3] === p.color[i + 3]) continue;
      const beforeA = this.colors[b + 3] / 255, afterA = p.color[i + 3] / 255, targetA = this.reference[i + 3] / 255;
      const target = linen.map((v, c) => this.reference[i + c] * targetA + v * (1 - targetA));
      const before = qualityDistance(target, linen.map((v, c) => this.colors[b + c] * beforeA + v * (1 - beforeA)));
      const after = qualityDistance(target, linen.map((v, c) => p.color[i + c] * afterA + v * (1 - afterA)));
      improvement += before - after;
      if (before < 100 && after > before) damage += after - before;
      changed++;
    }
    const accepted = changed > 0 && improvement > (protect ? damage * 2 + changed * .5 : 0);
    if (!accepted) {
      for (let row = 0; row < h; row++) {
        const i = (y0 + row) * N + x0;
        p.color.set(this.colors.subarray(row * w * 4, (row + 1) * w * 4), i * 4);
        p.height.set(this.heights.subarray(row * w, (row + 1) * w), i);
      }
      p.revision = revision;
    }
    return { accepted, improvement, damage, changed };
  }
}

/** Detail is independently resampled from the decoded source, not enlarged 512.
 * No semantic ROIs, source compositing, hidden colors or manual repair. */
export function createQualityPlan(global: Uint8ClampedArray, detail: Uint8ClampedArray, composition: Composition, inputHash: string, progress: (stage: number) => void = () => {}): StrokePlan {
  if (global.length !== 512 * 512 * 4 || detail.length !== N * N * 4) throw new Error('需要独立的全局与原输入细节参考');
  const painting = new Painting(false), trial = new FootprintTrial(painting, detail);
  const dishes = qualityDishes(global), colors = dishes.map(d => rgb(d.color));
  const plan: StrokePlan = { plannerVersion: QUALITY_VERSION, brushVersion: 2, seed: PLAN_SEED, size: 1024, analysisSize: 512, detailSize: 1024, composition, inputHash, stages: [], strokes: [] };
  const stats = { candidates: 0, rejected: 0, acceptedGain: 0, protectedDamage: 0, scratchBytes: trial.bytes, referenceBytes: global.byteLength + detail.byteLength };
  const target = (x: number, y: number) => { const i = at(x, y); return [detail[i], detail[i + 1], detail[i + 2]]; };
  const error = (x: number, y: number) => { const i = at(x, y), a = painting.color[i + 3] / 255; return qualityDistance(target(x, y), linen.map((v, c) => painting.color[i + c] * a + v * (1 - a))); };
  const lum = (x: number, y: number) => { const c = target(x, y); return c[0] * .299 + c[1] * .587 + c[2] * .114; };
  let randomState = PLAN_SEED;
  const seed = () => randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  for (let stage = 0; stage < STAGES.length; stage++) {
    progress(stage);
    const spec = STAGES[stage], step = Math.max(3, Math.round(spec.size * .6));
    let accepted = 0;
    for (let pass = 0; pass < 3 && accepted < spec.limit; pass++) {
      const candidates: { x: number; y: number; score: number }[] = [];
      for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
        let best = { x, y, score: -1 };
        const scan = Math.max(1, Math.floor(step / 4));
        for (let yy = y; yy < Math.min(N, y + step); yy += scan) for (let xx = x; xx < Math.min(N, x + step); xx += scan) {
          if (detail[at(xx, yy) + 3] < 240) continue;
          const e = error(xx, yy), edge = Math.max(Math.abs(lum(xx - 3, yy) - lum(xx + 3, yy)), Math.abs(lum(xx, yy - 3) - lum(xx, yy + 3)));
          const score = e * (stage > 1 ? 1 + Math.min(2, edge / 24) : 1);
          if (score > best.score) best = { x: xx, y: yy, score };
        }
        if (best.score > 16) candidates.push(best);
      }
      candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
      for (const start of candidates.slice(0, (spec.limit - accepted) * 4)) {
        if (accepted >= spec.limit) break;
        if (error(start.x, start.y) < 12) continue;
        const value = target(start.x, start.y);
        let best = Infinity, dish = 0;
        colors.forEach((c, i) => { const d = qualityDistance(c, value); if (d < best) { best = d; dish = i; } });
        const gx = lum(start.x + 2, start.y) - lum(start.x - 2, start.y), gy = lum(start.x, start.y + 2) - lum(start.x, start.y - 2);
        const angle = Math.hypot(gx, gy) > 3 ? Math.atan2(gy, gx) + Math.PI / 2 : 0;
        let size = spec.size as number;
        while (size > 4 && stage > 0) {
          const across = Math.max(...[-.45, .45].map(t => qualityDistance(value, target(start.x - Math.sin(angle) * size * t, start.y + Math.cos(angle) * size * t))));
          if (across < 160) break;
          size = size > 36 ? 36 : size > 16 ? 16 : size > 8 ? 8 : 4;
        }
        const trace = (sign: number): Point[] => {
          const points: Point[] = [];
          for (let i = 1; i <= 3; i++) {
            const x = start.x + Math.cos(angle) * size * .3 * sign * i, y = start.y + Math.sin(angle) * size * .3 * sign * i;
            if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1 || detail[at(x, y) + 3] < 240 || qualityDistance(value, target(x, y)) > (stage > 1 ? 100 : 400)) break;
            points.push({ x, y, pressure: .5 });
          }
          return points;
        };
        const path = [...trace(-1).reverse(), { x: start.x, y: start.y, pressure: .5 }, ...trace(1)];
        if (path.length === 1) path.push({ x: start.x + Math.cos(angle) * .8, y: start.y + Math.sin(angle) * .8, pressure: .5 });
        const stroke: PlannedStroke = { order: plan.strokes.length, stage, path, sampleStep: 1, brush: { size, color: dishes[dish].color, load: 1, thickness: stage > 1 ? .04 : .07, mode: 'cover', seed: seed() } };
        const result = trial.attempt(stroke, stage > 1); stats.candidates++;
        if (result.accepted) { plan.strokes.push(stroke); accepted++; stats.acceptedGain += result.improvement; stats.protectedDamage += result.damage; }
        else stats.rejected++;
      }
    }
    plan.stages.push({ name: spec.name, end: plan.strokes.length });
  }
  plan.qualityMetrics = stats;
  return prepareProcess(attachMaterials(plan, dishes));
}
