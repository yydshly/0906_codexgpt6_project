export const seed = 906;
export const yellow = '#EBC43C', blue = '#3155A6';
export const line = (x0: number, y0: number, x1: number, y1: number, n = 80) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n }));
export const single = line(192, 320, 832, 320);
export const crossYellow = line(192, 512, 832, 512);
export const crossBlue = line(512, 192, 512, 832);
// Locked M1 repeated short arc, always the same path, seed and colors.
export const shortArc = Array.from({ length: 81 }, (_, i) => ({ x: 320 + i * 4.8, y: 550 - Math.sin(i / 80 * Math.PI) * 120 }));
export const quickArc = Array.from({ length: 17 }, (_, i) => ({ x: 160 + i * 44, y: 400 + Math.sin(i / 16 * Math.PI * 2) * 180 }));
