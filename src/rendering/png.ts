// Main-thread canvas encoders can share Chrome's ~6.7s idle deadline, including
// OffscreenCanvas.convertToBlob. Encode in a dedicated worker, not that queue.
// At most two encodes overlap while a user replaces a pending signature preview.
let encoders = 0;
export async function encodePng(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.convertToBlob === 'function') {
    if (encoders >= 2) throw new Error('上一份预览仍在准备，请稍候重试。');
    encoders++;
    let bitmap: ImageBitmap | undefined, worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    try {
      bitmap = await createImageBitmap(canvas);
      worker = new Worker(new URL('./png.worker.ts', import.meta.url), { type: 'module' });
      return await new Promise<Blob>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('PNG 编码等待过久，请保留画作并重试。')), 10000);
        worker!.onmessage = ({ data }: MessageEvent<{ blob?: Blob; error?: string }>) => data.blob ? resolve(data.blob) : reject(new Error(data.error ?? 'PNG 编码失败，请重试。'));
        worker!.onerror = event => { event.preventDefault(); reject(new Error('PNG 编码不可用，请保留画作并重试。')); };
        worker!.postMessage({ bitmap, width: canvas.width, height: canvas.height }, [bitmap!]);
      });
    } finally {
      clearTimeout(timer); worker?.terminate(); bitmap?.close(); encoders--;
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败，请保留画作并重试。')), 'image/png'));
}
