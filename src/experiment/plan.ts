import { Painting, type Brush, type Point } from '../painting/engine';

export const ANALYSIS_SIZE = 256;
export const PLANNER_VERSION = 'e1-multiscale-1';
export const PLAN_SEED = 1906;
export const STAGES = [
  { name: '铺开大色块', size: 80, limit: 320, threshold: 0 },
  { name: '寻找主要轮廓', size: 40, limit: 850, threshold: 18 },
  { name: '细化色彩差异', size: 20, limit: 1200, threshold: 16 },
  { name: '留下局部细节', size: 10, limit: 1400, threshold: 14 },
] as const;
export const MAX_STROKES = STAGES.reduce((n, s) => n + s.limit, 0);
export type Composition = 'contain' | 'crop';
export type PlannedStroke = { order: number; stage: number; path: Point[]; brush: Brush };
export type StrokePlan = { plannerVersion: string; brushVersion: number; seed: number; size: 1024; analysisSize: 256; composition: Composition; inputHash: string; stages: { name: string; end: number }[]; strokes: PlannedStroke[] };
export function executeStroke(painting: Painting, stroke: PlannedStroke) {
  painting.begin(stroke.path[0], stroke.brush);
  for (const point of stroke.path.slice(1)) painting.move(point);
  painting.end();
}
const clamp = (v: number, low = 0, high = 255) => Math.max(low, Math.min(high, v));
function blurred(source: Uint8ClampedArray, radius: number) {
  const temp = new Float32Array(source.length), result = new Uint8ClampedArray(source.length);
  // Two bounded separable box passes approximate the scale-space reference.
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) for (let c = 0; c < 3; c++) {
    let sum = 0; for (let k = -radius; k <= radius; k++) sum += source[(y * 256 + clamp(x + k)) * 4 + c];
    temp[(y * 256 + x) * 4 + c] = sum / (radius * 2 + 1);
  }
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) for (let c = 0; c < 3; c++) {
    let sum = 0; for (let k = -radius; k <= radius; k++) sum += temp[(clamp(y + k) * 256 + x) * 4 + c];
    result[(y * 256 + x) * 4 + c] = sum / (radius * 2 + 1);
  }
  return result;
}

/** Local original implementation inspired by Hertzmann 1998; no imported paper code.
 * The worker uses the SAME Painting for error feedback, never a photo in the result. */
export function createPlan(source: Uint8ClampedArray, composition: Composition, inputHash: string, progress: (stage: number) => void = () => {}) {
  if (source.length !== 256 * 256 * 4) throw new Error('分析尺寸不正确');
  const painting = new Painting(false);
  const plan: StrokePlan = { plannerVersion: PLANNER_VERSION, brushVersion: 1, seed: PLAN_SEED, size: 1024, analysisSize: 256, composition, inputHash, stages: [], strokes: [] };
  let state = PLAN_SEED;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let stage = 0; stage < STAGES.length; stage++) {
    progress(stage);
    const spec = STAGES[stage], reference = blurred(source, Math.max(1, Math.round(spec.size / 20)));
    const at = (x: number, y: number) => (clamp(Math.round(y)) * 256 + clamp(Math.round(x))) * 4;
    const luminance = (x: number, y: number) => { const i = at(x, y); return .299 * reference[i] + .587 * reference[i + 1] + .114 * reference[i + 2]; };
    const error = (x: number, y: number) => {
      const i = at(x, y), j = (Math.round(y) * 4 * 1024 + Math.round(x) * 4) * 4, a = painting.color[j + 3] / 255;
      let sum = 0;
      for (let c = 0; c < 3; c++) sum += (reference[i + c] - (painting.color[j + c] * a + 240 * (1 - a))) ** 2;
      return Math.sqrt(sum / 3);
    };
    const step = Math.max(2, Math.round(spec.size * .8 / 4)), candidates: { x: number; y: number; error: number }[] = [];
    for (let y = 0; y < 256; y += step) for (let x = 0; x < 256; x += step) {
      let best = { x: clamp(x + Math.floor(step / 2)), y: clamp(y + Math.floor(step / 2)), error: -1 };
      for (let yy = y; yy < Math.min(256, y + step); yy += 2) for (let xx = x; xx < Math.min(256, x + step); xx += 2) {
        const e = error(xx, yy); if (e > best.error) best = { x: xx, y: yy, error: e };
      }
      if (stage === 0) best = { x: clamp(x + step * (.25 + random() * .5)), y: clamp(y + step * (.25 + random() * .5)), error: 256 };
      if (best.error >= spec.threshold) candidates.push(best);
    }
    candidates.sort((a, b) => b.error - a.error);
    candidates.length = Math.min(candidates.length, spec.limit);
    for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
    for (const start of candidates) {
      const i = at(start.x, start.y), rgb = [reference[i], reference[i + 1], reference[i + 2]];
      let fallback = random() * Math.PI * 2;
      const trace = (sign: number) => {
        let x = start.x, y = start.y, angle = fallback;
        const points: Point[] = [];
        for (let n = 0; n < 3; n++) {
          const gx = luminance(x + 1, y) - luminance(x - 1, y), gy = luminance(x, y + 1) - luminance(x, y - 1);
          if (Math.hypot(gx, gy) > 2) {
            let tangent = Math.atan2(gy, gx) + Math.PI / 2;
            if (Math.cos(tangent - angle) < 0) tangent += Math.PI;
            angle += Math.atan2(Math.sin(tangent - angle), Math.cos(tangent - angle)) * .65;
          }
          const nx = x + Math.cos(angle) * spec.size / 16 * sign, ny = y + Math.sin(angle) * spec.size / 16 * sign;
          if (nx < 0 || nx > 255 || ny < 0 || ny > 255) break;
          const j = at(nx, ny), difference = Math.sqrt(rgb.reduce((sum, value, c) => sum + (value - reference[j + c]) ** 2, 0) / 3);
          if (n > 0 && difference > 30) break;
          x = nx; y = ny; points.push({ x: Math.round(x * 4 * 100) / 100, y: Math.round(y * 4 * 100) / 100, pressure: .5 });
        }
        return points;
      };
      const path = [...trace(-1).reverse(), { x: start.x * 4, y: start.y * 4, pressure: .5 }, ...trace(1)];
      const stroke: PlannedStroke = { order: plan.strokes.length, stage, path, brush: { color: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''), size: spec.size, load: .85, mode: 'cover', seed: Math.floor(random() * 4294967296) } };
      executeStroke(painting, stroke); plan.strokes.push(stroke);
    }
    plan.stages.push({ name: spec.name, end: plan.strokes.length });
  }
  return plan;
}
