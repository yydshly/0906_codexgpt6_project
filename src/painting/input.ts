import { Painting, SIZE, type Brush, type Point } from './engine';

export function logicalPoint(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Point {
  return { x: (clientX - rect.left) / rect.width * SIZE, y: (clientY - rect.top) / rect.height * SIZE };
}

export function attachInput(surface: HTMLElement, painting: Painting, getBrush: () => Brush, render: () => void, changed: () => void, cursor: (p: { x: number; y: number } | null) => void, fail: (text: string) => void) {
  let pointer: number | null = null;
  let rect = surface.getBoundingClientRect();
  const point = (e: PointerEvent) => ({ ...logicalPoint(e.clientX, e.clientY, rect), pressure: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : .5 });
  const finish = () => {
    if (pointer === null) return;
    const id = pointer; pointer = null;
    painting.end(); if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    render(); changed();
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || pointer !== null) return;
    e.preventDefault(); rect = surface.getBoundingClientRect();
    try { painting.begin(point(e), getBrush()); pointer = e.pointerId; surface.setPointerCapture(e.pointerId); render(); }
    catch { fail('本次落笔无法分配历史空间，原画作已保留。请先导出。'); }
  };
  const move = (e: PointerEvent) => {
    cursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (pointer !== e.pointerId) return;
    if (e.buttons === 0) { finish(); return; }
    const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    // Samples are consumed synchronously; no stroke-length-dependent queue.
    for (const sample of samples.length ? samples : [e]) painting.move(point(sample));
    render();
  };
  const up = (e: PointerEvent) => { if (e.pointerId === pointer) { painting.move(point(e)); finish(); } };
  const cancel = (e: PointerEvent) => { if (e.pointerId === pointer) finish(); };
  const leave = () => cursor(null);
  const enter = () => { if (pointer === null) rect = surface.getBoundingClientRect(); };
  const visibility = () => { if (document.hidden) finish(); };
  const resized = () => { finish(); rect = surface.getBoundingClientRect(); };
  const observer = new ResizeObserver(resized); observer.observe(surface);
  surface.addEventListener('pointerdown', down); surface.addEventListener('pointermove', move); surface.addEventListener('pointerup', up);
  surface.addEventListener('pointercancel', cancel); surface.addEventListener('lostpointercapture', cancel); surface.addEventListener('pointerleave', leave); surface.addEventListener('pointerenter', enter);
  window.addEventListener('blur', finish); window.addEventListener('resize', resized); document.addEventListener('visibilitychange', visibility);
  return { finish, dispose() { finish(); observer.disconnect(); surface.removeEventListener('pointerdown', down); surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerup', up); surface.removeEventListener('pointercancel', cancel); surface.removeEventListener('lostpointercapture', cancel); surface.removeEventListener('pointerleave', leave); surface.removeEventListener('pointerenter', enter); window.removeEventListener('blur', finish); window.removeEventListener('resize', resized); document.removeEventListener('visibilitychange', visibility); } };
}
