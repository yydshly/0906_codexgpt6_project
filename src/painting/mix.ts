export type RGB = [number, number, number];

// Bounded artist RYB approximation, not a spectral/chemical pigment model.
export function rgbToRyb(r: number, g: number, b: number): RGB {
  const white = Math.min(r, g, b);
  r -= white; g -= white; b -= white;
  const originalMax = Math.max(r, g, b);
  let y = Math.min(r, g); r -= y; g -= y;
  if (b > 0 && g > 0) { b *= 0.5; g *= 0.5; }
  y += g; b += g;
  const m = Math.max(r, y, b), scale = m ? originalMax / m : 0;
  return [r * scale + white, y * scale + white, b * scale + white];
}

export function rybToRgb(r: number, y: number, b: number): RGB {
  const white = Math.min(r, y, b);
  r -= white; y -= white; b -= white;
  const originalMax = Math.max(r, y, b);
  let g = Math.min(y, b); y -= g; b -= g;
  if (b > 0 && g > 0) { b *= 2; g *= 2; }
  r += y; g += y;
  const m = Math.max(r, g, b), scale = m ? originalMax / m : 0;
  return [r * scale + white, g * scale + white, b * scale + white];
}

export function mixRyb(a: RGB, b: RGB, amount: number): RGB {
  const t = Math.max(0, Math.min(1, amount));
  if (a.every((v, i) => v === b[i])) return [...a];
  const ar = rgbToRyb(...a), br = rgbToRyb(...b);
  return rybToRgb(ar[0] + (br[0] - ar[0]) * t, ar[1] + (br[1] - ar[1]) * t, ar[2] + (br[2] - ar[2]) * t);
}

export function fromHex(hex: string): RGB {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
