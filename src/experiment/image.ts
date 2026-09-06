import { ANALYSIS_SIZE, type Composition } from './plan';
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_PIXELS = 12_000_000;
export const MAX_EDGE = 8192;
export function imageDimensions(bytes: Uint8Array): { width: number; height: number; type: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && view.getUint32(12) === 0x49484452) return { width: view.getUint32(16), height: view.getUint32(20), type: 'image/png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos++] !== 0xff) break;
      while (bytes[pos] === 0xff) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (pos + 2 > bytes.length) break;
      const length = view.getUint16(pos);
      if (length < 2 || pos + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) return { width: view.getUint16(pos + 5), height: view.getUint16(pos + 3), type: 'image/jpeg' };
      pos += length;
    }
  }
  throw new Error('无法读取图片。请选择有效的 PNG 或 JPEG 文件。');
}
export async function decodeLocalImage(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error('图片超过 12 MB，请先缩小文件。');
  const bytes = new Uint8Array(await file.arrayBuffer()), dimensions = imageDimensions(bytes);
  if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_PIXELS || Math.max(dimensions.width, dimensions.height) > MAX_EDGE) throw new Error('图片尺寸过大：最多 1200 万像素，单边不超过 8192。');
  const inputHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes], { type: dimensions.type }), { imageOrientation: 'from-image' }); }
  catch { throw new Error('图片解码失败。当前实验画作已保留，请选择另一张 PNG 或 JPEG。'); }
  return { bitmap, inputHash };
}
export function analyzeImage(bitmap: ImageBitmap, composition: Composition) {
  const canvas = referenceCanvas(bitmap, composition, ANALYSIS_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { pixels: ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE).data, preview: canvas.toDataURL('image/png') };
}
function referenceCanvas(bitmap: ImageBitmap, composition: Composition, side: number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const scale = (composition === 'contain' ? Math.min : Math.max)(side / bitmap.width, side / bitmap.height);
  ctx.drawImage(bitmap, (side - bitmap.width * scale) / 2, (side - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  // Transparent margins stay unpainted canvas; these pixels are analysis only.
  return canvas;
}
export function detailReference(bitmap: ImageBitmap, composition: Composition) {
  return referenceCanvas(bitmap, composition, 1024).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, 1024, 1024).data;
}
