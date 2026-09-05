import type { Brush } from '../painting/engine';

export type GuideState = { theme: 'sunset' | null; step: number; open: boolean; overlay: boolean };
export const emptyGuide: GuideState = { theme: null, step: 0, open: false, overlay: true };
export const sunsetSteps: { title: string; area: string; hint: string; colorName: string; brush: Partial<Brush> }[] = [
  { title: '天空', area: '画布上方约一半，留出地平线。', hint: '从左往右铺几条宽色带。靠近地平线时换日落黄，让两种颜色轻轻接触；不必填得完全均匀。', colorName: '朱红', brush: { color: '#C95139', size: 96, load: .6, mode: 'cover' } },
  { title: '远山', area: '画布中间，沿虚线山脊附近。', hint: '用一笔缓慢起伏的折线画山脊，再向下补几笔。山高低由你决定，给天空留一点呼吸。', colorName: '深褐', brush: { color: '#584335', size: 48, load: .5, mode: 'cover' } },
  { title: '水面', area: '地平线以下，画布的下半部。', hint: '横着画长短不同的蓝色笔触。留一些空隙作波光；想让颜色相遇，可以试试混色。', colorName: '群青', brush: { color: '#3155A6', size: 64, load: .55, mode: 'cover' } },
  { title: '反光与个人细节', area: '水面中间向下的一条窄带。', hint: '用短短的横笔点出日落反光，越近越宽。最后加一个属于你的细节：小岛、船影，或一抹暖色。', colorName: '日落黄', brush: { color: '#EBC43C', size: 24, load: .75, mode: 'cover' } },
];
