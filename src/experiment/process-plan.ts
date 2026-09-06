import type { PlannedStroke, StrokePlan } from './plan';

export type PaintPickup = { before: number; color: string; size: number; load: number };
export const PAINT_WELL = { x: 96, y: 1090 };
export const DIP_MS = 48;
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: PlannedStroke, b: PlannedStroke) => Math.hypot(a.path.at(-1)!.x - b.path[0].x, a.path.at(-1)!.y - b.path[0].y);
const transition = (a: PlannedStroke, b: PlannedStroke) => {
  const left = rgb(a.brush.color), right = rgb(b.brush.color);
  return distance(a, b) + Math.hypot(...left.map((v, i) => v - right[i])) * 1.2;
};
function bounds(s: PlannedStroke) {
  const radius = Math.ceil(Math.max(4, Math.min(96, s.brush.size)) * (.8 + .4 * Math.max(1, ...s.path.map(p => p.pressure ?? .5))) * .9 + 2);
  return { x0: Math.min(...s.path.map(p => p.x)) - radius, x1: Math.max(...s.path.map(p => p.x)) + radius,
    y0: Math.min(...s.path.map(p => p.y)) - radius, y1: Math.max(...s.path.map(p => p.y)) + radius };
}
const overlaps = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const region = (s: PlannedStroke) => { const p = s.path[Math.floor(s.path.length / 2)]; return `${Math.floor(p.x / 128)},${Math.floor(p.y / 128)}`; };
const score = (strokes: PlannedStroke[]) => strokes.slice(1).reduce((sum, s, i) => sum + transition(strokes[i], s), 0);
const route = (strokes: PlannedStroke[]) => strokes.slice(1).reduce((sum, s, i) => sum + distance(strokes[i], s), 0);
const changedBrush = (a: PlannedStroke, b: PlannedStroke) => a.brush.size !== b.brush.size;
const changedPaint = (a: PlannedStroke, b: PlannedStroke) => changedBrush(a, b) || a.brush.color !== b.brush.color || a.brush.load !== b.brush.load;
// Logical-unit scheduling costs, not measured milliseconds or physical travel.
const materialTransition = (a: PlannedStroke, b: PlannedStroke) => distance(a, b) + (changedBrush(a, b) ? 3000 : a.brush.color !== b.brush.color ? 1800 : a.brush.load !== b.brush.load ? 1200 : 0);
const actionCount = (strokes: PlannedStroke[], changed: typeof changedPaint) => strokes.slice(1).filter((s, i) => changed(strokes[i], s)).length;

/** Reorder only disjoint footprints in a bounded local window. No paint parameters change. */
export function prepareProcess(plan: StrokePlan): StrokePlan {
  const output: PlannedStroke[] = [];
  const cost = plan.materials ? materialTransition : transition;
  const total = (strokes: PlannedStroke[]) => strokes.slice(1).reduce((sum, s, i) => sum + cost(strokes[i], s), 0);
  for (let stage = 0; stage < plan.stages.length; stage++) {
    const original = plan.strokes.filter(s => s.stage === stage), remaining = original.map(s => ({ stroke: s, box: bounds(s) })), ordered: PlannedStroke[] = [];
    while (remaining.length) {
      let chosen = 0;
      const previous = ordered.at(-1);
      if (previous) {
        let best = cost(previous, remaining[0].stroke);
        for (let i = 1; i < Math.min(plan.materials ? 64 : 24, remaining.length); i++) {
          const candidate = remaining[i];
          if (region(candidate.stroke) !== region(remaining[0].stroke)) continue;
          if (remaining.slice(0, i).some(other => overlaps(other.box, candidate.box))) continue;
          const nextCost = cost(previous, candidate.stroke);
          if (nextCost < best) { best = nextCost; chosen = i; }
        }
      }
      ordered.push(remaining.splice(chosen, 1)[0].stroke);
    }
    // A local greedy choice must not worsen the full stage's route or color transitions.
    const improved = plan.materials
      ? total(ordered) <= total(original) && actionCount(ordered, changedPaint) <= actionCount(original, changedPaint) && actionCount(ordered, changedBrush) <= actionCount(original, changedBrush)
      : score(ordered) <= score(original) && route(ordered) <= route(original);
    output.push(...(improved ? ordered : original));
  }
  const pickups: PaintPickup[] = [];
  let loaded: PaintPickup | undefined;
  const strokes = output.map((stroke, order) => {
    if (!loaded || loaded.color !== stroke.brush.color || loaded.size !== stroke.brush.size || loaded.load !== stroke.brush.load) {
      loaded = { before: order, color: stroke.brush.color, size: stroke.brush.size, load: stroke.brush.load }; pickups.push(loaded);
    }
    return { ...stroke, sourceOrder: stroke.sourceOrder ?? stroke.order, order };
  });
  return { ...plan, processVersion: 1, pickups, strokes, processMetrics: {
    movedStrokes: strokes.filter(s => s.order !== s.sourceOrder).length,
    previousTravel: route(plan.strokes), travel: route(strokes), previousScore: score(plan.strokes), score: score(strokes), pickups: pickups.length,
    ...(plan.materials ? { costModel: 'material-actions-v1' as const, previousActionScore: total(plan.strokes), actionScore: total(strokes), previousPickups: actionCount(plan.strokes, changedPaint) + 1, previousBrushChanges: actionCount(plan.strokes, changedBrush), brushChanges: actionCount(strokes, changedBrush) } : {}),
  } };
}
