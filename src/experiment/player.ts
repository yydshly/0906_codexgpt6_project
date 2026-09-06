import { Painting } from '../painting/engine';
import type { StrokePlan } from './plan';
import { StrokeRunner } from './stroke-runner';
import { DIP_MS, PAINT_WELL, type PaintPickup } from './process-plan';

type Station = { x: number; y: number };
export type MaterialStations = { dishes: Record<string, Station>; brushes: Record<string, Station>; wipe: Station };

export class PlanPlayer {
  index = 0;
  state: 'ready' | 'playing' | 'paused' | 'complete' = 'ready';
  speed = 1;
  onStage?: (stage: number) => void;
  tip = { x: 0, y: 0, down: false, visible: false, color: '#433e32', size: 24, width: 24, angle: 0, load: 0 };
  loadedPaint: PaintPickup | null = null;
  dipProgress = 0;
  heldBrushId: string | null = null;
  private dwell = 0;
  private afterWipe: 'return-brush' | 'to-paint' = 'to-paint';
  private stations: MaterialStations = { dishes: {}, brushes: {}, wipe: { x: 1220, y: 1030 } };
  private pickups = new Map<number, PaintPickup>();
  readonly metrics = { batches: [] as number[], frames: [] as number[], strokeMaxMs: 0, paintingMs: 0, totalBatches: 0, maxBatchMs: 0, maxConsecutiveOver100: 0 };
  private consecutiveOver100 = 0;
  private frame = 0;
  private lastTime = 0;
  private credit = 0;
  private runner: StrokeRunner | null = null;
  private phase: 'prepare' | 'take-brush' | 'return-brush' | 'release-brush' | 'to-wipe' | 'wipe' | 'to-paint' | 'dip' | 'travel' | 'draw' | 'lift' = 'prepare';
  private travel: { x: number; y: number; elapsed: number; duration: number } | null = null;
  private strokeCpuMs = 0;
  private liftRemaining = 6;
  constructor(readonly painting: Painting, readonly plan: StrokePlan, private update: () => void) {
    painting.metadata.brushVersion = plan.brushVersion;
    if (plan.processVersion) {
      this.pickups = new Map(plan.pickups?.map(p => [p.before, p]));
      let load: PaintPickup | undefined;
      for (const stroke of plan.strokes) {
        load = this.pickups.get(stroke.order) ?? load;
        if (!load || load.color !== stroke.brush.color || load.size !== stroke.brush.size || load.load !== stroke.brush.load) throw new Error('取色计划与笔触不一致');
      }
    }
    if (plan.materials) {
      const { brushes, dishes } = plan.materials;
      if (plan.materials.version !== 1 || !brushes.length || brushes.length > 8 || !dishes.length || dishes.length > 24 || new Set(brushes.map(b => b.id)).size !== brushes.length || new Set(dishes.map(d => d.id)).size !== dishes.length) throw new Error('备料清单无效');
      for (const s of plan.strokes) if (brushes.find(b => b.id === s.brushId)?.size !== s.brush.size || dishes.find(d => d.id === s.dishId)?.color !== s.brush.color) throw new Error('笔具或色盘与实际笔触不一致');
      brushes.forEach((b, i) => { this.stations.brushes[b.id] = { x: 1120 + i * 48, y: 860 }; });
      dishes.forEach((d, i) => { this.stations.dishes[d.id] = { x: 1120 + i % 4 * 80, y: 180 + Math.floor(i / 4) * 80 }; });
    }
  }
  setStations(stations: MaterialStations) {
    this.stations = stations;
    if (!['draw', 'lift', 'prepare'].includes(this.phase)) this.travel = null;
  }
  get action() { return this.phase; }
  get nextPaint() { return this.pickups.get(this.index) ?? this.loadedPaint; }
  get hasPaint() { return this.index > 0 || !!this.runner?.hasPaint; }
  get sampleIndex() { return this.runner?.cursor ?? 0; }
  play() { if (this.state === 'complete' || this.state === 'playing') return; this.state = 'playing'; this.lastTime = 0; this.frame = requestAnimationFrame(this.tick); this.update(); }
  pause() { cancelAnimationFrame(this.frame); if (this.state === 'playing') this.state = 'paused'; this.update(); }
  replay() {
    this.pause(); this.painting.clear(); this.index = 0; this.runner = null; this.travel = null; this.phase = 'prepare';
    this.loadedPaint = null; this.dipProgress = 0; this.tip.load = 0;
    this.heldBrushId = null; this.dwell = 0; this.afterWipe = 'to-paint';
    this.credit = 0; this.strokeCpuMs = 0; this.liftRemaining = 6; this.tip.visible = false; this.tip.down = false;
    this.state = 'ready'; this.play();
  }
  dispose() { cancelAnimationFrame(this.frame); this.state = 'paused'; }
  private tick = (time: number) => {
    if (this.state !== 'playing') return;
    if (this.lastTime && time - this.lastTime < 16) { this.frame = requestAnimationFrame(this.tick); return; }
    const elapsedFrame = this.lastTime ? time - this.lastTime : 16;
    if (this.lastTime && this.metrics.frames.length < 20000) this.metrics.frames.push(elapsedFrame);
    this.lastTime = time;
    // Bound catch-up after a hidden tab or slow frame. Speed affects timing only.
    this.credit = Math.min(100, this.credit + Math.min(40, elapsedFrame) * Math.max(.5, Math.min(4, this.speed)));
    const start = performance.now();
    while ((this.index < this.plan.strokes.length || this.plan.materials && this.heldBrushId) && this.state === 'playing' && this.credit > 0 && performance.now() - start < 6) {
      const stroke = this.plan.strokes[Math.min(this.index, this.plan.strokes.length - 1)];
      if (this.index === this.plan.strokes.length && !['return-brush', 'release-brush', 'to-wipe', 'wipe'].includes(this.phase)) this.returnBrush();
      if (this.phase === 'prepare') {
        if (this.plan.materials && this.heldBrushId !== stroke.brushId) {
          if (this.heldBrushId) this.returnBrush();
          else {
            this.heldBrushId = stroke.brushId!;
            const point = this.stations.brushes[this.heldBrushId];
            this.tip.x = point.x; this.tip.y = point.y; this.tip.size = stroke.brush.size; this.tip.width = stroke.brush.size;
            this.tip.angle = -Math.PI / 2; this.tip.visible = true; this.tip.down = false; this.tip.load = 0;
            this.phase = 'take-brush'; this.dwell = 70;
          }
        } else this.phase = this.pickups.has(this.index) ? this.plan.materials && this.loadedPaint && this.loadedPaint.color !== stroke.brush.color ? 'to-wipe' : 'to-paint' : 'travel';
        this.travel = null;
      } else if (this.phase === 'take-brush') {
        if (this.waitDwell()) this.phase = 'to-paint';
      } else if (this.phase === 'return-brush') {
        if (this.moveTip(this.stations.brushes[this.heldBrushId!], 64)) { this.phase = 'release-brush'; this.dwell = 50; this.tip.angle = -Math.PI / 2; this.travel = null; }
      } else if (this.phase === 'release-brush') {
        if (this.waitDwell()) { this.heldBrushId = null; this.loadedPaint = null; this.tip.visible = false; this.tip.load = 0; this.phase = 'prepare'; }
      } else if (this.phase === 'to-wipe') {
        if (this.moveTip(this.stations.wipe, 54)) { this.phase = 'wipe'; this.dwell = 45; this.travel = null; }
      } else if (this.phase === 'wipe') {
        const done = this.waitDwell(); this.tip.load = (this.loadedPaint?.load ?? 0) * this.dwell / 45;
        if (done) { this.loadedPaint = null; this.phase = this.afterWipe; this.afterWipe = 'to-paint'; }
      } else if (this.phase === 'to-paint') {
        const well = this.plan.materials ? this.stations.dishes[stroke.dishId!] : PAINT_WELL;
        if (this.moveTip(well, this.plan.materials ? 54 : 24)) { this.phase = 'dip'; this.dipProgress = 0; this.travel = null; this.tip.angle = Math.PI / 2; }
      } else if (this.phase === 'dip') {
        const paint = this.pickups.get(this.index)!;
        const duration = this.plan.materials ? 100 : DIP_MS;
        const used = Math.min(this.credit, duration * (1 - this.dipProgress)); this.credit -= used;
        this.dipProgress = Math.min(1, this.dipProgress + used / duration);
        this.tip.color = paint.color; this.tip.size = paint.size; this.tip.width = paint.size; this.tip.load = paint.load * this.dipProgress;
        const well = this.plan.materials ? this.stations.dishes[stroke.dishId!] : PAINT_WELL;
        this.tip.x = well.x; this.tip.y = well.y + Math.sin(this.dipProgress * Math.PI) * 9;
        if (this.dipProgress >= 1) { this.loadedPaint = paint; this.phase = 'travel'; this.travel = null; }
      } else if (this.phase === 'lift') {
        const used = Math.min(this.credit, this.liftRemaining); this.credit -= used; this.liftRemaining -= used;
        if (this.liftRemaining <= 0) { this.phase = 'prepare'; this.travel = null; }
      } else if (this.phase === 'travel') {
        const target = stroke.path[0];
        if (!this.travel) {
          this.tip.color = this.loadedPaint?.color ?? stroke.brush.color;
          this.tip.size = stroke.brush.size; this.tip.width = stroke.brush.size; this.tip.load = stroke.brush.load;
          const next = stroke.path[1];
          if (next) this.tip.angle = Math.atan2(next.y - target.y, next.x - target.x);
        }
        if (this.moveTip(target, this.plan.materials ? 54 : this.plan.processVersion ? 24 : 48)) {
          const prepared = this.loadedPaint ? { ...stroke, brush: { ...stroke.brush, color: this.loadedPaint.color, load: this.loadedPaint.load, size: this.loadedPaint.size } } : stroke;
          const before = performance.now(); this.runner = new StrokeRunner(this.painting, prepared); this.strokeCpuMs = performance.now() - before;
          this.phase = 'draw'; this.tip.down = true;
        }
      } else {
        const runner = this.runner!, cost = runner.nextDistance / 1.4;
        if (cost > this.credit) break;
        this.credit -= cost;
        const before = performance.now(); runner.advance(); this.strokeCpuMs += performance.now() - before;
        this.tip.x = runner.position.x; this.tip.y = runner.position.y;
        const contact = this.painting.contact;
        if (contact) {
          this.tip.x = contact.x; this.tip.y = contact.y; this.tip.width = contact.width;
          if (contact.angle !== null) this.tip.angle = contact.angle;
        }
        if (runner.done) {
          this.metrics.strokeMaxMs = Math.max(this.metrics.strokeMaxMs, this.strokeCpuMs);
          this.runner = null; this.index++; this.tip.down = false; this.phase = 'lift'; this.liftRemaining = 6;
          for (let stage = 0; stage < this.plan.stages.length; stage++) if (this.plan.stages[stage].end === this.index) this.onStage?.(stage);
        }
      }
    }
    const elapsed = performance.now() - start; this.metrics.paintingMs += elapsed;
    this.metrics.totalBatches++; this.metrics.maxBatchMs = Math.max(this.metrics.maxBatchMs, elapsed);
    this.consecutiveOver100 = elapsed > 100 ? this.consecutiveOver100 + 1 : 0;
    this.metrics.maxConsecutiveOver100 = Math.max(this.metrics.maxConsecutiveOver100, this.consecutiveOver100);
    if (this.metrics.batches.length < 20000) this.metrics.batches.push(elapsed);
    if (this.index === this.plan.strokes.length && (!this.plan.materials || !this.heldBrushId)) { this.state = 'complete'; this.tip.down = false; this.tip.visible = false; }
    this.update();
    if (this.state === 'playing') this.frame = requestAnimationFrame(this.tick);
  };
  private waitDwell() { const used = Math.min(this.credit, this.dwell); this.credit -= used; this.dwell -= used; return this.dwell <= 0; }
  private returnBrush() { this.afterWipe = 'return-brush'; this.phase = this.loadedPaint ? 'to-wipe' : 'return-brush'; this.travel = null; }
  private moveTip(target: { x: number; y: number }, maximum: number) {
    if (!this.travel) {
      if (!this.tip.visible) { this.tip.x = target.x; this.tip.y = target.y; }
      this.tip.visible = true; this.tip.down = false;
      this.travel = { x: this.tip.x, y: this.tip.y, elapsed: 0, duration: Math.max(6, Math.min(maximum, Math.hypot(target.x - this.tip.x, target.y - this.tip.y) / 8)) };
    }
    const travel = this.travel, used = Math.min(this.credit, travel.duration - travel.elapsed); travel.elapsed += used; this.credit -= used;
    const t = travel.elapsed / travel.duration; this.tip.x = travel.x + (target.x - travel.x) * t; this.tip.y = travel.y + (target.y - travel.y) * t;
    return travel.elapsed >= travel.duration;
  }
}
