import { Painting } from '../painting/engine';
import { executeStroke, type StrokePlan } from './plan';
export class PlanPlayer {
  index = 0;
  state: 'ready' | 'playing' | 'paused' | 'complete' = 'ready';
  speed = 1;
  onStage?: (stage: number) => void;
  readonly metrics = { batches: [] as number[], frames: [] as number[], strokeMaxMs: 0, paintingMs: 0 };
  private frame = 0;
  private lastTime = 0;
  constructor(readonly painting: Painting, readonly plan: StrokePlan, private update: () => void) {}
  play() { if (this.state === 'complete' || this.state === 'playing') return; this.state = 'playing'; this.lastTime = 0; this.frame = requestAnimationFrame(this.tick); this.update(); }
  pause() { cancelAnimationFrame(this.frame); if (this.state === 'playing') this.state = 'paused'; this.update(); }
  replay() { this.pause(); this.painting.clear(); this.index = 0; this.state = 'ready'; this.play(); }
  dispose() { cancelAnimationFrame(this.frame); this.state = 'paused'; }
  private tick = (time: number) => {
    if (this.state !== 'playing') return;
    if (this.lastTime && time - this.lastTime < 16 / this.speed) { this.frame = requestAnimationFrame(this.tick); return; }
    if (this.lastTime && this.metrics.frames.length < 20000) this.metrics.frames.push(time - this.lastTime);
    this.lastTime = time;
    const start = performance.now(); let count = 0;
    while (this.index < this.plan.strokes.length && this.state === 'playing') {
      const before = performance.now(); executeStroke(this.painting, this.plan.strokes[this.index++]);
      this.metrics.strokeMaxMs = Math.max(this.metrics.strokeMaxMs, performance.now() - before);
      const stage = this.plan.stages.findIndex(s => s.end === this.index);
      if (stage >= 0) this.onStage?.(stage);
      if (++count >= Math.ceil(this.speed * 4) || performance.now() - start >= 6) break;
    }
    const elapsed = performance.now() - start; this.metrics.paintingMs += elapsed;
    if (this.metrics.batches.length < 20000) this.metrics.batches.push(elapsed);
    if (this.index === this.plan.strokes.length) this.state = 'complete';
    this.update();
    if (this.state === 'playing') this.frame = requestAnimationFrame(this.tick);
  };
}
