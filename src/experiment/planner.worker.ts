import { createPlan, type Composition, type PaintingApproach } from './plan';
self.onmessage = (event: MessageEvent<{ pixels: Uint8ClampedArray; composition: Composition; inputHash: string; approach?: PaintingApproach }>) => {
  try {
    const start = performance.now();
    const plan = createPlan(event.data.pixels, event.data.composition, event.data.inputHash, stage => self.postMessage({ type: 'progress', stage }), true, event.data.approach);
    self.postMessage({ type: 'plan', plan, elapsed: performance.now() - start });
  } catch (error) {
    if (import.meta.env.DEV) console.error('Local planner failed', error);
    self.postMessage({ type: 'error', message: '规划失败，请更换有效图片后重试。' });
  }
};
