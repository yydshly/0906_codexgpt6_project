// A single-purpose, short-lived PNG encoder. No paint logic or guidance runs here.
self.onmessage = async ({ data }: MessageEvent<{ bitmap: ImageBitmap; width: number; height: number }>) => {
  const canvas = new OffscreenCanvas(data.width, data.height);
  try {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('PNG 编码画布不可用，请重试。');
    ctx.drawImage(data.bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob });
  } catch { self.postMessage({ error: 'PNG 编码失败，请保留画作并重试。' }); }
  finally { data.bitmap.close(); canvas.width = canvas.height = 1; }
};
export {};
