import type { StrokePlan } from './plan';

export const MATERIALS_VERSION = 1;
export const MAX_DISHES = 24;
export type PaintDish = { id: string; color: string };
export type PreparedBrush = { id: string; size: number };
export type Materials = { version: 1; dishes: PaintDish[]; brushes: PreparedBrush[] };
const hex = (rgb: number[]) => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const rgb = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + 2 * (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Bounded, deterministic weighted median-cut. Transparent margins contribute no paint. */
export function prepareDishes(pixels: Uint8ClampedArray, importance?: Float32Array): PaintDish[] {
  const bins = new Map<number, { sum: number[]; weight: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] <= 8) continue;
    const key = (pixels[i] >> 4) * 256 + (pixels[i + 1] >> 4) * 16 + (pixels[i + 2] >> 4);
    const bin = bins.get(key) ?? { sum: [0, 0, 0], weight: 0 }, weight = pixels[i + 3] / 255 * (importance?.[i / 4] ?? 1);
    bin.weight += weight;
    for (let c = 0; c < 3; c++) bin.sum[c] += pixels[i + c] * weight;
    bins.set(key, bin);
  }
  const points = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => ({ rgb: b.sum.map(v => v / b.weight), weight: b.weight }));
  if (!points.length) throw new Error('图片没有可绘制的内容');
  const describe = (items: typeof points) => {
    const ranges = [0, 1, 2].map(c => Math.max(...items.map(p => p.rgb[c])) - Math.min(...items.map(p => p.rgb[c])));
    const axis = ranges.indexOf(Math.max(...ranges));
    return { items, axis, score: ranges[axis] * Math.sqrt(items.reduce((s, p) => s + p.weight, 0)) };
  };
  const boxes = [describe(points)];
  while (boxes.length < MAX_DISHES) {
    const candidates = boxes.map((box, i) => ({ box, i })).filter(({ box }) => box.items.length > 1).sort((a, b) => b.box.score - a.box.score || a.i - b.i);
    if (!candidates.length) break;
    const { box, i } = candidates[0], items = [...box.items].sort((a, b) => a.rgb[box.axis] - b.rgb[box.axis]);
    const half = items.reduce((s, p) => s + p.weight, 0) / 2;
    let weight = 0, split = 1;
    for (; split < items.length; split++) { weight += items[split - 1].weight; if (weight >= half) break; }
    split = Math.min(items.length - 1, split);
    boxes.splice(i, 1, describe(items.slice(0, split)), describe(items.slice(split)));
  }
  const colors = [...new Set(boxes.map(box => {
    const weight = box.items.reduce((s, p) => s + p.weight, 0);
    return hex([0, 1, 2].map(c => box.items.reduce((s, p) => s + p.rgb[c] * p.weight, 0) / weight));
  }))].sort((a, b) => { const light = (color: string) => { const c = rgb(color); return c[0] * .299 + c[1] * .587 + c[2] * .114; }; return light(b) - light(a) || a.localeCompare(b); });
  return colors.map((color, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, color }));
}
export function dishMatcher(dishes: PaintDish[]) {
  const colors = dishes.map(d => rgb(d.color)), cache = new Map<string, PaintDish>();
  return (color: string) => {
    const cached = cache.get(color); if (cached) return cached;
    const value = rgb(color); let selected = 0, best = Infinity;
    colors.forEach((candidate, i) => { const d = distance(candidate, value); if (d < best) { best = d; selected = i; } });
    const dish = dishes[selected]; cache.set(color, dish); return dish;
  };
}
export function attachMaterials(plan: StrokePlan, dishes: PaintDish[]): StrokePlan {
  const sizes = [...new Set(plan.strokes.map(s => s.brush.size))].sort((a, b) => b - a);
  const brushes = sizes.map((size, i) => ({ id: `B${String(i + 1).padStart(2, '0')}`, size }));
  const brushIds = new Map(brushes.map(b => [b.size, b.id])), dishIds = new Map(dishes.map(d => [d.color, d.id]));
  return { ...plan, materials: { version: MATERIALS_VERSION, dishes, brushes }, strokes: plan.strokes.map(s => ({ ...s, brushId: brushIds.get(s.brush.size)!, dishId: dishIds.get(s.brush.color)! })) };
}
