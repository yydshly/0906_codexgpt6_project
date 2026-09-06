import { Painting } from '../painting/engine';
import { strokeSamples, type PlannedStroke } from './plan';

/** One active stroke; scheduling never changes its Painting commands. */
export class StrokeRunner {
  readonly samples;
  cursor = 1;
  done = false;
  hasPaint = false;
  constructor(private painting: Painting, readonly stroke: PlannedStroke) {
    this.samples = strokeSamples(stroke);
    painting.begin(this.samples[0], stroke.brush);
  }
  get position() { return this.samples[this.cursor - 1]; }
  get nextDistance() {
    const next = this.samples[this.cursor];
    return next ? Math.hypot(next.x - this.position.x, next.y - this.position.y) : 0;
  }
  advance() {
    if (this.done) return;
    if (this.cursor < this.samples.length) this.painting.move(this.samples[this.cursor++]);
    else { this.painting.end(); this.done = true; }
    this.hasPaint = true;
  }
}
