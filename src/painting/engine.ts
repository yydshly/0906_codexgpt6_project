import { fromHex, mixRyb, type RGB } from './mix';

export const SIZE = 1024;
export const HISTORY_LIMIT = 20;
export const MAX_HEIGHT = 18000;
export type Brush = { color: string; size: number; load: number; mode: 'cover' | 'mix'; seed: number; thickness?: number };
export type Point = { x: number; y: number; pressure?: number };
type Snapshot = { color: Uint8ClampedArray; height: Uint16Array };
export type Dirty = { x0: number; y0: number; x1: number; y1: number };

export class Painting {
  readonly width = SIZE;
  readonly color = new Uint8ClampedArray(SIZE * SIZE * 4);
  readonly height = new Uint16Array(SIZE * SIZE);
  readonly metadata = { formatVersion: 1, brushVersion: 1, canvasSeed: 906, size: SIZE, light: [-0.55, -0.65, 0.9] };
  history: Snapshot[] = [];
  private before: Snapshot | null = null;
  private batchBefore: Snapshot | null = null;
  constructor(private readonly recordHistory = true) {}
  private profile = new Float32Array(256);
  private tips = new Float32Array(256);
  private targetCache = new Map<number, RGB>();
  private last: Point | null = null;
  private lastDab: Point | null = null;
  private angle: number | null = null;
  private distance = 0;
  private travel = 0;
  private changed = false;
  private brush!: Brush;
  private rgb: RGB = [0, 0, 0];
  dirty: Dirty | null = { x0: 0, y0: 0, x1: SIZE, y1: SIZE };
  revision = 0;
  get active() { return this.before !== null; }
  get canUndo() { return this.history.length > 0; }

  private snapshot(): Snapshot { return { color: this.color.slice(), height: this.height.slice() }; }
  private remember(s: Snapshot) {
    this.history.push(s);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }
  begin(p: Point, brush: Brush) {
    this.end();
    if (this.recordHistory) this.before = this.snapshot(); // Exactly once per manual stroke.
    else {
      // Automated paintings reuse one color buffer; coverage never needs a copy.
      this.batchBefore ??= { color: new Uint8ClampedArray(this.color.length), height: new Uint16Array(0) };
      if (brush.mode === 'mix') this.batchBefore.color.set(this.color);
      this.before = this.batchBefore;
    }
    this.brush = { ...brush, size: Math.max(this.recordHistory ? 8 : 4, Math.min(96, brush.size)), load: Math.max(.15, Math.min(1, brush.load)) };
    this.rgb = fromHex(brush.color);
    this.last = p; this.lastDab = null; this.angle = null; this.distance = 0; this.travel = 0; this.changed = false;
    this.targetCache.clear();
    let state = brush.seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    let previous = random(), next = random();
    for (let i = 0; i < 256; i++) {
      // Longitudinal grooves stay coherent throughout a stroke.
      if (i % 8 === 0) { previous = next; next = random(); }
      const bundle = previous + (next - previous) * (i % 8) / 8;
      this.profile[i] = .25 + .65 * bundle + .10 * Math.sin(i * .9) ** 2;
      this.tips[i] = .42 + .58 * bundle;
    }
  }
  move(p: Point) {
    if (!this.before || !this.last) return;
    const dx = p.x - this.last.x, dy = p.y - this.last.y, length = Math.hypot(dx, dy);
    if (length < .001) return;
    const desired = Math.atan2(dy, dx);
    if (this.angle === null) {
      this.angle = desired;
      this.dab(this.last, desired); this.lastDab = this.last;
    }
    const spacing = Math.max(.75, this.brush.size / 9);
    for (let travel = spacing - this.distance; travel <= length; travel += spacing) {
      const t = travel / length;
      const q = { x: this.last.x + dx * t, y: this.last.y + dy * t, pressure: (this.last.pressure ?? .5) + ((p.pressure ?? .5) - (this.last.pressure ?? .5)) * t };
      const diff = Math.atan2(Math.sin(desired - this.angle), Math.cos(desired - this.angle));
      this.angle += diff * .5;
      this.travel += spacing; this.dab(q, this.angle); this.lastDab = q;
    }
    this.distance = (this.distance + length) % spacing;
    this.last = p;
  }
  end() {
    if (!this.before) return;
    if (this.last && (!this.lastDab || Math.hypot(this.last.x - this.lastDab.x, this.last.y - this.lastDab.y) > .5)) this.dab(this.last, this.angle ?? 0);
    if (this.changed) { if (this.recordHistory) this.remember(this.before); this.revision++; }
    this.before = null; this.last = null; this.lastDab = null; this.targetCache.clear();
  }
  private dab(p: Point, angle: number) {
    if (!this.before) return;
    const w = this.brush.size * (.8 + .4 * (p.pressure ?? .5)), halfW = w / 2, halfL = w * .40;
    const c = Math.cos(angle), s = Math.sin(angle), radius = Math.ceil(halfW + halfL + 2);
    const x0 = Math.max(0, Math.floor(p.x - radius)), x1 = Math.min(SIZE, Math.ceil(p.x + radius));
    const y0 = Math.max(0, Math.floor(p.y - radius)), y1 = Math.min(SIZE, Math.ceil(p.y + radius));
    if (x0 >= x1 || y0 >= y1) return;
    const load = this.brush.load, mix = this.brush.mode === 'mix';
    const relief = this.recordHistory ? 1 : Math.max(.02, Math.min(1, this.brush.thickness ?? 1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = x + .5 - p.x, dy = y + .5 - p.y;
      const along = dx * c + dy * s;
      const drift = (Math.sin(this.travel * .019) + .45 * Math.sin(this.travel * .047)) * w * .018;
      const across = -dx * s + dy * c - drift;
      if (Math.abs(across) >= halfW) continue;
      const k = Math.max(0, Math.min(255, Math.floor((across / w + .5) * 255)));
      const tip = halfL * this.tips[k];
      if (Math.abs(along) >= tip) continue;
      const edge = Math.min(1, (halfW - Math.abs(across)) / 1.25, (tip - Math.abs(along)) / 1.1);
      const bristle = this.profile[k];
      // Smooth overlap removes periodic stamp bars without blurring the painting.
      const longitudinal = 1 - (along / tip) ** 2;
      const deposit = Math.min(.92, edge * bristle * (.3 + load * .8) * longitudinal * (.9 + .1 * Math.sin(this.travel * .025 + k * .08)));
      const pixel = y * SIZE + x, i = pixel * 4;
      const oldAlpha = this.color[i + 3] / 255;
      let target = this.rgb;
      if (mix && this.before.color[i + 3] > 0) {
        const bc = this.before.color;
        const key = bc[i] * 65536 + bc[i + 1] * 256 + bc[i + 2];
        const cached = this.targetCache.get(key);
        if (cached) target = cached;
        else {
          target = mixRyb([bc[i], bc[i + 1], bc[i + 2]], this.rgb, .22 + load * .58);
          // Bounded cache; no allocation proportional to stroke duration.
          if (this.targetCache.size < 4096) this.targetCache.set(key, target);
        }
      }
      const alpha = deposit + oldAlpha * (1 - deposit);
      for (let ch = 0; ch < 3; ch++) this.color[i + ch] = (target[ch] * deposit + this.color[i + ch] * oldAlpha * (1 - deposit)) / alpha;
      this.color[i + 3] = Math.round(alpha * 255);
      // Default/manual strokes retain their original height. Thin paint is an
      // explicit version-2 experiment parameter, separate from color opacity.
      this.height[pixel] = Math.min(MAX_HEIGHT, this.height[pixel] + Math.round(deposit * (280 + load * 920) * (.35 + bristle) * relief));
      this.changed = true;
    }
    this.mark({ x0, y0, x1, y1 });
  }
  mark(d: Dirty) {
    if (!this.dirty) this.dirty = d;
    else { this.dirty.x0 = Math.min(this.dirty.x0, d.x0); this.dirty.y0 = Math.min(this.dirty.y0, d.y0); this.dirty.x1 = Math.max(this.dirty.x1, d.x1); this.dirty.y1 = Math.max(this.dirty.y1, d.y1); }
  }
  invalidate() { this.dirty = { x0: 0, y0: 0, x1: SIZE, y1: SIZE }; }
  undo() {
    this.end();
    const prior = this.history.pop();
    if (!prior) return false;
    this.color.set(prior.color); this.height.set(prior.height); this.revision++; this.invalidate(); return true;
  }
  clear() {
    this.end();
    if (!this.color.some(v => v !== 0)) return;
    if (this.recordHistory) this.remember(this.snapshot());
    this.color.fill(0); this.height.fill(0); this.revision++; this.invalidate();
  }
  memory() {
    const bytes = this.color.byteLength + this.height.byteLength;
    return { currentBytes: bytes, historyBytes: this.history.length * bytes, pendingBytes: this.before && this.recordHistory ? bytes : 0, batchBufferBytes: this.batchBefore?.color.byteLength ?? 0, brushBytes: this.profile.byteLength + this.tips.byteLength, cacheEntries: this.targetCache.size, historyCount: this.history.length };
  }
}
