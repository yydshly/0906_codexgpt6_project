import { Painting, type Brush, type Point } from '../painting/engine';
import { prepareProcess, type PaintPickup } from './process-plan';
import { attachMaterials, prepareDishes, dishMatcher, type Materials } from './materials';
import { regionTasks, structureImportance } from './structure';

export type PaintingApproach = 'original' | 'structure';

export const ANALYSIS_SIZE = 512;
export const PLANNER_VERSION = 'e1-brush-process-3';
export const PLAN_SEED = 1906;
export const STAGES = [
  { name: '铺开大色块', size: 72, limit: 420, threshold: 0, load: .72, thickness: .09 },
  { name: '建立主要形体', size: 36, limit: 1000, threshold: 12, load: .76, thickness: .10 },
  { name: '细化局部轮廓', size: 16, limit: 1800, threshold: 10, load: .78, thickness: .12 },
  { name: '补充小处色彩', size: 8, limit: 2200, threshold: 8, load: .8, thickness: .14 },
  { name: '收拾边缘细节', size: 4, limit: 2600, threshold: 7, load: .82, thickness: .16 },
] as const;
export const MAX_STROKES = STAGES.reduce((n, s) => n + s.limit, 0);
export type Composition = 'contain' | 'crop';
export type PlannedStroke = { order: number; stage: number; path: Point[]; brush: Brush; sampleStep?: number; sourceOrder?: number; brushId?: string; dishId?: string };
export type StrokePlan = { plannerVersion: string; brushVersion: number; seed: number; size: 1024; analysisSize: number; composition: Composition; inputHash: string; stages: { name: string; end: number }[]; strokes: PlannedStroke[]; materials?: Materials; processVersion?: 1; pickups?: PaintPickup[]; processMetrics?: { movedStrokes: number; previousTravel: number; travel: number; previousScore: number; score: number; pickups: number; costModel?: string; previousActionScore?: number; actionScore?: number; previousPickups?: number; previousBrushChanges?: number; brushChanges?: number } };

/** Fixed commands are independent of frame rate; legacy plans keep their original points. */
export function strokeSamples(stroke: PlannedStroke): Point[] {
  if (!stroke.sampleStep) return stroke.path;
  const result = [stroke.path[0]], step = Math.max(1, stroke.sampleStep);
  for (let i = 1; i < stroke.path.length; i++) {
    const a = stroke.path[i - 1], b = stroke.path[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 1; j <= n; j++) result.push({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n, pressure: (a.pressure ?? .5) + ((b.pressure ?? .5) - (a.pressure ?? .5)) * j / n });
  }
  return result;
}
export function executeStroke(painting: Painting, stroke: PlannedStroke) {
  const samples = strokeSamples(stroke); painting.begin(samples[0], stroke.brush);
  for (const point of samples.slice(1)) painting.move(point);
  painting.end();
}
const W = ANALYSIS_SIZE, SCALE = 1024 / W;
const clamp = (v: number) => Math.max(0, Math.min(W - 1, v));
const at = (x: number, y: number) => (clamp(Math.round(y)) * W + clamp(Math.round(x))) * 4;
const linen = [242, 238, 226];
function blurred(source: Uint8ClampedArray, radius: number) {
  const temp = new Float32Array(source.length), result = new Uint8ClampedArray(source.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) { const i = (y * W + clamp(x + k)) * 4, a = source[i + 3] / 255; sum += source[i + c] * a + linen[c] * (1 - a); }
    temp[(y * W + x) * 4 + c] = sum / (radius * 2 + 1);
  }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let sum = 0; for (let k = -radius; k <= radius; k++) sum += temp[(clamp(y + k) * W + x) * 4 + c];
    result[(y * W + x) * 4 + c] = sum / (radius * 2 + 1);
  }
  return result;
}
type Candidate = { x: number; y: number; error: number };
const tile = (p: Candidate) => Math.floor(p.y / 64) * 8 + Math.floor(p.x / 64);
function distribute(candidates: Candidate[], limit: number) {
  const groups = new Map<number, Candidate[]>();
  for (const p of candidates) { const id = tile(p); if (!groups.has(id)) groups.set(id, []); groups.get(id)!.push(p); }
  const quota = Math.max(1, Math.floor(limit / Math.max(1, groups.size))), selected: Candidate[] = [], rest: Candidate[] = [];
  for (const group of groups.values()) { group.sort((a, b) => b.error - a.error); selected.push(...group.slice(0, quota)); rest.push(...group.slice(quota)); }
  rest.sort((a, b) => b.error - a.error); selected.push(...rest.slice(0, Math.max(0, limit - selected.length)));
  const order = (p: Candidate) => { const ty = Math.floor(p.y / 64), tx = Math.floor(p.x / 64); return ty * 8 + (ty % 2 ? 7 - tx : tx); };
  // Adjacent work proceeds together, without claiming semantic object recognition.
  return selected.sort((a, b) => order(a) - order(b) || a.y - b.y || a.x - b.x);
}

/** Original local implementation inspired by Hertzmann's coarse-to-fine idea.
 * Error feedback uses the existing Painting, never a pasted photo. */
export function createPlan(source: Uint8ClampedArray, composition: Composition, inputHash: string, progress: (stage: number) => void = () => {}, prepared = false, approach: PaintingApproach = 'original') {
  if (source.length !== W * W * 4) throw new Error('分析尺寸不正确');
  const painting = new Painting(false);
  const plan: StrokePlan = { plannerVersion: PLANNER_VERSION, brushVersion: 2, seed: PLAN_SEED, size: 1024, analysisSize: W, composition, inputHash, stages: [], strokes: [] };
  const structured = approach === 'structure';
  const importance = structured ? structureImportance(source, W) : undefined;
  const dishes = prepared ? prepareDishes(source, importance) : null, match = dishes ? dishMatcher(dishes) : null;
  if (prepared) plan.plannerVersion = 'e1-prepared-studio-2';
  if (structured) plan.plannerVersion = 'e1-structure-1';
  let state = PLAN_SEED;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < W && source[at(x, y) + 3] > 8;
  for (let stage = 0; stage < STAGES.length; stage++) {
    progress(stage);
    const spec = STAGES[stage], reference = blurred(source, structured && stage >= 3 ? 0 : Math.max(0, Math.round(spec.size / SCALE * .16)));
    const luminance = (x: number, y: number) => { const i = at(x, y); return .299 * reference[i] + .587 * reference[i + 1] + .114 * reference[i + 2]; };
    const direction = (x: number, y: number) => {
      let gx = 0, gy = 0;
      for (let k = -1; k <= 1; k++) { gx += luminance(x + 1, y + k) - luminance(x - 1, y + k); gy += luminance(x + k, y + 1) - luminance(x + k, y - 1); }
      return { angle: Math.atan2(gy, gx) + Math.PI / 2, strength: Math.hypot(gx, gy) / 3 };
    };
    const error = (x: number, y: number) => {
      const i = at(x, y), j = (Math.round(y * SCALE) * 1024 + Math.round(x * SCALE)) * 4, a = painting.color[j + 3] / 255;
      let sum = 0; for (let c = 0; c < 3; c++) sum += (reference[i + c] - (painting.color[j + c] * a + linen[c] * (1 - a))) ** 2;
      return Math.sqrt(sum / 3);
    };
    const step = Math.max(2, Math.round(spec.size * .65 / SCALE)), candidates: Candidate[] = [];
    for (let y = 0; y < W; y += step) for (let x = 0; x < W; x += step) {
      let best: Candidate | null = null;
      for (let yy = y; yy < Math.min(W, y + step); yy += 2) for (let xx = x; xx < Math.min(W, x + step); xx += 2) {
        if (!inside(xx, yy)) continue;
        const e = error(xx, yy) * (stage > 0 ? importance?.[yy * W + xx] ?? 1 : 1); if (!best || e > best.error) best = { x: xx, y: yy, error: e };
      }
      if (!best) continue;
      if (stage === 0) {
        const cx = clamp(x + step * (.35 + random() * .3)), cy = clamp(y + step * (.35 + random() * .3));
        if (inside(cx, cy)) best = { x: cx, y: cy, error: 256 };
      }
      if (best.error >= spec.threshold) candidates.push(best);
    }
    const brushSize = (p: Candidate) => Math.max(4, Math.round(spec.size * (stage && direction(p.x, p.y).strength > 12 ? .65 : 1)));
    const colorAt = (p: Candidate) => { const i = at(p.x, p.y); const color = '#' + [reference[i], reference[i + 1], reference[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); return match ? match(color).color : color; };
    const selected = distribute(candidates, spec.limit);
    const tasks = structured ? regionTasks(selected, p => `${String(brushSize(p)).padStart(2, '0')}:${colorAt(p)}`) : selected;
    for (const start of tasks) {
      if (stage && error(start.x, start.y) < spec.threshold * .8) continue;
      const i = at(start.x, start.y), rgb = [reference[i], reference[i + 1], reference[i + 2]], flow = direction(start.x, start.y);
      const size = Math.max(4, Math.round(spec.size * (stage && flow.strength > 12 ? .65 : 1)));
      const fallback = flow.strength > 2 ? flow.angle : (random() - .5) * .12;
      const trace = (sign: number) => {
        let x = start.x, y = start.y, angle = fallback; const points: Point[] = [];
        for (let n = 0; n < 3; n++) {
          const flow = direction(x, y);
          if (flow.strength > 2) { let tangent = flow.angle; if (Math.cos(tangent - angle) < 0) tangent += Math.PI; angle += Math.atan2(Math.sin(tangent - angle), Math.cos(tangent - angle)) * .5; }
          const nx = x + Math.cos(angle) * size / SCALE / 4 * sign, ny = y + Math.sin(angle) * size / SCALE / 4 * sign;
          if (!inside(nx, ny)) break;
          const j = at(nx, ny), difference = Math.sqrt(rgb.reduce((sum, value, c) => sum + (value - reference[j + c]) ** 2, 0) / 3);
          if (difference > (stage ? 16 : 30)) break;
          x = nx; y = ny; points.push({ x: Math.round(x * SCALE * 100) / 100, y: Math.round(y * SCALE * 100) / 100, pressure: .5 });
        }
        return points;
      };
      const path = [...trace(-1).reverse(), { x: start.x * SCALE, y: start.y * SCALE, pressure: .5 }, ...trace(1)];
      const stroke: PlannedStroke = { order: plan.strokes.length, stage, path, sampleStep: 2, brush: { color: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''), size, load: spec.load, thickness: spec.thickness, mode: 'cover', seed: Math.floor(random() * 4294967296) } };
      // Explicit new-plan parameters only; historical/manual brush behavior is unchanged.
      if (structured) { stroke.brush.load = .9; stroke.brush.thickness = stage >= 3 ? .065 : spec.thickness; }
      if (match) stroke.brush.color = match(stroke.brush.color).color;
      executeStroke(painting, stroke); plan.strokes.push(stroke);
    }
    plan.stages.push({ name: spec.name, end: plan.strokes.length });
  }
  return prepareProcess(dishes ? attachMaterials(plan, dishes) : plan);
}
