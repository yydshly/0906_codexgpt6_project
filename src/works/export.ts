import { SIZE } from '../painting/engine';
import type { StudioRenderer } from '../rendering/renderer';
import { encodePng } from '../rendering/png';

export async function exportArtwork(renderer: StudioRenderer, signature: string): Promise<Blob> {
  const painting = await renderer.exportPng();
  const name = signature.trim();
  if (!name) return painting; // Preserve the original M1 PNG byte path.
  const bitmap = await createImageBitmap(painting);
  try {
    const output = document.createElement('canvas'); output.width = output.height = SIZE;
    const ctx = output.getContext('2d'); if (!ctx) throw new Error('签名画布不可用，请重试导出。');
    ctx.drawImage(bitmap, 0, 0);
    await document.fonts.ready;
    ctx.font = '26px "KaiTi", "STKaiti", serif';
    const width = ctx.measureText(name).width;
    if (width > 600) ctx.font = `${26 * 600 / width}px "KaiTi", "STKaiti", serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#433e32'; ctx.shadowColor = '#fff9e8b3'; ctx.shadowBlur = 2;
    ctx.fillText(name, 968, 968);
    return await encodePng(output);
  } finally { bitmap.close(); }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
